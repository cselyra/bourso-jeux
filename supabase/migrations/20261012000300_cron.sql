-- Nettoyage des réservations échues toutes les 5 minutes.
create extension if not exists pg_cron;
select cron.schedule('expire-orders', '*/5 * * * *', 'select public.expire_orders()');
