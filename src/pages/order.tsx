import { useQuery } from '@tanstack/react-query'
import { type ComponentType, type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PayzenForm from '@/components/payments/payzen-form'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPrice } from '@/lib/games'
import { type OrderView, fetchOrder, loadPaymentStart } from '@/lib/orders'

interface EmbeddedFormProps {
  client: Record<string, string>
  onSubmitted: () => void
}

// Formulaires embarqués par prestataire : en ajouter un ici suffit côté front.
const embeddedForms: Record<string, ComponentType<EmbeddedFormProps>> = {
  payzen: PayzenForm,
}

const deadline = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function Panel({ tone, stamp, title, children }: { tone: string; stamp: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-card p-6 shadow-box">
      <p className={`stamp mb-3 -rotate-2 ${tone}`}>{stamp}</p>
      <h1 className="text-3xl font-black text-balance sm:text-4xl">{title}</h1>
      <div className="mt-3 space-y-3 text-base">{children}</div>
    </div>
  )
}

function Pending({ order, token }: { order: OrderView; token: string }) {
  const [submitted, setSubmitted] = useState(false)
  const before = <strong>{deadline.format(new Date(order.expires_at))}</strong>

  if (order.payment_mode === 'link') {
    return (
      <Panel tone="text-felt" stamp="Jeux réservés" title="Il ne reste qu'à payer">
        <p>
          Un e-mail contenant votre lien de paiement vient d'être envoyé à <strong>{order.buyer_email}</strong>.
        </p>
        <p>Vos jeux sont bloqués pour vous jusqu'au {before}. Passé ce délai, ils sont remis en vente.</p>
        <p className="text-sm text-muted-foreground">Pensez à vérifier vos courriers indésirables. Cette page se met à jour dès le paiement reçu.</p>
      </Panel>
    )
  }

  const start = loadPaymentStart(token)
  const Form = embeddedForms[order.provider]
  if (start?.kind !== 'embedded' || !Form) {
    return (
      <Panel tone="text-meeple" stamp="Paiement interrompu" title="La session de paiement est perdue">
        <p>Vos jeux restent bloqués jusqu'au {before}, puis seront remis en vente : vous pourrez alors les réserver à nouveau.</p>
      </Panel>
    )
  }

  return (
    <Panel tone="text-felt" stamp="Jeux réservés" title="Réglez pour confirmer">
      <p>Vos jeux sont bloqués pour vous jusqu'au {before}.</p>
      {submitted ? (
        <p className="font-semibold">Paiement envoyé, confirmation en cours…</p>
      ) : (
        <Form client={start.client} onSubmitted={() => setSubmitted(true)} />
      )}
    </Panel>
  )
}

function Status({ order, token }: { order: OrderView; token: string }) {
  switch (order.status) {
    case 'pending':
      return <Pending order={order} token={token} />
    case 'paid':
      return (
        <Panel tone="text-felt" stamp="Payé" title="C'est à vous de jouer !">
          <p>Votre paiement est bien reçu. Vos jeux vous attendent : le retrait se fait sur place.</p>
        </Panel>
      )
    case 'conflict':
      return (
        <Panel tone="text-meeple" stamp="À rembourser" title="Paiement reçu trop tard">
          <p>
            Votre paiement est arrivé après la fin de la réservation et au moins un jeu avait été repris. Nous vous contactons à{' '}
            <strong>{order.buyer_email}</strong> pour vous rembourser.
          </p>
        </Panel>
      )
    case 'expired':
    case 'cancelled':
      return (
        <Panel tone="text-meeple" stamp={order.status === 'expired' ? 'Expirée' : 'Annulée'} title="Cette réservation n'est plus active">
          <p>Les jeux ont été remis en vente. S'ils sont encore disponibles, vous pouvez les réserver à nouveau.</p>
        </Panel>
      )
  }
}

export function OrderPage() {
  const { token = '' } = useParams()
  const { data: order, isPending, isError } = useQuery({
    queryKey: ['order', token],
    queryFn: () => fetchOrder(token),
    // Tant que le paiement est attendu, on guette la notification du prestataire.
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 4000 : false),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      {isPending && <Skeleton className="h-64 rounded-xl" />}
      {isError && <p role="alert">Impossible de charger cette commande. Rechargez la page dans un instant.</p>}
      {order === null && <p>Commande introuvable.</p>}
      {order && (
        <>
          <Status order={order} token={token} />
          <div className="rounded-xl border-2 border-ink bg-secondary p-5">
            <h2 className="text-xl font-bold">Vos jeux</h2>
            <ul className="mt-2 divide-y-2 divide-dashed divide-border">
              {order.items.map((item) => (
                <li key={item.title} className="flex justify-between gap-3 py-2">
                  <span className="font-heading text-lg font-bold">{item.title}</span>
                  <span className="font-heading font-bold">{formatPrice(item.price_cents)}</span>
                </li>
              ))}
            </ul>
            <p className="font-heading mt-2 flex justify-between border-t-2 border-ink pt-3 text-xl font-bold">
              Total <span>{formatPrice(order.amount_cents)}</span>
            </p>
          </div>
        </>
      )}
      <Link to="/" className="inline-block font-semibold text-felt underline underline-offset-4">
        Retour au catalogue
      </Link>
    </div>
  )
}
