import { CalendarClock, MapPin } from 'lucide-react'
import { pickupWhen, pickupWhere } from '@/lib/pickup'
import { cn } from '@/lib/utils'

export function PickupInfo({ className }: { className?: string }) {
  return (
    <dl className={cn('space-y-1.5 text-sm', className)}>
      <div className="flex gap-2">
        <dt>
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
          <span className="sr-only">Date du retrait</span>
        </dt>
        <dd className="font-semibold first-letter:uppercase">{pickupWhen}</dd>
      </div>
      <div className="flex gap-2">
        <dt>
          <MapPin className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
          <span className="sr-only">Lieu du retrait</span>
        </dt>
        <dd>{pickupWhere}</dd>
      </div>
    </dl>
  )
}
