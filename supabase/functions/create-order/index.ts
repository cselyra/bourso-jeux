import { adminClient, corsHeaders, json, UUID } from '../_shared/http.ts'
import { getPaymentMode, getProvider, holdFor, webhookUrl } from '../_shared/payments/index.ts'

interface Body {
  game_ids?: unknown
  name?: unknown
  email?: unknown
  phone?: unknown
}

function parse(body: Body) {
  const ids = Array.isArray(body.game_ids) ? body.game_ids : []
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''

  if (ids.length < 1 || ids.length > 50 || !ids.every((id) => typeof id === 'string' && UUID.test(id))) return null
  if (name.length < 2 || name.length > 100) return null
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  if (!/^\+?[\d\s.-]{6,20}$/.test(phone)) return null
  return { ids: ids as string[], name, email, phone }
}

// Réserve le panier (tout ou rien) puis crée le paiement. Si le prestataire échoue,
// la réservation est annulée pour ne pas bloquer des jeux que personne ne peut payer.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const input = parse(await request.json().catch(() => ({})))
  if (!input) return json({ error: 'invalid_input' }, 400)

  const provider = getProvider()
  const mode = getPaymentMode()
  const db = adminClient()

  const { data: reservation, error } = await db.rpc('reserve_games', {
    p_game_ids: input.ids,
    p_buyer_name: input.name,
    p_buyer_email: input.email,
    p_buyer_phone: input.phone,
    p_hold: holdFor(mode),
    p_provider: provider.name,
    p_payment_mode: mode,
  })
  if (error) {
    console.error('reserve_games', error)
    return json({ error: 'reservation_failed' }, 500)
  }
  if (!reservation.ok) return json({ error: 'unavailable', unavailable: reservation.unavailable }, 409)

  try {
    const session = await provider.createPayment(
      {
        id: reservation.order_id,
        amountCents: reservation.amount_cents,
        buyerEmail: input.email,
        expiresAt: new Date(reservation.expires_at),
      },
      mode,
      webhookUrl(provider.name),
    )
    if (session.providerRef) {
      await db.from('orders').update({ provider_ref: session.providerRef }).eq('id', reservation.order_id)
    }

    const { providerRef: _ref, ...payment } = session
    return json({
      token: reservation.public_token,
      expires_at: reservation.expires_at,
      amount_cents: reservation.amount_cents,
      payment: { provider: provider.name, ...payment },
    })
  } catch (cause) {
    console.error('createPayment', cause)
    await db.rpc('cancel_order', { p_order_id: reservation.order_id })
    return json({ error: 'payment_unavailable' }, 502)
  }
})
