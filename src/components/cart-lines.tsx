import { TriangleAlert, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { CartLine } from '@/hooks/use-cart-lines'
import { formatPrice } from '@/lib/games'
import { cn } from '@/lib/utils'

export function LostGamesAlert({ lost, onRemove }: { lost: CartLine[]; onRemove: (ids: string[]) => void }) {
  if (lost.length === 0) return null
  return (
    <Alert className="border-2 border-alert bg-alert/10">
      <TriangleAlert className="text-alert" />
      <AlertTitle>{lost.length === 1 ? "Un jeu n'est plus disponible" : `${lost.length} jeux ne sont plus disponibles`}</AlertTitle>
      <AlertDescription className="space-y-2 text-foreground">
        <ul>
          {lost.map((line) => (
            <li key={line.id}>
              <strong>{line.game?.title ?? 'Ce jeu'}</strong> {line.lost}.
            </li>
          ))}
        </ul>
        <Button type="button" size="sm" variant="outline" onClick={() => onRemove(lost.map((line) => line.id))}>
          Retirer et continuer
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export function CartLineList({ lines, onRemove }: { lines: CartLine[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="divide-y-2 divide-dashed divide-border">
      {lines.map((line) => (
        <li key={line.id} className="flex items-center gap-3 py-3">
          <div className={cn('min-w-0 flex-1', line.lost && 'text-muted-foreground line-through')}>
            <p className="font-heading truncate text-lg font-bold">{line.game?.title ?? 'Jeu retiré'}</p>
            {line.game?.publisher && <p className="truncate text-xs">{line.game.publisher}</p>}
          </div>
          {line.game && (
            <span className={cn('font-heading font-bold', line.lost && 'text-muted-foreground line-through')}>
              {formatPrice(line.game.price_cents)}
            </span>
          )}
          {onRemove && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onRemove(line.id)}
              aria-label={`Retirer ${line.game?.title ?? 'ce jeu'} du panier`}
            >
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
