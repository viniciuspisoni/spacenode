# SpaceNode 3.0: Renderizar em três camadas

Estudo de 25/11/2026 sobre `937bec1`. Pesquisa de mercado, desenho do harness e conta de margem. Nada aqui foi ligado em produção nem gerou imagem paga.

**Limite da pesquisa.** A rede desta sessão bloqueou as páginas oficiais de preço (Google, OpenAI, xAI e BytePlus). Os preços vêm de buscas que cruzam várias fontes secundárias e dos valores já conferidos no repositório (`lib/edit-v4/pricing.ts`, `lib/costs/pricing.ts`, `docs/ORION-PILOTO-2026-09-10.md`). A coluna "confiança" diz o que está confirmado. Os preços da Anthropic vêm da tabela oficial de 03/11/2026. Antes de fixar a tabela de Nodes, conferir cada linha "secundária" na página do fornecedor.

## 1. Resumo

1. **As três camadas já existem, mas só a geração manda.** Hoje a leitura usa Gemini 2.5 Flash, um modelo de 2025. A conferência só roda nos casos limítrofes e não segura a entrega: espera 4 s e depois segue em segundo plano. Na 3.0 a conferência passa a decidir: entregar, refazer com correção dirigida ou entregar com aviso.
2. **Geração: testar quatro motores, não dois.** Os candidatos são Nano Banana 2.1, GPT Image 2.6 (Flare e Sunburst), Seedream 5.0 Flash e **Seedream 5.5**. O 5.5 saiu em 09/11 e substitui o 5.0 Pro: fica acima dele nos rankings de edição e custa menos na ModelArk. O Nano Banana Pro custa cerca de 2× o 2.1 e aparece abaixo dele nos rankings atuais, então sai da vitrine.
3. **Leitura e conferência: um modelo forte para ler e um barato para conferir.** A leitura acontece uma vez por print e fica em cache, então cabe um modelo caro (Claude Sonnet 5.5 no padrão, Claude Opus 5.5 no Final). A conferência roda em toda tentativa. Por isso usa Claude Haiku 5.5 (cerca de US$ 0,0014 por chamada) e só sobe para Sonnet 5.5 nos casos duvidosos. A escolha final sai da bancada (§6), não desta tabela.
4. **Nenhum juiz de IA enxerga bem a geometria.** Benchmarks de novembro de 2026 mostram juízes multimodais fracos em consistência espacial. A nota geométrica que já existe (bordas e cor, calculada no servidor, sem custo) continua obrigatória. O juiz de IA confere o que ela não mede: materiais, aberturas, objetos, luz e pedidos do usuário.
5. **A margem de 75% fecha, mas só com disciplina.** Com o Essence anual, um node vale R$ 0,1397. Com margem de 75%, sobram **US$ 0,0065 de custo por node** (câmbio de R$ 5,40). Uma imagem de 20 Nodes pode custar no máximo **US$ 0,129**, contando todas as tentativas, a leitura e a conferência. O Quasar de hoje, com saída de 4,2 MP, já está no limite (cerca de 75% antes de impostos).

## 2. Como o Renderizar funciona hoje

| Camada | Hoje | Onde | Limitação |
|---|---|---|---|
| 1. Leitura | Gemini 2.5 Flash gera o briefing arquitetônico, em cache por print | `lib/fidelity-engine.ts`, `app/api/generate/route.ts` | Modelo de 2025; tratado como observação falível |
| 2. Geração | Quasar (Seedream 5.0 Pro, padrão, 20 Nodes), Vega (Nano Banana Pro), Pulsar (Nano Banana 2), Orion (GPT Image 2.5, piloto) | `lib/engines.ts`, `lib/ai/image-provider.ts` | Pulsar usa um modelo que fontes secundárias dão como descontinuado em 06/10/2026 |
| 3. Conferência | Nota geométrica (bordas e ΔE) com até 2 tentativas, mais auditoria Gemini 2.5 Flash nos casos limítrofes | `lib/ai/fidelity/*`, `lib/spaces/preserve-validate.ts` | A auditoria não bloqueia a entrega nem orienta a nova tentativa |

Custo atual do Quasar: a ModelArk cobra US$ 0,045 até 2,61 MP e US$ 0,09 acima disso. O `auto_2K` entrega cerca de 4,2 MP, então cai na faixa cara, a menos que `SEEDREAM_CHEAP_TIER=1` esteja ligado em produção (`lib/ai/seedream-size.ts`). Verificar essa variável é a primeira ação de margem.

## 3. Pesquisa de modelos

### 3.1 Camada 2: geração e edição

| Modelo | Preço por imagem | Confiança | Ranking de edição (nov/2026) | Observação para arquitetura |
|---|---|---|---|---|
| Nano Banana 2.1 (Google) | US$ 0,050 em 2K; US$ 0,076 a 0,113 em 4K | Secundária; fontes divergem no 4K | Arena edit 6º (1.432); AA 10º (1.152) | Sucessor recomendado do Nano Banana 2; melhor edição por máscara. Um teste de terceiros viu a câmera abrir |
| Nano Banana Pro (Google) | US$ 0,134 em 2K; US$ 0,24 em 4K (fal: 0,15/0,30) | fal conferida no repo | Arena 1.366; AA 25º | Mais caro e abaixo do 2.1 nos rankings atuais |
| GPT Image 2.6 Sunburst / Flare (OpenAI) | Por token: US$ 8/M imagem de entrada, US$ 30/M saída. Medido no 2.5: US$ 0,041 em 1,6 MP e US$ 0,092 em 3,4 MP | Tarifa igual à 2.5, conferida no repo; 2.6 secundária | Topo do Arena edit (2.6 Sunburst 2º, 2.5 Sunburst 1º); AA 2º | Lançado em 04/11. Sunburst é mais lento (cerca de 120 s por edição); retrato custa cerca de 2,2× paisagem |
| Seedream 5.5 (ByteDance) | ModelArk: US$ 0,020 até 2,6 MP, US$ 0,035 em 2K, mais US$ 0,008 por imagem de entrada. fal: US$ 0,04 a 0,0525 | Secundária, várias fontes concordantes | AA 8º (1.159), à frente do NB 2.1 dentro da margem de erro | Lançado em 09/11; edição em várias rodadas, saída em camadas |
| Seedream 5.0 Pro (Quasar atual) | ModelArk: US$ 0,045 até 2,61 MP, US$ 0,09 acima | Conferida no repo | Arena 8º (1.412); AA 16º | Substituído pelo 5.5 |
| Seedream 5.0 Flash | ModelArk/OpenRouter US$ 0,018; fal US$ 0,027 | Secundária | Sem ranking independente | Rascunho rápido, menos de 20 s, até 10 a 14 referências |
| MAI-Image 2.7 (Microsoft) | Não encontrado | — | AA 1º (1.215, dado do fabricante) | Fora do escopo até ter API e preço públicos |

### 3.2 Camadas 1 e 3: leitura e conferência

Custo por chamada calculado com 4.000 tokens de entrada e 2.500 de saída na leitura, e 6.500 de entrada (duas imagens mais checklist) e 1.500 de saída na conferência.

| Modelo | US$/M entrada · saída | Leitura | Conferência | Confiança | Papel sugerido |
|---|---|---:|---:|---|---|
| Claude Opus 5.5 | 4 · 20 | 0,066 | 0,056 | Oficial | Leitura do Final 4K |
| Claude Sonnet 5.5 | 2 · 10 | 0,033 | 0,028 | Oficial | Leitura padrão; juiz de escalonamento |
| Claude Haiku 5.5 | 0,10 · 0,50 | 0,0016 | 0,0014 | Oficial | Juiz de primeira passada; leitura do Rascunho |
| Gemini 3.5 Flash | 1,50 · 9 | 0,029 | 0,023 | Secundária (fonte diverge: 0,75 · 4,50) | Candidato a leitor e juiz |
| Gemini 3.1 Pro | 2 · 12 | 0,038 | 0,031 | Secundária | Candidato a leitor |
| GPT-6.1 Terra | 1 · 5 | 0,017 | 0,014 | Secundária, sem página oficial | Candidato a leitor (raciocínio visual) |
| Grok 4.7 | 2 · 6 | 0,023 | 0,022 | Guia do desenvolvedor xAI, via busca | Candidato a leitor; sem benchmark de visão encontrado |

O ranking de compreensão de imagem do llm-stats (nov/2026) põe os modelos Claude no topo. É um único agregador, então a bancada decide. Regra de desenho: o juiz não pode ser da mesma família do gerador. Um Gemini julgando um Nano Banana tende a favorecer o próprio estilo.

## 4. O harness 3.0

```
print ──► [1] LEITURA (1× por print, cache)
           ficha técnica JSON: câmera, volumes, aberturas (contagem e posição),
           materiais por superfície, luminárias, vegetação, texto/logos,
           o que é ambíguo
        ──► [2] GERAÇÃO (prompt por motor, já existe em render-prompt-profile)
           motor escolhido pelo nível: Rascunho / Padrão / Final
        ──► [3] CONFERÊNCIA
           3a. checks gratuitos no servidor: nota geométrica, ΔE de cor,
               aspecto e dimensão          ── reprovou geometria ─┐
           3b. juiz barato (Haiku 5.5): checklist sim/não contra a ficha,
               item por item, com confiança ── duvidoso ─► 3c. juiz forte
           decisão: ENTREGAR │ REFAZER com correção dirigida │ ENTREGAR COM AVISO
                                     ▲                              │
                                     └── itens reprovados viram ◄───┘
                                         instrução da nova tentativa
```

Regras do harness:

- **Checklist, não nota livre.** O juiz responde por item ("a porta da esquerda continua com 2 folhas?"), comparando com a ficha da camada 1. Nota única de 0 a 10 não orienta a nova tentativa e não é auditável.
- **Correção dirigida.** Hoje a segunda tentativa muda seed e reforço estrutural. Na 3.0 ela recebe a lista dos itens reprovados.
- **Orçamento por imagem.** Cada nível tem teto em US$ (§5). O harness não abre tentativa que estoure o teto; entrega a melhor tentativa com aviso.
- **Melhor de N só no Final.** Gerar 2 candidatos e deixar o juiz escolher custa 2× a geração. Só cabe no preço de 45 Nodes.
- **Registro.** `generation_log` guarda modelo, custo, itens reprovados e decisão de cada camada, e `/admin/custos` passa a mostrar custo por imagem *aprovada*.

## 5. Margem bruta

### 5.1 Quanto vale um node

| | Valor |
|---|---|
| Essence anual | R$ 111,75 por mês ÷ 800 Nodes = **R$ 0,1397/node** |
| Em dólar (R$ 5,40, mesma base de `lib/edit-v4/pricing.ts`) | US$ 0,0259/node |
| Custo máximo com margem de 75% | **US$ 0,0065/node** (R$ 0,0349) |
| Teto por imagem | 8 Nodes: US$ 0,052 · 20 Nodes: US$ 0,129 · 40 Nodes: US$ 0,259 |

A conta supõe que o cliente gasta 100% dos Nodes, que é o pior caso. Impostos e taxa de cartão não entram no "bruto". Com 15% de deduções, os tetos caem 15%.

### 5.2 Configurações simuladas

Premissas: em média 1,35 tentativa por imagem no Rascunho e no Padrão e 1,5 no Final. Mais 5% de falhas pagas e estornadas. Leitura dividida por 2 renders por print, graças ao cache. Juiz Haiku em toda tentativa, mais Sonnet em 25% (Padrão) ou 40% (Final).

| Nível | Leitura → Geração → Conferência | Nodes | Custo US$ | Margem bruta | Com 15% de deduções |
|---|---|---:|---:|---:|---:|
| Rascunho 1,5K | Haiku 5.5 → Seedream 5.0 Flash → Haiku 5.5 | 8 | 0,027 | **86,8%** | 84,5% |
| Padrão 2K (A) | Sonnet 5.5 → Seedream 5.5 → Haiku (+Sonnet) | 20 | 0,089 | **82,8%** | 79,8% |
| Padrão 2K (B) | Sonnet 5.5 → GPT Image 2.6 Flare → Haiku (+Sonnet) | 20 | 0,092 | **82,3%** | 79,2% |
| Padrão 2K (C) | Sonnet 5.5 → Nano Banana 2.1 → Haiku (+Sonnet) | 20 | 0,099 | **80,8%** | 77,4% |
| Final 4K | Opus 5.5 → Nano Banana 2.1 4K → Haiku (+Sonnet) | 40 | 0,230 | 77,8% | 73,9% |
| Final 4K | mesmo pipeline | **45** | 0,230 | **80,3%** | 76,8% |
| Final 4K | Opus 5.5 → Nano Banana Pro 4K → Haiku (+Sonnet) | 40 | 0,430 | 58,5% | 51,1% |

O que mais pesa na conta:

1. **Tokens de saída das LLMs.** Uma leitura com Gemini 3.5 Flash ou Sonnet custa cerca de US$ 0,03, quase o preço da própria imagem. Usar a mesma LLM média para ler e conferir em toda tentativa derruba o Padrão para cerca de 72%. Por isso: cache da leitura, ficha JSON curta, esforço baixo no juiz e escalonamento só quando necessário.
2. **Tentativas.** Cada tentativa extra no Padrão custa cerca de US$ 0,055, somando geração e conferência. A margem cai cerca de 7 pontos se a média subir de 1,35 para 2.
3. **Megapixel, não rótulo.** Seedream e GPT Image cobram por área. Retrato em "2K" custa cerca de 2,2× paisagem no GPT Image. A tabela de Nodes deve olhar MP, como o piloto Orion já recomendou.
4. **Câmbio.** Com o dólar a R$ 6,00 e 15% de deduções, o Padrão A cai para cerca de 77%. Revisar a tabela de Nodes a cada trimestre.

## 6. Bancada de decisão

A escolha dos modelos de cada camada sai de testes nos prints dos clientes, não de rankings genéricos. A base já existe em `tests/fidelity/bench.test.ts` (opt-in, pago).

- **Conjunto:** 40 prints reais (SketchUp, Archicad, Revit, foto), cobrindo interior com marcenaria, piso paginado, fachada com esquadrias finas, vidro e espelho, cortina fechada, iluminação noturna, logotipo e texto, e refinamento com âncora. O conjunto `tests/fidelity/bench/inputs` não está no repositório e precisa ser montado.
- **Camada 1:** cada leitor gera a ficha dos 40 prints. Um arquiteto da equipe marca erros de contagem (portas, janelas, luminárias), de material e de câmera. Candidatos: Sonnet 5.5, Opus 5.5, Haiku 5.5, Gemini 3.5 Flash, GPT-6.1 Terra e Grok 4.7.
- **Camada 2:** 6 motores (Seedream 5.0 Pro como controle, Seedream 5.5, Seedream 5.0 Flash, Nano Banana 2.1, GPT Image 2.6 Flare e Sunburst) × 40 prints × 3 repetições, com a mesma ficha e o mesmo nível. Medir geometria, materiais, realismo, pior caso, latência e custo por imagem aprovada.
- **Camada 3:** os juízes avaliam as mesmas saídas. Comparar com a avaliação humana: concordância, falsos aprovados (os mais graves) e custo. Usar os casos de `render_feedback` como verdade adicional.
- **Custo estimado da bancada:** cerca de US$ 45 em gerações (720 × US$ 0,06), US$ 8 em leituras e US$ 60 em juízes. Total de **US$ 110 a 150**. Só rodar com aprovação.
- **Critério:** escolher o motor do Padrão pelo maior número de imagens aprovadas por dólar, com pior caso aceitável, e não pela maior média.

## 7. Riscos e pendências

- Preços secundários (§3) a conferir nas páginas oficiais. Liberar `ai.google.dev`, `developers.openai.com`, `docs.x.ai` e `docs.byteplus.com` na rede da sessão permite automatizar a conferência.
- Pulsar sobre Nano Banana 2, possivelmente descontinuado: confirmar e migrar para o 2.1.
- Leitura e auditoria em Gemini 2.5 Flash: confirmar a data de desligamento do modelo.
- `SEEDREAM_CHEAP_TIER` em produção: sem a variável, o Quasar paga a faixa de US$ 0,09.
- Juízes de IA erram geometria. A nota geométrica determinística não pode ser removida para economizar.
- Sunburst leva cerca de 2 minutos por edição. Cabe no Final, não no Rascunho.

## 8. Próximos passos

1. Conferir os preços oficiais e `SEEDREAM_CHEAP_TIER` (sem custo).
2. Montar o conjunto de 40 prints e a planilha de avaliação humana.
3. Aprovar e rodar a bancada (cerca de US$ 150).
4. Implementar a ficha técnica (camada 1) e o juiz em checklist (camada 3) atrás de flag, reutilizando `generation_log` e `lib/costs`.
5. Definir a tabela de Nodes por nível e MP com `lib/edit-v4/pricing.ts` como modelo: preço derivado do custo e da margem-alvo, não fixo.

## Fontes

- Anthropic: tabela de modelos e preços (cache oficial de 03/11/2026).
- [Arena: image edit](https://arena.ai/leaderboard/image/image-edit/single-image-commercial-design), [Arena: multi-image edit](https://arena.ai/leaderboard/image/image-edit/multi-image), [Artificial Analysis: editing](https://artificialanalysis.ai/image/leaderboard/editing/open-weights), [benchmarklist: AA editing](https://benchmarklist.com/arenas/artificial_analysis_image_editing/), [benchmarklist: Arena edit](https://benchmarklist.com/arenas/arena_ai_image_edit/), [Design Arena](https://www.designarena.ai/leaderboard/image)
- [MAI-Image 2.7](https://techjacksolutions.com/ai-tools/microsoft-ai/mai-image-2-7/), [5 modelos de novembro de 2026](https://www.zeniteq.com/5-new-ai-image-models-to-know-in-november-2026-pufojn)
- Nano Banana 2.1: [Decrypt](https://decrypt.co/380257/google-launches-nano-banana-2-1), [Android Authority](https://www.androidauthority.com/google-launches-nano-banana-2-1-3719823/), [benchlm](https://benchlm.ai/media-pricing/nano-banana), [laozhang](https://blog.laozhang.ai/en/posts/nano-banana-2-1), [fastlane](https://www.fastlane.ai/models/nano-banana-2-1)
- GPT Image 2.6: [Wikipedia](https://en.wikipedia.org/wiki/GPT_Image), [AlphaSignal](https://alphasignal.ai/news/openai-s-gpt-image-2-6-flare-and-sunburst-top-every-image-leaderboard), [Apidog](https://apidog.com/blog/gpt-image-2-6-flare-vs-sunburst/), [custo medido na fal](https://dev.to/lygerone/gpt-image-26-pricing-what-one-edit-really-costs-on-fal-measured-5aan), [Mockingbird](https://www.mockingbirdhouse.com/guides/gpt-image-2-6-pricing)
- Seedream: [5.5 LiteLLM](https://models.litellm.ai/models/seedream-v5.5), [5.5 OpenRouter](https://openrouter.ai/bytedance-seed/seedream-5-5), [5.5 Apiyi](https://help.apiyi.com/en/seedream-5-5-api-pricing-generation-editing-layers-en.html), [5.5 rankings](https://felloai.com/seedream-5-5/), [5.0 Flash OpenRouter](https://openrouter.ai/bytedance-seed/seedream-5-0-flash), [5.0 Flash fal](https://fal.ai/models/bytedance/seedream/v5/flash/edit), [5.0 Pro preços](https://budgetpixel.com/data/ai-generation-price-index/seedream-5.0-pro)
- LLMs: [llm-stats: compreensão de imagem](https://llm-stats.com/leaderboards/best-ai-for-image-understanding), [Gemini 3.5 Flash](https://www.buildfastwithai.com/blogs/gemini-3-5-flash-review-benchmarks-price-api), [Gemini 3.1 Pro](https://tokencost.app/models/gemini-3-1-pro), [Grok 4.7](https://docs.x.ai/developers/grok-4-7), [OpenAI GPT-6](https://www.nops.io/blog/openai-api-pricing/)
- Juízes: [EditJudge-Bench](https://arxiv.org/html/2611.12524), [MLLMs e inconsistência espacial](https://arxiv.org/pdf/2604.00799), [GEditBench v2](https://www.alphaxiv.org/abs/2603.28547), [VIF-Bench](https://arxiv.org/pdf/2609.37709)
- Testes de arquitetura: [Visualizee](https://visualizee.ai/blog/best-ai-model-for-architectural-rendering), [Desktop Architect](https://www.desktoparchitect.com/articles/chatgpt-vs-gemini-nano-banana-architecture-landscape-design)
