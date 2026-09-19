'use client'

import Image from 'next/image'
import renderImg from '@/public/demo-render.jpg'

// Hero da landing em vidro, composição centralizada em UMA coluna (à Apple):
// badge → título → descrição → CTAs → uma imagem grande logo abaixo.
//
// 2026-09-19: o comparador antes/depois saiu daqui — ele continua na seção
// Projetos, que é onde o visitante arrasta. No topo entra um render inteiro
// da plataforma, na proporção nativa do arquivo (1632×656 ≈ 2,5:1, faixa
// entre 21:9 e cinema), SEM recorte: a edificação inteira, não meia casa
// atrás de um divisor. A imagem atual é provisória até o dono escolher a
// definitiva entre os renders da própria plataforma.
//
// O espaçamento vertical foi apertado de propósito: com a navbar sticky de
// 84px e o título em UMA linha, o topo da imagem fica a ~420px da borda
// superior, o que deixa ~3/4 dela dentro do primeiro viewport de um notebook
// (1366×768). No mobile tudo empilha e a imagem cabe inteira abaixo dos botões.
export default function Hero() {
  return (
    <section className="spn-hero">
      <div className="spn-hero-copy">
        <span className="spn-hero-badge spn-glass--raised">
          Plataforma de visualização arquitetônica
        </span>

        <h1 className="spn-hero-title">Visualize seus projetos.</h1>

        <p className="spn-hero-sub">
          Renderize, explore e apresente projetos de arquitetura e interiores
          em um só lugar.
        </p>

        <div className="spn-hero-ctas">
          <a href="/login?mode=signup" className="spn-hero-primary">
            Testar grátis
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#projetos" className="spn-hero-secondary spn-glass--raised">
            Ver projetos reais
          </a>
        </div>
      </div>

      {/* A moldura é o vidro; a imagem passa por trás da aresta especular.
          Sem `fill`/`object-fit`: o <img> segue a proporção nativa do arquivo
          (largura 100%, altura automática), então nada é cortado em nenhuma
          largura — no mobile ela só fica mais baixa, nunca pela metade. */}
      <figure className="spn-hero-frame spn-glass">
        <div className="spn-hero-media">
          <Image
            src={renderImg}
            alt="Render fotorrealista gerado pela SpaceNode: casa de concreto e vidro ao entardecer, com a geometria e as proporções do modelo 3D preservadas"
            preload
            placeholder="blur"
            sizes="(max-width: 768px) 100vw, (max-width: 1248px) 95vw, 1132px"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      </figure>

      <style jsx>{`
        .spn-hero {
          position: relative;
          z-index: 1;
          padding: 36px 24px 64px;
          max-width: 1200px;
          margin: 0 auto;
        }
        /* CTAs → imagem: 36px, o piso da faixa de 36–48px pedida. */
        .spn-hero-copy {
          text-align: center;
          max-width: 820px;
          margin: 0 auto 36px;
        }
        .spn-hero-badge {
          display: inline-flex;
          align-items: center;
          padding: 7px 14px;
          border-radius: var(--radius-full);
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-text-secondary);
          margin-bottom: 18px;
        }
        .spn-hero-title {
          font-size: clamp(40px, 5.8vw, 62px);
          font-weight: 300;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 auto 16px;
          color: var(--color-text-primary);
          text-wrap: balance;
        }
        .spn-hero-sub {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.55;
          letter-spacing: -0.01em;
          margin: 0 auto 24px;
          max-width: 520px;
          text-wrap: balance;
        }
        .spn-hero-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
        }
        .spn-hero-primary,
        .spn-hero-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--r-inner);
          text-decoration: none;
          white-space: nowrap;
          letter-spacing: -0.01em;
          font-weight: 500;
          min-height: 52px;
          padding: 15px 28px;
          font-size: 14px;
          transition: transform 200ms var(--ease), box-shadow 200ms var(--ease),
            color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-hero-primary {
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          box-shadow: var(--shadow-float);
        }
        .spn-hero-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .spn-hero-secondary {
          color: var(--color-text-secondary);
          padding: 15px 22px;
          font-size: 13px;
        }
        .spn-hero-secondary:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }
        .spn-hero-primary:focus-visible,
        .spn-hero-secondary:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }

        /* O padding de 10px é o que deixa a aresta especular do vidro
           visível em volta da imagem. */
        .spn-hero-frame {
          position: relative;
          margin: 0;
          padding: 10px;
          border-radius: calc(var(--r-card) + 10px);
          box-shadow: var(--shadow-float);
        }
        .spn-hero-media {
          position: relative;
          overflow: hidden;
          border-radius: var(--r-card);
          background: var(--color-preview-bg);
        }

        @media (max-width: 768px) {
          .spn-hero { padding: 28px 16px 40px; }
          .spn-hero-copy { margin-bottom: 36px; }
          .spn-hero-badge {
            font-size: 9.5px;
            letter-spacing: 0.08em;
            line-height: 1.45;
            text-align: center;
            padding: 6px 12px;
            margin-bottom: 18px;
          }
          .spn-hero-title {
            font-size: clamp(34px, 10.4vw, 46px);
            margin-bottom: 14px;
          }
          .spn-hero-sub { font-size: 15px; margin-bottom: 22px; }
          .spn-hero-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .spn-hero-primary,
          .spn-hero-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
          .spn-hero-frame { padding: 6px; border-radius: calc(var(--r-inner) + 6px); }
          .spn-hero-media { border-radius: var(--r-inner); }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-hero-primary,
          .spn-hero-secondary { transition: none; }
          .spn-hero-primary:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}
