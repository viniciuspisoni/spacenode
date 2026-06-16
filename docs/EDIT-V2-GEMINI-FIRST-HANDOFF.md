# EDITAR v2 (Google-first) — HANDOFF (checkpoint 2026-06-12)

Sessão pausada como **laboratório técnico**. Nenhuma implementação nova daqui
em diante sem reabrir. Documento curto para retomar com contexto.

## Estado do repositório
- **Branch:** `feature/edit-v2-google-first`
- **Último commit:** `9ad4695` — feat(edit-v2): surface completion (cobertura da superfície-alvo)
- **Editar v1:** INTOCADO. Zero mudança committada em `lib/spaces/`, `components/spaces/`
  e `app/api/edits/route.ts|preview|segment`. A única alteração em arquivo
  compartilhado é `app/app/editar/page.tsx` (+14/−2): switch por flag
  `NEXT_PUBLIC_EDIT_V2` — sem a flag, renderiza o v1 exatamente como antes.
- **Sem deploy, sem migration, sem cobrança real, sem débito de Nodes.** Toda
  cobrança do v2 é SIMULADA (`charge: {simulated:true, debited:false}`);
  nenhuma migration foi criada; `.env.local` ignorado pelo git.
- 34 arquivos novos (lib/edit-v2, components/editar, scripts, docs).

## O que foi VALIDADO (com teste pago real)
- **Gemini Flash (`gemini-3.1-flash-image`, API direta) para troca de material:**
  trocou os painéis por madeira clara preservando juntas/luz/geometria; drift
  fora da máscara ~0,009% (recompose); gate semântico aprovou. ✔
- **Vertex/Imagen (`imagen-3.0-capability-001`) para edição localizada com
  máscara real:** correção de artefato (mancha no piso) impecável; remoção
  funciona para objeto inteiro NÃO-luminoso; drift ~0,008%. ✔
- **Seleção por intenção (Trocar material) — caminho final que passou nos 4
  critérios:** Circular região → Gemini box (`box_2d`+label+confidence, ~5–7s)
  → SAM2 dentro da box → componente conexo ancorado na região → refino
  edge-aware → **surface completion** (close + fill, limitado por box +
  exclusões). Cobertura completa (holeRatio 0,016→0,000), sem vazamento,
  latência 13–23s (SAM2 warm vs cold). `policy=gemini-box-sam2-complete`. ✔
- **Pipeline server-side de preservação:** recompose (PNG lossless + alpha
  materializado + keepMetadata), gates de pixel (drift fora / no-op dentro),
  gate semântico, allowlist SSRF, attempt resiliente. ✔
- **UI EditV2Flow:** 5 tipos, controles Preservação/Intensidade/Qualidade,
  custo em Nodes (preview server-side), antes/depois, importar do histórico
  (Renders/Vistas/Edições), canvas com coordenadas normalizadas + zoom/pan,
  "Circular região"/"Pintar manualmente". Validação visual manual do dono
  PENDENTE.

## O que deve ser CONGELADO (não mexer mais nesta janela)
- A camada de seleção inteligente do Trocar material (já passou nos 4
  critérios). Não empilhar mais ajustes de máscara agora.
- A matriz de roteamento por evidência (router.ts): Vertex p/ fix/remove
  mascarados; Gemini Flash p/ material/inserir/atmosfera; Pro só alta precisão.
- Os tetos de custo das chamadas Gemini (maxOutputTokens/thinkingBudget/timeout).

## O que deve ser REAPROVEITADO
- `lib/edit-v2/*` inteiro (router puro, pricing central, prompts, providers
  Google diretos, normalizer, semantic-gate, mask-ops, mask-morphology,
  connected-components, mask-refine, pipeline, gemini-segment, gemini-mask-raster).
- Helpers battle-tested do v1 reusados por import (edit-crop: recompose,
  máscara, crop, drift) — NÃO reescrever.
- Scripts de smoke/validação (todos dry-run por padrão; `--approve-paid-call`
  para gastar) — úteis para regressão.
- `gemini-mask-raster.ts` (Gemini mask direto) fica guardado como experimento
  futuro; hoje fora do fluxo.

## RISCOS
- **Pricing/margem (crítico):** 5 nodes ≈ US$0,068 de receita no piso vs
  ~US$0,103 de custo real (Gemini Flash 2K) = margem NEGATIVA no piso.
  Revisar antes de qualquer cobrança real.
- **Latência da detecção:** SAM2/evf-sam em cold boot chegam a 37–56s
  (warm ~3–13s). Precisa de warm-up/cache antes de produção.
- **Telemetria sob bypass de teste:** `attempt_id` fica null com o usuário-
  fantasma (FK em auth.users) — com sessão real grava; confirmar.
- **Drift repo×produção:** tabela `edits` sem DDL no repo; CHECK de
  `vistas.engine` divergente. Baseline dump obrigatório antes de migration v2.
- **Custo de detecção é "da casa"** (sem Node): vetor de abuso sem rate limit.
- **Gemini mask direto:** geração de máscara pelo Gemini é lenta (>30s) —
  descartado como motor principal (caminho B venceu).

## PENDÊNCIAS (ordem sugerida para retomar)
1. **Teste manual do dono na UI** (em andamento): circular região / pintar
   manual / importar histórico / detectar / ajustar máscara / gerar / antes-
   depois / loading-erros / sensação geral.
2. **Revisão de pricing** (pré-Fase 4): custo real por tipo; custo de detecção
   (~US$0,0065) e geração (~US$0,103); margem por plano; discrepância UI×API
   (5 vs 6 nodes — provável material sem ref=5 / com ref=6); preço próprio p/
   Trocar material Gemini Flash 2K.
3. **Fase 4:** cobrança real controlada + débito + histórico persistente +
   migration (com baseline + aprovação) + deploy gradual atrás de flag.
4. **Latência:** warm-up/cache do SAM2; timeout/fallback mais rápido.
5. **Validar os outros tipos** (Remover/Inserir/Corrigir/Atmosfera) na UI e
   com smoke pago quando autorizado.

## Aprendizados técnicos (resumo)
- Gemini Flash: ótimo para **re-síntese de material** (transformar superfície).
- Vertex/Imagen: ótimo para **edição localizada com máscara** (reconstruir o
  que deveria estar ali — correção/remoção).
- Detecção automática de superfície: **instável como fluxo principal** isolado
  (evf-sam erra alvo/cold boot; Gemini-mask lento). A combinação Gemini-box +
  SAM-na-box + completion estabilizou — mas seleção por intenção é
  **promissora, não obrigatória** para o MVP (manter "Pintar manualmente"
  como base sempre disponível).
- Pricing **precisa ser revisado** antes de cobrança real (margem negativa no
  piso com a tabela-hipótese atual).
- Documento de plano completo: `docs/PLANO-EDITAR-V2-2026-06-12.md`.
