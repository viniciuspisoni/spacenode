import Image from 'next/image'
import fechoImg from '@/public/close-vale.jpg'

// Fecho da landing. Não é um cartão: é a página inteira abrindo.
//
// O render é do acervo real do dono (3328×1280 na origem; aqui reduzido a
// 2400px e recomprimido): deck e piscina de borda infinita sobre o vale. É
// a única das candidatas que tem um horizonte de verdade, que é exatamente
// o que a seção faz — por isso ela, e não outra.
//
// O texto fica na parte de cima, onde o degradê ainda é o fundo opaco da
// página: assim o CTA não depende de véu sobre imagem para ter contraste. O
// render abre logo abaixo, quase sem véu (não há texto ali), e volta a
// dissolver no fundo antes do rodapé.
//
// A imagem NÃO cobre a seção inteira: ela é ancorada embaixo, com altura
// igual à faixa. Sendo 2.6:1, esticá-la sobre a seção toda (mais próxima de
// 1.6:1) jogaria a piscina e as montanhas para dentro da parte opaca e
// sobraria só o piso do deck na parte visível.
export default function FinalCTA() {
  return (
    <section className="spn-final">
      <div className="spn-final-media">
        <Image
          src={fechoImg}
          alt=""
          aria-hidden
          fill
          placeholder="blur"
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center center' }}
        />
      </div>
      <div className="spn-final-veil" />

      <div className="spn-final-copy">
        <span className="spn-final-eyebrow">
          <span className="spn-final-dot" />
          próximo projeto
        </span>

        <h2 className="spn-final-title">
          apresente melhor seus projetos,{' '}
          <span className="spn-final-title-dim">sem perder o controle sobre eles.</span>
        </h2>

        <div className="spn-final-ctas">
          <a href="/login?mode=signup" className="spn-final-primary">
            Testar grátis
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#planos" className="spn-final-secondary spn-glass--raised">
            Ver planos
          </a>
        </div>

        <p className="spn-final-microcopy">80 nodes grátis · sem cartão · em português</p>
      </div>

      <style jsx>{`
        .spn-final {
          position: relative;
          z-index: 1;
          isolation: isolate;
          min-height: 880px;
          display: flex;
          justify-content: center;
          padding: 80px 24px 0;
          overflow: hidden;
        }
        /* Ancorada embaixo, ocupando só a faixa. Em 1440×880 esta caixa dá
           quase exatamente 2.6:1 — a proporção nativa do render — então ele
           entra praticamente sem corte. */
        .spn-final-media {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 64%;
          z-index: 0;
        }
        /* Degradê que costura o render à página. Opaco só até onde o texto
           alcança (42%); daí em diante o véu cai para 0.12 e o render fica
           praticamente limpo por metade da seção, porque ali não há nada
           para ler. Volta a fechar no fim, para o rodapé encontrar o fundo
           da página em vez de uma aresta de imagem cortada. */
        .spn-final-veil {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            180deg,
            var(--color-bg) 0%,
            var(--color-bg) 42%,
            rgba(10, 10, 10, 0.58) 52%,
            rgba(10, 10, 10, 0.12) 64%,
            rgba(10, 10, 10, 0.12) 88%,
            var(--color-bg) 100%
          );
        }
        .spn-final-copy {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 680px;
          align-self: flex-start;
        }
        .spn-final-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--color-text-tertiary);
          margin-bottom: 18px;
        }
        .spn-final-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--color-accent-green);
          box-shadow: 0 0 8px var(--color-accent-green-glow);
        }
        .spn-final-title {
          font-size: clamp(28px, 4.6vw, 44px);
          font-weight: 300;
          letter-spacing: -0.04em;
          line-height: 1.12;
          margin: 0 auto 34px;
          color: var(--color-text-primary);
        }
        .spn-final-title-dim { color: var(--color-text-tertiary); }
        .spn-final-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .spn-final-primary,
        .spn-final-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--r-inner);
          text-decoration: none;
          font-weight: 500;
          letter-spacing: -0.01em;
          min-height: 52px;
          transition: transform 200ms var(--ease), box-shadow 200ms var(--ease),
            color 200ms var(--ease), border-color 200ms var(--ease);
        }
        .spn-final-primary {
          padding: 15px 28px;
          font-size: 14px;
          background: var(--color-inverse);
          color: var(--color-inverse-foreground);
          box-shadow: var(--shadow-float);
        }
        .spn-final-primary:hover { transform: translateY(-1px); }
        .spn-final-secondary {
          padding: 15px 22px;
          font-size: 13px;
          color: var(--color-text-secondary);
        }
        .spn-final-secondary:hover {
          color: var(--color-text-primary);
          border-color: var(--glass-line-strong);
        }
        .spn-final-primary:focus-visible,
        .spn-final-secondary:focus-visible {
          outline: 1.5px solid var(--color-border-focus);
          outline-offset: 2px;
        }
        .spn-final-microcopy {
          font-size: 12px;
          color: var(--color-text-tertiary);
          margin: 0;
        }

        @media (max-width: 768px) {
          .spn-final {
            min-height: 720px;
            padding: 56px 20px 0;
          }
          /* Os CTAs empilham no mobile: o bloco de texto desce até ~45% da
             seção, contra ~38% no desktop. Sem este degradê próprio, a
             microcopy cairia em cima do render. */
          .spn-final-veil {
            background: linear-gradient(
              180deg,
              var(--color-bg) 0%,
              var(--color-bg) 50%,
              rgba(10, 10, 10, 0.55) 60%,
              rgba(10, 10, 10, 0.12) 70%,
              rgba(10, 10, 10, 0.12) 90%,
              var(--color-bg) 100%
            );
          }
          .spn-final-title { font-size: 27px; margin-bottom: 26px; }
          .spn-final-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .spn-final-primary,
          .spn-final-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .spn-final-primary,
          .spn-final-secondary { transition: none; }
          .spn-final-primary:hover { transform: none; }
        }
      `}</style>
    </section>
  )
}
