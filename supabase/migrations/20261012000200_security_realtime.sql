-- Droits, RLS et temps réel (spécifique Supabase).

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.admins
  add constraint admins_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.games enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_events enable row level security;
alter table public.admins enable row level security;

-- Le catalogue est public en lecture ; toute écriture passe par les fonctions (service_role).
grant select on public.games to anon, authenticated;
create policy games_public_read on public.games for select to anon, authenticated using (true);

grant select on public.orders, public.order_items, public.payment_events, public.admins to authenticated;
create policy orders_admin_read on public.orders for select to authenticated using (public.is_admin());
create policy order_items_admin_read on public.order_items for select to authenticated using (public.is_admin());
create policy payment_events_admin_read on public.payment_events for select to authenticated using (public.is_admin());
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

revoke execute on function
  public.reserve_games (uuid[], text, text, text, interval, text, text),
  public.expire_orders (),
  public.mark_order_paid (uuid, text),
  public.cancel_order (uuid)
from public, anon, authenticated;
grant execute on function
  public.reserve_games (uuid[], text, text, text, interval, text, text),
  public.expire_orders (),
  public.mark_order_paid (uuid, text),
  public.cancel_order (uuid)
to service_role;

alter publication supabase_realtime add table public.games;
