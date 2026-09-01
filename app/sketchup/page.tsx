import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Brandmark } from '@/components/brand'

// Página pública do plugin — /sketchup. Dark como todo o namespace /sketchup/*
// (o painel do plugin e a tela de conexão são dark); o tom segue o brand:
// específico, sem hype, títulos em minúsculas com ponto.

export const metadata: Metadata = {
  title: 'SPACENODE para SketchUp',
  description:
    'Renderize suas vistas do SketchUp com o motor de fidelidade da SPACENODE — sem sair do modelo. Extensão oficial para SketchUp 2024 ou superior.',
}

const RBZ_PATH = '/downloads/spacenode-sketchup.rbz'
const PLUGIN_VERSION = '0.5.2'

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'a vista vira o render.',
    body: 'Captura em alta resolução direto do viewport, com higiene automática: arestas sketchy, névoa, guias e grade de seção ficam de fora da imagem que a IA vê.',
  },
  {
    title: 'geometria como verdade.',
    body: 'Um mapa de arestas hidden-line da mesma câmera guia o motor de fidelidade — condicionamento estrutural por dados do modelo, não por adivinhação de pixel.',
  },
  {
    title: 'cenas em lote.',
    body: 'Selecione as cenas do modelo e gere o caderno inteiro com os mesmos presets e a mesma semente — coerência de material e estilo no conjunto.',
  },
  {
    title: 'sol e lente reais.',
    body: 'A posição do sol (data, hora e localização do modelo) e a lente da câmera entram no prompt como fato medido. A luz do render respeita as sombras do projeto.',
  },
  {
    title: 'edite por instrução.',
    body: 'Trocar material, remover, refinar — direto do painel, com as texturas reais do seu modelo como amostra e o custo exato no botão antes de aplicar.',
  },
  {
    title: 'cenas viram um Space.',
    body: 'Um clique cria um Space com a identidade do projeto e transforma suas cenas em vistas coerentes entre si — a máquina de estados fica invisível.',
  },
]

const STEPS: string[] = [
  'Baixe o arquivo .rbz abaixo.',
  'No SketchUp: Window → Extension Manager → Install Extension.',
  'Abra a barra de ferramentas SPACENODE e clique em Conectar.',
]

export default function SketchUpPage() {
  return (
    <main style={S.main}>
      <div style={S.wrap}>
        <header style={S.header}>
          <Brandmark variant="horizontal" size={26} color="#f5f5f7" />
          <Link href="/login?next=/app" style={S.headerLink}>
            entrar
          </Link>
        </header>

        <section style={S.hero}>
          <span style={S.eyebrow}>SPACENODE para SketchUp</span>
          <h1 style={S.title}>seu modelo, renderizado de dentro do SketchUp.</h1>
          <p style={S.lede}>
            A extensão oficial da SPACENODE captura a vista atual, envia os dados que só quem está
            dentro do modelo tem — geometria, sol, lente, materiais — e devolve o render com o mesmo
            motor de fidelidade do app.
          </p>

          <a href={RBZ_PATH} style={S.download} download>
            <span>Baixar a extensão (.rbz)</span>
            <span style={S.downloadMeta}>v{PLUGIN_VERSION} · Windows e macOS</span>
          </a>
          <p style={S.requirement}>SketchUp 2024 ou superior. Grátis — os renders usam os Nodes da sua conta SPACENODE.</p>
        </section>

        <section style={S.section}>
          <span style={S.sectionLabel}>Como instalar</span>
          <ol style={S.steps}>
            {STEPS.map((step, i) => (
              <li key={i} style={S.step}>
                <span style={S.stepNumber}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p style={S.note}>
            A conexão usa a sessão da sua conta no navegador — a senha nunca passa pelo plugin, e o
            acesso expira junto com a sessão.
          </p>
        </section>

        <section style={S.section}>
          <span style={S.sectionLabel}>O que ele faz</span>
          <div style={S.grid}>
            {FEATURES.map(f => (
              <div key={f.title} style={S.card}>
                <h3 style={S.cardTitle}>{f.title}</h3>
                <p style={S.cardBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...S.section, textAlign: 'center' as const }}>
          <p style={S.closing}>
            Ainda não tem conta?{' '}
            <Link href="/login?mode=signup" style={S.inlineLink}>
              Crie grátis
            </Link>{' '}
            — todo cadastro começa com Nodes pra testar no seu próprio projeto.
          </p>
        </section>

        <footer style={S.footer}>
          <Link href="/" style={S.footerLink}>spacenode.app</Link>
          <span style={S.footerSep}>·</span>
          <Link href="/termos" style={S.footerLink}>termos</Link>
          <span style={S.footerSep}>·</span>
          <Link href="/privacidade" style={S.footerLink}>privacidade</Link>
        </footer>
      </div>
    </main>
  )
}

const S: Record<string, CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#f5f5f7',
    fontFamily: 'var(--font-geist), system-ui, -apple-system, sans-serif',
    letterSpacing: '-0.011em',
  },
  wrap: { maxWidth: 820, margin: '0 auto', padding: '28px 24px 64px' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 28,
  },
  headerLink: {
    color: '#a1a1a6',
    fontSize: 13,
    textDecoration: 'none',
    padding: '8px 14px',
    borderRadius: 9,
    border: '0.5px solid rgba(255,255,255,0.14)',
  },
  hero: { padding: '40px 0 12px', maxWidth: 640 },
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.22em',
    textTransform: 'uppercase' as const,
    color: '#6e6e73',
  },
  title: {
    margin: '14px 0 0',
    fontSize: 40,
    lineHeight: 1.08,
    fontWeight: 500,
    letterSpacing: '-0.03em',
  },
  lede: { margin: '18px 0 0', color: '#a1a1a6', fontSize: 16, lineHeight: 1.6, maxWidth: 560 },
  download: {
    marginTop: 28,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 22px',
    borderRadius: 12,
    background: '#f5f5f7',
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: 650,
    textDecoration: 'none',
    boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
  },
  downloadMeta: { fontSize: 11, fontWeight: 500, opacity: 0.6 },
  requirement: { margin: '12px 0 0', color: '#6e6e73', fontSize: 12 },
  section: { borderTop: '0.5px solid rgba(255,255,255,0.08)', marginTop: 44, paddingTop: 32 },
  sectionLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.24em',
    textTransform: 'uppercase' as const,
    color: '#6e6e73',
    marginBottom: 18,
  },
  steps: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 12 },
  step: { display: 'flex', alignItems: 'baseline', gap: 12, color: '#d5d5d8', fontSize: 14 },
  stepNumber: {
    flex: '0 0 22px',
    width: 22,
    height: 22,
    borderRadius: 7,
    background: 'rgba(255,255,255,0.06)',
    border: '0.5px solid rgba(255,255,255,0.14)',
    color: '#a1a1a6',
    fontSize: 11,
    fontWeight: 650,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { margin: '18px 0 0', color: '#6e6e73', fontSize: 12, lineHeight: 1.55, maxWidth: 520 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 10,
  },
  card: {
    padding: '18px 18px 16px',
    borderRadius: 14,
    border: '0.5px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
  },
  cardTitle: { margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' },
  cardBody: { margin: '8px 0 0', color: '#a1a1a6', fontSize: 12.5, lineHeight: 1.55 },
  closing: { color: '#a1a1a6', fontSize: 14 },
  inlineLink: { color: '#f5f5f7', textUnderlineOffset: 3 },
  footer: {
    marginTop: 56,
    paddingTop: 20,
    borderTop: '0.5px solid rgba(255,255,255,0.08)',
    display: 'flex',
    gap: 10,
    fontSize: 12,
    color: '#6e6e73',
  },
  footerLink: { color: '#6e6e73', textDecoration: 'none' },
  footerSep: { color: '#3a3a3c' },
}
