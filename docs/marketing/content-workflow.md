# SPACENODE — Fluxo editorial

> Fluxo de produção de conteúdo, do registro da ideia à análise pós-publicação. Implementado no
> schema `marketing` (Supabase) e operado pelo painel `/admin/marketing`. A máquina de status vive
> em `lib/marketing/workflow.ts` — este documento é a descrição funcional dela.

---

## 1. Visão geral

```text
idea
→ brief_draft
→ awaiting_review
→ changes_requested   (volta para brief_draft/awaiting_review)
→ approved
→ ready_for_production
→ asset_production
→ final_review
→ ready_to_schedule
→ scheduled
→ published
→ analyzed
```

Estados terminais alternativos: `rejected` (briefing recusado) e, para ideias, `archived`.

**Neste sprint, os estágios ativos no painel vão de `idea` até `ready_to_schedule`.**
`scheduled`, `published` e `analyzed` existem no schema e na máquina de status, mas dependem das
integrações futuras (n8n, Instagram API, PostHog) — nenhuma publicação automática está ativa.

## 2. Estágios

| Status | Entidade | Significado | Saídas permitidas |
|---|---|---|---|
| `idea` | content_ideas | Pauta registrada na biblioteca de ideias | virar briefing, arquivar |
| `brief_draft` | content_briefs | Briefing em escrita (manual ou gerado por IA) | awaiting_review |
| `awaiting_review` | content_briefs | Enviado para revisão humana | changes_requested, approved, rejected |
| `changes_requested` | content_briefs | Revisor pediu alterações (nova versão) | awaiting_review, brief_draft |
| `approved` | content_briefs | Aprovado editorialmente | ready_for_production |
| `rejected` | content_briefs | Recusado (terminal; motivo registrado) | — |
| `ready_for_production` | content_briefs | Fila de produção de arte/vídeo | asset_production |
| `asset_production` | content_briefs | Assets em produção (arte, captura, edição) | final_review |
| `final_review` | content_briefs | Revisão final da peça montada | ready_to_schedule, changes_requested |
| `ready_to_schedule` | content_briefs | Pronto para agendar (fim do escopo atual) | scheduled |
| `scheduled` | content_briefs | Agendado (futuro — integração) | published |
| `published` | content_briefs | Publicado (futuro — integração) | analyzed |
| `analyzed` | content_briefs | Métricas coletadas e lidas (futuro) | — |

Transições fora dessa tabela são bloqueadas pelo serviço (`assertTransition`). O status de ideia
(`content_ideas.status`) é independente: `open → in_briefing → converted` (ou `archived`).

## 3. Papéis

- **Criador** (staff): registra ideias, escreve/gera briefings, produz versões.
- **Revisor** (staff): aprova, pede alterações ou rejeita — sempre um humano. Neste momento os
  dois papéis são exercidos pelas mesmas pessoas (equipe interna via `isInternalStaff`); a
  estrutura de `content_approvals.reviewer_id` já registra quem revisou.

## 4. O ciclo, passo a passo

1. **Ideia** — registrada na biblioteca com pilar, objetivo, público e prioridade. Fontes:
   funcionalidade nova, projeto/geração interessante, pergunta recorrente de usuário, pauta do
   calendário.
2. **Briefing** — a ideia vira briefing (`ideaToBrief`): título, gancho, mensagem central,
   formato, plataforma, roteiro, legenda, CTA, direção visual, assets necessários. Pode ser
   escrito à mão ou gerado por IA (Etapa de geração assistida) — **sempre como rascunho**.
3. **Verificação de marca** — o verificador automático (`brand-check`) roda antes do envio para
   revisão: léxico proibido, claims, limites, genericidade, repetição. Score < 80 ou issue
   bloqueante = volta para edição. **A verificação automática nunca substitui a revisão humana.**
4. **Revisão humana** — o revisor vê conteúdo, legenda, roteiro, direção visual, arquivos
   vinculados, histórico de versões e observações; decide: aprovar / solicitar alterações /
   rejeitar. Cada decisão gera um registro em `content_approvals`.
5. **Versões** — toda alteração relevante após envio cria uma `content_version` (snapshot de
   título/roteiro/legenda/direção visual + resumo da mudança). O histórico é imutável.
6. **Produção** — aprovado, o briefing entra em produção de assets: seleção de imagens
   (gerações reais, uploads de marca), captura de tela, arte nos templates. Imagens de projeto de
   usuário exigem `content_projects.permission_status = granted`.
7. **Revisão final** — a peça montada (arte + legenda) passa por conferência final (checklist de
   [`editorial-guidelines.md`](./editorial-guidelines.md) §11–12).
8. **Pronto para agendar** — fim do escopo deste sprint. Publicação é manual, fora do sistema
   (processo do `content-factory/README.md`: orgânico manual; pago sobe **pausado**).
9. **Futuro** — agendamento (n8n), publicação (Instagram API) e análise (PostHog/metrics) usarão
   `content_publications`, sem mudar nada dos passos 1–8. Ver
   [`integration-roadmap.md`](./integration-roadmap.md).

## 5. Serviços disponíveis (lib/marketing/service.ts)

| Operação | Função |
|---|---|
| Criar ideia | `createIdea` |
| Transformar ideia em briefing | `ideaToBrief` |
| Criar nova versão | `createVersion` |
| Solicitar aprovação | `requestReview` |
| Aprovar conteúdo | `approveBrief` |
| Solicitar alterações | `requestChanges` |
| Rejeitar conteúdo | `rejectBrief` |
| Relacionar imagens a um briefing | `linkAsset` / `linkProject` |
| Consultar conteúdos anteriores | `listBriefs`, `getBriefDetail` |
| Identificar conteúdos semelhantes | `findSimilarContent` |
| Consultar regras da marca | `getBrandRules` |
| Registrar execução de automação | `recordAutomationRun` |

Todas rodam **apenas no servidor** (service role), atrás do gate `isInternalStaff`.

## 6. Regras inegociáveis do fluxo

1. Nada é publicado automaticamente — em nenhum estágio, por nenhuma integração futura sem
   aprovação humana explícita peça a peça.
2. Todo conteúdo que usa projeto/geração de usuário precisa de permissão registrada antes da
   produção.
3. Briefing rejeitado não é reciclado silenciosamente — vira ideia nova se a pauta merecer.
4. O verificador de marca roda em todo briefing antes de `awaiting_review`; o resultado fica
   registrado no briefing.
5. Execuções de IA (geração/verificação) são registradas em `automation_runs` com modelo, data e
   resultado.
