import { adminClient, corsHeaders, json, UUID } from '../_shared/http.ts'

// État d'une commande pour sa page de suivi. Le jeton public, non devinable, tient lieu de droit d'accès.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!UUID.test(token)) return json({ error: 'not_found' }, 404)

  const { data: order, error } = await adminClient()
    .from('orders')
    .select('status, amount_cents, expires_at, paid_at, payment_mode, provider, buyer_email, order_items(price_cents, games(title))')
    .eq('public_token', token)
    .maybeSingle()
  if (error) return json({ error: 'server_error' }, 500)
  if (!order) return json({ error: 'not_found' }, 404)

  // Une réservation échue l'est tout de suite, sans attendre le nettoyage planifié.
  const expired = order.status === 'pending' && Date.parse(order.expires_at) <= Date.now()

  return json({
    status: expired ? 'expired' : order.status,
    amount_cents: order.amount_cents,
    expires_at: order.expires_at,
    paid_at: order.paid_at,
    payment_mode: order.payment_mode,
    provider: order.provider,
    buyer_email: order.buyer_email,
    items: order.order_items.map((item: { price_cents: number; games: { title: string } }) => ({
      title: item.games.title,
      price_cents: item.price_cents,
    })),
  })
})
