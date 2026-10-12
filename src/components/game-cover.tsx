import { useState } from 'react'
import { Meeple } from '@/components/meeple'
import { type Game, imageUrl } from '@/lib/games'

// Couvertures de remplacement tant qu'un jeu n'a pas de photo : [fond, texte]
const PALETTE: [string, string][] = [
  ['var(--ink)', 'var(--paper)'],
  ['var(--teal)', 'var(--ink)'],
  ['var(--sun)', 'var(--ink)'],
  ['var(--ink)', 'var(--sun)'],
  ['var(--teal)', 'var(--paper)'],
]

function hash(text: string) {
  let h = 0
  for (const char of text) h = (h * 31 + char.codePointAt(0)!) >>> 0
  return h
}

export function GameCover({ game }: { game: Game }) {
  const src = imageUrl(game)
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    // Zone blanche, photo entière : 280 × 280 px au plus, proportions conservées
    return (
      <div className="flex size-full items-center justify-center bg-paper">
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-auto max-h-[280px] w-auto max-w-[280px] object-contain"
        />
      </div>
    )
  }

  const [background, color] = PALETTE[hash(game.title) % PALETTE.length]
  return (
    <div className="dot-texture relative flex size-full items-center justify-center overflow-hidden p-5" style={{ background, color }}>
      <Meeple className="absolute -right-5 -bottom-7 size-28 rotate-12 opacity-15" />
      <span className="font-heading text-center text-2xl leading-[1.05] font-extrabold text-balance">{game.title}</span>
    </div>
  )
}
