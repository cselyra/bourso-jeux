// Retrait des jeux : le seul endroit à modifier quand la date ou le lieu changent.
export const PICKUP = {
  place: 'Lyra',
  address: "209 rue de l'Innovation, 31670 Labège",
  date: '2026-12-13',
  from: '12 h',
  to: '14 h',
}

const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

// « dimanche 13 décembre, entre 12 h et 14 h »
export const pickupWhen = `${day.format(new Date(`${PICKUP.date}T12:00:00`))}, entre ${PICKUP.from} et ${PICKUP.to}`
// « Lyra, 209 rue de l'Innovation, 31670 Labège »
export const pickupWhere = `${PICKUP.place}, ${PICKUP.address}`
