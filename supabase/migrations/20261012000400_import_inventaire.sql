-- Adaptations à l'inventaire réel : l'état de la boîte n'est pas toujours renseigné,
-- le prix neuf sert de repère à l'acheteur, et les photos sont hébergées chez nous.

alter table public.games alter column condition drop not null;
alter table public.games add column price_new_cents int check (price_new_cents >= 0);

-- Bucket public en lecture ; seul le script d'import (service_role) y écrit.
insert into storage.buckets (id, name, public)
values ('games', 'games', true)
on conflict (id) do nothing;
