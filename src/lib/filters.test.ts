import { describe, expect, it } from 'vitest'
import { type Filters, EMPTY_FILTERS, applyFilters, parseFilters, serializeFilters } from '@/lib/filters'
import type { Game } from '@/lib/games'

const NOW = Date.parse('2026-10-12T12:00:00Z')

function game(title: string, overrides: Partial<Game> = {}): Game {
  return {
    id: title,
    ref: title,
    title,
    publisher: null,
    description: null,
    min_players: 2,
    max_players: 4,
    duration_min: 45,
    age_min: 8,
    condition: 'bon',
    condition_note: null,
    price_cents: 1500,
    price_new_cents: null,
    image_path: null,
    status: 'available',
    reserved_until: null,
    ...overrides,
  }
}

const titles = (games: Game[], filters: Partial<Filters> = {}) =>
  applyFilters(games, { ...EMPTY_FILTERS, ...filters }, NOW).map((g) => g.title)

describe('applyFilters', () => {
  it('ne montre jamais les jeux vendus ou retirés', () => {
    const games = [game('A'), game('B', { status: 'sold' }), game('C', { status: 'withdrawn' })]
    expect(titles(games)).toEqual(['A'])
    expect(titles(games, { statuses: ['available', 'reserved'] })).toEqual(['A'])
  })

  it('filtre par statut et traite une réservation échue comme disponible', () => {
    const games = [
      game('Libre'),
      game('Tenu', { status: 'reserved', reserved_until: '2026-10-12T13:00:00Z' }),
      game('Échu', { status: 'reserved', reserved_until: '2026-10-12T11:59:00Z' }),
    ]
    expect(titles(games, { statuses: ['available'] })).toEqual(['Échu', 'Libre'])
    expect(titles(games, { statuses: ['reserved'] })).toEqual(['Tenu'])
  })

  it('filtre par nombre de joueurs, avec 8 = 8 et plus', () => {
    const games = [game('Duo', { max_players: 2 }), game('Groupe', { min_players: 4, max_players: 12 })]
    expect(titles(games, { players: 2 })).toEqual(['Duo'])
    expect(titles(games, { players: 5 })).toEqual(['Groupe'])
    expect(titles(games, { players: 8 })).toEqual(['Groupe'])
  })

  it('filtre par durée, âge, état et prix', () => {
    const games = [
      game('Court', { duration_min: 15, age_min: 4, condition: 'neuf', price_cents: 500 }),
      game('Long', { duration_min: 180, age_min: 14, condition: 'correct', price_cents: 4000 }),
    ]
    expect(titles(games, { durations: ['court'] })).toEqual(['Court'])
    expect(titles(games, { durations: ['court', 'tres_long'] })).toEqual(['Court', 'Long'])
    expect(titles(games, { age: 6 })).toEqual(['Court'])
    expect(titles(games, { conditions: ['correct'] })).toEqual(['Long'])
    expect(titles(games, { maxPrice: 5 })).toEqual(['Court'])
  })

  it('recherche sans tenir compte des accents ni de la casse', () => {
    const games = [game('Les Aventuriers du Rail'), game('Azul', { publisher: 'Éditions Plan B' })]
    expect(titles(games, { q: 'AVENTURIERS' })).toEqual(['Les Aventuriers du Rail'])
    expect(titles(games, { q: 'editions' })).toEqual(['Azul'])
  })

  it('trie par prix', () => {
    const games = [game('B', { price_cents: 900 }), game('A', { price_cents: 2000 })]
    expect(titles(games, { sort: 'prix_asc' })).toEqual(['B', 'A'])
    expect(titles(games, { sort: 'prix_desc' })).toEqual(['A', 'B'])
  })
})

describe('filtres dans l’URL', () => {
  it('fait l’aller-retour sans perte', () => {
    const filters: Filters = {
      q: 'catan',
      players: 4,
      durations: ['court', 'long'],
      age: 8,
      conditions: ['neuf', 'bon'],
      statuses: ['available'],
      maxPrice: 20,
      sort: 'prix_asc',
    }
    expect(parseFilters(serializeFilters(filters))).toEqual(filters)
  })

  it('ignore les valeurs invalides', () => {
    expect(parseFilters(new URLSearchParams('joueurs=abc&duree=nimp&tri=x&statut=sold'))).toEqual(EMPTY_FILTERS)
  })
})
