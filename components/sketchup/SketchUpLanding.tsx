'use client'

import Link from 'next/link'
import { Brandmark } from '@/components/brand'
import Footer from '@/components/Footer'
import ForceDarkScope from '@/lib/theme/ForceDarkScope'
import { Ambient } from '@/components/landing/Ambient'
import { PLUGIN_VERSION, PLUGIN_RBZ_PATH } from '@/lib/sketchup/plugin-release'

// Página pública do plugin — /sketchup, agora no mesmo material da landing e
// do web app: papel de parede borrado atrás, todo o conteúdo em vidro
// (.spn-glass). É literalmente a linguagem do painel v1 do plugin, então a
// página e o produto que ela vende finalmente se parecem.
//
// Reforma de 2026-09-10: o texto era o problema. Dez cartões de três linhas
// cada faziam uma parede que ninguém lia inteira. Agora são SEIS cartões de
// uma frase — os seis que só existem porque a extensão está DENTRO do
// modelo — e o resto do painel virou uma tira de uma linha por item.
//
// Client Component por causa do styled-jsx (no Next 16 ele só funciona em
// cliente — ver node_modules/next/dist/docs/01-app/02-guides/css-in-js.md) e
// do Ambient. A metadata fica no server component app/sketchup/page.tsx.
//
// Nada ESTILIZADO aqui pode ser next/link — a mesma regra da landing, e ela
// tem dente: o styled-jsx põe a classe de escopo (jsx-<hash>) só em tags
// HTML, nunca em componentes. Um <Link className="spn-skp-primary"> sai com
// a classe mas SEM o escopo, então nenhuma regra deste arquivo pega nele e o
// CTA vira texto solto. Custou uma rodada de screenshot em 2026-09-10.
// O logo é a única exceção: não tem classe local, e href="/" precisa de
// <Link> para o @next/next/no-html-link-for-pages.

// Cada cartão responde "por que de dentro do SketchUp e não do navegador?".
// Uma frase, um fato — nada aqui é promessa. As condições de verdade:
// - viewport/higiene: main.rb tira arestas sketchy, névoa, guias e seção.
// - mapa de arestas: `want_edge`, captura dupla da MESMA câmera.
// - sol: prompts.ts só injeta o bloco solar quando a iluminação é
//   "Preservar Original" — daí o "preservando a luz", não "sempre".
const FEATURES: { title: string; body: string }[] = [
  {
    title: 'a vista vira o render.',
    body: 'Captura direto do viewport. Arestas sketchy, névoa, guias e grade de seção ficam fora da imagem que a IA vê.',
  },
  {
    title: 'geometria como verdade.',
    body: 'Um mapa de arestas da mesma câmera vai junto. O motor recebe a estrutura medida, não inferida do pixel.',
  },
  {
    title: 'sol e lente reais.',
    body: 'Data, hora, local e lente do modelo entram como fato medido. Preservando a luz, o render respeita as sombras do projeto.',
  },
  {
    title: 'o estilo fica no arquivo.',
    body: 'Trave o estilo de um render aprovado e ele viaja com o .skp. Quem abrir o arquivo herda a mesma paleta.',
  },
  {
    title: 'cenas em lote.',
    body: 'Selecione as cenas e gere o caderno inteiro com os mesmos presets e a mesma semente.',
  },
  {
    title: 'espelhos de verdade.',
    body: 'Marque a face do espelho e o reflexo real entra em toda captura, calculado pra câmera daquele momento.',
  },
]

// O resto do painel. São recursos reais e em produção, mas não são o
// argumento desta página — então ganham uma linha, não um cartão.
const ALSO: { title: string; gloss: string }[] = [
  { title: 'enquadramento de fotógrafo', gloss: 'proporção, lente, altura do olho, verticais niveladas' },
  { title: 'edição por instrução', gloss: 'pinte a área, troque o material, veja o custo antes' },
  { title: 'render animado', gloss: 'um take curto, salvo ao lado do .skp' },
  { title: 'cenas viram um Space', gloss: 'o projeto inteiro coerente dentro do app' },
]

const STEPS: string[] = [
  'Baixe o .rbz acima.',
  'No SketchUp: Window → Extension Manager → Install Extension.',
  'Abra a barra SPACENODE e clique em Conectar.',
]

const Arrow = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function SketchUpLanding() {
  return (
    <main className="spn-skpage">
      <ForceDarkScope />
      <Ambient />

      <header className="spn-skp-bar spn-glass--chrome">
        <Link href="/" aria-label="SPACENODE">
          <Brandmark variant="horizontal" size={24} />
        </Link>
        <a href="/login?next=/app" className="spn-skp-bar-link spn-glass--raised">
          entrar
        </a>
      </header>

      <section className="spn-skp-hero">
        <span className="spn-skp-badge spn-glass--raised">
          <span className="spn-skp-dot" />
          extensão oficial
        </span>

        <h1 className="spn-skp-h1">
          seu modelo, renderizado{' '}
          <span className="spn-skp-dim">de dentro do SketchUp.</span>
        </h1>

        <p className="spn-skp-lede">
          A extensão captura a vista atual e manda junto o que só quem está dentro
          do modelo tem: geometria, sol, lente, materiais. O render volta sem
          exportar nada.
        </p>

        <div className="spn-skp-ctas">
          <a href={PLUGIN_RBZ_PATH} className="spn-skp-primary" download>
            Baixar a extensão
            <span className="spn-skp-primary-meta">.rbz · v{PLUGIN_VERSION}</span>
          </a>
          <a href="#instalar" className="spn-skp-secondary spn-glass--raised">
            Como instalar
          </a>
        </div>

        <p className="spn-skp-micro">
          SketchUp 2021+ · Windows e macOS · grátis, usa os Nodes da sua conta
        </p>
      </section>

      <section className="spn-skp-sec">
        <h2 className="spn-skp-h2">o que ela faz dentro do modelo.</h2>

        <div className="spn-skp-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="spn-skp-card spn-glass">
              <h3 className="spn-skp-card-title">{f.title}</h3>
              <p className="spn-skp-card-body">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="spn-skp-also spn-glass">
          <span className="spn-skp-also-label">no mesmo painel</span>
          <ul className="spn-skp-also-list">
            {ALSO.map(a => (
              <li key={a.title} className="spn-skp-also-item">
                <span className="spn-skp-also-title">{a.title}</span>
                <span className="spn-skp-also-gloss">{a.gloss}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="instalar" className="spn-skp-sec">
        <div className="spn-skp-install spn-glass">
          <div className="spn-skp-install-head">
            <h2 className="spn-skp-h3">instalar leva um minuto.</h2>
            <p className="spn-skp-note">
              A conexão usa a sessão da sua conta no navegador: a senha nunca passa
              pelo plugin e o acesso expira junto com a sessão.
            </p>
          </div>

          <ol className="spn-skp-steps">
            {STEPS.map((step, i) => (
              <li key={i} className="spn-skp-step">
                <span className="spn-skp-step-num spn-glass--raised">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="spn-skp-sec">
        <div className="spn-skp-close spn-glass">
          <h2 className="spn-skp-h3">comece pelo seu próprio projeto.</h2>
          <p className="spn-skp-close-sub">
            Todo cadastro começa com Nodes — dá pra testar numa vista do modelo que
            você já tem aberto.
          </p>
          <a href="/login?mode=signup" className="spn-skp-primary">
            Criar conta grátis
            <Arrow />
          </a>
          <p className="spn-skp-micro">80 nodes grátis · sem cartão · em português</p>
        </div>
      </section>

      <Footer />

      <style jsx>{`
        .spn-skpage {
          position: relative;
          min-height: 100vh;
          background: var(--color-bg);
        }

        /* ── chrome ─────────────────────────────────────────────────── */
        .spn-skp-bar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 24px;
          border-bottom: 0.5px solid var(--glass-line);
          color: var(--color-text-primary);
        }
        .spn-skp-bar-link {
          padding: 8px 16px;
          border-radius: var(--radius-full);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: -0.005em;
          color: var(--color-text-secondary);
          transition: color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-skp-bar-link:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }

        /* ── hero ───────────────────────────────────────────────────── */
        .spn-skp-hero {
          position: relative;
          z-index: 1;
          max-width: 780px;
          margin: 0 auto;
          padding: 92px 24px 72px;
          text-align: center;
        }
        .spn-skp-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px 6px 11px;
          border-radius: var(--radius-full);
          font-size: 11.5px;
          font-weight: 500;
          color: var(--color-text-secondary);
          margin-bottom: 26px;
        }
        .spn-skp-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-accent-green);
          box-shadow: 0 0 8px var(--color-accent-green-glow);
        }
        .spn-skp-h1 {
          font-size: clamp(34px, 5.4vw, 54px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 auto 20px;
          max-width: 660px;
          color: var(--color-text-primary);
        }
        .spn-skp-dim { color: var(--color-text-tertiary); }
        .spn-skp-lede {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          letter-spacing: -0.01em;
          margin: 0 auto 30px;
          max-width: 520px;
        }
        .spn-skp-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        /* Os dois CTAs primários são o único elemento OPACO da página. O
           vidro é o material de tudo que flutua; o CTA ganha hierarquia
           justamente por NÃO flutuar — sem precisar de cor de marca. */
        .spn-skp-primary,
        .spn-skp-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 48px;
          padding: 13px 22px;
          border-radius: var(--r-inner);
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: -0.01em;
          white-space: nowrap;
          transition: transform 200ms var(--ease), background 200ms var(--ease),
            border-color 200ms var(--ease);
        }
        .spn-skp-primary {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          box-shadow: var(--shadow-float);
        }
        .spn-skp-primary:hover {
          background: var(--color-inverse-hover);
          transform: translateY(-1px);
        }
        .spn-skp-primary-meta {
          font-size: 11px;
          font-weight: 500;
          opacity: 0.55;
        }
        .spn-skp-secondary { color: var(--color-text-primary); }
        .spn-skp-secondary:hover {
          transform: translateY(-1px);
          border-color: var(--glass-line-strong);
        }
        .spn-skp-primary:focus-visible,
        .spn-skp-secondary:focus-visible,
        .spn-skp-bar-link:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-skp-micro {
          font-size: 12px;
          color: var(--color-text-tertiary);
          margin: 0;
        }

        /* ── seções ─────────────────────────────────────────────────── */
        .spn-skp-sec {
          position: relative;
          z-index: 1;
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 24px 96px;
        }
        .spn-skp-h2 {
          text-align: center;
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 28px;
          color: var(--color-text-primary);
        }
        .spn-skp-h3 {
          font-size: clamp(20px, 3vw, 26px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0;
          color: var(--color-text-primary);
        }

        .spn-skp-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .spn-skp-card {
          padding: 24px 22px;
          border-radius: var(--r-card);
        }
        .spn-skp-card-title {
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: var(--color-text-primary);
          margin: 0 0 9px;
        }
        .spn-skp-card-body {
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          letter-spacing: -0.005em;
          margin: 0;
        }

        /* Tira do resto do painel: uma linha por item, sem virar cartão. */
        .spn-skp-also {
          margin-top: 12px;
          padding: 22px;
          border-radius: var(--r-card);
        }
        .spn-skp-also-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 16px;
        }
        .spn-skp-also-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px 32px;
        }
        .spn-skp-also-item {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 4px 10px;
          font-size: 13.5px;
          letter-spacing: -0.005em;
        }
        .spn-skp-also-title {
          font-weight: 500;
          color: var(--color-text-primary);
        }
        .spn-skp-also-gloss { color: var(--color-text-tertiary); }

        /* ── instalar ───────────────────────────────────────────────── */
        .spn-skp-install {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 32px 48px;
          padding: 36px 40px;
          border-radius: calc(var(--r-card) + 6px);
          box-shadow: var(--shadow-float);
        }
        .spn-skp-note {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 12px 0 0;
          max-width: 380px;
        }
        .spn-skp-steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .spn-skp-step {
          display: flex;
          align-items: baseline;
          gap: 12px;
          font-size: 13.5px;
          color: var(--color-text-secondary);
          line-height: 1.5;
          letter-spacing: -0.005em;
        }
        .spn-skp-step-num {
          flex: 0 0 22px;
          width: 22px;
          height: 22px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 500;
          color: var(--color-text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transform: translateY(3px);
        }

        /* ── fecho ──────────────────────────────────────────────────── */
        .spn-skp-close {
          padding: 44px 40px;
          border-radius: calc(var(--r-card) + 6px);
          box-shadow: var(--shadow-float);
          text-align: center;
        }
        .spn-skp-close-sub {
          font-size: 14.5px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 12px auto 26px;
          max-width: 420px;
        }
        .spn-skp-close .spn-skp-micro { margin-top: 16px; }

        @media (max-width: 900px) {
          .spn-skp-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
          .spn-skp-bar { padding: 12px 16px; }
          .spn-skp-hero { padding: 64px 16px 56px; }
          .spn-skp-sec { padding: 0 16px 64px; }
          .spn-skp-grid { grid-template-columns: 1fr; gap: 10px; }
          .spn-skp-card { padding: 20px 18px; }
          .spn-skp-also { padding: 20px 18px; }
          .spn-skp-also-list { grid-template-columns: 1fr; gap: 12px; }
          .spn-skp-install {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 26px 22px;
          }
          .spn-skp-close { padding: 30px 22px; }
          .spn-skp-ctas { flex-direction: column; align-items: stretch; }
          .spn-skp-primary,
          .spn-skp-secondary { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-skp-primary,
          .spn-skp-secondary,
          .spn-skp-bar-link { transition: none; }
          .spn-skp-primary:hover,
          .spn-skp-secondary:hover { transform: none; }
        }
      `}</style>
    </main>
  )
}
