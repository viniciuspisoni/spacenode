# APIs e controle de custos da SpaceNode

O painel em `/admin/custos` reúne consumo monitorado, faturas mensais, cobertura dos dados e qualidade das entregas. O objetivo é reduzir o custo por resultado útil preservando a fidelidade ao projeto. Há 15 integrações mapeadas; presença de um adapter ou de uma credencial não comprova tráfego em produção.

## Inventário

| Integração | Uso | Evidência |
| --- | --- | --- |
| fal.ai | Imagens, fallback, upscale, vídeo, segmentação e 3D | `lib/ai/image-provider.ts`, `lib/upscale/providers`, `lib/spaces/engines` |
| BytePlus ModelArk | Seedream no Quasar e Editar V4 | `lib/ai/ark/seedreamEdit.ts`, `lib/edit-v4/engine.ts` |
| Google Cloud Vertex | Vega, Pulsar, visão, texto e adapter de vídeo | `lib/ai/image-provider.ts`, `lib/gemini.ts`, `lib/video/adapters` |
| Gemini API direta | Nodi, briefing, visão e edições legadas | `lib/gemini.ts`, `lib/nodi`, `lib/ai/google/editImage.ts` |
| OpenAI | Orion | `lib/orion/provider.ts`, `lib/orion/pricing.ts` |
| Supabase | Banco, Auth, Storage e Realtime | `lib/supabase`, `lib/storage` |
| Vercel | Hospedagem, funções e tarefas agendadas | `vercel.json`, `app/api` |
| Stripe | Assinaturas, checkout, Pix e webhooks | `app/api/stripe`, `lib/stripe` |
| Resend | Convites por email | `lib/email/send-invite-email.ts` |
| YCloud WhatsApp | Serviço externo informado para contato e recuperação | `app/api/internal/whatsapp`; nenhuma chamada direta à YCloud encontrada |
| Meta Marketing, Pixel e CAPI | Anúncios, atribuição e conversões | `lib/meta/ads.ts`, `lib/analytics/adapters/meta-conversions.ts` |
| Google Analytics 4 | Eventos e comportamento, opcional por configuração | `lib/analytics/adapters/ga4.ts` |
| Google Ads Google Tag | Medição de conversões e campanhas, independente do GA4 | `lib/gtag.ts`, `components/GoogleTag.tsx` |
| Google OAuth | Login via Supabase Auth | `app/login`, `lib/supabase` |
| Meshy | Adapter opcional de Blocos 3D, uso a confirmar | `lib/blocos3d/meshy.ts` |

Canva, Runway, ChatGPT e Claude da equipe não são APIs do produto. Investimento em anúncios também fica separado das chamadas de IA. Custos de Auth já incluídos no Supabase não devem ser duplicados em Google OAuth.

## Dados financeiros e qualidade

O painel consulta `renders`, `edits`, `edit_v3_jobs`, `image_edit_attempts`, `blocos3d_jobs`, `video_jobs` e `render_feedback`, além das novas tabelas `api_cost_events` e `api_cost_invoices`. As leituras usam paginação de 500 linhas e limite de 20 mil linhas por fonte; erros de leitura e limites aparecem explicitamente.

Chamadas de imagem acionadas por `/api/generate`, Editar V4 por `/api/edit-v4` e provedores de Ampliar por `/api/upscale` geram novos eventos. A coleta inclui branches concorrentes e fallbacks nos caminhos instrumentados. Ampliar fica sem valor quando não há tarifa implementada. Vídeo, 3D, Nodi, visão, segmentação e outros chamadores de adapters ainda dependem de instrumentação adicional ou da reconciliação com o fornecedor.

- **Consumo monitorado:** subtotal conhecido em USD. Custos por tarifa são estimativas; `real_usd`, quando disponível, substitui a estimativa.
- **Faturas:** valor final mensal atribuído à SpaceNode, após créditos, descontos e impostos. Recarga de saldo não é consumo. Um total por fornecedor e mês evita duplicar faturas.
- **Cobertura:** operações com ao menos um valor conhecido sobre todas as operações. Não garante que todas as tentativas estejam precificadas.
- **Subtotal por entrega:** limite inferior quando faltam custos. Não deve decidir sozinho uma troca de motor.
- **Qualidade:** aprovação registrada e feedback voluntário de utilidade. A amostra pode ter viés.

Nodes não são convertidos em despesa. Rejeição, falha ou estorno podem ter cobrança de API. Valores desconhecidos não viram zero. Eventos vinculados por request ID substituem estimativas históricas; histórico de edições e renders de vídeo ligados ao mesmo job é deduplicado. Faturas e consumo não são somados entre si.

O histórico monetário utilizável vem de `provider_cost_usd` em tentativas de edição e de estimativas do Orion em `generation_log`. Não há reconstrução de custos antigos com tarifas atuais. O período usa São Paulo; câmbio e meta são manuais, salvos no dispositivo. As faturas são compartilhadas pela equipe.

## Decisões de produto

| Prioridade | Ação | Evidência necessária |
| --- | --- | --- |
| 1 | Fechar faturas e reconciliar consumo por fornecedor | Ranking real de despesas, créditos e cobertura |
| 2 | Reduzir retrabalho por geometria, materiais e alterações fora da seleção | Custo de todas as tentativas por resultado aprovado ou útil |
| 3 | Investigar fallbacks de Vertex e ModelArk | Qualidade, sucesso e latência preservados com custo total menor |
| 4 | Dimensionar saídas pela necessidade da entrega e pelo crop | Mesmas referências, detalhes e materiais preservados |
| 5 | Comparar motores em projetos equivalentes | Mesmas imagens e instruções, fidelidade, aprovação e tempo |
| 6 | Examinar execução, armazenamento e tráfego conforme as faturas | Ganho financeiro sem prejudicar histórico e imagens |

O simulador reutiliza `lib/edit-v4/pricing.ts`, com tarifas de setembro de 2026. A rota direta já existe; a economia adicional depende do tráfego que ainda passa pela fal e de testes equivalentes. Não muda o motor padrão. Imagens Google e fal usam `lib/costs/pricing.ts`; uso incompleto ou modelos não reconhecidos ficam sem valor.

Fontes para revisão: [Seedream fal](https://fal.ai/models/bytedance/seedream/v5/pro/edit), [ModelArk](https://docs.byteplus.com/en/docs/ModelArk/1544106), [Nano Banana Pro](https://fal.ai/models/fal-ai/nano-banana-pro/edit), [Nano Banana 2](https://fal.ai/models/fal-ai/nano-banana-2/edit), [Google Cloud](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing).

O acesso às cobranças Vercel funcionou em 9 de outubro. O retorno é um agregado parcial da equipe, com períodos diários e amostra limitada, sem atribuição completa a projetos. Não foi importado como fatura final da SpaceNode.

## Operação e validação

A migration `20261009133910_api_cost_dashboard.sql` foi aplicada em 9 de outubro de 2026. As duas tabelas têm RLS e acesso de leitura/escrita pelo servidor; `anon` e `authenticated` não têm acesso. O painel reutiliza a autenticação staff existente, com `INTERNAL_STAFF_EMAILS` ou papel interno do perfil verificado no servidor. Não usa metadados editáveis pelo cliente para autorização.

A coleta ocorre após a resposta, sem acrescentar espera de banco à entrega. Uma falha de telemetria não bloqueia a imagem. Eventos não incluem prompts, imagens, IDs de usuários, chaves ou erros brutos. Os dados enviados à interface são agregados.

85 testes passaram, incluindo contabilidade, custo desconhecido, zero confirmado, rejeições cobradas, duas branches, duplicidade, paginação, RLS, origem de gravação, acesso staff, tarifas e limites de mês. TypeScript, ESLint e build de produção passaram. O build local usa credenciais públicas fictícias somente para inicialização; a conexão real é verificada separadamente.

A publicação no GitHub e na SpaceNode foi autorizada em 9 de outubro de 2026. A conferência visual e o fluxo autenticado em produção continuam pendentes; o download do navegador para teste local falhou. Conferir o deploy e os controles de acesso após a publicação.

Para fechar o primeiro mês, registrar as faturas finais dos fornecedores, conferir as diferenças com o subtotal e observar novos eventos após o uso normal de Renderizar, Editar V4 e Ampliar. A conferência de uma amostra de request IDs com a cobrança do fornecedor continua necessária para tratar estimativas como custos reconciliados.
