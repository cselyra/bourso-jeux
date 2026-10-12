import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPayzenProvider } from '../functions/_shared/payments/payzen.ts'
import { WebhookRejected } from '../functions/_shared/payments/types.ts'

const PASSWORD = 'testpassword_abc'
const provider = createPayzenProvider({ shopId: '12345678', password: PASSWORD, publicKey: '12345678:testpublickey_x' })

const order = {
  id: '11111111-2222-3333-4444-555555555555',
  amountCents: 4200,
  buyerEmail: 'ada@example.org',
  expiresAt: new Date('2026-10-13T12:00:00Z'),
}

function ipn(answer: object, { key = PASSWORD, hashKey = 'password' } = {}) {
  const krAnswer = JSON.stringify(answer)
  const body = new URLSearchParams({
    'kr-hash': createHmac('sha256', key).update(krAnswer).digest('hex'),
    'kr-hash-algorithm': 'sha256_hmac',
    'kr-hash-key': hashKey,
    'kr-answer-type': 'V4/Payment',
    'kr-answer': krAnswer,
  })
  return new Request('https://example.org/payment-webhook/payzen', { method: 'POST', body })
}

const paid = {
  orderStatus: 'PAID',
  orderDetails: { orderId: order.id, orderTotalAmount: 4200 },
  transactions: [{ uuid: 'tx-uuid-1', status: 'PAID' }],
}

afterEach(() => vi.unstubAllGlobals())

function stubPayzen(answer: object, status = 'SUCCESS') {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ status, answer }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('IPN PayZen', () => {
  it('accepte une notification signée avec le mot de passe', async () => {
    expect(await provider.parseWebhook(ipn(paid))).toMatchObject({
      orderId: order.id,
      transactionId: 'tx-uuid-1',
      status: 'paid',
      amountCents: 4200,
    })
  })

  it('traduit les autres statuts', async () => {
    expect((await provider.parseWebhook(ipn({ ...paid, orderStatus: 'UNPAID' }))).status).toBe('failed')
    expect((await provider.parseWebhook(ipn({ ...paid, orderStatus: 'RUNNING' }))).status).toBe('pending')
  })

  it('rejette une signature faite avec une autre clé', async () => {
    await expect(provider.parseWebhook(ipn(paid, { key: 'autre-cle' }))).rejects.toBeInstanceOf(WebhookRejected)
  })

  it('rejette un contenu modifié après signature', async () => {
    const request = ipn(paid)
    const form = new URLSearchParams(await request.text())
    form.set('kr-answer', form.get('kr-answer')!.replace('4200', '1'))
    const tampered = new Request(request.url, { method: 'POST', body: form })
    await expect(provider.parseWebhook(tampered)).rejects.toBeInstanceOf(WebhookRejected)
  })

  it('rejette un retour navigateur (signé avec la clé HMAC, pas le mot de passe)', async () => {
    await expect(provider.parseWebhook(ipn(paid, { hashKey: 'sha256_hmac' }))).rejects.toBeInstanceOf(WebhookRejected)
  })
})

describe('IPN PayZen au format formulaire (lien de paiement)', () => {
  const FORM_KEY = 'cle-de-test-1234'
  const withFormKey = createPayzenProvider({ shopId: '12345678', password: PASSWORD, publicKey: 'x', formKey: FORM_KEY })

  function formIpn(fields: Record<string, string>, { key = FORM_KEY, sha1 = false } = {}) {
    const message = [...Object.keys(fields).sort().map((name) => fields[name]), key].join('+')
    const signature = sha1
      ? createHash('sha1').update(message).digest('hex')
      : createHmac('sha256', key).update(message).digest('base64')
    return new Request('https://example.org/payment-webhook/payzen', {
      method: 'POST',
      body: new URLSearchParams({ ...fields, signature }),
    })
  }

  const fields = {
    vads_trans_status: 'AUTHORISED',
    vads_order_id: order.id,
    vads_amount: '4200',
    vads_trans_uuid: 'uuid-form-1',
    vads_cust_email: 'ada@example.org',
  }

  it('accepte une notification signée en HMAC-SHA-256', async () => {
    expect(await withFormKey.parseWebhook(formIpn(fields))).toMatchObject({
      orderId: order.id,
      transactionId: 'uuid-form-1',
      status: 'paid',
      amountCents: 4200,
    })
  })

  it('accepte l’ancienne signature SHA-1', async () => {
    expect((await withFormKey.parseWebhook(formIpn(fields, { sha1: true }))).status).toBe('paid')
  })

  it('traduit un refus', async () => {
    expect((await withFormKey.parseWebhook(formIpn({ ...fields, vads_trans_status: 'REFUSED' }))).status).toBe('failed')
  })

  it('rejette une mauvaise clé ou un montant modifié', async () => {
    await expect(withFormKey.parseWebhook(formIpn(fields, { key: 'autre' }))).rejects.toBeInstanceOf(WebhookRejected)
    const request = formIpn(fields)
    const body = new URLSearchParams(await request.text())
    body.set('vads_amount', '1')
    await expect(withFormKey.parseWebhook(new Request(request.url, { method: 'POST', body }))).rejects.toBeInstanceOf(WebhookRejected)
  })

  it('rejette explicitement si la clé de la boutique n’est pas configurée', async () => {
    await expect(provider.parseWebhook(formIpn(fields))).rejects.toThrow('PAYZEN_FORM_KEY')
  })
})

describe('création du paiement PayZen', () => {
  it('mode lien : crée un ordre de paiement par e-mail qui expire avant la réservation', async () => {
    const fetchMock = stubPayzen({ paymentOrderId: 'po-1', paymentURL: 'https://secure.payzen.eu/t/abc' })
    const session = await provider.createPayment(order, 'link', 'https://hook')

    expect(session).toEqual({ kind: 'link', providerRef: 'po-1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.payzen.eu/api-payment/V4/Charge/CreatePaymentOrder')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa(`12345678:${PASSWORD}`)}`)
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 4200,
      currency: 'EUR',
      orderId: order.id,
      ipnTargetUrl: 'https://hook',
      channelOptions: { channelType: 'MAIL', mailOptions: { recipient: 'ada@example.org' } },
      customer: { email: 'ada@example.org' },
      expirationDate: '2026-10-13T11:50:00+00:00',
      locale: 'fr_FR',
    })
  })

  it('mode embarqué : renvoie le jeton du formulaire et la clé publique', async () => {
    const fetchMock = stubPayzen({ formToken: 'token-1' })
    const session = await provider.createPayment(order, 'embedded', 'https://hook')

    expect(session).toEqual({
      kind: 'embedded',
      providerRef: null,
      client: { formToken: 'token-1', publicKey: '12345678:testpublickey_x', endpoint: 'https://static.payzen.eu' },
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.payzen.eu/api-payment/V4/Charge/CreatePayment')
  })

  it('remonte une erreur PayZen', async () => {
    stubPayzen({ errorCode: 'INT_905', errorMessage: 'invalid credentials' }, 'ERROR')
    await expect(provider.createPayment(order, 'link', 'https://hook')).rejects.toThrow('INT_905')
  })
})
