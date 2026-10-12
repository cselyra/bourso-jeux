import { adminClient, UUID } from '../_shared/http.ts'
import { getProvider } from '../_shared/payments/index.ts'
import { WebhookRejected } from '../_shared/payments/types.ts'

// Point d'entrée des notifications de paiement : /payment-webhook/<prestataire>.
// C'est la seule source de vérité sur un paiement ; le retour navigateur n'est jamais cru.
// Toute réponse autre que 200 fait rejouer la notification par le prestataire.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const name = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? ''
  let provider
  try {
    provider = getProvider(name)
  } catch {
    return new Response('unknown provider', { status: 404 })
  }

  let event
  try {
    event = await provider.parseWebhook(request)
  } catch (cause) {
    if (cause instanceof WebhookRejected) {
      console.warn('webhook rejeté :', cause.message)
      // Le motif précis apparaît dans le journal des notifications du prestataire
      return new Response(`rejected: ${cause.message}`, { status: 401 })
    }
    throw cause
  }

  const db = adminClient()
  const { data: order, error: orderError } = UUID.test(event.orderId)
    ? await db.from('orders').select('id, amount_cents').eq('id', event.orderId).maybeSingle()
    : { data: null, error: null }
  if (orderError) return new Response('database error', { status: 500 })

  const mismatch = order !== null && event.status === 'paid' && event.amountCents !== order.amount_cents
  const status = order === null ? 'unknown_order' : mismatch ? 'amount_mismatch' : event.status

  // La contrainte d'unicité rend le rejeu d'une même notification sans effet.
  const { error: logError } = await db.from('payment_events').upsert(
    {
      order_id: order?.id ?? null,
      provider: provider.name,
      transaction_id: event.transactionId || `sans-transaction:${event.orderId}`,
      status,
      payload: event.raw,
    },
    { onConflict: 'provider,transaction_id,status', ignoreDuplicates: true },
  )
  if (logError) return new Response('database error', { status: 500 })

  if (status === 'paid') {
    const { data: result, error } = await db.rpc('mark_order_paid', {
      p_order_id: order!.id,
      p_provider_ref: event.transactionId,
    })
    if (error) return new Response('database error', { status: 500 })
    if (result === 'conflict') console.error(`commande ${order!.id} payée mais jeux indisponibles : remboursement à faire`)
  } else if (status !== 'failed' && status !== 'pending') {
    console.error(`notification ${provider.name} ignorée (${status}) pour la commande ${event.orderId}`)
  }

  return new Response('OK')
})
