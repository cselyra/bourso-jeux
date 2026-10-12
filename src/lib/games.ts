import { supabaseUrl } from '@/lib/supabase'

export type GameStatus = 'available' | 'reserved' | 'sold' | 'withdrawn'
export type GameCondition = 'neuf' | 'comme_neuf' | 'tres_bon' | 'bon' | 'correct'
// Ce que voit un visiteur : un jeu est en vente, ou vendu (c'est-à-dire réellement payé)
export type VisibleStatus = 'available' | 'sold'

export interface Game {
  id: string
  ref: string
  title: string
  publisher: string | null
  description: string | null
  min_players: number
  max_players: number
  duration_min: number
  age_min: number
  // null tant que l'état de la boîte n'a pas été relevé
  condition: GameCondition | null
  condition_note: string | null
  price_cents: number
  price_new_cents: number | null
  image_path: string | null
  status: GameStatus
  reserved_until: string | null
}

export const GAME_COLUMNS =
  'id, ref, title, publisher, description, min_players, max_players, duration_min, age_min, condition, condition_note, price_cents, price_new_cents, image_path, status, reserved_until'

export const CONDITIONS: { value: GameCondition; label: string }[] = [
  { value: 'neuf', label: 'Neuf' },
  { value: 'comme_neuf', label: 'Comme neuf' },
  { value: 'tres_bon', label: 'Très bon état' },
  { value: 'bon', label: 'Bon état' },
  { value: 'correct', label: 'État correct' },
]

export const conditionLabel = (condition: GameCondition) =>
  CONDITIONS.find((c) => c.value === condition)?.label ?? condition

// Un paiement en cours bloque le jeu côté serveur mais ne s'affiche pas : tant qu'il n'est pas
// payé, le jeu reste présenté comme en vente. Les jeux retirés ne sont jamais montrés.
export function visibleStatus(game: Game): VisibleStatus | null {
  if (game.status === 'sold') return 'sold'
  return game.status === 'withdrawn' ? null : 'available'
}

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
export const formatPrice = (cents: number) => euros.format(cents / 100)

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export function formatPlayers(game: Pick<Game, 'min_players' | 'max_players'>) {
  if (game.min_players === game.max_players) {
    return game.min_players === 1 ? '1 joueur' : `${game.min_players} joueurs`
  }
  return `${game.min_players} à ${game.max_players} joueurs`
}


export function imageUrl(game: Pick<Game, 'image_path'>) {
  if (!game.image_path) return null
  if (/^https?:\/\//.test(game.image_path)) return game.image_path
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/games/${game.image_path}` : null
}
