import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { demoGames } from '@/lib/demo-games'
import { type Game, GAME_COLUMNS } from '@/lib/games'
import { supabase } from '@/lib/supabase'

const GAMES_KEY = ['games'] as const

async function fetchGames(): Promise<Game[]> {
  if (!supabase) return demoGames()
  const { data, error } = await supabase.from('games').select(GAME_COLUMNS).returns<Game[]>()
  if (error) throw error
  return data
}

export function useGames() {
  return useQuery({ queryKey: GAMES_KEY, queryFn: fetchGames })
}

function upsert(games: Game[], game: Game) {
  return games.some((g) => g.id === game.id) ? games.map((g) => (g.id === game.id ? game : g)) : [...games, game]
}

// À monter une seule fois : applique chaque changement de la table `games` à la ligne
// concernée du cache, sans recharger la liste.
export function useGamesRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const patch = (update: (games: Game[]) => Game[]) =>
      queryClient.setQueryData<Game[]>(GAMES_KEY, (games) => games && update(games))

    if (!supabase) {
      // Mode démo : `__demo.sell('D001')` dans la console simule un autre acheteur.
      const set = (ref: string, changes: Partial<Game>) =>
        patch((games) => games.map((g) => (g.ref === ref ? { ...g, ...changes } : g)))
      const demo = {
        reserve: (ref: string, minutes = 20) =>
          set(ref, { status: 'reserved', reserved_until: new Date(Date.now() + minutes * 60_000).toISOString() }),
        sell: (ref: string) => set(ref, { status: 'sold', reserved_until: null }),
        release: (ref: string) => set(ref, { status: 'available', reserved_until: null }),
      }
      Object.assign(window, { __demo: demo })
      return
    }

    const client = supabase
    const channel = client
      .channel('games-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        (payload: RealtimePostgresChangesPayload<Game>) => {
          if (payload.eventType === 'DELETE') {
            const { id } = payload.old
            patch((games) => games.filter((g) => g.id !== id))
          } else {
            patch((games) => upsert(games, payload.new))
          }
        },
      )
      // Des changements ont pu passer avant l'abonnement ou pendant une coupure : on resynchronise.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: GAMES_KEY })
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [queryClient])
}
