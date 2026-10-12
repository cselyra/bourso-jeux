import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../migrations/20261012000100_schema.sql', import.meta.url), 'utf8')

type Reservation =
  | { ok: true; order_id: string; public_token: string; amount_cents: number; expires_at: string }
  | { ok: false; unavailable: string[] }

let db: PGlite
let games: Record<string, string>

async function reserve(refs: string[], hold = '24 hours'): Promise<Reservation> {
  const ids = refs.map((ref) => games[ref])
  const { rows } = await db.query<{ r: Reservation }>(
    `select public.reserve_games($1::uuid[], 'Ada', 'ada@example.org', '0600000000', $2::interval, 'payzen', 'link') as r`,
    [ids, hold],
  )
  return rows[0].r
}

async function gameStatus(ref: string) {
  const { rows } = await db.query<{ status: string }>('select status from games where ref = $1', [ref])
  return rows[0].status
}

async function orderStatus(id: string) {
  const { rows } = await db.query<{ status: string }>('select status from orders where id = $1', [id])
  return rows[0].status
}

async function call(fn: 'mark_order_paid' | 'cancel_order', orderId: string) {
  const sql = fn === 'mark_order_paid' ? `select mark_order_paid($1, 'tx-1') as s` : 'select cancel_order($1) as s'
  const { rows } = await db.query<{ s: string }>(sql, [orderId])
  return rows[0].s
}

function expectOk(r: Reservation): asserts r is Extract<Reservation, { ok: true }> {
  expect(r.ok).toBe(true)
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(schema)
  const { rows } = await db.query<{ ref: string; id: string }>(
    `insert into games (ref, title, min_players, max_players, duration_min, age_min, condition, price_cents)
     values ('A', 'Catan', 3, 4, 75, 10, 'bon', 1500),
            ('B', 'Azul', 2, 4, 40, 8, 'neuf', 2000),
            ('C', 'Dixit', 3, 6, 30, 8, 'tres_bon', 1200)
     returning ref, id`,
  )
  games = Object.fromEntries(rows.map((r) => [r.ref, r.id]))
})

describe('reserve_games', () => {
  it('réserve un panier et calcule le total', async () => {
    const r = await reserve(['A', 'B'])
    expectOk(r)
    expect(r.amount_cents).toBe(3500)
    expect(await gameStatus('A')).toBe('reserved')
    expect(await gameStatus('B')).toBe('reserved')
    expect(await gameStatus('C')).toBe('available')
  })

  it('refuse tout le panier si un jeu est déjà pris', async () => {
    await reserve(['A'])
    const r = await reserve(['A', 'C'])
    expect(r).toEqual({ ok: false, unavailable: [games.A] })
    expect(await gameStatus('C')).toBe('available')
  })

  it('refuse un jeu vendu', async () => {
    const first = await reserve(['A'])
    expectOk(first)
    await call('mark_order_paid', first.order_id)
    const r = await reserve(['A'])
    expect(r.ok).toBe(false)
  })

  it('rend un jeu re-réservable dès que le blocage est échu, sans attendre le nettoyage', async () => {
    const stale = await reserve(['A', 'B'], '-1 minute')
    expectOk(stale)
    const fresh = await reserve(['A'])
    expectOk(fresh)

    await db.query('select expire_orders()')
    expect(await orderStatus(stale.order_id)).toBe('expired')
    // A est tenu par la nouvelle commande, B est libéré
    expect(await gameStatus('A')).toBe('reserved')
    expect(await gameStatus('B')).toBe('available')
    expect(await orderStatus(fresh.order_id)).toBe('pending')
  })
})

describe('mark_order_paid', () => {
  it('vend les jeux et reste idempotente', async () => {
    const r = await reserve(['A', 'B'])
    expectOk(r)
    expect(await call('mark_order_paid', r.order_id)).toBe('paid')
    expect(await call('mark_order_paid', r.order_id)).toBe('paid')
    expect(await gameStatus('A')).toBe('sold')
    expect(await gameStatus('B')).toBe('sold')
  })

  it('honore un paiement tardif si les jeux sont encore libres', async () => {
    const r = await reserve(['A'], '-1 minute')
    expectOk(r)
    await db.query('select expire_orders()')
    expect(await gameStatus('A')).toBe('available')
    expect(await call('mark_order_paid', r.order_id)).toBe('paid')
    expect(await gameStatus('A')).toBe('sold')
  })

  it('passe en conflit si un jeu a été repris entre-temps', async () => {
    const late = await reserve(['A', 'B'], '-1 minute')
    expectOk(late)
    const other = await reserve(['A'])
    expectOk(other)

    expect(await call('mark_order_paid', late.order_id)).toBe('conflict')
    expect(await gameStatus('A')).toBe('reserved')
    expect(await call('mark_order_paid', other.order_id)).toBe('paid')
    expect(await gameStatus('A')).toBe('sold')
  })

  it('passe en conflit si la commande avait été annulée', async () => {
    const r = await reserve(['A'])
    expectOk(r)
    await call('cancel_order', r.order_id)
    expect(await call('mark_order_paid', r.order_id)).toBe('conflict')
    expect(await gameStatus('A')).toBe('available')
  })
})

describe('cancel_order', () => {
  it("libère les jeux d'une commande en attente", async () => {
    const r = await reserve(['A', 'B'])
    expectOk(r)
    expect(await call('cancel_order', r.order_id)).toBe('cancelled')
    expect(await gameStatus('A')).toBe('available')
    expect(await gameStatus('B')).toBe('available')
    expectOk(await reserve(['A', 'B']))
  })

  it('ne touche pas une commande payée', async () => {
    const r = await reserve(['A'])
    expectOk(r)
    await call('mark_order_paid', r.order_id)
    expect(await call('cancel_order', r.order_id)).toBe('paid')
    expect(await gameStatus('A')).toBe('sold')
  })
})
