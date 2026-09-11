# Roteiro para criar as campanhas Meta por API (servidor MCP `meta-ads`)

Executar numa sessão interativa do `claude` na pasta do projeto, aprovando as chamadas de escrita.
Conta de anúncios: **act_1591546965695524** ("SpaceNode Ads") · Página: **1300022283184438** (SpaceNode) ·
Instagram Business: **17841477062800156** (@spacenode.app). **Tudo nasce PAUSED. Nada é ativado.**
Ao terminar cada fase, gravar os IDs em `marketing/ads/setup-2026-09/meta-ids-2026-09-09.json`.

Regras gerais: usar só ferramentas `meta-ads`; depois de cada criação, buscar a entidade de volta e conferir
`status = PAUSED`; nunca inventar IDs de interesse (só os três abaixo, já validados na conta pessoal); se a API
rejeitar um campo, registrar o erro exato em `warnings` e tentar a alternativa indicada.

## Fase 1 — público, campanhas e conjuntos (não depende de vídeo)

**A. Público personalizado** `SN_QUENTE_IG_365`: subtype `ENGAGEMENT`, fonte `ig_business` id `17841477062800156`,
retenção 365 dias (31536000 s), evento "todos que interagiram com a conta profissional" (nome documentado, ex.
`ig_business_profile_all`). Descrição: "Interagiu com @spacenode.app nos últimos 365 dias".

**B. Campanha** `SN_META_PROSPECCAO_ARQUITETO`: objective `OUTCOME_TRAFFIC`, buying_type `AUCTION`, ABO (sem
orçamento na campanha), special_ad_categories `[]`, PAUSED. Se a ferramenta aceitar limite de gastos, `100000`
(R$ 1.000,00 em centavos); senão pular.

**C. Dois conjuntos** na campanha B, ambos: billing_event `IMPRESSIONS`, optimization_goal `LANDING_PAGE_VIEWS`,
bid_strategy `LOWEST_COST_WITHOUT_CAP`, daily_budget `1600` (centavos = R$ 16), start_time
`2026-09-14T09:00:00-03:00`, end_time `2026-10-13T23:59:00-03:00`, PAUSED, e o `targeting` EXATAMENTE:

```json
{"age_min":24,"age_max":50,
 "geo_locations":{"countries":["BR"],"location_types":["home"]},
 "locales":[16],
 "flexible_spec":[{"interests":[
   {"id":6004140335706,"name":"Arquitetura (arquitetura)"},
   {"id":6002920953955,"name":"Design de interiores (design)"},
   {"id":6003350422793,"name":"Design de interiores (arquitetura)"}]}],
 "publisher_platforms":["instagram"],
 "instagram_positions":["stream","story","reels"],
 "device_platforms":["mobile","desktop"],
 "targeting_automation":{"advantage_audience":0}}
```

Nomes: `SN_META_PROSPECCAO_ARQUITETO_RENDER` e `SN_META_PROSPECCAO_ARQUITETO_PLUGIN`. Se a API rejeitar
`locales:[16]`, repetir sem locales e registrar. Se rejeitar `advantage_audience: 0`, registrar o erro exato e repetir
sem `targeting_automation` (nesse caso o Advantage+ precisa ser desligado na interface depois).

**D. Campanha** `SN_META_SEGUIDORES_ARQUITETO`: objective `OUTCOME_ENGAGEMENT`, AUCTION, ABO, PAUSED, limite
`25000` se suportado.

**E. Conjunto** `SN_META_SEGUIDORES_ARQUITETO_QUENTE` na campanha D: optimization_goal `VISIT_INSTAGRAM_PROFILE`,
destination_type `INSTAGRAM_PROFILE`, billing_event `IMPRESSIONS`, bid `LOWEST_COST_WITHOUT_CAP`, daily_budget
`800`, mesmas datas, PAUSED, targeting igual ao de C mas com `age_min 22`, `age_max 55` e
`"custom_audiences":[{"id":"<id do público A>"}]`. Se exigir `promoted_object`, usar page_id `1300022283184438` e
instagram id `17841477062800156`.

Ao fim da fase 1, gravar o JSON: `{"audience_id","campaign_prospeccao_id","adset_render_id","adset_plugin_id",
"campaign_seguidores_id","adset_quente_id","warnings":[]}` e mostrar o targeting efetivo de cada conjunto (idade,
interesses, públicos, publisher_platforms, instagram_positions, targeting_automation).

## Fase 2 — vídeos, criativos e anúncios (depois de `node marketing/scripts/ads/upload-meta-media.mjs`)

Ler `marketing/ads/setup-2026-09/meta-media-urls.json` (chave = pasta do vídeo → `video_url`, `image_url`).

**F. Subir cada vídeo** com `ads_creative_upload_media` (`upload_source: URL`, `media_type: VIDEO`, `media_url` =
`video_url`, `name` = nome da pasta). Guardar o `video_id`. Esperar o processamento terminar se a ferramenta indicar.

**G. Criativo + anúncio por linha da tabela**, com `ads_create_creative` (page_id `1300022283184438`,
`instagram_user_id` `17841477062800156`, `object_story_spec.video_data` = {video_id, image_url = capa da pasta,
message = texto principal, title = título, link_description = descrição, call_to_action = {type, value:{link}}}) e
depois `ads_create_ad` (PAUSED) no conjunto indicado. Os UTMs já estão dentro do link.

| Conjunto | Nome do anúncio | Pasta do vídeo | Copy | CTA | Link |
|---|---|---|---|---|---|
| RENDER | SN_META_PROSPECCAO_ARQUITETO_RENDER_DRONE_COPY01 | 2026-09-04-reel-drone-nada-sai-do-lugar-ad | COPY01 | SIGN_UP | https://spacenode.app/lp/print-do-sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_render_drone_copy01&utm_term=arquiteto |
| RENDER | SN_META_PROSPECCAO_ARQUITETO_RENDER_PISCAFACHADA_COPY01 | 2026-09-04-reel-pisca-fachada-geminada-ad | COPY01 | SIGN_UP | https://spacenode.app/lp/print-do-sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_render_piscafachada_copy01&utm_term=arquiteto |
| RENDER | SN_META_PROSPECCAO_ARQUITETO_RENDER_DUASREUNIOES_COPY02 | 2026-09-04-reel-entre-duas-reunioes-ad | COPY02 | SIGN_UP | https://spacenode.app/lp/print-do-sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_render_duasreunioes_copy02&utm_term=arquiteto |
| PLUGIN | SN_META_PROSPECCAO_ARQUITETO_PLUGIN_PLUGINRENDER_COPY03 | 2026-09-07-reel-plugin-render-real | COPY03 | SIGN_UP | https://spacenode.app/sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_plugin_pluginrender_copy03&utm_term=arquiteto |
| PLUGIN | SN_META_PROSPECCAO_ARQUITETO_PLUGIN_PLUGINNOSU_COPY03 | 2026-09-07-reel-plugin-no-sketchup | COPY03 | SIGN_UP | https://spacenode.app/sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_plugin_pluginnosu_copy03&utm_term=arquiteto |
| PLUGIN | SN_META_PROSPECCAO_ARQUITETO_PLUGIN_TRESCENAS_COPY04 | 2026-09-05-reel-plugin-tres-cenas-um-clique | COPY04 | SIGN_UP | https://spacenode.app/sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=sn_meta_prospeccao_arquiteto_plugin_trescenas_copy04&utm_term=arquiteto |
| QUENTE | SN_META_SEGUIDORES_ARQUITETO_QUENTE_DRONE_COPY05 | 2026-09-04-reel-drone-nada-sai-do-lugar-ad | COPY05 | VIEW_INSTAGRAM_PROFILE | https://www.instagram.com/spacenode.app/ |
| QUENTE | SN_META_SEGUIDORES_ARQUITETO_QUENTE_PLUGINNOSU_COPY05 | 2026-09-07-reel-plugin-no-sketchup | COPY05 | VIEW_INSTAGRAM_PROFILE | https://www.instagram.com/spacenode.app/ |

Reaproveitar o `video_id` quando a pasta se repete (drone e plugin-no-sketchup aparecem duas vezes). Se o CTA
`VIEW_INSTAGRAM_PROFILE` for recusado no criativo, tentar `INSTAGRAM_PROFILE`/`VISIT_INSTAGRAM_PROFILE` conforme a lista
aceita pela ferramenta, ou criar o criativo sem link e registrar em `warnings`.

**Textos (message = texto principal, duas linhas; title = título; description = descrição):**

- COPY01 · message: "Você modela no SketchUp? O print do modelo vira render fotorrealista, sem nada sair do lugar. Feito por arquiteto.\nPlanos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão." · title: "Render fiel ao seu SketchUp" · description: "80 nodes grátis · sem cartão"
- COPY02 · message: "Para arquitetos: reunião de manhã com o print do SketchUp, reunião da tarde com a imagem. Render em minutos, no navegador.\nPlanos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão." · title: "Do print à imagem, em minutos" · description: "80 nodes grátis · sem cartão"
- COPY03 · message: "Renderize sem sair do SketchUp: o plugin captura a cena, a lente e o sol do seu modelo e devolve a imagem em minutos.\nPlugin grátis. Cadastro com 80 nodes, sem cartão." · title: "Render dentro do SketchUp" · description: "Plugin grátis · SketchUp 2021+"
- COPY04 · message: "Três cenas do SketchUp, um clique, três renders com o mesmo preset. O plugin renderiza em lote, dentro do seu modelo.\nPlugin grátis. Cadastro com 80 nodes, sem cartão." · title: "Cenas em lote, dentro do SketchUp" · description: "Plugin grátis · SketchUp 2021+"
- COPY05 · message: "Render com IA para quem projeta no SketchUp: fidelidade ao modelo, bastidores do plugin, um Reel por semana.\nFeito por arquiteto, em português." · title: "Render fiel ao SketchUp, toda semana" · description: "@spacenode.app"

Ao fim da fase 2, acrescentar ao JSON: `video_ids` (pasta → id), `creatives` e `ads` (nome → id) e `warnings`.
Conferir com `ads_get_ad_preview` um anúncio de cada conjunto (posicionamento Instagram Reels) e relatar se a
Página/Instagram aparecem como remetente. Não ativar nada.

## O que fica na interface depois (Gerenciador de Anúncios, conta SpaceNode Ads)

1. Públicos → criar `SN_QUENTE_VIDEO50_365` (Vídeo → assistiram ≥ 50% → todos os vídeos → 365 d) e incluí-lo no
   conjunto `_QUENTE` ao lado de `SN_QUENTE_IG_365`.
2. Em cada conjunto de prospecção: conferir "Público original" e desmarcar "Alcançar pessoas além das seleções";
   acrescentar a camada 2 (Restringir público) com `meta-02-segmentacao.csv`; conferir tamanho (300 mil–2 mi).
3. Em cada anúncio: aprimoramentos Advantage+ creative todos OFF; prévia de Reels e Feed.
4. Faturamento da conta SpaceNode Ads: cartão válido antes de ativar. Ativar só depois da leitura final.
