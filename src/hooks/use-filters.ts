import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { type Filters, EMPTY_FILTERS, parseFilters, serializeFilters } from '@/lib/filters'

// Les filtres vivent dans l'URL : un lien partagé rouvre la même sélection.
export function useFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(params), [params])

  const update = useCallback(
    (changes: Partial<Filters>) =>
      setParams((current) => serializeFilters({ ...parseFilters(current), ...changes }), { replace: true }),
    [setParams],
  )

  const reset = useCallback(
    () => setParams((current) => serializeFilters({ ...EMPTY_FILTERS, sort: parseFilters(current).sort }), { replace: true }),
    [setParams],
  )

  return { filters, update, reset }
}
