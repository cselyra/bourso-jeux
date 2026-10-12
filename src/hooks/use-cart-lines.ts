import { useGames, useNow } from '@/hooks/use-games'
import { useCart } from '@/lib/cart'
import { type Game, effectiveStatus } from '@/lib/games'

export interface CartLine {
  id: string
  game: Game | undefined
  // null tant que le jeu peut être réservé
  lost: string | null
}

function lostReason(game: Game | undefined, now: number) {
  if (!game) return "n'est plus en vente"
  switch (effectiveStatus(game, now)) {
    case 'available':
      return null
    case 'reserved':
      return "vient d'être vendu"
    case 'sold':
      return "vient d'être vendu"
    case 'withdrawn':
      return "n'est plus en vente"
  }
}

// Le panier confronté en direct à l'état des jeux.
export function useCartLines() {
  const cart = useCart()
  const { data: games } = useGames()
  const now = useNow(games)

  const lines: CartLine[] = games
    ? cart.ids.map((id) => {
        const game = games.find((g) => g.id === id)
        return { id, game, lost: cart.checkingOut ? null : lostReason(game, now) }
      })
    : []
  const lost = lines.filter((line) => line.lost !== null)
  const available = lines.filter((line) => line.lost === null)
  const total = available.reduce((sum, line) => sum + (line.game?.price_cents ?? 0), 0)

  return { lines, lost, available, total, loaded: games !== undefined }
}
