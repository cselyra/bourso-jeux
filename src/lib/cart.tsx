import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'bourso-jeux:panier'

interface Cart {
  ids: string[]
  has: (id: string) => boolean
  add: (id: string) => void
  remove: (...ids: string[]) => void
  clear: () => void
  // Vrai pendant la validation : les jeux du panier passent « réservés » par nous-mêmes,
  // il ne faut pas les signaler comme pris par quelqu'un d'autre.
  checkingOut: boolean
  setCheckingOut: (value: boolean) => void
}

const CartContext = createContext<Cart | null>(null)

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// Le panier ne bloque aucun jeu : la réservation n'a lieu qu'à la validation.
export function CartProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState(load)
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    } catch {
      // stockage indisponible (navigation privée) : le panier reste en mémoire
    }
  }, [ids])

  const add = useCallback((id: string) => setIds((prev) => (prev.includes(id) ? prev : [...prev, id])), [])
  const remove = useCallback((...gone: string[]) => setIds((prev) => prev.filter((id) => !gone.includes(id))), [])
  const clear = useCallback(() => setIds([]), [])

  const cart = useMemo<Cart>(
    () => ({ ids, has: (id) => ids.includes(id), add, remove, clear, checkingOut, setCheckingOut }),
    [ids, add, remove, clear, checkingOut],
  )

  return <CartContext value={cart}>{children}</CartContext>
}

export function useCart() {
  const cart = use(CartContext)
  if (!cart) throw new Error('useCart doit être utilisé dans un CartProvider')
  return cart
}
