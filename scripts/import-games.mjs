// Importe l'inventaire Excel dans la table `games`.
//
//   npm run import -- "inventaire.xlsx"            simulation : n'écrit rien
//   npm run import -- "inventaire.xlsx" --apply    écrit en base et envoie les photos
//
// Relançable à volonté : chaque exemplaire a une référence stable tirée du titre, et une
// mise à jour ne touche jamais au statut (réservé, vendu) d'un jeu déjà en base.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import sharp from 'sharp'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const file = args.find((arg) => !arg.startsWith('--'))
if (!file) {
  console.error('Usage : npm run import -- "inventaire.xlsx" [--apply]')
  process.exit(1)
}

const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const slug = (text) =>
  normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// En-tête de colonne (sans accents, en minuscules) → champ. Les colonnes absentes sont ignorées.
const COLUMNS = [
  ['title', (h) => h === 'jeu' || h === 'titre'],
  ['quantity', (h) => h.startsWith('qt') || h.startsWith('quantite')],
  ['min_players', (h) => h.includes('joueurs min')],
  ['max_players', (h) => h.includes('joueurs max')],
  ['duration_min', (h) => h.startsWith('duree')],
  ['age_min', (h) => h.startsWith('age')],
  ['price_new', (h) => h.includes('prix neuf')],
  ['price', (h) => h.includes('prix de vente')],
  ['image', (h) => h.startsWith('image')],
  ['condition', (h) => h.startsWith('etat')],
  ['publisher', (h) => h.startsWith('editeur')],
  ['description', (h) => h.startsWith('description')],
]

const CONDITIONS = {
  neuf: 'neuf',
  'comme neuf': 'comme_neuf',
  'tres bon': 'tres_bon',
  'tres bon etat': 'tres_bon',
  bon: 'bon',
  'bon etat': 'bon',
  correct: 'correct',
  'etat correct': 'correct',
}

function cellValue(cell) {
  const value = cell.value
  if (value == null) return null
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value
  return value.result ?? value.text ?? (value.richText ? value.richText.map((part) => part.text).join('') : null)
}

const cellLink = (cell) => (cell.value && typeof cell.value === 'object' ? (cell.value.hyperlink ?? null) : null)

function number(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}

const cents = (euros) => (euros == null ? null : Math.round(euros * 100))

async function readInventory(path) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]

  let headerRow = 0
  const columns = {}
  sheet.eachRow((row, n) => {
    if (headerRow) return
    const headers = row.values.map((value) => normalize(typeof value === 'object' && value ? (value.text ?? '') : value))
    if (!headers.some((h) => h === 'jeu' || h === 'titre')) return
    headerRow = n
    headers.forEach((h, index) => {
      const match = COLUMNS.find(([field, test]) => !(field in columns) && h && test(h))
      if (match) columns[match[0]] = index
    })
  })
  if (!headerRow) throw new Error('Ligne d’en-tête introuvable : une colonne doit s’appeler « Jeu ».')

  const games = []
  const skipped = []
  const copiesByTitle = new Map()

  sheet.eachRow((row, n) => {
    if (n <= headerRow) return
    const read = (field) => (field in columns ? cellValue(row.getCell(columns[field])) : null)
    const title = String(read('title') ?? '').trim()
    const quantity = number(read('quantity'))
    // Lignes de total et de notes : pas de titre, ou pas un jeu
    if (!title || normalize(title) === 'total' || quantity == null) return

    const game = {
      title,
      publisher: read('publisher') ? String(read('publisher')).trim() : null,
      description: read('description') ? String(read('description')).trim() : null,
      min_players: number(read('min_players')),
      max_players: number(read('max_players')),
      duration_min: number(read('duration_min')),
      age_min: number(read('age_min')),
      price_cents: cents(number(read('price'))),
      price_new_cents: cents(number(read('price_new'))),
      condition: null,
    }

    const problems = []
    const rawCondition = read('condition')
    if (rawCondition) {
      game.condition = CONDITIONS[normalize(rawCondition)] ?? null
      if (!game.condition) problems.push(`état « ${rawCondition} » non reconnu`)
    }
    if (game.min_players == null || game.max_players == null) problems.push('nombre de joueurs manquant')
    else if (game.max_players < game.min_players) problems.push('joueurs max < joueurs min')
    if (game.duration_min == null) problems.push('durée manquante')
    if (game.age_min == null) problems.push('âge manquant')
    if (game.price_cents == null) problems.push('prix de vente manquant')

    if (problems.length) {
      skipped.push({ row: n, title, problems })
      return
    }

    const imageCell = 'image' in columns ? row.getCell(columns.image) : null
    const imageUrl = imageCell ? (cellLink(imageCell) ?? (/^https?:/.test(String(cellValue(imageCell))) ? String(cellValue(imageCell)) : null)) : null

    // Un exemplaire = une ligne en base. La numérotation continue si le titre revient plus bas.
    const base = slug(title)
    for (let i = 0; i < quantity; i++) {
      const copy = (copiesByTitle.get(base) ?? 0) + 1
      copiesByTitle.set(base, copy)
      games.push({ ...game, ref: `${base}-${copy}`, imageUrl, imageKey: base, row: n })
    }
  })

  return { games, skipped, columns }
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', Accept: 'image/*,*/*' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`type ${type || 'inconnu'}`)
  const original = Buffer.from(await response.arrayBuffer())
  // Vignette légère : 640 px suffisent pour une carte du catalogue
  return sharp(original).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
}

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match) env[match[1]] = match[2].trim()
    }
  } catch {
    // pas de .env.local
  }
  return { ...env, ...process.env }
}

// La clé service_role n'est jamais écrite sur disque : à défaut de variable, on la demande à la CLI Supabase.
function serviceRoleKey(env) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY
  const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const output = execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(output.slice(output.indexOf(output.match(/[[{]/)[0])))
  const keys = Array.isArray(parsed) ? parsed : (parsed.keys ?? parsed.api_keys ?? [])
  const key = keys.find((entry) => entry.name === 'service_role')?.api_key
  if (!key) throw new Error('clé service_role introuvable : la CLI Supabase est-elle connectée au bon compte ?')
  return key
}

const { games, skipped, columns } = await readInventory(file)
const titles = new Set(games.map((game) => game.imageKey))

console.log(`Colonnes reconnues : ${Object.keys(columns).join(', ')}`)
console.log(`${titles.size} jeux complets, soit ${games.length} exemplaires à importer.`)
if (!('condition' in columns)) console.log('Pas de colonne « État » : l’état de la boîte restera vide.')
if (skipped.length) {
  console.log(`\n${skipped.length} ligne(s) ignorée(s), à compléter dans le fichier :`)
  for (const line of skipped) console.log(`  ligne ${line.row} · ${line.title} : ${line.problems.join(', ')}`)
}
const odd = [...new Map(games.filter((g) => g.price_cents % 50 !== 0).map((g) => [g.imageKey, g])).values()]
if (odd.length) {
  console.log(`\n${odd.length} prix de vente ne tombent pas rond (à 50 centimes près) :`)
  console.log('  ' + odd.map((g) => `${g.title} ${(g.price_cents / 100).toFixed(2)} €`).join(' · '))
}
const above = [...new Map(games.filter((g) => g.price_new_cents != null && g.price_cents > g.price_new_cents).map((g) => [g.imageKey, g])).values()]
if (above.length) console.log(`\nPrix de vente supérieur au prix neuf : ${above.map((g) => g.title).join(', ')}`)

// Photos : une par titre, partagée par tous ses exemplaires
console.log('\nPhotos :')
const images = new Map()
for (const game of games) {
  if (images.has(game.imageKey)) continue
  if (!game.imageUrl) {
    images.set(game.imageKey, null)
    console.log(`  ✗ ${game.title} : pas de lien`)
    continue
  }
  try {
    images.set(game.imageKey, await fetchImage(game.imageUrl))
  } catch (cause) {
    images.set(game.imageKey, null)
    console.log(`  ✗ ${game.title} : ${cause.message} (${new URL(game.imageUrl).hostname})`)
  }
}
const found = [...images.values()].filter(Boolean)
console.log(`  ${found.length}/${images.size} photos récupérées (${Math.round(found.reduce((sum, b) => sum + b.length, 0) / 1024)} Ko au total).`)

if (!apply) {
  console.log('\nSimulation terminée, rien n’a été écrit. Ajoutez --apply pour importer.')
  process.exit(0)
}

const env = loadEnv()
if (!env.VITE_SUPABASE_URL) throw new Error('VITE_SUPABASE_URL manquant dans .env.local')
const db = createClient(env.VITE_SUPABASE_URL, serviceRoleKey(env), { auth: { persistSession: false } })

for (const [key, buffer] of images) {
  if (!buffer) continue
  const { error } = await db.storage.from('games').upload(`${key}.webp`, buffer, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(`envoi de la photo ${key} : ${error.message}`)
}

// `status` et `reserved_until` ne sont pas dans la liste : un jeu réservé ou vendu le reste.
const rows = games.map(({ imageUrl: _url, imageKey, row: _row, ...game }) => ({
  ...game,
  ...(images.get(imageKey) ? { image_path: `${imageKey}.webp` } : {}),
}))
// PostgREST exige les mêmes clés sur toutes les lignes d'un envoi : deux lots, avec et sans photo
for (const batch of [rows.filter((row) => 'image_path' in row), rows.filter((row) => !('image_path' in row))]) {
  if (batch.length === 0) continue
  const { error } = await db.from('games').upsert(batch, { onConflict: 'ref' })
  if (error) throw new Error(`écriture en base : ${error.message}`)
}

const { data: existing, error } = await db.from('games').select('ref, title, status')
if (error) throw error
const refs = new Set(games.map((game) => game.ref))
const orphans = existing.filter((game) => !refs.has(game.ref))
console.log(`\nImport terminé : ${rows.length} exemplaires en base.`)
if (orphans.length) {
  console.log(`${orphans.length} jeu(x) en base absents du fichier (non modifiés) :`)
  for (const game of orphans) console.log(`  ${game.ref} · ${game.title} (${game.status})`)
}
