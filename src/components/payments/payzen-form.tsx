import glueModule from '@lyracom/embedded-form-glue'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Le paquet est publié en CommonJS : selon le bundler, l'objet utile est le module ou son `default`.
const KRGlue = (glueModule as unknown as { default?: typeof glueModule }).default ?? glueModule

let theme: Promise<void> | undefined

// Le thème doit être appliqué avant l'affichage, sinon le formulaire apparaît brut puis se restyle.
function loadTheme(endpoint: string) {
  theme ??= new Promise((resolve) => {
    const base = `${endpoint}/static/js/krypton-client/V4.0/ext`
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${base}/neon-reset.min.css` })
    const js = Object.assign(document.createElement('script'), { src: `${base}/neon.js` })
    css.onload = css.onerror = () => resolve()
    document.head.append(css, js)
  })
  return theme
}

interface PayzenFormProps {
  // Fourni par le serveur : formToken, publicKey, endpoint
  client: Record<string, string>
  onSubmitted: () => void
}

// Formulaire de carte PayZen dans la page. Le résultat affiché ici n'est qu'indicatif :
// c'est la notification serveur (IPN) qui valide la commande.
export default function PayzenForm({ client, onSubmitted }: PayzenFormProps) {
  const { endpoint, publicKey, formToken } = client
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let remove: (() => void) | undefined

    void (async () => {
      await loadTheme(endpoint)
      const { KR } = await KRGlue.loadLibrary(endpoint, publicKey)
      if (cancelled) return
      remove = () => void KR.removeForms()
      await KR.setFormConfig({ formToken, 'kr-language': 'fr-FR' })
      await KR.onFormReady(() => setReady(true))
      await KR.onError((failure) => setError(failure.errorMessage))
      await KR.onSubmit(() => {
        onSubmitted()
        return false // pas de redirection : on reste sur la page de commande
      })
      await KR.renderElements('#payzen-form')
      // Filet de sécurité : ne jamais laisser le formulaire masqué si le signal « prêt » ne vient pas.
      setTimeout(() => !cancelled && setReady(true), 4000)
    })().catch((cause: unknown) => {
      console.error('PayZen', cause)
      setError("Le formulaire de paiement n'a pas pu se charger.")
    })

    return () => {
      cancelled = true
      remove?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onSubmitted` n'a pas à relancer le formulaire
  }, [endpoint, publicKey, formToken])

  return (
    <div className="space-y-3">
      {/* Hauteur réservée et formulaire masqué jusqu'à ce qu'il soit complet : aucun saut de mise en page. */}
      <div className="relative min-h-[23rem]">
        {!ready && !error && <Skeleton className="absolute inset-x-0 top-0 mx-auto h-[22.5rem] max-w-[300px] rounded-lg" />}
        <div id="payzen-form" className={cn('flex justify-center transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0')}>
          <div className="kr-smart-form" />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-ink">
          {error}
        </p>
      )}
    </div>
  )
}
