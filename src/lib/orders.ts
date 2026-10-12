import { anonKey, supabaseUrl } from '@/lib/supabase'

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'conflict'

// Ce que le serveur renvoie pour lancer le paiement, quel que soit le prestataire.
export type PaymentStart =
  | { provider: string; kind: 'link' }
  | { provider: string; kind: 'embedded'; client: Record<string, string> }
  | { provider: string; kind: 'redirect'; url: string }

export interface CreatedOrder {
  token: string
  expires_at: string
  amount_cents: number
  payment: PaymentStart
}

export interface OrderView {
  status: OrderStatus
  amount_cents: number
  expires_at: string
  paid_at: string | null
  payment_mode: 'link' | 'embedded'
  provider: string
  buyer_email: string
  items: { title: string; price_cents: number }[]
}

export interface Buyer {
  name: string
  email: string
  phone: string
}

function call(name: string, init?: RequestInit) {
  if (!supabaseUrl || !anonKey) throw new Error('Supabase non configuré')
  return fetch(`${supabaseUrl}/functions/v1/${name}`, {
    ...init,
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
  })
}

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder }
  // Le serveur a tranché : ces jeux ont été pris entre-temps, rien n'est réservé
  | { ok: false; reason: 'unavailable'; unavailable: string[] }
  | { ok: false; reason: 'payment_unavailable' | 'error' }

export async function createOrder(gameIds: string[], buyer: Buyer): Promise<CreateOrderResult> {
  const response = await call('create-order', { method: 'POST', body: JSON.stringify({ game_ids: gameIds, ...buyer }) })
  const body = await response.json().catch(() => ({}))
  if (response.ok) return { ok: true, order: body as CreatedOrder }
  if (response.status === 409) return { ok: false, reason: 'unavailable', unavailable: body.unavailable ?? [] }
  return { ok: false, reason: response.status === 502 ? 'payment_unavailable' : 'error' }
}

export async function fetchOrder(token: string): Promise<OrderView | null> {
  const response = await call(`order-status?token=${encodeURIComponent(token)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error('order-status')
  return (await response.json()) as OrderView
}

// Le paiement embarqué a besoin d'un jeton à usage unique : on le garde le temps de l'onglet.
const sessionKey = (token: string) => `bourso-jeux:paiement:${token}`

export function savePaymentStart(token: string, payment: PaymentStart) {
  try {
    sessionStorage.setItem(sessionKey(token), JSON.stringify(payment))
  } catch {
    // stockage indisponible : la page de commande expliquera comment recommencer
  }
}

export function loadPaymentStart(token: string): PaymentStart | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(token))
    return raw ? (JSON.parse(raw) as PaymentStart) : null
  } catch {
    return null
  }
}
