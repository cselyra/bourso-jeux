# Bourso Jeux

Bourse aux jeux de société : catalogue filtrable, panier, réservation « premier arrivé, premier servi » et paiement en ligne.

Stack : Vite + React + TypeScript, Tailwind CSS, shadcn/ui, Supabase (Postgres, Realtime, Edge Functions), déploiement GitHub Pages.

## Développement

```bash
npm install
npm run dev     # sans .env.local : mode démo sur des données fictives
npm test        # logique de réservation (PGlite) et filtres
npm run build
```

En mode démo, la console du navigateur permet de simuler un autre acheteur :
`__demo.reserve('D002')`, `__demo.sell('D001')`, `__demo.release('D002')`.

## Brancher Supabase

1. Appliquer les migrations de `supabase/migrations/` dans l'ordre (éditeur SQL ou `npx supabase db push`).
2. Copier `.env.example` en `.env.local` et renseigner l'URL et la clé anon du projet.

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie sur GitHub Pages à chaque push sur `main`.
Dans le dépôt : activer Pages (source « GitHub Actions ») et créer les variables
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (et `VITE_BASE=/` avec un domaine personnalisé).

## Paiement

Les Edge Functions (`supabase/functions/`) réservent le panier, créent le paiement et reçoivent la notification du prestataire.
Le prestataire est interchangeable : voir `supabase/functions/_shared/payments/`.

```bash
npx supabase secrets set PAYZEN_SHOP_ID=... PAYZEN_PASSWORD=... PAYZEN_PUBLIC_KEY=... PAYMENT_MODE=embedded
npx supabase functions deploy --use-api
```

`PAYMENT_MODE` vaut `embedded` (formulaire de carte dans la page, jeux bloqués 20 min) ou `link`
(lien de paiement envoyé par e-mail, jeux bloqués 24 h).
