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
  neuf: 'text-felt',
  comme_neuf: 'text-felt',
  tres_bon: 'text-ink',
  bon: 'text-ink',
  correct: 'text-meeple',
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

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border-2 border-ink bg-card shadow-box transition duration-200',
        reserved ? 'shadow-box-sm' : 'hover:-translate-x-0.5 hover:-translate-y-1 hover:shadow-box-lg',
      )}
    >
      <div className="relative aspect-[4/3] border-b-2 border-ink">
        <div className={cn('size-full transition duration-300', reserved && 'opacity-75 grayscale')}>
          <GameCover game={game} />
        </div>
        {reserved && (
          <span className="stamp absolute bottom-3 left-3 -rotate-6 border-[3px] bg-paper px-2.5 py-1.5 text-sm text-meeple">
            Réservé
          </span>
        )}
        <span className="font-heading absolute -top-px -right-px rounded-bl-xl border-b-2 border-l-2 border-ink bg-mustard px-3 py-1 text-lg font-black">
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
            <Meeple className="size-4 text-meeple" />
            {formatPlayers(game)}
          </li>
          <li className="flex items-center gap-1.5">
            <Hourglass className="size-4 text-felt" aria-hidden="true" />
            {formatDuration(game.duration_min)}
          </li>
          <li className="flex items-center gap-1.5">
            <Cake className="size-4 text-felt" aria-hidden="true" />
            dès {game.age_min} ans
          </li>
        </ul>

        <p>
          <span className={cn('stamp -rotate-2', conditionTone[game.condition])}>{conditionLabel(game.condition)}</span>
        </p>

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
                inCart ? 'bg-paper text-felt hover:bg-muted' : 'bg-felt text-primary-foreground hover:bg-felt-deep',
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
