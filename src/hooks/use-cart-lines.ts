import { useGames } from '@/hooks/use-games'
import { useCart } from '@/lib/cart'
import { type Game, visibleStatus } from '@/lib/games'

export interface CartLine {
  id: string
  game: Game | undefined
  // null tant que le jeu peut être réservé
  lost: string | null
}

function lostReason(game: Game | undefined) {
  if (!game) return "n'est plus en vente"
  switch (visibleStatus(game)) {
    case 'available':
      return null
    case 'sold':
      return "vient d'être vendu"
    case null:
      return "n'est plus en vente"
  }
}

// Le panier confronté en direct à l'état des jeux.
export function useCartLines() {
  const cart = useCart()
  const { data: games } = useGames()

  const lines: CartLine[] = games
    ? cart.ids.map((id) => {
        const game = games.find((g) => g.id === id)
        return { id, game, lost: cart.checkingOut ? null : lostReason(game) }
      })
    : []
  const lost = lines.filter((line) => line.lost !== null)
  const available = lines.filter((line) => line.lost === null)
  const total = available.reduce((sum, line) => sum + (line.game?.price_cents ?? 0), 0)

  return { lines, lost, available, total, loaded: games !== undefined }
}
