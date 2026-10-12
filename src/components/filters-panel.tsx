import type { ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { AGES, DURATIONS, type Filters, MAX_PLAYER_CHOICE, PLAYER_COUNTS, STATUSES } from '@/lib/filters'
import { CONDITIONS, formatPrice } from '@/lib/games'

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-w-9 rounded-full border-2 px-3 py-1 text-sm font-semibold transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        pressed ? 'border-ink bg-ink text-paper' : 'border-input bg-paper hover:border-ink',
      )}
    >
      {children}
    </button>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="font-heading text-base font-bold">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

const toggle = <T,>(values: T[], value: T) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value]

interface FiltersPanelProps {
  filters: Filters
  onChange: (changes: Partial<Filters>) => void
  priceCeiling: number
}

export function FiltersPanel({ filters, onChange, priceCeiling }: FiltersPanelProps) {
  const price = Math.min(filters.maxPrice ?? priceCeiling, priceCeiling)

  return (
    <div className="space-y-6">
      <Group title="Disponibilité">
        {STATUSES.map((s) => (
          <Chip
            key={s.value}
            pressed={filters.statuses.includes(s.value)}
            onClick={() => onChange({ statuses: toggle(filters.statuses, s.value) })}
          >
            {s.label}
          </Chip>
        ))}
      </Group>

      <Group title="Nombre de joueurs">
        {PLAYER_COUNTS.map((n) => (
          <Chip key={n} pressed={filters.players === n} onClick={() => onChange({ players: filters.players === n ? null : n })}>
            {n === MAX_PLAYER_CHOICE ? `${n}+` : n}
          </Chip>
        ))}
      </Group>

      <Group title="Durée d'une partie">
        {DURATIONS.map((d) => (
          <Chip
            key={d.value}
            pressed={filters.durations.includes(d.value)}
            onClick={() => onChange({ durations: toggle(filters.durations, d.value) })}
          >
            {d.label}
          </Chip>
        ))}
      </Group>

      <Group title="Âge du plus jeune joueur">
        {AGES.map((age) => (
          <Chip key={age} pressed={filters.age === age} onClick={() => onChange({ age: filters.age === age ? null : age })}>
            {age} ans
          </Chip>
        ))}
      </Group>

      <Group title="État de la boîte">
        {CONDITIONS.map((c) => (
          <Chip
            key={c.value}
            pressed={filters.conditions.includes(c.value)}
            onClick={() => onChange({ conditions: toggle(filters.conditions, c.value) })}
          >
            {c.label}
          </Chip>
        ))}
      </Group>

      <fieldset className="space-y-3">
        <legend className="font-heading flex w-full items-baseline justify-between text-base font-bold">
          Prix maximum
          <span className="font-sans text-sm font-semibold">
            {filters.maxPrice === null ? 'Tous les prix' : formatPrice(price * 100)}
          </span>
        </legend>
        <Slider
          aria-label="Prix maximum"
          min={1}
          max={priceCeiling}
          value={[price]}
          onValueChange={(value) => {
            const next = typeof value === 'number' ? value : value[0]
            onChange({ maxPrice: next >= priceCeiling ? null : next })
          }}
        />
      </fieldset>
    </div>
  )
}
