-- Bourso Jeux : schéma et logique de réservation.
-- Ce fichier ne dépend d'aucune spécificité Supabase (les tests le chargent dans PGlite).

create type public.game_status as enum ('available', 'reserved', 'sold', 'withdrawn');
create type public.game_condition as enum ('neuf', 'comme_neuf', 'tres_bon', 'bon', 'correct');
create type public.order_status as enum ('pending', 'paid', 'expired', 'cancelled', 'conflict');

-- Table publique : ne doit contenir aucune donnée acheteur (elle est diffusée en temps réel).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  title text not null,
  publisher text,
  description text,
  min_players int not null check (min_players >= 1),
  max_players int not null,
  duration_min int not null check (duration_min > 0),
  age_min int not null check (age_min >= 0),
  condition public.game_condition not null,
  condition_note text,
  price_cents int not null check (price_cents >= 0),
  image_path text,
  bgg_id int,
  ean text,
  status public.game_status not null default 'available',
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_players >= min_players),
  check ((status = 'reserved') = (reserved_until is not null))
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  status public.order_status not null default 'pending',
  amount_cents int not null,
  expires_at timestamptz not null,
  provider text not null,
  payment_mode text not null,
  provider_ref text,
  paid_at timestamptz,
  picked_up_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending';

-- « active » = cette commande tient le jeu (réservation en cours ou vente conclue).
create table public.order_items (
  order_id uuid not null references public.orders (id) on delete cascade,
  game_id uuid not null references public.games (id),
  price_cents int not null,
  active boolean not null default true,
  primary key (order_id, game_id)
);
create unique index order_items_one_active_per_game on public.order_items (game_id) where active;

create table public.payment_events (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id),
  provider text not null,
  transaction_id text not null,
  status text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, transaction_id, status)
);

create table public.admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger games_touch_updated_at before update on public.games
for each row execute function public.touch_updated_at();

-- Réserve un panier en tout ou rien. Les lignes sont verrouillées dans l'ordre des id :
-- deux paniers concurrents ne peuvent pas s'interbloquer et un seul obtient chaque jeu.
create function public.reserve_games(
  p_game_ids uuid[],
  p_buyer_name text,
  p_buyer_email text,
  p_buyer_phone text,
  p_hold interval,
  p_provider text,
  p_payment_mode text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_unavailable uuid[];
  v_amount int;
  v_order public.orders;
begin
  select array_agg(distinct t.id) into v_ids from unnest(p_game_ids) as t (id);
  if v_ids is null then
    raise exception 'empty_cart';
  end if;

  perform 1 from public.games where id = any (v_ids) order by id for update;

  select coalesce(array_agg(x.id), '{}') into v_unavailable
  from unnest(v_ids) as x (id)
  left join public.games g on g.id = x.id
  where g.id is null
     or not (g.status = 'available' or (g.status = 'reserved' and g.reserved_until < now()));

  if cardinality(v_unavailable) > 0 then
    return jsonb_build_object('ok', false, 'unavailable', to_jsonb(v_unavailable));
  end if;

  -- Réservations échues pas encore nettoyées : elles lâchent le jeu.
  update public.order_items set active = false where game_id = any (v_ids) and active;

  select sum(price_cents) into v_amount from public.games where id = any (v_ids);

  insert into public.orders (buyer_name, buyer_email, buyer_phone, amount_cents, expires_at, provider, payment_mode)
  values (p_buyer_name, p_buyer_email, p_buyer_phone, v_amount, now() + p_hold, p_provider, p_payment_mode)
  returning * into v_order;

  insert into public.order_items (order_id, game_id, price_cents)
  select v_order.id, g.id, g.price_cents from public.games g where g.id = any (v_ids);

  update public.games set status = 'reserved', reserved_until = v_order.expires_at where id = any (v_ids);

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'public_token', v_order.public_token,
    'amount_cents', v_amount,
    'expires_at', v_order.expires_at
  );
end $$;

-- Nettoyage périodique. Un jeu échu est déjà re-réservable sans attendre ce passage.
create function public.expire_orders() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'expired' where status = 'pending' and expires_at < now();

  update public.order_items oi set active = false
  from public.orders o
  where o.id = oi.order_id and o.status = 'expired' and oi.active;

  with stale as (
    select id from public.games
    where status = 'reserved' and reserved_until < now()
    order by id
    for update skip locked
  )
  update public.games g set status = 'available', reserved_until = null
  from stale where g.id = stale.id;
end $$;

-- Appelée par le webhook de paiement. Idempotente. Renvoie le statut final de la commande.
-- Un paiement tardif est honoré si tous les jeux sont encore libres, sinon la commande
-- passe en « conflict » (remboursement manuel).
create function public.mark_order_paid(p_order_id uuid, p_provider_ref text) returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_lost int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_order.status in ('paid', 'conflict') then
    return v_order.status;
  end if;

  perform 1 from public.games g
  where g.id in (select game_id from public.order_items where order_id = p_order_id)
  order by g.id for update;

  if v_order.status = 'cancelled' then
    v_lost := 1;
  else
    select count(*) into v_lost
    from public.order_items oi
    join public.games g on g.id = oi.game_id
    where oi.order_id = p_order_id
      and not (
        (oi.active and g.status = 'reserved')
        or (not oi.active and (g.status = 'available' or (g.status = 'reserved' and g.reserved_until < now())))
      );
  end if;

  if v_lost > 0 then
    update public.orders set status = 'conflict', provider_ref = p_provider_ref, paid_at = now()
    where id = p_order_id;
    return 'conflict';
  end if;

  update public.order_items set active = false
  where order_id <> p_order_id and active
    and game_id in (select game_id from public.order_items where order_id = p_order_id);
  update public.order_items set active = true where order_id = p_order_id;
  update public.games set status = 'sold', reserved_until = null
  where id in (select game_id from public.order_items where order_id = p_order_id);
  update public.orders set status = 'paid', provider_ref = p_provider_ref, paid_at = now()
  where id = p_order_id;
  return 'paid';
end $$;

-- Annulation d'une réservation en attente (suivi organisateur, ou échec de création du paiement).
create function public.cancel_order(p_order_id uuid) returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_order.status <> 'pending' then
    return v_order.status;
  end if;

  with held as (
    select g.id from public.games g
    join public.order_items oi on oi.game_id = g.id
    where oi.order_id = p_order_id and oi.active and g.status = 'reserved'
    order by g.id
    for update of g
  )
  update public.games g set status = 'available', reserved_until = null
  from held where g.id = held.id;

  update public.order_items set active = false where order_id = p_order_id;
  update public.orders set status = 'cancelled' where id = p_order_id;
  return 'cancelled';
end $$;
