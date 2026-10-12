import { ShoppingBag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CartLineList, LostGamesAlert } from '@/components/cart-lines'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCartLines } from '@/hooks/use-cart-lines'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/games'

export function CartSheet() {
  const cart = useCart()
  const { lines, lost, available, total } = useCartLines()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  // Prévient dès qu'un jeu du panier part, même panier fermé.
  const lostKey = lost.map((line) => line.id).join(',')
  const notified = useRef(new Set<string>())
  useEffect(() => {
    for (const line of lost) {
      if (notified.current.has(line.id)) continue
      notified.current.add(line.id)
      toast.warning(`« ${line.game?.title ?? 'Un jeu de votre panier'} » ${line.lost}.`)
    }
    for (const id of notified.current) {
      if (!lost.some((line) => line.id === id)) notified.current.delete(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lostKey` résume `lost`
  }, [lostKey])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="relative flex h-10 items-center gap-2 rounded-lg border-2 border-ink bg-sun px-3 text-sm font-bold shadow-box-sm transition outline-none hover:-translate-y-0.5 hover:shadow-box focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <ShoppingBag className="size-4" aria-hidden="true" />
        Panier
        <span className="flex size-5 items-center justify-center rounded-full bg-ink text-xs text-paper" aria-label={`${cart.ids.length} jeux`}>
          {cart.ids.length}
        </span>
      </SheetTrigger>

      <SheetContent className="w-full gap-0 border-l-2 border-ink sm:max-w-md">
        <SheetHeader className="border-b-2 border-ink">
          <SheetTitle className="text-2xl font-bold">Votre panier</SheetTitle>
          <SheetDescription>Un jeu n'est bloqué pour vous qu'une fois la réservation validée.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <LostGamesAlert lost={lost} onRemove={(ids) => cart.remove(...ids)} />
          {lines.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">Votre panier est vide.</p>
          ) : (
            <CartLineList lines={lines} onRemove={cart.remove} />
          )}
        </div>

        <SheetFooter className="border-t-2 border-ink bg-secondary">
          <p className="font-heading flex items-baseline justify-between text-xl font-bold">
            Total <span>{formatPrice(total)}</span>
          </p>
          <Button
            size="lg"
            className="h-11 border-2 border-ink text-base font-bold"
            disabled={available.length === 0 || lost.length > 0}
            onClick={() => {
              setOpen(false)
              void navigate('/reservation')
            }}
          >
            Réserver ces jeux
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
