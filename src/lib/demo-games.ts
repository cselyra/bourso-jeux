import type { Game, GameCondition, GameStatus } from '@/lib/games'

type Row = [
  title: string,
  publisher: string,
  min: number,
  max: number,
  duration: number,
  age: number,
  condition: GameCondition,
  euros: number,
  status?: GameStatus,
  reservedForMinutes?: number,
]

const rows: Row[] = [
  ['7 Wonders', 'Repos Production', 3, 7, 30, 10, 'tres_bon', 22],
  ['Azul', 'Plan B Games', 2, 4, 40, 8, 'comme_neuf', 24],
  ['Carcassonne', 'Hans im Glück', 2, 5, 35, 7, 'bon', 14, 'reserved', 190],
  ['Catan', 'Kosmos', 3, 4, 75, 10, 'bon', 18],
  ['Codenames', 'Iello', 2, 8, 15, 12, 'tres_bon', 10],
  ['Dixit', 'Libellud', 3, 6, 30, 8, 'comme_neuf', 17],
  ['Dobble', 'Asmodee', 2, 8, 15, 6, 'correct', 5],
  ['Les Aventuriers du Rail', 'Days of Wonder', 2, 5, 60, 8, 'tres_bon', 25],
  ['Pandemic', 'Z-Man Games', 2, 4, 45, 8, 'bon', 16, 'reserved', 2],
  ['Splendor', 'Space Cowboys', 2, 4, 30, 10, 'neuf', 22],
  ['Terraforming Mars', 'Intrafin', 1, 5, 120, 12, 'tres_bon', 38],
  ['Wingspan', 'Matagot', 1, 5, 70, 10, 'comme_neuf', 35],
  ['Scythe', 'Matagot', 1, 5, 115, 14, 'bon', 45],
  ['Twilight Imperium', 'Fantasy Flight Games', 3, 6, 360, 14, 'tres_bon', 95],
  ['Kingdomino', 'Blue Orange', 2, 4, 15, 8, 'neuf', 12],
  ['Patchwork', 'Funforge', 2, 2, 30, 8, 'tres_bon', 11],
  ['Jaipur', 'Space Cowboys', 2, 2, 30, 12, 'bon', 9],
  ['Le Verger', 'Haba', 1, 8, 15, 3, 'correct', 8],
  ['Mysterium', 'Libellud', 2, 7, 45, 10, 'tres_bon', 26],
  ['Root', 'Matagot', 2, 4, 90, 10, 'comme_neuf', 42],
  ['Time’s Up! Family', 'Repos Production', 4, 12, 30, 8, 'bon', 9],
  ['Takenoko', 'Bombyx', 2, 4, 45, 8, 'tres_bon', 20, 'sold'],
  ['Skyjo', 'Magilano', 2, 8, 30, 8, 'neuf', 10],
  ['Agricola', 'Funforge', 1, 4, 120, 12, 'correct', 21],
]

export function demoGames(): Game[] {
  const now = Date.now()
  return rows.map(([title, publisher, min, max, duration, age, condition, euros, status, minutes], i) => ({
    id: `demo-${i + 1}`,
    ref: `D${String(i + 1).padStart(3, '0')}`,
    title,
    publisher,
    description: null,
    min_players: min,
    max_players: max,
    duration_min: duration,
    age_min: age,
    condition,
    condition_note: null,
    price_cents: euros * 100,
    price_new_cents: null,
    image_path: null,
    status: status ?? 'available',
    reserved_until: status === 'reserved' ? new Date(now + (minutes ?? 60) * 60_000).toISOString() : null,
  }))
}
