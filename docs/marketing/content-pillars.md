# SPACENODE — Pilares de conteúdo

> 12 pilares editoriais do sistema de conteúdo. Cada ideia/briefing pertence a exatamente um pilar
> (campo `pillar`, slug estável abaixo). Os 6 pilares do
> [`content-factory/content-pillars.json`](../../content-factory/content-pillars.json) continuam
> válidos e estão mapeados no §14 — este documento os expande para a operação no painel.

CTAs sempre da lista aprovada ([`editorial-guidelines.md`](./editorial-guidelines.md) §4).

---

## 1. `antes-e-depois` — Antes e depois

- **Objetivo:** prova visual imediata da promessa central; o device gráfico da marca.
- **Público:** arquitetos e designers em qualquer estágio do funil (topo forte).
- **Mensagem principal:** o "antes" é o seu modelo/print real; o "depois" é o mesmo projeto,
  renderizado — nada foi inventado no caminho.
- **Formatos:** comparativo antes/depois (quadrado/vertical), Reel demonstrativo, story.
- **Exemplos de pauta:** "Print do modelo às 9h, imagem de apresentação às 9h07"; "O mesmo living,
  antes e depois — com as linhas de fuga sobrepostas"; "Antes/depois de fachada mantendo a
  esquadria".
- **CTA:** "Teste com um projeto real".
- **Riscos:** antes/depois desonesto (projetos diferentes, insumo maquiado) destrói a marca;
  sempre mesmo projeto, sempre resultado real; registrar permissão quando o projeto é de usuário.

## 2. `fidelidade-geometrica` — Fidelidade geométrica

- **Objetivo:** sustentar o diferencial técnico nº 1 com prova, não com adjetivo.
- **Público:** arquitetos técnicos, céticos de IA — o público mais difícil e mais valioso.
- **Mensagem principal:** geometria, proporções e perspectiva do projeto preservadas; a régua
  confirma.
- **Formatos:** post estático com overlay de linhas de fuga, carrossel educativo, zoom em detalhe.
- **Exemplos de pauta:** "Linhas de fuga antes e depois do render"; "Por que a escada do render
  genérico tem 22 degraus"; "Pé-direito de 2,70m que continua 2,70m".
- **CTA:** "Veja no seu próprio projeto".
- **Riscos:** prometer perfeição absoluta (fidelidade tem limites honestos — admitir onde IA ainda
  erra reforça a credibilidade); usar imagem em que a fidelidade falhou sem contexto.

## 3. `coerencia-entre-angulos` — Coerência entre diferentes ângulos

- **Objetivo:** demonstrar o diferencial do Spaces: múltiplas vistas do mesmo projeto com o mesmo
  DNA visual.
- **Público:** arquitetos que apresentam ambientes completos (interiores, sobretudo).
- **Mensagem principal:** mesmo ambiente, vários ângulos, um único DNA visual — materiais, luz e
  atmosfera coerentes entre si.
- **Formatos:** três ângulos do mesmo projeto (carrossel/vertical), Reel de produto (navegando as
  vistas), story.
- **Exemplos de pauta:** "Mesmo living, quatro vistas, um DNA visual"; "O erro clássico da IA
  genérica: cada vista parece de um projeto diferente".
- **CTA:** "Renderize seu projeto".
- **Riscos:** publicar conjunto de vistas com incoerência visível; prometer coerência perfeita em
  vez de "coerência entre vistas" como direção do produto.

## 4. `produtividade` — Produtividade para arquitetos

- **Objetivo:** conectar a plataforma ao ganho real de prazo e fluxo do escritório.
- **Público:** arquitetos autônomos e pequenos escritórios pressionados por prazo.
- **Mensagem principal:** iteração em minutos dentro do fluxo — o render que caberia entre duas
  reuniões.
- **Formatos:** Reel demonstrativo (tempo real na tela), carrossel, post estático.
- **Exemplos de pauta:** "Três variações de acabamento antes da reunião das 14h"; "Um dia de
  entrega: o render entre duas reuniões"; "Iteração com cliente sem refazer o render externo".
- **CTA:** "Comece agora".
- **Riscos:** citar tempos que não se sustentam (usar tempos reais de tela); nunca sugerir que a
  plataforma substitui o projeto ou o arquiteto — ela remove espera, não autoria.

## 5. `tutoriais-rapidos` — Tutoriais rápidos

- **Objetivo:** ativação e retenção; mostrar o caminho curto para o primeiro resultado bom.
- **Público:** usuários novos e leads quentes considerando testar.
- **Mensagem principal:** em N passos objetivos você sai do print para a imagem de apresentação.
- **Formatos:** tutorial em carrossel, Reel curto de tela, story sequencial.
- **Exemplos de pauta:** "Do upload ao render: o fluxo completo em 5 passos"; "Como preparar o
  print do modelo para o melhor resultado"; "Como iterar uma imagem sem perder o que já aprovou".
- **CTA:** "Comece grátis".
- **Riscos:** tutorial de recurso desativado ou em beta (conferir `lib/nav/modules-config.ts`);
  esconder passos reais para parecer mais simples do que é.

## 6. `demonstracao-de-ferramentas` — Demonstração de ferramentas

- **Objetivo:** apresentar módulos ativos, um por vez, resolvendo um problema concreto.
- **Público:** leads em consideração + usuários que não conhecem todos os módulos.
- **Mensagem principal:** um módulo, um problema resolvido, uma tela real.
- **Formatos:** Reel de produto, post estático, carrossel.
- **Exemplos de pauta:** "Trocar o piso sem regenerar o ambiente inteiro (Editar)"; "Spaces:
  todas as vistas do projeto organizadas"; "Do render ao vídeo de apresentação (Animar)";
  "Planta Humanizada: a primeira leitura do cliente leigo".
- **CTA:** "Comece grátis" / "Veja no seu próprio projeto".
- **Riscos:** tour de features sem problema concreto (proibido); citar módulo desativado
  (Isométricas, Prancha IA, Moodboard estão off); inventar capacidade que o módulo não tem.

## 7. `bastidores` — Bastidores do desenvolvimento

- **Objetivo:** humanizar a marca e sustentar o "criado por arquiteto para arquitetos".
- **Público:** comunidade, early adopters, seguidores engajados.
- **Mensagem principal:** produto construído com critério de arquiteto — as decisões têm régua.
- **Formatos:** post estático, carrossel, story.
- **Exemplos de pauta:** "Por que recusamos gerar imagem que deforma a esquadria"; "Como testamos
  fidelidade antes de lançar um motor novo"; "A decisão de manter o verde só funcional".
- **CTA:** "Comece agora" (ou peça sem CTA de conversão — engajamento).
- **Riscos:** virar diário pessoal; expor prompt/stack/segredo interno; prometer roadmap com data.

## 8. `erros-comuns` — Erros comuns em geração de imagens arquitetônicas

- **Objetivo:** educar o olhar e posicionar o SpaceNode como o anti-hype; autoridade técnica.
- **Público:** arquitetos que já usaram IA genérica e se frustraram.
- **Mensagem principal:** como avaliar uma imagem de IA com critério de arquiteto — e onde o
  render genérico trai o projeto.
- **Formatos:** carrossel educativo, post estático com zoom em erro, Reel comparativo.
- **Exemplos de pauta:** "5 pontos para conferir antes de enviar um render ao cliente"; "Onde o
  render genérico erra a escada (e como perceber em 10 segundos)"; "Anatomia de um render ruim".
- **CTA:** "Veja no seu próprio projeto".
- **Riscos:** citar/atacar concorrente nominalmente (nunca); tom arrogante — a crítica é com
  régua, não com deboche; esquecer os limites honestos da nossa própria IA.

## 9. `estudos-de-caso` — Estudos de caso

- **Objetivo:** prova social real com projeto, contexto e resultado verificáveis.
- **Público:** leads em decisão; arquitetos avaliando se "funciona no meu tipo de projeto".
- **Mensagem principal:** projeto real do arquiteto X, do modelo à apresentação — com autorização
  e crédito.
- **Formatos:** carrossel de estudo de caso, vertical, Reel.
- **Exemplos de pauta:** "O render que segurou a aprovação de uma reforma comercial"; "Como um
  escritório de 3 pessoas absorveu visualização no fluxo semanal".
- **CTA:** "Teste com um projeto real".
- **Riscos:** **regra dura — sem material real e autorização registrada, este pilar espera.**
  Nunca inventar depoimento, métrica ou caso. `content_projects.permission_status` deve estar
  `granted` antes da produção; crédito ao autor é obrigatório.

## 10. `educativo-apresentacao` — Apresentação de projetos (educativo)

- **Objetivo:** valor além da ferramenta: como apresentar projeto para aprovar mais rápido.
- **Público:** arquitetos em início de carreira e autônomos; topo/meio de funil.
- **Mensagem principal:** o cliente aprova o que entende — a sequência e a qualidade das imagens
  decidem a reunião.
- **Formatos:** carrossel educativo, post estático, Reel falado curto.
- **Exemplos de pauta:** "A ordem das imagens numa reunião de aprovação"; "Planta seca vs. planta
  humanizada: o que o leigo lê primeiro"; "Vídeo como fechamento de apresentação".
- **CTA:** "Comece agora".
- **Riscos:** prometer resultado comercial garantido ("dobre aprovações" ✗); conteúdo genérico de
  coach — manter o chão técnico.

## 11. `tradicional-vs-spacenode` — Métodos tradicionais vs. SpaceNode

- **Objetivo:** comparação honesta de fluxo, prazo e controle com o processo tradicional
  (render externo / não visualizar).
- **Público:** arquitetos que terceirizam render ou apresentam sem visualização.
- **Mensagem principal:** comparação de processo (etapas, espera, iteração) — não de qualidade
  artística absoluta.
- **Formatos:** carrossel comparativo, post estático de duas colunas, Reel.
- **Exemplos de pauta:** "Render externo: briefing, fila, ajuste, semana. Aqui: upload, iteração,
  reunião"; "O custo invisível de apresentar planta seca".
- **CTA:** "Comece agora".
- **Riscos:** desmerecer renderistas profissionais (o alvo é a espera/fila, nunca o profissional);
  comparação de preço com números não conferidos; generalizar prazos de terceiros sem "em geral".

## 12. `novidades` — Novidades e atualizações do produto

- **Objetivo:** manter base ativa informada e dar motivo de retorno.
- **Público:** usuários atuais e seguidores.
- **Mensagem principal:** o que mudou, o problema que isso resolve, onde encontrar.
- **Formatos:** post estático de lançamento, Reel de produto, story.
- **Exemplos de pauta:** "Animar: vídeo a partir do seu render"; "Finalizar: pós-produção sem
  sair da plataforma".
- **CTA:** "Veja no seu próprio projeto".
- **Riscos:** anunciar antes de estar ativo em produção para todos; prometer data de roadmap;
  usar linguagem de "lançamento revolucionário" — novidade também segue a voz seca.

---

## 13. Mix editorial sugerido

Herda o mix do `content-factory` (4 peças/semana) reponderado nos 12 pilares:

| Peso | Pilares |
|---|---|
| Alto (semanal) | antes-e-depois, fidelidade-geometrica, demonstracao-de-ferramentas |
| Médio (quinzenal) | produtividade, coerencia-entre-angulos, erros-comuns, tutoriais-rapidos, educativo-apresentacao |
| Sob demanda | estudos-de-caso (só com material real), novidades (só com release ativo), tradicional-vs-spacenode, bastidores |

## 14. Mapeamento para os pilares do content-factory

| content-factory (`content-pillars.json`) | Pilares deste documento |
|---|---|
| `fidelidade-geometrica` | fidelidade-geometrica, antes-e-depois, coerencia-entre-angulos |
| `do-modelo-a-apresentacao` | produtividade, tutoriais-rapidos |
| `apresentacao-que-vende` | educativo-apresentacao |
| `criterio-tecnico` | erros-comuns |
| `produto-sem-verniz` | demonstracao-de-ferramentas, novidades |
| `voz-do-arquiteto` | estudos-de-caso |

Pilares novos sem correspondente direto: bastidores, tradicional-vs-spacenode.
