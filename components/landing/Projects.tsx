'use client'

import { BeforeAfter } from '@/components/landing/BeforeAfter'

// Projetos reais — agora com renders de CLIENTES, não do acervo da casa.
// Cada par vem da conta de um escritório que usa a plataforma, com aceite
// do autor, e leva o crédito abaixo da célula. Isso muda o que a seção
// prova: sai de "olha o que a gente consegue fazer" para "olha quem já
// usa" (2026-09-09, escolha do dono sobre 16 candidatos do banco).
//
// Convenção de nome dos arquivos: `-base` é o modelo, `-render` é o
// resultado. NÃO usar before/after: no acervo antigo os pares casa e
// comercial estão trocados no disco (o "-before" deles é o render) e isso
// já derrubou alteração antes.
//
// CONFERIR TODO PAR EM CHEIO ANTES DE ENTRAR AQUI. A tabela `renders` tem
// registros que reusam o mesmo `input_url` entre gerações diferentes, então
// input e output NÃO são garantidamente o mesmo enquadramento — duas das
// oito candidatas desta rodada caíram por isso (uma com base e render de
// cenas diferentes, outra em que o render trocou bancada, armários e porta).
// E conferir com as imagens INTEIRAS, não pelo comparador: no split
// meio-a-meio, metades diferentes da mesma cena parecem discrepância mesmo
// quando o par está certo, e o inverso também engana.
//
// Ordem alternando o tipo de ambiente: nenhum par encosta em outro do mesmo
// tipo. Duas das oito são cozinha e três são living — lado a lado elas leem
// como repetição, e na coluna única do mobile isso fica pior ainda.
//
// 2026-09-16: `hall-entrada` saiu (decisão do dono) e entraram três pares de
// um lote novo da muda arquitetura — `living-estante`, `entrada-corredor` e
// `sala-estar`. Aceite dela para a LANDING confirmado pelo dono na mesma data;
// o ledger por canal (landing / orgânico / mídia paga) vive em
// `marketing/AUTORIZACOES.md`, na branch onde a árvore `marketing/` existe.
//
// Duas armadilhas desse lote, que valem pra qualquer lote vindo do Drive:
//
//  1. O nome do arquivo NÃO diz qual é base e qual é render — o sufixo "(1)"
//     da desduplicação cai ora num, ora no outro, e chegou a trocar de lado
//     entre duas vistas da MESMA pasta. O que separa é a dimensão: o print do
//     SketchUp sai maior (3000x1619 / 3500x1969) que o render da plataforma
//     (2816x1504 / 2731x1536).
//  2. Nome de pasta do lote é nome de CLIENTE, não crédito. `164_suellen`,
//     `176_maite e luis` e `193_rafa` são os três da mesma autora. Perguntar
//     quem assina antes de escrever o crédito.
//
// Base e render de cada par novo foram cortados na MESMA proporção antes de
// entrar em `public/`. Eles saem da origem em ratios levemente diferentes e,
// com `object-fit: cover` na célula 16/9, cada lado é cortado de um jeito e o
// comparador desliza alguns pixels no meio da cena.
const PAIRS = [
  { slug: 'cozinha-ceramica',  caption: 'Cozinha',            credit: 'muda arquitetura' },
  { slug: 'sala-jantar',       caption: 'Sala de jantar',     credit: 'Paula Miolla' },
  { slug: 'living-estante',    caption: 'Living com estante', credit: 'muda arquitetura' },
  { slug: 'cozinha-ilha',      caption: 'Cozinha com ilha',   credit: 'Nathalia Costa' },
  { slug: 'entrada-corredor',  caption: 'Corredor de entrada', credit: 'muda arquitetura' },
  { slug: 'living-jantar',     caption: 'Living integrado',   credit: 'Bruna Plentz' },
  { slug: 'sala-estar',        caption: 'Sala de estar',      credit: 'muda arquitetura' },
  { slug: 'home-office',       caption: 'Home office',        credit: 'Nathalia Costa' },
]

export function Projects() {
  return (
    <section id="projetos" className="spn-projects">
      <div className="spn-projects-head">
        <h2 className="spn-projects-title">projetos reais, de escritórios reais.</h2>
        <p className="spn-projects-sub">
          Arraste qualquer um: à esquerda o modelo que entrou, à direita o
          render que saiu. Publicado com autorização de quem projetou.
        </p>
      </div>

      <div className="spn-projects-grid">
        {PAIRS.map(pair => (
          <figure key={pair.slug} className="spn-projects-item">
            <div className="spn-projects-cell spn-glass">
              <BeforeAfter
                base={`/proj-${pair.slug}-base.jpg`}
                render={`/proj-${pair.slug}-render.jpg`}
                caption={pair.caption}
                aspect="16 / 9"
                sizes="(max-width: 768px) 100vw, (max-width: 1080px) 46vw, 500px"
              />
            </div>
            <figcaption className="spn-projects-credit">{pair.credit}</figcaption>
          </figure>
        ))}
      </div>

      <style jsx>{`
        .spn-projects {
          position: relative;
          z-index: 1;
          padding: 40px 24px 96px;
          max-width: 1080px;
          margin: 0 auto;
        }
        .spn-projects-head {
          text-align: center;
          margin-bottom: 28px;
        }
        .spn-projects-title {
          font-size: clamp(22px, 3.6vw, 30px);
          font-weight: 400;
          letter-spacing: -0.035em;
          line-height: 1.2;
          margin: 0 0 8px;
          color: var(--color-text-primary);
        }
        .spn-projects-sub {
          font-size: 14px;
          line-height: 1.6;
          color: var(--color-text-tertiary);
          margin: 0 auto;
          max-width: 520px;
          letter-spacing: -0.005em;
        }
        .spn-projects-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px 12px;
        }
        .spn-projects-item { margin: 0; }
        .spn-projects-cell {
          padding: 7px;
          border-radius: calc(var(--r-inner) + 7px);
        }
        /* O crédito fica FORA do vidro: é texto de leitura, não etiqueta
           sobre imagem — e sobre vidro o terciário ainda passa AA. */
        .spn-projects-credit {
          font-size: 11.5px;
          letter-spacing: 0.01em;
          color: var(--color-text-tertiary);
          padding: 9px 4px 0;
        }

        @media (max-width: 768px) {
          .spn-projects { padding: 24px 16px 64px; }
          .spn-projects-grid { grid-template-columns: 1fr; gap: 6px; }
          .spn-projects-credit { padding-bottom: 6px; }
        }
      `}</style>
    </section>
  )
}
