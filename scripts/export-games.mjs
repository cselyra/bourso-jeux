// Exporte la table `games` dans un classeur Excel que `npm run import` sait relire.
//
//   npm run export                     → inventaire_export_AAAA-MM-JJ.xlsx
//   npm run export -- "mon-fichier.xlsx"
//
// Une ligne par jeu, avec sa quantité. Les colonnes grisées (disponibles, réservés, vendus)
// sont là pour information : l'import les ignore et ne modifie jamais un statut.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const env = { ...process.env }
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match) env[match[1]] ??= match[2].trim()
}

const CONDITION_LABELS = { neuf: 'Neuf', comme_neuf: 'Comme neuf', tres_bon: 'Très bon état', bon: 'Bon état', correct: 'État correct' }

// La lecture du catalogue est publique : la clé anon suffit.
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: games, error } = await db.from('games').select('*')
if (error) throw new Error(`lecture de la base : ${error.message}`)

// Les exemplaires d'un même jeu sont numérotés (catan-1, catan-2) : on les remet dans cet ordre,
// celui que l'import reproduira en relisant le fichier.
const parts = (ref) => {
  const match = ref.match(/^(.*)-(\d+)$/)
  return match ? [match[1], Number(match[2])] : [ref, 0]
}
games.sort((a, b) => {
  const [baseA, copyA] = parts(a.ref)
  const [baseB, copyB] = parts(b.ref)
  return a.title.localeCompare(b.title, 'fr') || baseA.localeCompare(baseB) || copyA - copyB
})

// Les exemplaires identiques sont regroupés sur une ligne ; s'ils diffèrent (prix, état), ils restent séparés.
const EDITABLE = ['title', 'publisher', 'description', 'min_players', 'max_players', 'duration_min', 'age_min', 'price_new_cents', 'price_cents', 'condition', 'image_path']
const lines = []
for (const game of games) {
  const last = lines.at(-1)
  if (last && parts(last.game.ref)[0] === parts(game.ref)[0] && EDITABLE.every((field) => last.game[field] === game[field])) {
    last.copies.push(game)
  } else {
    lines.push({ game, copies: [game] })
  }
}

const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('Inventaire', { views: [{ state: 'frozen', ySplit: 1 }] })
sheet.columns = [
  { header: 'Jeu', key: 'title', width: 44 },
  { header: 'Qté', key: 'quantity', width: 6 },
  { header: 'Joueurs min', key: 'min_players', width: 12 },
  { header: 'Joueurs max', key: 'max_players', width: 12 },
  { header: 'Durée moy. (min)', key: 'duration_min', width: 16 },
  { header: 'Âge min', key: 'age_min', width: 9 },
  { header: 'Prix neuf', key: 'price_new', width: 10 },
  { header: 'Prix de vente', key: 'price', width: 13 },
  { header: 'État de la boîte', key: 'condition', width: 17 },
  { header: 'Éditeur', key: 'publisher', width: 22 },
  { header: 'Description', key: 'description', width: 50 },
  { header: 'Image boîte', key: 'image', width: 14 },
  { header: 'Disponibles', key: 'available', width: 12 },
  { header: 'Réservés', key: 'reserved', width: 10 },
  { header: 'Vendus', key: 'sold', width: 9 },
]

const count = (copies, status) => copies.filter((copy) => copy.status === status).length

for (const { game, copies } of lines) {
  const row = sheet.addRow({
    title: game.title,
    quantity: copies.length,
    min_players: game.min_players,
    max_players: game.max_players,
    duration_min: game.duration_min,
    age_min: game.age_min,
    price_new: game.price_new_cents == null ? null : game.price_new_cents / 100,
    price: game.price_cents / 100,
    condition: game.condition ? CONDITION_LABELS[game.condition] : null,
    publisher: game.publisher,
    description: game.description,
    available: count(copies, 'available'),
    reserved: count(copies, 'reserved'),
    sold: count(copies, 'sold'),
  })
  if (game.image_path) {
    const url = /^https?:/.test(game.image_path) ? game.image_path : `${env.VITE_SUPABASE_URL}/storage/v1/object/public/games/${game.image_path}`
    row.getCell('image').value = { text: "Voir l'image", hyperlink: url }
    row.getCell('image').font = { color: { argb: 'FF005071' }, underline: true }
  }
  // Liste déroulante : seules ces cinq valeurs sont acceptées à l'import
  row.getCell('condition').dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`"${Object.values(CONDITION_LABELS).join(',')}"`],
  }
  for (const key of ['price_new', 'price']) row.getCell(key).numFmt = '0.00 "€"'
  for (const key of ['available', 'reserved', 'sold']) {
    row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }
  }
}

const header = sheet.getRow(1)
header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005071' } }
header.alignment = { vertical: 'middle', wrapText: true }
header.height = 30
sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } }

const output = process.argv[2] ?? `inventaire_export_${new Date().toISOString().slice(0, 10)}.xlsx`
await workbook.xlsx.writeFile(output)
console.log(`${lines.length} lignes, ${games.length} exemplaires → ${output}`)
