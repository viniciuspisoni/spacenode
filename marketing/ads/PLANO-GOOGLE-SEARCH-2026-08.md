# Plano de tráfego — Google Ads Pesquisa (captação de demanda ativa)

> Objetivo: capturar quem **já está procurando** render/imagem com IA para
> arquitetura no Brasil e converter em cadastro (80 nodes grátis) → assinatura.
> Canal: Google Ads **Pesquisa** (rede de pesquisa pura). Gestão manual no
> painel do Google Ads, seguindo a regra da casa: **tudo nasce PAUSADO,
> ativação é decisão humana do dono.**
>
> Convenções deste plano seguem `lib/marketing/ads/naming.ts` e
> `docs/marketing/ads-system.md`. Copy validada contra
> `docs/marketing/prohibited-content.md` (léxico, claims, posicionamento).
> Preços conferidos em `lib/plans.ts` (Starter 89 / Pro 199 / Studio 349 /
> Office 699; cadastro grátis = 80 nodes).

---

## 0. BLOQUEADORES antes de ativar (nesta ordem)

1. **Conversão de cadastro não mede hoje.** A tag `AW-18345260541` está em
   produção (PR #122), mas `NEXT_PUBLIC_GADS_SIGNUP_LABEL` não existe →
   `reportSignupConversion()` é no-op. Sem isso o Google não recebe nenhum
   sinal e nada pode ser otimizado nem avaliado.
   - Google Ads → Metas → Conversões → **Nova ação de conversão** → Site →
     nome **Cadastro** → categoria *Inscrição* → contagem **Uma** → janela
     30 dias → conversão **principal**. Copiar o *label* (parte após a barra
     em `AW-18345260541/XXXXXXXX`).
   - Vercel → env `NEXT_PUBLIC_GADS_SIGNUP_LABEL=<label>` em **Production** →
     **redeploy** (env sem redeploy não vale — política do projeto).
   - Validar com 1 cadastro real novo: o fluxo `auth/callback` marca
     `?signup=1` p/ conta criada há <60s e `SignupConversionPing` dispara
     exatamente 1 vez.
2. **LGPD / Política de Privacidade.** A cláusula 7 de `/privacidade` promete
   "sem rastreadores de terceiros", mas a tag do Google Ads **já está no ar**
   desde 23/07. Atualizar a cláusula ANTES de escalar gasto: usar o rascunho
   de `docs/marketing/ads-system.md` §4.2 (cookie `sn_attribution`) **somando
   um trecho declarando a tag de conversão do Google Ads**. Decisão de banner
   de consentimento é do dono (hoje não existe banner).
3. **Auto-tagging ON** na conta (Configurações → gclid). O cookie
   `sn_attribution` já captura `gclid`+UTMs — mas o código do funil
   first-party é o PR #115 (não mergeado). Enquanto não mergear, a única
   medição é a do Google (item 1) + Stripe na mão.
4. Campanha publicada **PAUSADA**; ativar só depois de 1–3 concluídos.

Recomendado (não bloqueia): mergear PR #135 (landing nova — hero comparador,
página 17,5% mais curta) antes de escalar; a landing atual converte pior.

---

## 1. Estratégia em uma tela

- **O que capturamos**: demanda ativa por (a) render com IA, (b) render de
  SketchUp, (c) planta humanizada, (d) IA para arquitetura/imagem de
  arquitetura. São os quatro bolsos de busca com intenção compatível com o
  produto.
- **O que NÃO capturamos de propósito**: busca genérica por "gerador de
  imagem IA" sem qualificador de arquitetura (público de meme/avatar, CPC
  baixo mas conversão nula — e o posicionamento proíbe comunicar o SpaceNode
  como gerador genérico); marcas concorrentes (Lumion/V-Ray/Enscape/D5) como
  palavra-chave — além do risco de conversão, há jurisprudência brasileira
  (STJ, 2023+) tratando compra de marca alheia como concorrência desleal.
  Entram como **negativas** na v1; reavaliar na fase 2 com parecer.
- **Conversão primária**: cadastro (grátis, 80 nodes, sem cartão). Assinatura
  é acompanhada via Stripe/first-party por enquanto (fase 2: importar
  conversão de assinatura).
- **1 campanha, 4 grupos** — orçamento pequeno concentra aprendizado; grupos
  separam mensagem por intenção.

## 2. Estrutura e naming (registro interno)

| Nível | Identificador | Uso |
|---|---|---|
| Campanha | `SN_GOOGLE_CAPTACAO_ARQUITETO` | `utm_campaign` (minúsculo) |
| Grupo 1 | `SN_GOOGLE_CAPTACAO_ARQUITETO_RENDERIA` | Render com IA (núcleo) |
| Grupo 2 | `SN_GOOGLE_CAPTACAO_ARQUITETO_SKETCHUP` | Workflow SketchUp |
| Grupo 3 | `SN_GOOGLE_CAPTACAO_ARQUITETO_PLANTAHUM` | Planta humanizada |
| Grupo 4 | `SN_GOOGLE_CAPTACAO_ARQUITETO_IAARQ` | IA p/ arquitetura |
| RSA G1 | `SN_GOOGLE_CAPTACAO_ARQUITETO_PRAZO_RSA01_COPY01` | `utm_content` |
| RSA G2 | `SN_GOOGLE_CAPTACAO_ARQUITETO_FIDELIDADE_RSA01_COPY01` | `utm_content` |
| RSA G3 | `SN_GOOGLE_CAPTACAO_ARQUITETO_APRESENTACAO_RSA01_COPY01` | `utm_content` |
| RSA G4 | `SN_GOOGLE_CAPTACAO_ARQUITETO_CATEGORIA_RSA01_COPY01` | `utm_content` |

**URL final** (todas): landing `https://spacenode.app/` com UTM padrão
(`utm_source=google`, `utm_medium=cpc`, `utm_campaign=sn_google_captacao_arquiteto`,
`utm_content=<id do anúncio em minúsculo>`, `utm_term=arquiteto`). Exemplo G1:

```text
https://spacenode.app/?utm_source=google&utm_medium=cpc&utm_campaign=sn_google_captacao_arquiteto&utm_content=sn_google_captacao_arquiteto_prazo_rsa01_copy01&utm_term=arquiteto
```

> Gap conhecido: G3 (planta humanizada) mereceria LP própria — hoje a única
> página pública é a home, focada em render. É o caso de uso perfeito do
> `/lp/[slug]` do PR #115. Na v1 vai para a home mesmo; a copy faz a ponte.

## 3. Configuração da campanha (checklist de criação)

| Configuração | Valor |
|---|---|
| Tipo | Pesquisa, **sem meta de campanha guiada** (criar "sem orientação de meta" p/ não ligar expansões) |
| Redes | **Só Pesquisa Google** — desmarcar Parceiros de pesquisa e Display |
| Local | Brasil · opção de segmentação "**Presença**: pessoas no local" (não "interesse") |
| Idiomas | Português **e** Inglês (navegador em EN é comum entre arquitetos) |
| Lances | **Maximizar cliques com teto de CPC R$ 3,00** até ter medição + ≥30 conversões/30d; depois migrar p/ Maximizar conversões (tCPA só com histórico estável) |
| Orçamento | **R$ 40/dia** (cenário base ≈ R$ 1.200/mês) · mínimo viável R$ 25/dia |
| Rotação de anúncios | Otimizar |
| Programação | 24/7 na v1 (arquiteto renderiza de madrugada — não cortar noite sem dado) |
| Auto-tagging | ON |
| Sitelinks | **Não usar na v1** — o site tem 1 página pública e o Google exige URLs de destino distintas; habilitar quando existirem LPs (`/lp/*`) |

**Frases de destaque (callouts, ≤25 chars)** — todas verificadas:
`Cadastro sem cartão` · `80 nodes grátis` · `Geometry Lock` ·
`Tudo no navegador` · `Suporte em português` · `Feito por arquiteto`

**Snippet estruturado (Serviços)** — só módulo ativo em
`lib/nav/modules-config.ts`:
`Render fotorrealista` · `Planta humanizada` · `Edição de imagem` ·
`Ampliação de imagem` · `Vídeo do projeto`
(NUNCA: Isométricas, Prancha IA, Moodboard — estão desligados.)

**Extensão de promoção (a forma segura de usar a oferta de lançamento):**
promoção "50% de desconto — Primeira mensalidade", período **18/08–31/08/2026**.
A extensão expira sozinha no Google em 31/08 — por isso a oferta **não entra
no texto fixo** de nenhum anúncio (anúncio fixo com oferta vencida =
propaganda enganosa; e encerrar a oferta na landing já exige deploy próprio,
ver `docs/CAMPANHA-LANCAMENTO-2026-07.md`).

## 4. Palavras-chave por grupo

Só correspondência de **frase** e **exata** (orçamento pequeno não sustenta
ampla). Lista inicial enxuta de propósito — expandir via relatório de termos
de pesquisa semanal.

### G1 — Render com IA
```text
"render com ia"
"render ia"
"renderizar com ia"
"render com inteligência artificial"
"renderizador com ia"
"programa de render com ia"
"site para renderizar com ia"
"render online com ia"
"criar render com ia"
[render com ia]
[renderizar com ia]
```

### G2 — SketchUp
```text
"renderizar sketchup"
"render sketchup online"
"renderizar sketchup online"
"sketchup com ia"
"ia para sketchup"
"renderizar modelo do sketchup"
"render rápido sketchup"
"como renderizar no sketchup"
[renderizar sketchup]
[render sketchup]
```
*("como renderizar…" tem intenção mista de tutorial — manter e vigiar o CPL
do termo; cortar se não converter.)*

### G3 — Planta humanizada
```text
"planta humanizada"
"planta humanizada online"
"fazer planta humanizada"
"planta humanizada com ia"
"programa para planta humanizada"
"planta humanizada automática"
"como fazer planta humanizada"
[planta humanizada]
[planta humanizada com ia]
```

### G4 — IA para arquitetura
```text
"ia para arquitetura"
"inteligência artificial para arquitetura"
"ia para arquitetos"
"ia para design de interiores"
"ia para projetos de arquitetura"
"gerar imagem de arquitetura com ia"
"criar imagem de arquitetura com ia"
"imagem com ia arquitetura"
[ia para arquitetura]
[ia para arquitetos]
```

### Negativas (nível campanha)
```text
curso, cursos, aula, aulas, tutorial, apostila, faculdade, tcc,
emprego, vaga, vagas, salário, estágio, currículo,
download, baixar, apk, crack, crackeado, torrent, pirata,
midjourney, dall-e, dalle, stable diffusion, leonardo ai, chatgpt, canva,
vray, v-ray, lumion, enscape, twinmotion, d5,
o que é, significado, wallpaper, png, logo, logotipo,
tattoo, tatuagem, anime, jogo, jogos
```
**Não** negativar: `grátis` (o cadastro É grátis e o CTA é teste grátis),
`revit` (upload de print funciona vindo de qualquer software; só não entra
como palavra positiva porque o posicionamento é SketchUp-first),
`photoshop` em G3 (quem busca "planta humanizada photoshop" aceita um
caminho mais fácil — a descrição responde exatamente isso).

## 5. Anúncios (RSA — títulos ≤30, descrições ≤90)

Tom do brief: de arquiteto para arquiteto, direto, zero hype de IA. Léxico
proibido conferido (nada de "transforme", "revolucionário", "incrível" etc.);
sem emoji; claim de tempo aprovado = "em minutos"; sem menção à oferta 50%
no texto fixo (só extensão de promoção). Fixar (pin) apenas onde indicado —
resto livre para o Google combinar.

### RSA G1 — Render com IA (`…_PRAZO_RSA01_COPY01`)

Títulos (contagem entre parênteses):
1. Render com IA para Arquitetos (29)
2. Fotorrealismo em Minutos (24)
3. Do Modelo 3D ao Fotorrealista (29)
4. Sem Fila, Sem Madrugada (23)
5. Geometria do Projeto Intacta (28)
6. Cadastro Grátis, Sem Cartão (27)
7. Planos a partir de R$ 89/mês (28)
8. Feito por Arquiteto, no Brasil (30)
9. Renderize no Navegador (22)
10. Sem Hardware Caro (17)
11. Seu Cliente Entende o Render (28)
12. Teste com 80 Nodes Grátis (25)

Descrições:
1. Suba a imagem do seu modelo e receba um render fotorrealista em minutos. Teste grátis. (86)
2. Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
3. Sem placa de vídeo, sem fila de render. Tudo no navegador, a partir de R$ 89/mês. (81)
4. Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade. (87)

### RSA G2 — SketchUp (`…_FIDELIDADE_RSA01_COPY01`)

Títulos:
1. Renderize Prints do SketchUp (28) — *pin título 1*
2. Do SketchUp ao Render com IA (28)
3. Do Print ao Fotorrealista (25)
4. Geometry Lock: Projeto Fiel (27)
5. Fotorrealismo em Minutos (24)
6. Sem Render de Madrugada (23)
7. Cadastro Grátis, Sem Cartão (27)
8. A partir de R$ 89/mês (21)
9. Seu Cliente Entende o Render (28)
10. Sem Plugin, Sem Instalação (26)
11. Upload da Imagem e Pronto (25)
12. Render Fiel ao Seu Modelo (25)

Descrições:
1. Faça upload do print do SketchUp e receba o render fotorrealista em minutos, no navegador. (90)
2. Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
3. Sem plugin e sem render de madrugada: o modelo que você já tem vira apresentação. (81)
4. Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade. (87)

> Atenção ao claim: é sempre **upload do print** — nunca "importação direta"
> ou "plugin do SketchUp" (claim falso, lista proibida). "Sem plugin" é o
> jeito honesto de dizer a mesma força.

### RSA G3 — Planta humanizada (`…_APRESENTACAO_RSA01_COPY01`)

Títulos:
1. Planta Humanizada com IA (24) — *pin título 1*
2. Da Planta Técnica à Humanizada (30)
3. Humanize Plantas em Minutos (27)
4. Planta Humanizada Online (24)
5. Cores, Pisos e Mobiliário (25)
6. Apresente a Planta ao Cliente (29)
7. Cadastro Grátis, Sem Cartão (27)
8. A partir de R$ 89/mês (21)
9. Sem Photoshop, Sem Demora (25)
10. Feito para Arquitetura (22)
11. Envie a Planta e Pronto (23)
12. Qualidade de Apresentação (25)

Descrições:
1. Envie a planta técnica e receba a versão humanizada em minutos, pronta para apresentar. (87)
2. Pisos, cores e mobiliário aplicados com IA, respeitando o desenho da sua planta. (80)
3. Sem horas de Photoshop: a planta humanizada sai no navegador, sem hardware caro. (80)
4. Cadastro grátis com 80 nodes para testar. Planos a partir de R$ 89 por mês. (75)

### RSA G4 — IA para arquitetura (`…_CATEGORIA_RSA01_COPY01`)

Títulos:
1. IA Feita para Arquitetura (25)
2. Imagens de Arquitetura com IA (29)
3. Render com IA para Arquitetos (29)
4. Imagens Fiéis ao Seu Projeto (28)
5. Do Projeto à Apresentação (25)
6. Fotorrealismo em Minutos (24)
7. Cadastro Grátis, Sem Cartão (27)
8. Planos a partir de R$ 89/mês (28)
9. Geometria do Projeto Intacta (28)
10. Feito por Arquiteto, no Brasil (30)
11. Render, Planta e Vídeo (22)
12. Tudo no Navegador (17)

Descrições:
1. IA para renderizar, editar, ampliar e animar imagens do seu projeto de arquitetura. (83)
2. Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
3. Ferramenta de imagem com IA feita para arquitetos, não um gerador genérico. Teste grátis. (89)
4. Suba a imagem do seu modelo e receba um render fotorrealista em minutos. Teste grátis. (86)

## 6. Experimento (registrar no padrão do sistema quando o painel subir)

- **Hipótese**: existe demanda ativa qualificada por render/imagem IA de
  arquitetura no Brasil que converte em cadastro a custo sustentável.
- **Critério de sucesso (30 dias)**: CPL ≤ **R$ 40** com ≥ **10 cadastros**,
  e ativação (1º render) ≥ **40%** dos cadastros vindos de `utm_source=google`.
- **Guardrail de corte**: grupo com > R$ 300 gastos e 0 cadastros → pausar o
  grupo (não a campanha).
- **Meta de negócio (90 dias)**: ≥ 2 assinaturas atribuídas. Matemática
  honesta: no Starter (R$ 89/mês) um CAC de R$ 600 = payback ~7 meses; no Pro
  (R$ 199) ~3 meses. A fase 1 compra **dado**, não escala — escalar só com
  CPL e ativação validados.
- **Rotina semanal**: relatório de termos de pesquisa → mover termo bom p/
  exata, termo ruim p/ negativa; conferir CPL por grupo; exportar CSV de
  desempenho (guardar em `marketing/ads/csv/` até o painel do PR #115 subir).

## 7. Fase 2 (não fazer agora)

1. **Conversão de assinatura** no Google Ads (evento no fluxo Stripe) — hoje
   só cadastro é instrumentado.
2. **LPs dedicadas** por grupo via `/lp/[slug]` (PR #115) — prioridade para
   planta humanizada; habilita sitelinks.
3. **Marcas concorrentes** como keyword — só com parecer jurídico
   (jurisprudência STJ sobre concorrência desleal) e decisão do dono.
4. **Meta Ads prospecção** com os 7 Reels prontos em `marketing/output/`
   (demanda latente; manual no Gerenciador, CSV no painel).
5. **Remarketing** (listas do Google) — exige atualização de privacidade +
   decisão de consentimento antes.
6. **Performance Max / Display**: não usar com este orçamento e sem histórico
   de conversão — queima verba sem sinal.
