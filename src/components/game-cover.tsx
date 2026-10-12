import { useState } from 'react'
import { Meeple } from '@/components/meeple'
import { type Game, imageUrl } from '@/lib/games'

// Couvertures de remplacement tant qu'un jeu n'a pas de photo : [fond, texte]
const PALETTE: [string, string][] = [
  ['var(--ink)', '#ffffff'],
  ['var(--teal)', 'var(--ink)'],
  ['var(--sun)', 'var(--ink)'],
  ['var(--teal-deep)', '#ffffff'],
  ['#0a6b94', '#ffffff'],
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
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full bg-muted object-cover"
      />
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
