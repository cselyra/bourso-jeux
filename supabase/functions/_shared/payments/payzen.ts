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
  // Clé de la boutique (« clé de test » / « clé de production ») : elle signe les notifications
  // des paiements faits sur la page hébergée, donc indispensable en mode lien.
  formKey?: string
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

async function hmacSha256Base64(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)))
  return btoa(String.fromCharCode(...signature))
}

async function sha1Hex(message: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', encoder.encode(message)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const FORM_STATUS: Record<string, PaymentEvent['status']> = {
  AUTHORISED: 'paid',
  CAPTURED: 'paid',
  ACCEPTED: 'paid',
  REFUSED: 'failed',
  ABANDONED: 'failed',
  CANCELLED: 'failed',
  EXPIRED: 'failed',
}

// Notification au format de l'API formulaire : la signature porte sur les valeurs des champs
// vads_*, triés par nom et joints par « + », suivis de la clé de la boutique.
async function parseFormNotification(form: FormData, formKey: string | undefined): Promise<PaymentEvent> {
  if (!formKey) {
    throw new WebhookRejected('notification au format formulaire (lien de paiement) reçue, mais le secret PAYZEN_FORM_KEY n’est pas défini')
  }
  const fields: Record<string, string> = {}
  for (const [name, value] of form.entries()) {
    if (name.startsWith('vads_') && typeof value === 'string') fields[name] = value
  }
  const message = [...Object.keys(fields).sort().map((name) => fields[name]), formKey].join('+')
  const received = String(form.get('signature'))
  // Selon le réglage de la boutique : HMAC-SHA-256 en base64, ou SHA-1 en hexadécimal (ancien)
  const expected = /^[0-9a-f]{40}$/i.test(received) ? await sha1Hex(message) : await hmacSha256Base64(formKey, message)
  if (!timingSafeEqual(expected, /^[0-9a-f]{40}$/i.test(received) ? received.toLowerCase() : received)) {
    throw new WebhookRejected('signature incorrecte (format formulaire) : PAYZEN_FORM_KEY ne correspond pas à la clé de la boutique (test ou production)', { ...fields, signature: received })
  }

  const amount = Number.parseInt(fields.vads_amount ?? '', 10)
  return {
    orderId: fields.vads_order_id ?? '',
    transactionId: fields.vads_trans_uuid ?? '',
    status: FORM_STATUS[fields.vads_trans_status] ?? 'pending',
    amountCents: Number.isFinite(amount) ? amount : null,
    raw: fields,
  }
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
        // Préremplit l'e-mail sur la page de paiement
        customer: { email: order.buyerEmail },
        expirationDate: new Date(order.expiresAt.getTime() - LINK_EXPIRY_MARGIN_MS).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
        locale: 'fr_FR',
      })
      return { kind: 'link', providerRef: answer.paymentOrderId ?? null }
    },

    async parseWebhook(request: Request): Promise<PaymentEvent> {
      const form = await request.formData()
      // Un paiement fait sur la page hébergée (lien de paiement) est notifié au format « formulaire ».
      if (form.has('vads_trans_status') && form.has('signature')) return parseFormNotification(form, config.formKey)

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
