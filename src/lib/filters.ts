import { type Game, type GameCondition, type VisibleStatus, CONDITIONS, visibleStatus } from '@/lib/games'

export type DurationKey = 'court' | 'moyen' | 'long' | 'tres_long'
export type SortKey = 'titre' | 'prix_asc' | 'prix_desc' | 'duree'

export interface Filters {
  q: string
  players: number | null
  durations: DurationKey[]
  age: number | null
  conditions: GameCondition[]
  statuses: VisibleStatus[]
  maxPrice: number | null
  sort: SortKey
}

export const DURATIONS: { value: DurationKey; label: string; match: (minutes: number) => boolean }[] = [
  { value: 'court', label: '30 min ou moins', match: (m) => m <= 30 },
  { value: 'moyen', label: '30 min à 1 h', match: (m) => m > 30 && m <= 60 },
  { value: 'long', label: '1 h à 2 h', match: (m) => m > 60 && m <= 120 },
  { value: 'tres_long', label: 'Plus de 2 h', match: (m) => m > 120 },
]

export const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8]
export const MAX_PLAYER_CHOICE = 8
export const AGES = [4, 6, 8, 10, 12, 14]

export const STATUSES: { value: VisibleStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'reserved', label: 'Réservé' },
]

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'titre', label: 'Titre (A → Z)' },
  { value: 'prix_asc', label: 'Prix croissant' },
  { value: 'prix_desc', label: 'Prix décroissant' },
  { value: 'duree', label: 'Parties les plus courtes' },
]

export const EMPTY_FILTERS: Filters = {
  q: '',
  players: null,
  durations: [],
  age: null,
  conditions: [],
  statuses: [],
  maxPrice: null,
  sort: 'titre',
}

const list = <T extends string>(raw: string | null, allowed: readonly T[]) =>
  (raw?.split(',') ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v))

const int = (raw: string | null) => {
  const n = raw === null ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('tri')
  return {
    q: params.get('q') ?? '',
    players: int(params.get('joueurs')),
    durations: list(params.get('duree'), DURATIONS.map((d) => d.value)),
    age: int(params.get('age')),
    conditions: list(params.get('etat'), CONDITIONS.map((c) => c.value)),
    statuses: list(params.get('statut'), STATUSES.map((s) => s.value)),
    maxPrice: int(params.get('prix')),
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortKey) : 'titre',
  }
}

export function serializeFilters(f: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (f.q) params.set('q', f.q)
  if (f.players) params.set('joueurs', String(f.players))
  if (f.durations.length) params.set('duree', f.durations.join(','))
  if (f.age) params.set('age', String(f.age))
  if (f.conditions.length) params.set('etat', f.conditions.join(','))
  if (f.statuses.length) params.set('statut', f.statuses.join(','))
  if (f.maxPrice) params.set('prix', String(f.maxPrice))
  if (f.sort !== 'titre') params.set('tri', f.sort)
  return params
}

export function countActive(f: Filters) {
  return (
    Number(f.q !== '') +
    Number(f.players !== null) +
    Number(f.age !== null) +
    Number(f.maxPrice !== null) +
    f.durations.length +
    f.conditions.length +
    f.statuses.length
  )
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function matches(game: Game, f: Filters, status: VisibleStatus) {
  if (f.statuses.length && !f.statuses.includes(status)) return false
  if (f.players !== null) {
    const fits =
      f.players >= MAX_PLAYER_CHOICE
        ? game.max_players >= MAX_PLAYER_CHOICE
        : game.min_players <= f.players && f.players <= game.max_players
    if (!fits) return false
  }
  if (f.durations.length && !DURATIONS.some((d) => f.durations.includes(d.value) && d.match(game.duration_min))) {
    return false
  }
  if (f.age !== null && game.age_min > f.age) return false
  if (f.conditions.length && (game.condition === null || !f.conditions.includes(game.condition))) return false
  if (f.maxPrice !== null && game.price_cents > f.maxPrice * 100) return false
  if (f.q) {
    const q = normalize(f.q.trim())
    if (!normalize(`${game.title} ${game.publisher ?? ''}`).includes(q)) return false
  }
  return true
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
const byTitle = (a: Game, b: Game) => collator.compare(a.title, b.title)

const comparators: Record<SortKey, (a: Game, b: Game) => number> = {
  titre: byTitle,
  prix_asc: (a, b) => a.price_cents - b.price_cents || byTitle(a, b),
  prix_desc: (a, b) => b.price_cents - a.price_cents || byTitle(a, b),
  duree: (a, b) => a.duration_min - b.duration_min || byTitle(a, b),
}

// Les jeux vendus ou retirés ne sont jamais renvoyés, quel que soit le filtre.
export function applyFilters(games: Game[], f: Filters, now: number): Game[] {
  return games
    .filter((game) => {
      const status = visibleStatus(game, now)
      return status !== null && matches(game, f, status)
    })
    .sort(comparators[f.sort])
}
