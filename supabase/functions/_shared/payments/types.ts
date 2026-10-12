// Contrat commun à tous les prestataires de paiement. Le reste de l'application ne connaît
// que ces types : changer de prestataire, c'est écrire un nouveau fichier qui les respecte.

export type PaymentMode = 'link' | 'embedded'

export interface OrderToPay {
  id: string
  amountCents: number
  buyerEmail: string
  expiresAt: Date
}

export type PaymentSession =
  // Le prestataire envoie lui-même le lien de paiement à l'acheteur
  | { kind: 'link'; providerRef: string | null }
  // Formulaire affiché dans notre page ; `client` est transmis tel quel au composant du prestataire
  | { kind: 'embedded'; providerRef: string | null; client: Record<string, string> }
  // Page de paiement hébergée par le prestataire
  | { kind: 'redirect'; providerRef: string | null; url: string }

export interface PaymentEvent {
  orderId: string
  transactionId: string
  status: 'paid' | 'failed' | 'pending'
  amountCents: number | null
  raw: unknown
}

export interface PaymentProvider {
  name: string
  createPayment(order: OrderToPay, mode: PaymentMode, webhookUrl: string): Promise<PaymentSession>
  // Doit lever WebhookRejected si la notification n'est pas authentique
  parseWebhook(request: Request): Promise<PaymentEvent>
}

export class WebhookRejected extends Error {
  // `received` : ce qui a été reçu, conservé pour pouvoir traiter le paiement à la main
  constructor(message: string, public received?: unknown) {
    super(message)
  }
}
