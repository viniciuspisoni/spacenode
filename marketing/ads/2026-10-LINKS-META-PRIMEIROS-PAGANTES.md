# Links da Meta — primeiros pagantes (outubro/2026)

> Substitui os links do plano operacional de 01/10 (`utm_campaign=sn_primeiros_pagantes_202610`,
> `utm_content=apresentacao_video20` / `respeito_projeto_estatico`). Aqueles identificadores não
> existem no painel `/admin/marketing/ads`: o painel gera o identificador sozinho
> (`SN_{CANAL}_{OBJETIVO}_{PERSONA}`), e o funil por campanha e a importação de gasto só casam
> eventos com esse identificador. Com os links antigos, cadastros e vendas do anúncio ficariam fora
> da campanha no painel e o CSV de gasto seria recusado.
>
> As URLs abaixo saem do próprio código do painel. `tests/meta-attribution-checkout.test.ts` cria a
> campanha e os anúncios pelo painel, confere que as URLs geradas são exatamente estas e segue o
> clique até a venda — se alguém mudar a convenção de nomes, o teste quebra antes da campanha.

## 1. Criar no painel ANTES de subir na Meta

**Campanha** (`/admin/marketing/ads` → Nova campanha):

| Campo | Valor |
| --- | --- |
| Nome | Primeiros pagantes — out/2026 |
| Canal | Meta |
| Frente | Conversão |
| Objetivo | Conversão |
| Persona (segmento do identificador) | `arquiteto202610` |
| Estágio | Topo de funil |

Identificador gerado: **`SN_META_CONVERSAO_ARQUITETO202610`** (o sufixo `202610` separa outubro das
campanhas de setembro; o plano pede para não reutilizar o identificador antigo).

**Anúncios** (na campanha → Novo anúncio). Deixe **Persona em branco** (herda a da campanha) e
escolha **Destino: Página inicial (/)**.

| Anúncio | Promessa | Criativo | Variação de copy | Identificador gerado |
| --- | --- | --- | --- | --- |
| A — Apresentação ao cliente (vídeo 20 s) | `apresentacao` | `video20` | `copy01` | `SN_META_CONVERSAO_ARQUITETO202610_APRESENTACAO_VIDEO20_COPY01` |
| B — Respeito ao projeto (estático) | `respeito` | `estatico` | `copy01` | `SN_META_CONVERSAO_ARQUITETO202610_RESPEITO_ESTATICO_COPY01` |

## 2. URL do site em cada anúncio da Meta

Copie a URL que o painel mostra no anúncio; ela tem de ser idêntica a esta.

- **Anúncio A**
  `https://spacenode.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_conversao_arquiteto202610&utm_content=sn_meta_conversao_arquiteto202610_apresentacao_video20_copy01&utm_term=arquiteto202610`
- **Anúncio B**
  `https://spacenode.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_conversao_arquiteto202610&utm_content=sn_meta_conversao_arquiteto202610_respeito_estatico_copy01&utm_term=arquiteto202610`

Não preencha "Parâmetros de URL" extras na Meta: o `fbclid` que ela acrescenta é guardado pelo site
sem interferir nos UTMs.

## 3. Nomes na Meta e importação diária do gasto

- Nome da campanha na Meta: `SN_META_CONVERSAO_ARQUITETO202610`.
- Nome de cada anúncio na Meta: o identificador do anúncio (tabela acima).
- CSV para `/admin/marketing/ads` (uma linha por anúncio por dia, no fuso da conta):
  `data,identificador,impressoes,cliques,investimento` com `identificador` = nome do anúncio.
  Importe só o nível de anúncio — linha de campanha e de anúncio no mesmo recorte soma o gasto em
  dobro.

## 4. Antes de ativar

1. Criar campanha e anúncios no painel e conferir as duas URLs.
2. Abrir a URL A no celular, pela prévia do anúncio no Instagram, e fazer um cadastro de teste por
   e-mail confirmando o link pelo app de e-mail (outro navegador). O cadastro precisa aparecer com
   `campaign_identifier = sn_meta_conversao_arquiteto202610`.
3. Marcar a conta de teste como interna no SQL editor:
   `select marketing.mark_internal_actor('<e-mail do teste>', 'teste pré-campanha out/2026');`
