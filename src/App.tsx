import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { CartSheet } from '@/components/cart-sheet'
import { Meeple } from '@/components/meeple'
import { Toaster } from '@/components/ui/sonner'
import { useGamesRealtime } from '@/hooks/use-games'
import { CartProvider } from '@/lib/cart'
import { supabase } from '@/lib/supabase'
import { CatalogPage } from '@/pages/catalog'
import { CheckoutPage } from '@/pages/checkout'
import { OrderPage } from '@/pages/order'

const queryClient = new QueryClient()
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function Layout() {
  useGamesRealtime()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="font-heading flex items-center gap-2 text-2xl font-black tracking-tight">
            <Meeple className="size-7 text-meeple" />
            Bourso Jeux
          </Link>
          <CartSheet />
        </div>
      </header>

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/reservation" element={<CheckoutPage />} />
          <Route path="/commande/:token" element={<OrderPage />} />
          <Route
            path="*"
            element={
              <div className="px-4 py-24 text-center">
                <h1 className="text-4xl font-black">Case introuvable</h1>
                <Link to="/" className="mt-4 inline-block font-semibold text-felt underline underline-offset-4">
                  Retour au catalogue
                </Link>
              </div>
            }
          />
        </Routes>
      </div>

      <footer className="border-t-2 border-ink px-4 py-6 text-center text-sm text-muted-foreground">
        Bourso Jeux · retrait des jeux sur place
        {!supabase && <span className="font-semibold text-meeple"> · mode démo, données fictives</span>}
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <CartProvider>
          <Layout />
          <Toaster position="bottom-center" />
        </CartProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
