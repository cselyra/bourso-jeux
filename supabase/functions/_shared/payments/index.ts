import { createPayzenProvider } from './payzen.ts'
import type { PaymentMode, PaymentProvider } from './types.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`secret manquant : ${name}`)
  return value
}

// Un prestataire de plus = une entrée de plus ici.
const providers: Record<string, () => PaymentProvider> = {
  payzen: () =>
    createPayzenProvider({
      shopId: required('PAYZEN_SHOP_ID'),
      password: required('PAYZEN_PASSWORD'),
      publicKey: required('PAYZEN_PUBLIC_KEY'),
      apiEndpoint: Deno.env.get('PAYZEN_API_ENDPOINT'),
      staticEndpoint: Deno.env.get('PAYZEN_STATIC_ENDPOINT'),
    }),
}

export function getProvider(name = Deno.env.get('PAYMENT_PROVIDER') ?? 'payzen'): PaymentProvider {
  const create = providers[name]
  if (!create) throw new Error(`prestataire de paiement inconnu : ${name}`)
  return create()
}

export function getPaymentMode(): PaymentMode {
  return Deno.env.get('PAYMENT_MODE') === 'embedded' ? 'embedded' : 'link'
}

// Durée pendant laquelle les jeux restent bloqués en attendant le paiement.
export function holdFor(mode: PaymentMode) {
  return mode === 'embedded'
    ? `${Deno.env.get('HOLD_MINUTES_EMBEDDED') ?? '20'} minutes`
    : `${Deno.env.get('HOLD_HOURS_LINK') ?? '24'} hours`
}

export function webhookUrl(provider: string) {
  return `${required('SUPABASE_URL')}/functions/v1/payment-webhook/${provider}`
}
