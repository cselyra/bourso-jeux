import { Cake, Check, Hourglass, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GameCover } from '@/components/game-cover'
import { Meeple } from '@/components/meeple'
import {
  type Game,
  type GameCondition,
  type VisibleStatus,
  conditionLabel,
  formatDuration,
  formatPlayers,
  formatPrice,
  formatRemaining,
} from '@/lib/games'

const conditionTone: Record<GameCondition, string> = {
  neuf: 'text-teal',
  comme_neuf: 'text-teal',
  tres_bon: 'text-ink',
  bon: 'text-ink',
  correct: 'text-muted-foreground',
}

interface GameCardProps {
  game: Game
  status: VisibleStatus
  now: number
  inCart: boolean
  onToggleCart: () => void
}

export function GameCard({ game, status, now, inCart, onToggleCart }: GameCardProps) {
  const reserved = status === 'reserved'
  // Le prix neuf n'est un argument que s'il est plus élevé que le prix demandé
  const showNewPrice = game.price_new_cents !== null && game.price_new_cents > game.price_cents

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border-2 border-ink bg-card shadow-box transition duration-200',
        reserved ? 'shadow-box-sm' : 'hover:-translate-x-0.5 hover:-translate-y-1 hover:shadow-box-lg',
      )}
    >
      <div className="relative aspect-[4/3] border-b-2 border-ink">
        <div className={cn('size-full transition duration-300', reserved && 'opacity-40')}>
          <GameCover game={game} />
        </div>
        {reserved && (
          <span className="stamp absolute bottom-3 left-3 -rotate-6 border-[3px] bg-sun px-2.5 py-1.5 text-sm text-ink">
            Réservé
          </span>
        )}
        <span className="font-heading absolute -top-px -right-px rounded-bl-xl border-b-2 border-l-2 border-ink bg-sun px-3 py-1 text-lg font-extrabold">
          {formatPrice(game.price_cents)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          {game.publisher && (
            <p className="text-[0.7rem] font-semibold tracking-widest text-muted-foreground uppercase">{game.publisher}</p>
          )}
          <h3 className="text-xl leading-tight font-bold text-balance">{game.title}</h3>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          <li className="flex items-center gap-1.5">
            <Meeple className="size-4 text-teal" />
            {formatPlayers(game)}
          </li>
          <li className="flex items-center gap-1.5">
            <Hourglass className="size-4 text-teal" aria-hidden="true" />
            {formatDuration(game.duration_min)}
          </li>
          <li className="flex items-center gap-1.5">
            <Cake className="size-4 text-teal" aria-hidden="true" />
            dès {game.age_min} ans
          </li>
        </ul>

        {(game.condition || showNewPrice) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {game.condition && (
              <span className={cn('stamp -rotate-2', conditionTone[game.condition])}>{conditionLabel(game.condition)}</span>
            )}
            {showNewPrice && (
              <span className="text-sm text-muted-foreground">
                Neuf : <s>{formatPrice(game.price_new_cents!)}</s>
              </span>
            )}
          </p>
        )}

        <div className="mt-auto pt-1">
          {reserved ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
              De nouveau disponible dans{' '}
              <strong className="font-semibold text-foreground">{formatRemaining(game.reserved_until!, now)}</strong> si
              non payé
            </p>
          ) : (
            <button
              type="button"
              onClick={onToggleCart}
              aria-pressed={inCart}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-ink text-sm font-bold transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px',
                inCart ? 'bg-teal/15 text-ink hover:bg-teal/25' : 'bg-ink text-white hover:bg-ink/85',
              )}
            >
              {inCart ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              {inCart ? 'Dans le panier' : 'Ajouter au panier'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
