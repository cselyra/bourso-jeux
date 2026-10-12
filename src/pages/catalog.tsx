import { MapPin, RotateCcw, Search, SlidersHorizontal, Store } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { FiltersPanel } from '@/components/filters-panel'
import { GameCard } from '@/components/game-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useFilters } from '@/hooks/use-filters'
import { useGames, useNow } from '@/hooks/use-games'
import { useCart } from '@/lib/cart'
import { type SortKey, SORTS, applyFilters, countActive } from '@/lib/filters'
import { visibleStatus } from '@/lib/games'
import { pickupWhen, pickupWhere } from '@/lib/pickup'

const GRID = 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

export function CatalogPage() {
  const { data: games, isPending, isError, refetch } = useGames()
  const now = useNow(games)
  const { filters, update, reset } = useFilters()
  const cart = useCart()

  const priceCeiling = useMemo(() => {
    const max = Math.max(0, ...(games ?? []).filter((g) => visibleStatus(g, now)).map((g) => g.price_cents))
    return Math.max(5, Math.ceil(max / 500) * 5)
  }, [games, now])

  const results = useMemo(() => applyFilters(games ?? [], filters, now), [games, filters, now])
  const active = countActive(filters)
  const panel = <FiltersPanel filters={filters} onChange={update} priceCeiling={priceCeiling} />

  return (
    <>
      <section className="dot-texture overflow-hidden border-b-2 border-ink bg-ink text-white">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-10 px-4 py-10 sm:px-6 sm:py-14">
          <div>
            <p className="stamp mb-4 -rotate-2 text-sun">Jeux d'occasion</p>
            <h1 className="max-w-3xl text-4xl leading-[1.05] font-extrabold text-balance sm:text-6xl">
              La bourse aux jeux de société
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">
              Réservez en ligne, réglez par carte, puis venez chercher vos jeux. Premier arrivé, premier servi.
            </p>
            <p className="mt-4 inline-flex max-w-xl items-start gap-2 rounded-lg border-2 border-sun px-3 py-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-sun" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Retrait le {pickupWhen}</strong> · {pickupWhere}
              </span>
            </p>
          </div>

          {/* Le logo sur une tuile blanche, entouré des carrés arrondis de l'identité du CSE */}
          <div className="relative mr-6 hidden shrink-0 md:block" aria-hidden="true">
            <div className="absolute -top-5 -left-9 size-44 -rotate-12 rounded-3xl bg-sun" />
            <div className="absolute -right-8 -bottom-6 size-44 rotate-12 rounded-3xl bg-teal" />
            <div className="relative rotate-2 rounded-3xl bg-white p-6 shadow-[6px_6px_0_0_rgb(0_0_0/0.25)]">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={841} height={921} className="h-56 w-auto" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[96rem] gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border-2 border-ink bg-card p-5 shadow-box">
            {panel}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={filters.q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="Rechercher un jeu, un éditeur…"
                aria-label="Rechercher un jeu"
                className="h-10 border-2 border-ink bg-paper pl-9 text-base"
              />
            </div>

            <Sheet>
              <SheetTrigger render={<Button variant="outline" className="h-10 border-2 border-ink bg-paper px-3 font-bold lg:hidden" />}>
                <SlidersHorizontal aria-hidden="true" />
                Filtres{active > 0 && ` (${active})`}
              </SheetTrigger>
              <SheetContent side="left" className="w-full gap-0 border-r-2 border-ink sm:max-w-sm">
                <SheetHeader className="border-b-2 border-ink">
                  <SheetTitle className="text-2xl font-bold">Filtres</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-4">{panel}</div>
              </SheetContent>
            </Sheet>

            <select
              value={filters.sort}
              onChange={(event) => update({ sort: event.target.value as SortKey })}
              aria-label="Trier les jeux"
              className="h-10 rounded-lg border-2 border-ink bg-paper px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>

          {games && (
            <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                {results.length} {results.length > 1 ? 'jeux' : 'jeu'}
              </p>
              {active > 0 && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw aria-hidden="true" />
                  Effacer les filtres
                </Button>
              )}
            </div>
          )}

          {isPending && (
            <div className={GRID}>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-96 rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <Alert className="border-2 border-ink">
              <AlertTitle>Impossible de charger les jeux</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Vérifiez votre connexion puis réessayez.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {games && results.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-input px-6 py-16 text-center">
              <h2 className="text-2xl font-bold">Aucun jeu ne correspond</h2>
              <p className="mt-2 text-muted-foreground">Élargissez votre recherche ou retirez un filtre.</p>
              {active > 0 && (
                <Button className="mt-5 border-2 border-ink font-bold" onClick={reset}>
                  Effacer les filtres
                </Button>
              )}
            </div>
          )}

          {/* Chaque carte s'anime seule : la liste se met à jour sans rechargement ni saut de page. */}
          <ul className={GRID}>
            <AnimatePresence mode="popLayout" initial={false}>
              {results.map((game) => (
                <motion.li
                  key={game.id}
                  layout
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  <GameCard
                    game={game}
                    status={visibleStatus(game, now) ?? 'available'}
                    now={now}
                    inCart={cart.has(game.id)}
                    onToggleCart={() => (cart.has(game.id) ? cart.remove(game.id) : cart.add(game.id))}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {/* Rappel du partenariat du CSE, pour qui n'a pas trouvé son jeu ici */}
          {games && (
            <aside className="mt-10 flex flex-col gap-4 rounded-xl border-2 border-ink bg-sun p-5 shadow-box sm:flex-row sm:items-center sm:p-6">
              <Store className="size-10 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">Vous ne trouvez pas votre bonheur ?</h2>
                <p className="mt-1 text-base">
                  Pensez au partenariat du CSE : la boutique <strong>Jeux du Monde</strong>, à Toulouse, accorde{' '}
                  <strong>10 % de réduction aux salariés Lyra</strong>.
                </p>
              </div>
            </aside>
          )}
        </main>
      </div>
    </>
  )
}
