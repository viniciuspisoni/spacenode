# Onboarding orientado à primeira visualização

## Auditoria do fluxo anterior

- O dashboard já destacava Renderizar, mas o tour ainda passava por Histórico e saldo de Nodes antes de abrir a ferramenta.
- O guia dentro do Renderizar acompanhava três fases reais, porém explicava controles e formatos mais do que a referência adequada e a fidelidade ao projeto.
- O resultado oferecia comparação, download, uma variação em 2K e Editar. Faltava um caminho explícito para Finalizar, Ampliar e Animar sobre a imagem recém-gerada.
- Spaces está desativado em `lib/nav/modules-config.ts`; a interface deve omitir o convite até a reativação. As rotas de criação continuam instrumentadas.
- O catálogo de analytics já incluía cadastro, checkout e assinatura, mas o funil de uso não emitia os fatos da geração e da criação de Space.

## Novo fluxo e estados

1. **Dashboard:** tour curto aponta Renderizar, continuidade da imagem e, quando habilitado, Space. O CTA final abre Renderizar. O empty state indica print do SketchUp, render básico ou foto.
2. **Renderizar:** o guia segue o estado real (referência → visualização → geração). A referência clara e a preservação de geometria, proporções e perspectiva aparecem no momento da decisão.
3. **Resultado:** comparação antes/depois e ações Editar, Finalizar, Ampliar, Animar e, quando habilitado, Space. Os links passam a imagem para a próxima ferramenta. A opção de planos aparece apenas quando o saldo restante não cobre outra render com a configuração atual.

## Eventos do funil

| Etapa | Evento | Origem |
| --- | --- | --- |
| Cadastro | `signup_completed` (`signup` no banco) | fluxo de atribuição existente |
| Dashboard | `dashboard_viewed` | cliente autenticado |
| Renderizar | `renderizar_viewed` | cliente autenticado |
| Referência escolhida | `render_reference_selected` | cliente autenticado |
| Upload validado | `image_uploaded` | API do Renderizar |
| Geração iniciada | `generation_started` | API, após débito |
| Render concluída | `generation_completed` e `first_generation` uma vez por conta | API, após resultado |
| Segunda ferramenta concluída | `second_tool_completed` uma vez por conta | APIs de Editar, Finalizar, Ampliar e Animar, após render prévia |
| Space criado | `project_created` | APIs de Space |
| Pricing visto | `plans_viewed` | landing ao entrar no viewport; billing ao abrir |
| Checkout e assinatura | `checkout_started`, `subscription_started` | API Stripe e webhook existentes |

Cliques nas ações do resultado usam `cta_clicked` com `cta=render_next_action` e `action` para separar intenção de conclusão. Os eventos novos são first-party em `marketing.acquisition_events`. A migration deste PR deve ser aplicada antes de ativar o código que os envia; falhas de analytics não bloqueiam a experiência.

## Revisão manual sugerida

- Conta sem renders: tour → Renderizar → upload → geração → resultado.
- Resultado: cada ação abre a imagem correta; Space não aparece enquanto o módulo estiver desativado.
- Saldo insuficiente: o caminho para planos aparece sem interromper download e ações disponíveis.
- No banco: uma render gera `first_generation` uma vez; uma ação concluída em outra ferramenta gera `second_tool_completed` uma vez; checkout e assinatura mantêm os eventos do Stripe.
