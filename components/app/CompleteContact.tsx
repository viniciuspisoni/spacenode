import { Brandmark } from '@/components/brand'
import ContactPreferencesForm from './ContactPreferencesForm'

export default function CompleteContact({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--color-bg)', color: 'var(--color-text-primary)',
      display: 'grid', placeItems: 'center', padding: '32px 20px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 440, display: 'grid', gap: 28 }}>
        <Brandmark size={28} />
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>Última etapa do cadastro</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em' }}>Como podemos falar com você?</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            Adicione seu WhatsApp e escolha se quer receber ajuda e novidades da SpaceNode.
          </p>
        </div>
        {unavailable ? (
          <div role="alert">
            <p>Não foi possível carregar seus dados de contato. Tente novamente em instantes.</p>
            <a href="" style={{ color: 'inherit', textDecoration: 'underline' }}>Tentar novamente</a>
          </div>
        ) : <ContactPreferencesForm requiredForSignup />}
        <form action="/auth/signout" method="POST">
          <button type="submit" className="spn-ghost" style={{ minHeight: 44, padding: '8px 12px' }}>Sair desta conta</button>
        </form>
      </div>
    </main>
  )
}
