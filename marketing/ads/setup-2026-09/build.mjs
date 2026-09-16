// Gera os arquivos de importação (Google Ads Editor + Meta bulk import + UTMs) e
// valida limites de caracteres. Uso: node marketing/ads/setup-2026-09/build.mjs
import fs from 'node:fs'
import path from 'node:path'
const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const REPO = path.resolve(OUT, '..', '..', '..')
const BASE = 'https://spacenode.app'
const errors = []
const chk = (label, s, max) => { if ([...s].length > max) errors.push(`${label}: ${[...s].length}/${max} "${s}"`) }
const csv = rows => rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }).join(',')).join('\r\n') + '\r\n'
const write = (name, content) => { fs.writeFileSync(path.join(OUT, name), '﻿' + content, 'utf8'); console.log('ok', name) }

// ───────────────────────── Google Ads ─────────────────────────
const G = {
  campaign: 'SN_GOOGLE_CAPTACAO_ARQUITETO',
  budget: 25, start: '2026-09-14', end: '2026-10-13',
  groups: {
    SKETCHUP: {
      lp: '/lp/print-do-sketchup', ad: 'sn_google_captacao_arquiteto_fidelidade_rsa01_copy01',
      exact: ['renderizar sketchup', 'render sketchup', 'render sketchup online', 'renderizar sketchup online', 'renderizar modelo do sketchup', 'sketchup com ia', 'ia para sketchup', 'render com ia sketchup', 'renderizador sketchup', 'render rápido sketchup'],
      phrase: ['renderizar sketchup'],
      headlines: ['Renderize Prints do SketchUp', 'Do SketchUp ao Render com IA', 'Do Print ao Fotorrealista', 'Render Fiel ao Seu Modelo', 'Fotorrealismo em Minutos', 'Sem Render de Madrugada', 'Cadastro Grátis, Sem Cartão', 'A partir de R$ 89/mês', 'Seu Cliente Entende o Render', 'Funciona com Qualquer Print', 'Upload da Imagem e Pronto', 'Tudo no Navegador', 'Feito por Arquiteto, no Brasil'],
      pin1: ['Renderize Prints do SketchUp', 'Do SketchUp ao Render com IA'],
      descriptions: ['Faça upload do print do SketchUp e receba o render fotorrealista em minutos, no navegador.', 'O render respeita o seu projeto: paredes, aberturas e proporções ficam como no print.', 'Sem render de madrugada: o modelo que você já tem vira apresentação, direto no navegador.', 'Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade.'],
      path: ['sketchup', 'render'],
    },
    PLUGIN: {
      lp: '/sketchup', ad: 'sn_google_captacao_arquiteto_plugin_rsa01_copy01',
      exact: ['plugin render sketchup', 'plugin de render para sketchup', 'plugin de renderização sketchup', 'plugin renderizador sketchup', 'renderizador para sketchup', 'render sketchup plugin', 'extensão render sketchup', 'plugin ia sketchup', 'plugin de render sketchup grátis'],
      phrase: ['plugin de render sketchup'],
      headlines: ['Renderize Dentro do SketchUp', 'Plugin Grátis para SketchUp', 'Um Clique na Barra do SketchUp', 'Render Fiel ao Seu Modelo', 'Cenas em Lote, Mesmo Preset', 'Sol e Lente do Seu Modelo', 'Cadastro Grátis, Sem Cartão', '80 Nodes Grátis para Testar', 'SketchUp 2021 ou Superior', 'Windows e macOS', 'Feito por Arquiteto, no Brasil', 'Fotorrealismo em Minutos'],
      pin1: ['Renderize Dentro do SketchUp', 'Plugin Grátis para SketchUp'],
      descriptions: ['Instale o plugin SPACENODE, clique em Renderizar e receba a imagem fotorrealista da cena.', 'A extensão captura a vista atual, a lente e o sol do modelo. Nada sai do lugar no render.', 'Renderize várias cenas em lote com o mesmo preset, sem sair do SketchUp. Plugin grátis.', 'Os renders usam os nodes da sua conta. Cadastro grátis com 80 nodes, sem cartão.'],
      path: ['sketchup', 'plugin'],
    },
    PLANTAHUM: {
      lp: '/lp/planta-humanizada', ad: 'sn_google_captacao_arquiteto_apresentacao_rsa01_copy01',
      exact: ['planta humanizada', 'planta humanizada online', 'planta humanizada com ia', 'planta humanizada ia', 'fazer planta humanizada', 'programa para planta humanizada', 'planta humanizada automática', 'planta baixa humanizada', 'humanizar planta baixa', 'humanizar planta'],
      phrase: [],
      headlines: ['Planta Humanizada com IA', 'Planta Humanizada Online', 'Da Planta Técnica à Humanizada', 'Humanize Plantas em Minutos', 'Cores, Pisos e Mobiliário', 'Apresente a Planta ao Cliente', 'Cadastro Grátis, Sem Cartão', 'A partir de R$ 89/mês', 'Sem Retoque Manual, Sem Demora', 'Feito para Arquitetura', 'Envie a Planta e Pronto', 'Respeita o Desenho da Planta'],
      pin1: ['Planta Humanizada com IA', 'Planta Humanizada Online'],
      descriptions: ['Envie a planta técnica e receba a versão humanizada em minutos, pronta para apresentar.', 'Pisos, cores e mobiliário aplicados com IA, respeitando o desenho da sua planta.', 'Sem horas de retoque manual: a planta humanizada sai no navegador, sem hardware caro.', 'Cadastro grátis com 80 nodes para testar. Planos a partir de R$ 89 por mês.'],
      path: ['planta', 'humanizada'],
    },
  },
  negatives: `curso,cursos,aula,aulas,tutorial,tutoriais,apostila,faculdade,tcc,"passo a passo",aprender,youtube,udemy,hotmart,videoaula,"vídeo aula",emprego,vaga,vagas,salário,salario,estágio,estagio,currículo,curriculo,download,baixar,apk,crack,crackeado,torrent,pirata,"free download","for free","sem pagar",ilimitado,estudante,estudantes,midjourney,dall-e,dalle,"stable diffusion","leonardo ai",chatgpt,gemini,copilot,canva,firefly,krea,sora,lumion,vray,"v-ray","v ray",enscape,twinmotion,d5,"d5 render",corona,"corona render",chaos,podium,kerkythea,artlantis,keyshot,blender,"unreal engine","o que é",significado,conceito,exemplo,exemplos,pinterest,wallpaper,png,jpg,pdf,dwg,pronta,prontas,"modelo pronto",logo,logotipo,tattoo,tatuagem,anime,jogo,jogos,bloco,blocos,warehouse,textura,texturas,vetor,decorar,decoração,decoracao,reforma,"minha casa","casa própria"`,
  callouts: ['Cadastro sem cartão', '80 nodes grátis', 'Tudo no navegador', 'Suporte em português', 'Feito por arquiteto', 'Plugin para SketchUp'],
  snippet: { header: 'Serviços', values: ['Render fotorrealista', 'Planta humanizada', 'Edição de imagem', 'Ampliação de imagem', 'Vídeo do projeto', 'Plugin para SketchUp'] },
}
const utm = (src, med, camp, content) => `utm_source=${src}&utm_medium=${med}&utm_campaign=${camp}&utm_content=${content}&utm_term=arquiteto`
const gUrl = g => `${BASE}${g.lp}?${utm('google', 'cpc', G.campaign.toLowerCase(), g.ad)}`

// campanha + grupos
write('google-01-campanha-e-grupos.csv', csv([
  ['Campaign', 'Campaign Type', 'Campaign Status', 'Budget', 'Budget type', 'Bid Strategy Type', 'Networks', 'Languages', 'Location', 'Start Date', 'End Date', 'Ad Group', 'Ad Group Status', 'Ad Group Type', 'Max CPC', 'Ad rotation'],
  [G.campaign, 'Search', 'Paused', G.budget, 'Daily', 'Maximize clicks', 'Google search', 'pt', 'Brazil', G.start, G.end, '', '', '', '', 'Optimize'],
  ...Object.keys(G.groups).map(k => [G.campaign, 'Search', 'Paused', '', '', '', '', '', '', '', '', `${G.campaign}_${k}`, 'Enabled', 'Standard', '3.00', '']),
]))
// palavras-chave
const kwRows = []
for (const [k, g] of Object.entries(G.groups)) {
  for (const kw of g.exact) kwRows.push([G.campaign, `${G.campaign}_${k}`, kw, 'Exact', 'Enabled', ''])
  for (const kw of g.phrase) kwRows.push([G.campaign, `${G.campaign}_${k}`, kw, 'Phrase', 'Enabled', ''])
}
write('google-02-palavras-chave.csv', csv([['Campaign', 'Ad Group', 'Keyword', 'Criterion Type', 'Status', 'Final URL'], ...kwRows]))
// negativas (lista compartilhada)
const negs = G.negatives.match(/"[^"]+"|[^,]+/g).map(s => s.replace(/"/g, '').trim())
write('google-03-negativas-SN_NEG_CAPTACAO_v2.csv', csv([['Negative keyword list', 'Keyword', 'Criterion Type'], ...negs.map(n => ['SN_NEG_CAPTACAO_v2', n, n.includes(' ') ? 'Negative Phrase' : 'Negative Broad'])]))
// RSAs
const H = Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`)
const HP = Array.from({ length: 15 }, (_, i) => `Headline ${i + 1} position`)
const D = Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`)
const adRows = []
for (const [k, g] of Object.entries(G.groups)) {
  g.headlines.forEach((h, i) => chk(`RSA ${k} headline ${i + 1}`, h, 30))
  g.descriptions.forEach((d, i) => chk(`RSA ${k} description ${i + 1}`, d, 90))
  g.path.forEach(p => chk(`RSA ${k} path`, p, 15))
  const hs = [...g.headlines, ...Array(15 - g.headlines.length).fill('')]
  const hp = hs.map(h => h && g.pin1.includes(h) ? '1' : '')
  adRows.push([G.campaign, `${G.campaign}_${k}`, 'Responsive search ad', 'Paused', gUrl(g), ...hs, ...hp, ...g.descriptions, g.path[0], g.path[1], g.ad])
}
write('google-04-anuncios-rsa.csv', csv([['Campaign', 'Ad Group', 'Ad type', 'Status', 'Final URL', ...H, ...HP, ...D, 'Path 1', 'Path 2', 'Ad name'], ...adRows]))
// extensões
G.callouts.forEach(c => chk('callout', c, 25))
G.snippet.values.forEach(v => chk('snippet value', v, 25))
const sitelinks = {
  SKETCHUP: [['Planta humanizada', 'Da planta técnica à humanizada', 'Cores, pisos e mobiliário', '/lp/planta-humanizada'], ['Plugin para SketchUp', 'Renderize dentro do SketchUp', 'Grátis, usa os nodes da conta', '/sketchup'], ['Planos a partir de R$ 89', '750 nodes por mês', 'Cadastro grátis, sem cartão', '/']],
  PLUGIN: [['Do print ao render', 'Qualquer print funciona', 'Render fiel ao modelo', '/lp/print-do-sketchup'], ['Planta humanizada', 'Da planta técnica à humanizada', 'Cores, pisos e mobiliário', '/lp/planta-humanizada'], ['Planos a partir de R$ 89', '750 nodes por mês', 'Cadastro grátis, sem cartão', '/']],
  PLANTAHUM: [['Do print ao render', 'Qualquer print funciona', 'Render fiel ao modelo', '/lp/print-do-sketchup'], ['Plugin para SketchUp', 'Renderize dentro do SketchUp', 'Grátis, usa os nodes da conta', '/sketchup'], ['Planos a partir de R$ 89', '750 nodes por mês', 'Cadastro grátis, sem cartão', '/']],
}
const extRows = []
for (const [k, list] of Object.entries(sitelinks)) for (const [t, d1, d2, p] of list) {
  chk('sitelink text', t, 25); chk('sitelink d1', d1, 35); chk('sitelink d2', d2, 35)
  extRows.push([G.campaign, `${G.campaign}_${k}`, 'Sitelink', t, d1, d2, `${BASE}${p}?${utm('google', 'cpc', G.campaign.toLowerCase(), G.groups[k].ad)}`])
}
for (const c of G.callouts) extRows.push([G.campaign, '', 'Callout', c, '', '', ''])
extRows.push([G.campaign, '', 'Structured snippet', G.snippet.header, G.snippet.values.join('; '), '', ''])
write('google-05-extensoes.csv', csv([['Campaign', 'Ad Group', 'Asset type', 'Text / Header', 'Description line 1 / Values', 'Description line 2', 'Final URL'], ...extRows]))

// ───────────────────────── Meta ─────────────────────────
// 09/09: público ORIGINAL (Advantage+ público DESLIGADO), Instagram apenas, 24–50, duas camadas de
// direcionamento detalhado (profissão E ferramenta 3D/CAD) — ver meta-02-segmentacao.csv. A planilha
// de importação da Meta só aceita interesses/públicos por ID numérico, então a segmentação é feita
// UMA vez na interface (conjunto RENDER) e duplicada para os outros conjuntos.
const META_COMMON = { countries: 'BR', locationTypes: 'home', ageMin: 24, ageMax: 50, locales: 'pt_BR', platforms: 'instagram', fbPositions: '', igPositions: 'stream, story, reels', advantageAudience: 'No', bid: 'Highest volume' }
const M = {
  campaign: 'SN_META_PROSPECCAO_ARQUITETO', objective: 'OUTCOME_TRAFFIC', limit: 1000, start: '2026-09-14 09:00', end: '2026-10-13 23:59',
  optimization: 'LANDING_PAGE_VIEWS',
  adsets: {
    RENDER: { budget: 16, lp: '/lp/print-do-sketchup', ads: [
      { id: 'DRONE_COPY01', video: 'marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar-ad/2026-09-04-reel-drone-nada-sai-do-lugar-ad.mp4', copy: 'COPY01' },
      { id: 'PISCAFACHADA_COPY01', video: 'marketing/output/2026-09-04-reel-pisca-fachada-geminada-ad/2026-09-04-reel-pisca-fachada-geminada-ad.mp4', copy: 'COPY01' },
      { id: 'DUASREUNIOES_COPY02', video: 'marketing/output/2026-09-04-reel-entre-duas-reunioes-ad/2026-09-04-reel-entre-duas-reunioes-ad.mp4', copy: 'COPY02' },
    ] },
    PLUGIN: { budget: 16, lp: '/sketchup', ads: [
      { id: 'PLUGINRENDER_COPY03', video: 'marketing/output/2026-09-07-reel-plugin-render-real/2026-09-07-reel-plugin-render-real.mp4', copy: 'COPY03' },
      { id: 'PLUGINNOSU_COPY03', video: 'marketing/output/2026-09-07-reel-plugin-no-sketchup/2026-09-07-reel-plugin-no-sketchup.mp4', copy: 'COPY03' },
      { id: 'TRESCENAS_COPY04', video: 'marketing/output/2026-09-05-reel-plugin-tres-cenas-um-clique/2026-09-05-reel-plugin-tres-cenas-um-clique.mp4', copy: 'COPY04' },
    ] },
  },
  copy: {
    COPY01: { body: 'Você modela no SketchUp? O print do modelo vira render fotorrealista, sem nada sair do lugar. Feito por arquiteto.\nPlanos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão.', title: 'Render fiel ao seu SketchUp', desc: '80 nodes grátis · sem cartão' },
    COPY02: { body: 'Para arquitetos: reunião de manhã com o print do SketchUp, reunião da tarde com a imagem. Render em minutos, no navegador.\nPlanos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão.', title: 'Do print à imagem, em minutos', desc: '80 nodes grátis · sem cartão' },
    COPY03: { body: 'Renderize sem sair do SketchUp: o plugin captura a cena, a lente e o sol do seu modelo e devolve a imagem em minutos.\nPlugin grátis. Cadastro com 80 nodes, sem cartão.', title: 'Render dentro do SketchUp', desc: 'Plugin grátis · SketchUp 2021+' },
    COPY04: { body: 'Três cenas do SketchUp, um clique, três renders com o mesmo preset. O plugin renderiza em lote, dentro do seu modelo.\nPlugin grátis. Cadastro com 80 nodes, sem cartão.', title: 'Cenas em lote, dentro do SketchUp', desc: 'Plugin grátis · SketchUp 2021+' },
  },
}
// Campanha 2 — seguidores QUALIFICADOS: Engajamento → local de conversão Instagram → "maximizar visitas ao
// perfil". Público = quem já assistiu ≥ 50% dos nossos vídeos ou interagiu com o @spacenode.app (365 d) E interesse
// de profissão (camada 1). Sem Advantage+. Se a importação recusar o objetivo, criar na interface (3 min).
const S = {
  campaign: 'SN_META_SEGUIDORES_ARQUITETO', objective: 'OUTCOME_ENGAGEMENT', limit: 250, start: M.start, end: M.end,
  optimization: 'VISIT_INSTAGRAM_PROFILE',
  adsets: { QUENTE: { budget: 8, ads: [
    { id: 'DRONE_COPY05', video: 'marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar-ad/2026-09-04-reel-drone-nada-sai-do-lugar-ad.mp4', copy: 'COPY05' },
    { id: 'PLUGINNOSU_COPY05', video: 'marketing/output/2026-09-07-reel-plugin-no-sketchup/2026-09-07-reel-plugin-no-sketchup.mp4', copy: 'COPY05' },
  ] } },
  copy: { COPY05: { body: 'Render com IA para quem projeta no SketchUp: fidelidade ao modelo, bastidores do plugin, um Reel por semana.\nFeito por arquiteto, em português.', title: 'Render fiel ao SketchUp, toda semana', desc: '@spacenode.app' } },
}
const metaRows = []
const head = ['Campaign Name', 'Campaign Status', 'Campaign Objective', 'Buying Type', 'Campaign Spend Limit', 'Ad Set Name', 'Ad Set Run Status', 'Ad Set Daily Budget', 'Ad Set Time Start', 'Ad Set Time Stop', 'Countries', 'Location Types', 'Age Min', 'Age Max', 'Locales', 'Optimization Goal', 'Billing Event', 'Bid Strategy', 'Publisher Platforms', 'Facebook Positions', 'Instagram Positions', 'Advantage Audience', 'Ad Name', 'Ad Status', 'Title', 'Body', 'Link Description', 'Call to Action', 'Link', 'Display Link', 'Video File Name', 'URL Tags']
const C = META_COMMON
for (const [k, s] of Object.entries(M.adsets)) for (const a of s.ads) {
  const c = M.copy[a.copy]
  chk(`Meta ${a.id} body line1`, c.body.split('\n')[0], 125); chk(`Meta ${a.id} title`, c.title, 40); chk(`Meta ${a.id} desc`, c.desc, 30)
  const adName = `${M.campaign}_${k}_${a.id}`
  metaRows.push([M.campaign, 'PAUSED', M.objective, 'AUCTION', M.limit, `${M.campaign}_${k}`, 'PAUSED', s.budget, M.start, M.end, C.countries, C.locationTypes, C.ageMin, C.ageMax, C.locales, M.optimization, 'IMPRESSIONS', C.bid, C.platforms, C.fbPositions, C.igPositions, C.advantageAudience, adName, 'PAUSED', c.title, c.body, c.desc, 'SIGN_UP', `${BASE}${s.lp}`, 'spacenode.app', path.basename(a.video), utm('meta', 'paid_social', M.campaign.toLowerCase(), adName.toLowerCase())])
}
for (const [k, s] of Object.entries(S.adsets)) for (const a of s.ads) {
  const c = S.copy[a.copy]
  chk(`Meta ${a.id} body line1`, c.body.split('\n')[0], 125); chk(`Meta ${a.id} title`, c.title, 40); chk(`Meta ${a.id} desc`, c.desc, 30)
  const adName = `${S.campaign}_${k}_${a.id}`
  metaRows.push([S.campaign, 'PAUSED', S.objective, 'AUCTION', S.limit, `${S.campaign}_${k}`, 'PAUSED', s.budget, S.start, S.end, C.countries, C.locationTypes, 22, 55, C.locales, S.optimization, 'IMPRESSIONS', C.bid, C.platforms, C.fbPositions, C.igPositions, C.advantageAudience, adName, 'PAUSED', c.title, c.body, c.desc, 'VISIT_INSTAGRAM_PROFILE', 'https://www.instagram.com/spacenode.app/', 'instagram.com/spacenode.app', path.basename(a.video), ''])
}
write('meta-01-bulk-import.csv', csv([head, ...metaRows]))

// Checklist de segmentação (feito na interface; a planilha não carrega interesses por nome)
const seg = [['conjunto', 'camada', 'onde no Gerenciador', 'item (buscar exatamente assim)', 'regra', 'observação']]
const layer1 = ['Arquitetura', 'Design de interiores', 'Arquitetura e Construção', 'Estilo arquitetônico', 'Arquitetura de interiores', 'Paisagismo', 'Urbanismo']
const layer2 = ['Desenho assistido por computador', '3ds Max', 'AutoCAD', 'Autodesk', 'Rhinoceros 3D', 'Archicad', 'Modelagem 3D', 'Computação gráfica 3D', 'Renderização 3D', 'Building information modeling']
const edu = ['Arquitetura e urbanismo', 'Arquitetura', 'Design de interiores', 'Engenharia civil']
const jobs = ['Arquiteto', 'Arquiteta', 'Designer de interiores', 'Projetista']
for (const set of ['SN_META_PROSPECCAO_ARQUITETO_RENDER', 'SN_META_PROSPECCAO_ARQUITETO_PLUGIN']) {
  seg.push([set, '0 · base', 'Público → Mudar para opções de público original', 'Advantage+ público DESLIGADO', 'obrigatório', 'Sem isso, interesses viram só sugestão'])
  seg.push([set, '0 · base', 'Locais', 'Brasil — "Pessoas que moram neste local"', 'obrigatório', 'Não usar "presença ou interesse"'])
  seg.push([set, '0 · base', 'Idade / Idiomas', '24–50 / Português (Brasil)', 'obrigatório', ''])
  for (const i of layer1) seg.push([set, '1 · profissão (OU)', 'Direcionamento detalhado → Interesses', i, 'incluir se existir', 'Camada 1 = qualquer um destes'])
  for (const i of edu) seg.push([set, '1 · profissão (OU)', 'Direcionamento detalhado → Dados demográficos → Educação → Áreas de estudo', i, 'incluir se existir', 'Mesma camada 1'])
  for (const i of jobs) seg.push([set, '1 · profissão (OU)', 'Direcionamento detalhado → Dados demográficos → Trabalho → Cargos', i, 'incluir se existir', 'Cargos foram muito podados; anotar se não existir'])
  for (const i of layer2) seg.push([set, '2 · ferramenta (E)', 'Direcionamento detalhado → "Restringir público" → Interesses', i, 'incluir se existir', 'Camada 2 = restringe a camada 1 (quem usa software 3D/CAD)'])
  seg.push([set, '2 · ferramenta (E)', 'Direcionamento detalhado', '"Alcançar pessoas além das suas seleções…" (Advantage+ direcionamento detalhado)', 'DESLIGADO', 'Se estiver ligado a camada 2 não filtra'])
  seg.push([set, '3 · tamanho', 'Painel "Tamanho estimado do público"', 'meta: 300 mil – 2 milhões', 'conferir', 'Abaixo de 150 mil: tirar Cargos/Educação da camada 2; acima de 3 milhões: camada 2 ficou solta'])
  seg.push([set, '4 · posicionamentos', 'Posicionamentos → Manuais', 'Só Instagram: Feed, Stories, Reels', 'obrigatório', 'Sem Facebook, Explorar, Threads, Audience Network, Messenger'])
}
const set2 = 'SN_META_SEGUIDORES_ARQUITETO_QUENTE'
seg.push([set2, '0 · base', 'Campanha', 'Objetivo Engajamento → Local de conversão Instagram → Meta de desempenho "Maximizar o número de visitas ao perfil do Instagram"', 'obrigatório', 'Se a meta não aparecer, usar Tráfego → Perfil do Instagram'])
seg.push([set2, '0 · base', 'Público → opções originais', 'Advantage+ público DESLIGADO', 'obrigatório', ''])
seg.push([set2, '0 · base', 'Locais / Idade / Idiomas', 'Brasil (moram) / 22–55 / Português (Brasil)', 'obrigatório', 'Faixa um pouco mais ampla que a de prospecção: seguidor não precisa pagar hoje'])
seg.push([set2, '1 · quente (OU)', 'Públicos personalizados → criar antes em Públicos', 'Instagram — todas as pessoas que interagiram com esta conta profissional, 365 dias', 'obrigatório', 'Fonte Meta, 1ª parte, sem LGPD'])
seg.push([set2, '1 · quente (OU)', 'Públicos personalizados → criar antes em Públicos', 'Vídeo — pessoas que assistiram pelo menos 50% de qualquer vídeo, 365 dias', 'obrigatório', 'Marcar TODOS os Reels/anúncios da conta'])
for (const i of layer1) seg.push([set2, '2 · profissão (E)', 'Direcionamento detalhado → Interesses', i, 'incluir se existir', 'Restringe o quente a quem tem sinal de profissão'])
seg.push([set2, '3 · tamanho', 'Painel "Tamanho estimado"', 'aceitar de 5 mil para cima', 'conferir', 'Se < 5 mil: remover camada 2 e manter só o quente'])
seg.push([set2, '4 · posicionamentos', 'Manuais', 'Só Instagram: Reels, Feed, Stories', 'obrigatório', ''])
seg.push([set2, '5 · leitura', 'Semanal', 'Amostra de 20 seguidores novos: bio com arquitet/design/interiores/CAU/SketchUp', 'meta ≥ 60%', 'Abaixo de 40% em 2 semanas seguidas → pausar campanha'])
write('meta-02-segmentacao.csv', csv(seg))

// ───────────────────────── UTMs / mapa de anúncios ─────────────────────────
const utmRows = [['canal', 'campanha', 'celula', 'anuncio (identificador = nome no gerenciador)', 'destino', 'url_final']]
for (const [k, g] of Object.entries(G.groups)) utmRows.push(['google', G.campaign, k, g.ad.toUpperCase(), g.lp, gUrl(g)])
for (const [k, s] of Object.entries(M.adsets)) for (const a of s.ads) { const n = `${M.campaign}_${k}_${a.id}`; utmRows.push(['meta', M.campaign, k, n, s.lp, `${BASE}${s.lp}?${utm('meta', 'paid_social', M.campaign.toLowerCase(), n.toLowerCase())}`]) }
for (const [k, s] of Object.entries(S.adsets)) for (const a of s.ads) utmRows.push(['meta', S.campaign, k, `${S.campaign}_${k}_${a.id}`, 'perfil @spacenode.app', 'https://www.instagram.com/spacenode.app/'])
write('utms-e-destinos.csv', csv(utmRows))

// vídeos existem?
for (const s of [...Object.values(M.adsets), ...Object.values(S.adsets)]) for (const a of s.ads) { const p = path.join(REPO, a.video); if (!fs.existsSync(p)) errors.push(`vídeo ausente: ${a.video}`) }

if (errors.length) { console.error('\nERROS:\n' + errors.join('\n')); process.exit(1) } else console.log('\nvalidação ok: sem estouro de limite; vídeos encontrados')
