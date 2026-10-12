import {
  type OrderToPay,
  type PaymentEvent,
  type PaymentMode,
  type PaymentProvider,
  type PaymentSession,
  WebhookRejected,
} from './types.ts'

export interface PayzenConfig {
  shopId: string
  // Mot de passe de l'API REST (testpassword_… ou prodpassword_…) : il signe aussi les IPN
  password: string
  // Clé publique du formulaire embarqué (« shopId:testpublickey_… »)
  publicKey: string
  apiEndpoint?: string
  staticEndpoint?: string
}

// Le lien de paiement expire un peu avant la réservation, pour ne pas encaisser un jeu déjà libéré.
const LINK_EXPIRY_MARGIN_MS = 10 * 60_000

const encoder = new TextEncoder()

async function hmacSha256Hex(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const STATUS: Record<string, PaymentEvent['status']> = {
  PAID: 'paid',
  UNPAID: 'failed',
  ABANDONED: 'failed',
  RUNNING: 'pending',
  PARTIALLY_PAID: 'pending',
}

export function createPayzenProvider(config: PayzenConfig): PaymentProvider {
  const api = config.apiEndpoint ?? 'https://api.payzen.eu'
  const staticEndpoint = config.staticEndpoint ?? 'https://static.payzen.eu'

  async function call(service: string, body: Record<string, unknown>) {
    const response = await fetch(`${api}/api-payment/V4/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${config.shopId}:${config.password}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = await response.json()
    if (json.status !== 'SUCCESS') {
      throw new Error(`PayZen ${service} : ${json.answer?.errorCode ?? response.status} ${json.answer?.errorMessage ?? ''} ${json.answer?.detailedErrorMessage ?? ''}`)
    }
    return json.answer
  }

  return {
    name: 'payzen',

    async createPayment(order: OrderToPay, mode: PaymentMode, webhookUrl: string): Promise<PaymentSession> {
      const common = {
        amount: order.amountCents,
        currency: 'EUR',
        orderId: order.id,
        ipnTargetUrl: webhookUrl,
      }

      if (mode === 'embedded') {
        const answer = await call('Charge/CreatePayment', { ...common, customer: { email: order.buyerEmail } })
        return {
          kind: 'embedded',
          providerRef: null,
          client: { formToken: answer.formToken, publicKey: config.publicKey, endpoint: staticEndpoint },
        }
      }

      const answer = await call('Charge/CreatePaymentOrder', {
        ...common,
        channelOptions: { channelType: 'MAIL', mailOptions: { recipient: order.buyerEmail } },
        expirationDate: new Date(order.expiresAt.getTime() - LINK_EXPIRY_MARGIN_MS).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
        locale: 'fr_FR',
      })
      return { kind: 'link', providerRef: answer.paymentOrderId ?? null }
    },

    async parseWebhook(request: Request): Promise<PaymentEvent> {
      const form = await request.formData()
      const answer = form.get('kr-answer')
      const hash = form.get('kr-hash')
      // Une IPN est signée avec le mot de passe ; « sha256_hmac » désigne le retour navigateur, qu'on n'accepte pas ici.
      if (typeof answer !== 'string' || typeof hash !== 'string') {
        const fields = [...form.keys()].join(', ') || 'aucun'
        throw new WebhookRejected(`format inattendu : kr-answer ou kr-hash absent (champs reçus : ${fields}). L'URL doit être déclarée dans la section API REST.`)
      }
      if (form.get('kr-hash-key') !== 'password') {
        throw new WebhookRejected(`kr-hash-key = ${String(form.get('kr-hash-key'))} : seule une IPN signée avec le mot de passe est acceptée`)
      }
      if (!timingSafeEqual(await hmacSha256Hex(config.password, answer), hash.toLowerCase())) {
        throw new WebhookRejected('signature incorrecte : le mot de passe configuré (test ou production) ne correspond pas à celui qui a signé')
      }

      const data = JSON.parse(answer)
      const transaction = data.transactions?.[0]
      return {
        orderId: String(data.orderDetails?.orderId ?? ''),
        transactionId: String(transaction?.uuid ?? ''),
        status: STATUS[data.orderStatus] ?? 'pending',
        amountCents: typeof data.orderDetails?.orderTotalAmount === 'number' ? data.orderDetails.orderTotalAmount : null,
        raw: data,
      }
    },
  }
}
