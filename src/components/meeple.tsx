import type { SVGProps } from 'react'

export function Meeple(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 1.5a3.4 3.4 0 0 0-2.3 5.9C5.9 8.3 2 10.2 2 12.6c0 1.1.9 1.7 2 1.7.9 0 1.9-.4 2.8-.8L4.2 21.3c-.2.6.2 1.2.9 1.2h4.2c.4 0 .7-.2.9-.6L12 18.300l1.800 3.600c.2.4.5.6.9.6h4.2c.7 0 1.100-.6.9-1.200l-2.600-7.800c.9.4 1.900.8 2.800.8 1.100 0 2-.6 2-1.700 0-2.400-3.900-4.300-7.700-5.200A3.400 3.400 0 0 0 12 1.500z" />
    </svg>
  )
}
