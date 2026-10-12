import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartLineList, LostGamesAlert } from '@/components/cart-lines'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PickupInfo } from '@/components/pickup-info'
import { Label } from '@/components/ui/label'
import { useCartLines } from '@/hooks/use-cart-lines'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/games'
import { type OrderView, createOrder, savePaymentStart } from '@/lib/orders'
import { supabase } from '@/lib/supabase'

const ERRORS = {
  unavailable: "Trop tard pour une partie du panier : quelqu'un a acheté juste avant vous. Rien n'a été commandé, retirez les jeux concernés pour continuer.",
  payment_unavailable: "Le paiement n'a pas pu être préparé. Rien n'a été commandé, réessayez dans un instant.",
  error: "La commande n'a pas abouti. Vérifiez vos coordonnées et réessayez.",
}

const fields = [
  { name: 'name', label: 'Nom et prénom', type: 'text', autoComplete: 'name', minLength: 2, maxLength: 100 },
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', maxLength: 200 },
  { name: 'phone', label: 'Téléphone', type: 'tel', autoComplete: 'tel', pattern: '\\+?[\\d\\s.\\-]{6,20}', maxLength: 20 },
] as const

export function CheckoutPage() {
  const cart = useCart()
  const { lines, lost, available, total, loaded } = useCartLines()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [error, setError] = useState<keyof typeof ERRORS | null>(null)

  // Vider le panier avant d'avoir quitté la page ferait apparaître « panier vide » un instant.
  const afterLeave = useRef<(() => void) | null>(null)
  useEffect(() => () => afterLeave.current?.(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    cart.setCheckingOut(true)
    try {
      const ids = available.map((line) => line.id)
      const result = await createOrder(ids, buyer)
      if (result.ok) {
        const { token, payment, amount_cents, expires_at } = result.order
        savePaymentStart(token, payment)
        afterLeave.current = () => {
          cart.remove(...ids)
          cart.setCheckingOut(false)
        }
        if (payment.kind === 'redirect') {
          window.location.assign(payment.url)
          return
        }
        // On connaît déjà la commande : sa page s'affiche complète, sans écran de chargement.
        queryClient.setQueryData<OrderView>(['order', token], {
          status: 'pending',
          amount_cents,
          expires_at,
          paid_at: null,
          payment_mode: payment.kind === 'embedded' ? 'embedded' : 'link',
          provider: payment.provider,
          buyer_email: buyer.email.trim().toLowerCase(),
          items: available.map((line) => ({ title: line.game?.title ?? '', price_cents: line.game?.price_cents ?? 0 })),
        })
        void navigate(`/commande/${token}`)
        return
      }
      setError(result.reason)
      // L'état des jeux fait foi : on le relit pour désigner ceux qui sont partis.
      void queryClient.invalidateQueries({ queryKey: ['games'] })
      cart.setCheckingOut(false)
    } catch {
      setError('error')
      cart.setCheckingOut(false)
    }
  }

  if (loaded && lines.length === 0 && !cart.checkingOut) {
    return (
      <div className="px-4 py-24 text-center">
        <h1 className="text-4xl font-extrabold">Votre panier est vide</h1>
        <Link to="/" className="mt-4 inline-block font-semibold text-ink underline underline-offset-4">
          Retour au catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_22rem]">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold">Finaliser ma commande</h1>
          <p className="mt-2 text-muted-foreground">
            Vos jeux sont bloqués pour vous dès la validation, le temps de régler par carte.
          </p>
        </div>

        {/* Mis à jour en direct : un jeu pris pendant la saisie est signalé ici, sans perdre le formulaire. */}
        <LostGamesAlert lost={lost} onRemove={(ids) => cart.remove(...ids)} />

        {error && (
          <Alert className="border-2 border-ink bg-sun/30">
            <AlertTitle>Commande non enregistrée</AlertTitle>
            <AlertDescription className="text-foreground">{ERRORS[error]}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 rounded-xl border-2 border-ink bg-card p-5 shadow-box">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={field.name} className="font-semibold">
                {field.label}
              </Label>
              <Input
                {...field}
                id={field.name}
                required
                value={buyer[field.name]}
                onChange={(event) => setBuyer((current) => ({ ...current, [field.name]: event.target.value }))}
                className="h-11 border-2 border-ink bg-paper text-base"
              />
            </div>
          ))}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={!supabase || cart.checkingOut || lost.length > 0 || available.length === 0}
          className="h-12 w-full border-2 border-ink text-base font-bold"
        >
          {cart.checkingOut ? 'Commande en cours…' : `Valider et payer · ${formatPrice(total)}`}
        </Button>
        {!supabase && <p className="text-center text-sm text-ink">Commande indisponible en mode démo.</p>}
      </form>

      <aside className="h-fit rounded-xl border-2 border-ink bg-secondary p-5">
        <h2 className="text-xl font-bold">Votre sélection</h2>
        <CartLineList lines={lines} onRemove={cart.checkingOut ? undefined : cart.remove} />
        <p className="font-heading mt-3 flex items-baseline justify-between border-t-2 border-ink pt-3 text-xl font-bold">
          Total <span>{formatPrice(total)}</span>
        </p>
        <h2 className="mt-5 mb-2 text-base font-bold">Retrait des jeux</h2>
        <PickupInfo />
      </aside>
    </div>
  )
}
