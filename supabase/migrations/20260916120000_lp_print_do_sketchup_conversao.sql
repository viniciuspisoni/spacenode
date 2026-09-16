-- LP /lp/print-do-sketchup — reconstrução para conversão em assinatura.
--
-- Contexto (2026-09-16): esta é a página de destino do tráfego pago do Meta
-- (SN_META_AQUISICAO_SIGNUP_2026-09). Estava com três problemas somados:
--
--   1. LAYOUT — o reset de elemento em app/globals.css estava fora de
--      `@layer base`, e no Tailwind v4 CSS sem layer vence utilities layered.
--      A página rodou em produção sem padding nenhum e com o CTA principal de
--      texto branco sobre botão branco. Corrigido no código, não aqui.
--
--   2. IMAGENS 404 — o bloco antes/depois apontava para `gallery-*-before.jpg`
--      que não existem mais em public/. Das imagens gallery-* que sobraram,
--      NENHUM par está completo. Trocado pelos pares `proj-*`, que existem
--      inteiros e são os mesmos da landing principal.
--
--   3. CONTEÚDO DESATUALIZADO — o FAQ afirmava "Não há plugin nem importação
--      direta de arquivo". O plugin oficial do SketchUp está em produção desde
--      2026-09-10 (v1.3.0), e o anúncio que traz essa gente fala justamente de
--      SketchUp. A página negava o produto que o anúncio promete.
--
-- Mudança de estratégia: a LP ganha PREÇO. Até aqui nenhuma landing de campanha
-- mostrava valor — quem clicava só via "80 nodes grátis, sem cartão". O Google
-- mandou 62 cadastros e 0 assinaturas em julho; o Meta, 0 também. Preço na
-- página qualifica antes do clique. A métrica desta LP passa a ser assinatura,
-- não volume de cadastro — espera-se MENOS cadastro daqui.
--
-- Os pares vêm de contas de escritórios clientes e vão CREDITADOS. A coluna
-- "mídia paga" do marketing/AUTORIZACOES.md foi liberada pelo dono em
-- 2026-09-16; a confirmação individual com cada autor(a) segue pendente de
-- registro. Se alguma delas recusar, este bloco sai.
--
-- Idempotente: pode rodar de novo sem duplicar nada.

update marketing.landing_pages
set
  headline = 'O print do SketchUp vira a imagem da reunião. Nada sai do lugar.',

  -- Mantém o casamento de mensagem com o criativo do anúncio (antes/depois,
  -- SketchUp). Só acrescenta o plugin, que o anúncio já sugere e a página
  -- antes negava.
  subheadline = 'Suba o print do seu modelo — ou renderize direto do SketchUp '
                'pelo plugin oficial — e receba a imagem fotorrealista em '
                'minutos, com a geometria do projeto intacta. Tudo no navegador.',

  cta_label = 'Teste com um projeto real',

  sections = $json$[
    {
      "kind": "before_after",
      "pairs": [
        {
          "before": "/proj-cozinha-ceramica-base.jpg",
          "after":  "/proj-cozinha-ceramica-render.jpg",
          "label":  "Cozinha",
          "credit": "muda arquitetura"
        },
        {
          "before": "/proj-sala-jantar-base.jpg",
          "after":  "/proj-sala-jantar-render.jpg",
          "label":  "Sala de jantar",
          "credit": "Paula Miolla"
        },
        {
          "before": "/proj-living-jantar-base.jpg",
          "after":  "/proj-living-jantar-render.jpg",
          "label":  "Living integrado",
          "credit": "Bruna Plentz"
        }
      ]
    },
    {
      "kind": "value_props",
      "items": [
        {
          "title": "fidelidade geométrica",
          "body": "Geometria, proporções e perspectiva do projeto preservadas. Nada é reinterpretado."
        },
        {
          "title": "coerência entre vistas",
          "body": "Luz, câmera e atmosfera variam. A identidade do projeto, não."
        },
        {
          "title": "velocidade com controle",
          "body": "Minutos por imagem, com escolhas de arquiteto — motor, atmosfera, materialidade. Sem prompts."
        }
      ]
    },
    {
      "kind": "how_it_works",
      "steps": [
        {
          "title": "Tire o print",
          "body": "Do SketchUp ou de qualquer modelo 3D, na câmera que você vai apresentar. No SketchUp, o plugin oficial captura a vista sozinho."
        },
        {
          "title": "Defina o ambiente",
          "body": "Atmosfera, enquadramento, luz e materiais — sem escrever prompt. A fidelidade à geometria é sempre máxima."
        },
        {
          "title": "Apresente",
          "body": "A imagem sai em minutos, pronta para reunião, prancha ou proposta. Ajuste, amplie ou anime se quiser."
        }
      ]
    },
    {
      "kind": "pricing",
      "plan_ids": ["essence", "pro", "studio"],
      "note": "Nodes são os créditos de geração — um render HD parte de 10 nodes. Eles acumulam enquanto a assinatura estiver ativa, e se você cancelar o saldo continua disponível por 90 dias. Comece grátis com 80 nodes, sem cartão; a assinatura entra quando o volume pedir."
    },
    {
      "kind": "faq",
      "items": [
        {
          "q": "A IA altera o meu projeto?",
          "a": "A plataforma é construída para preservar geometria, proporções, perspectiva e composição. Como toda ferramenta de IA, o resultado pode pedir ajustes — mas o objetivo é respeitar o projeto original, não criar uma imagem apenas parecida."
        },
        {
          "q": "Funciona com o que eu já uso?",
          "a": "Sim. Prints de tela, exportações, estudos volumétricos e referências funcionam como imagem base — do SketchUp, Revit, ArchiCAD, Blender ou qualquer modelador. Roda no navegador, sem instalação e sem GPU dedicada. Para SketchUp existe também o plugin oficial, que captura a vista direto do modelo."
        },
        {
          "q": "Preciso assinar para testar?",
          "a": "Não. A conta grátis vem com 80 nodes e não pede cartão — dá para gerar as primeiras imagens e julgar o resultado com um projeto seu antes de decidir qualquer coisa."
        },
        {
          "q": "E se eu não usar todos os nodes do mês?",
          "a": "Os nodes não utilizados acumulam enquanto a assinatura estiver ativa: o que sobrar de um mês soma com o do mês seguinte. Se você cancelar, o saldo continua disponível por 90 dias — reassinando dentro do prazo, você mantém tudo."
        },
        {
          "q": "Consigo usar as imagens com clientes?",
          "a": "Sim, os direitos das imagens geradas são seus. Use em apresentações comerciais, portfólio, redes sociais e materiais de projeto — incluindo saída em alta resolução (até 4K) para impressão."
        }
      ]
    }
  ]$json$::jsonb,

  meta_title = 'Do print do SketchUp ao render fiel · SpaceNode',
  meta_description = 'Suba o print do seu modelo de SketchUp e gere a imagem '
                     'de apresentação preservando geometria, proporções e '
                     'perspectiva. 80 nodes grátis, sem cartão. Planos a '
                     'partir de R$ 99/mês.'
where slug = 'print-do-sketchup';
