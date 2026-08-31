// ── Base de conhecimento do Nodi — conteúdo ──────────────────────────────────
//
// UMA entrada por assunto. Regra do produto: nenhuma resposta fixa espalhada
// por componente — dúvida recorrente entra AQUI (e o painel, o FAQ e o
// provedor de IA passam a usá-la). Como escrever/atualizar: docs/NODI.md.
//
// Princípios (herdados do manual da marca):
//   · voz de arquiteto sênior: direto, específico, sem entusiasmo vazio;
//   · números SEMPRE importados da fonte de verdade (lib/plans, lib/engines,
//     lib/video/models, lib/extra-nodes, lib/support) — nunca digitados aqui;
//   · quando o valor não é importável (ex.: nodes de cortesia do cadastro,
//     que é DEFAULT de coluna no banco), a resposta fica qualitativa;
//   · nada de promessa que o produto não cumpre; nada de jargão de IA.
//
// Este módulo roda no SERVIDOR (rotas /api/nodi/*). O painel só recebe os
// títulos (sugestões/FAQ) e pede a resposta por id.

import { PLANS } from '@/lib/plans'
import { EXTRA_NODE_PACKS } from '@/lib/extra-nodes'
import { ENGINES, ENGINE_ORDER } from '@/lib/engines'
import { listAvailableVideoModels } from '@/lib/video/models'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, supportWhatsAppUrl } from '@/lib/support'
import type { NodiAction } from '../types'

export interface KBEntry {
  id: string
  /** Pergunta como aparece no FAQ/sugestão. */
  title: string
  /** Palavras e frases (serão normalizadas) que puxam esta entrada. */
  keywords: string[]
  /** Padrões fortes testados contra a pergunta normalizada (sem acento). */
  patterns?: RegExp[]
  /** moduleIds (lib/nodi/context) onde a entrada ganha boost e vira sugestão. */
  modules?: string[]
  /** Aparece na lista de dúvidas frequentes do painel. */
  faq?: boolean
  /** Candidata a chip de sugestão rápida. */
  suggest?: boolean
  build: () => { text: string; actions?: NodiAction[] }
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`

// Perguntas de propósito sobre uma ferramenta, nas formas reais de perguntar:
// "pra que serve o X", "o que é/faz o X", "como funciona o X", "X serve pra quê".
// (Gap real visto em produção de teste: "pra que serve o finalizar?" não casava.)
const aboutTool = (word: string): RegExp[] => [
  new RegExp(`(pra|para|o) que (serve|e|faz|seria)[a-z ]*${word}`),
  new RegExp(`como (funciona|uso|usar)[a-z ]*${word}`),
  new RegExp(`${word}[a-z ]*(serve|funciona) (pra|para)`),
]

const ACT = {
  planos:    { type: 'navigate', label: 'Ver planos', href: '/app/billing' } as NodiAction,
  historico: { type: 'navigate', label: 'Abrir Histórico', href: '/app/history' } as NodiAction,
  problema:  { type: 'start-problem', label: 'Analisar uma geração' } as NodiAction,
  whatsapp:  { type: 'whatsapp', label: 'Chamar no WhatsApp', href: supportWhatsAppUrl('Olá, vim pelo Nodi e preciso de ajuda.') } as NodiAction,
}

export const KB_ENTRIES: KBEntry[] = [
  // ── Nodes, planos e cobrança ────────────────────────────────────────────────
  {
    id: 'o-que-sao-nodes',
    title: 'O que são nodes e como funciona o consumo?',
    keywords: ['nodes', 'node', 'creditos', 'credito', 'consumo', 'consome', 'custa', 'custo', 'cobranca', 'cobrado', 'debito'],
    patterns: [/o que sao nodes/, /como funciona.*(nodes|consumo)/, /quanto (custa|consome)/],
    faq: true,
    suggest: true,
    build: () => ({
      text:
        'Nodes são a unidade de consumo das gerações — cada ferramenta debita um valor conforme motor, resolução ou duração. ' +
        'O custo exato aparece sempre antes de você confirmar. ' +
        'Se uma geração falha depois do débito, os nodes voltam automaticamente pro saldo. ' +
        'Em equipe, o consumo sai da bolsa do dono do workspace.',
      actions: [ACT.planos],
    }),
  },
  {
    id: 'custo-renderizar',
    title: 'Quanto custa renderizar?',
    keywords: ['renderizar custo', 'render custo', 'custo renderizar', 'quanto custa renderizar', 'nodes render', 'preco render'],
    patterns: [/quanto custa/, /custo.*(render|vega|pulsar|quasar)/],
    modules: ['renderizar', 'spaces'],
    faq: true,
    suggest: true,
    build: () => {
      const rows = ENGINE_ORDER.map(id => {
        const e = ENGINES[id]
        const parts = e.resolutions.map(r => `${r.toUpperCase()} = ${e.nodes[r]} nodes`)
        return `${e.name} (${e.tagline.toLowerCase()}): ${parts.join(' · ')}`
      })
      return {
        text:
          'Custo por imagem, conforme motor e resolução:\n' +
          rows.map(r => `• ${r}`).join('\n') +
          '\nO valor aparece no botão antes de confirmar. Dentro de um projeto (Spaces), a variação de vista usa a mesma tabela.',
      }
    },
  },
  {
    id: 'engines-diferenca',
    title: 'Qual a diferença entre Vega, Pulsar e Quasar?',
    keywords: ['vega', 'pulsar', 'quasar', 'engine', 'motor', 'motores', 'diferenca', 'qual escolher', 'melhor engine'],
    patterns: [/diferen[cs]a entre.*(vega|pulsar|quasar|motor|engine)/, /qual (motor|engine)/],
    modules: ['renderizar', 'spaces'],
    faq: true,
    suggest: true,
    build: () => ({
      text: ENGINE_ORDER
        .map(id => {
          const e = ENGINES[id]
          return `${e.name} — ${e.description}`
        })
        .join('\n') +
        '\nNa dúvida: Vega para entrega final, Pulsar para iterar rápido, Quasar para casos especiais (tipografia, multi-referência).',
    }),
  },
  {
    id: 'resolucao-qual',
    title: 'Qual resolução escolher (HD, 2K ou 4K)?',
    keywords: ['resolucao', 'hd', '2k', '4k', 'qualidade', 'tamanho imagem'],
    patterns: [/qual resolu[cs]ao/, /(2k|4k|hd).*(ou|vs|diferen)/],
    modules: ['renderizar', 'spaces', 'ampliar'],
    build: () => ({
      text:
        '2K resolve a maioria das apresentações e é o padrão. ' +
        '4K é para entrega final ou impressão — custa mais nodes (a tabela de cada motor mostra o valor). ' +
        'Um caminho econômico: iterar em 2K e ampliar a versão aprovada no Ampliar.',
    }),
  },
  {
    id: 'custo-video',
    title: 'Quanto custa animar (vídeo)?',
    keywords: ['video custo', 'animar custo', 'quanto custa video', 'quanto custa animar', 'nodes video'],
    patterns: [/quanto custa/, /custo.*(video|animar)/],
    modules: ['animar'],
    faq: true,
    suggest: true,
    build: () => {
      const models = listAvailableVideoModels()
      const rows = models.map(m => {
        const parts = m.supportedDurations.map(d => `${d}s = ${m.costInNodes[d]} nodes`)
        return `• ${m.label} (${m.tag}): ${parts.join(' · ')}`
      })
      return {
        text:
          'Custo por vídeo, conforme modelo e duração:\n' + rows.join('\n') +
          '\nO valor exato aparece antes de confirmar. Se a geração falhar, os nodes são estornados.',
      }
    },
  },
  {
    id: 'animar-o-que',
    title: 'Para que serve o Animar?',
    keywords: ['animar', 'video', 'animacao', 'movimento', 'apresentacao em video'],
    patterns: [...aboutTool('animar'), ...aboutTool('video')],
    modules: ['animar'],
    faq: true,
    build: () => ({
      text:
        'O Animar transforma uma imagem do seu projeto em vídeo curto de apresentação — movimento de câmera e atmosfera, com a cena preservada. ' +
        'Você parte de um render ou foto, escolhe o tipo de vídeo, o formato e a duração; o custo em nodes aparece antes de confirmar.',
    }),
  },
  {
    id: 'video-modelos',
    title: 'Qual modelo de vídeo escolher?',
    keywords: ['modelo video', 'kling', 'veo', 'cinematico', 'rapido video', 'qual modelo'],
    patterns: [/qual modelo.*(video|animar)/, /(kling|veo).*(ou|vs|diferen)/],
    modules: ['animar'],
    suggest: true,
    build: () => {
      const models = listAvailableVideoModels()
      return {
        text: models
          .map(m => `${m.label} (${m.tag}) — ${m.description} Pontos fortes: ${m.strengths.slice(0, 2).join('; ').toLowerCase()}.`)
          .join('\n') +
          '\nPara apresentação a cliente, o Cinemático costuma valer o custo; para estudo de movimento, o Rápido resolve.',
      }
    },
  },
  {
    id: 'animar-limites',
    title: 'Quais durações e formatos o Animar aceita?',
    keywords: ['duracao video', 'formato video', 'proporcao video', 'segundos', 'vertical', 'horizontal', '9 16', '16 9'],
    patterns: [/(dura[cs]ao|formato|propor[cs]ao).*(video|animar)/],
    modules: ['animar'],
    build: () => {
      const models = listAvailableVideoModels()
      const rows = models.map(m =>
        `• ${m.label}: ${m.supportedDurations.map(d => `${d}s`).join('/')} · formatos ${m.supportedAspectRatios.join(', ')} · ${m.supportedResolutions.join(', ')}`,
      )
      return {
        text:
          rows.join('\n') +
          '\nA proporção da imagem de entrada precisa ficar entre 0.4 e 2.5 — imagens muito panorâmicas ou muito estreitas são recusadas pelo motor.',
      }
    },
  },
  {
    id: 'planos-precos',
    title: 'Quais são os planos e quantos nodes incluem?',
    keywords: ['planos', 'plano', 'preco', 'precos', 'assinatura', 'mensalidade', 'starter', 'pro', 'studio', 'office', 'upgrade'],
    patterns: [/quais.*planos/, /pre[cs]o.*(plano|assinatura)/, /quanto custa.*(plano|assinatura|spacenode)/],
    modules: ['planos'],
    faq: true,
    build: () => ({
      text:
        PLANS.map(p =>
          `• ${p.name}: ${p.nodes.toLocaleString('pt-BR')} nodes/mês — ${brl(p.monthlyPrice)}/mês (ou ${brl(p.annualMonthlyPrice)}/mês no anual)`,
        ).join('\n') +
        '\nO cadastro concede nodes de cortesia para testar com um projeto real. Upgrade e downgrade ficam em Planos.',
      actions: [ACT.planos],
    }),
  },
  {
    id: 'nodes-extras',
    title: 'O que são Nodes extras?',
    // "lumens" fica nos keywords: é o nome antigo e usuários veteranos ainda
    // perguntam por ele — a resposta já corrige a nomenclatura.
    keywords: ['nodes extras', 'extras', 'avulso', 'recarga', 'creditos extras', 'acabaram os nodes', 'lumens', 'lumen'],
    patterns: [/o que sao (nodes extras|lumens)/, /(comprar|recarregar).*(nodes|lumens|creditos)/, /nodes acabaram/],
    modules: ['planos'],
    faq: true,
    build: () => ({
      text:
        'Nodes extras são pacotes avulsos de nodes para quando o mês aperta — sem validade ' +
        '(antes se chamavam "Lumens"):\n' +
        EXTRA_NODE_PACKS.map(p => `• ${p.name}: ${p.nodes.toLocaleString('pt-BR')} nodes — ${brl(p.price)}`).join('\n') +
        '\nDisponíveis a partir do plano Pro. O consumo usa primeiro os Nodes mensais do plano; os extras entram depois, na ordem de compra.',
      actions: [ACT.planos],
    }),
  },
  {
    id: 'saldo-onde',
    title: 'Onde vejo meu saldo de nodes?',
    keywords: ['saldo', 'quantos nodes', 'meu saldo', 'nodes restantes', 'quanto tenho'],
    patterns: [/onde.*(saldo|nodes)/, /quantos nodes.*(tenho|restam)/],
    build: () => ({
      text:
        'O anel em volta do seu avatar, na barra lateral, mostra o consumo do ciclo — passe o mouse para o detalhe. ' +
        'O saldo completo (mensais + extras) fica em Planos. Em equipe, o saldo exibido é a bolsa do dono do workspace.',
      actions: [ACT.planos],
    }),
  },

  // ── Ferramentas ─────────────────────────────────────────────────────────────
  {
    id: 'spaces-dna',
    title: 'O que é um projeto (Space) e o DNA visual?',
    keywords: ['space', 'spaces', 'projeto', 'dna', 'vista mestre', 'vistas', 'coerencia', 'mesmo ambiente'],
    patterns: [...aboutTool('spaces?'), /o que (e|sao).*(space|dna|vista mestre)/, /coeren(cia|te).*(vista|imagem)/],
    modules: ['spaces'],
    faq: true,
    suggest: true,
    build: () => ({
      text:
        'Um projeto (Space) reúne as vistas de um mesmo espaço. ' +
        'A Vista Mestre define o DNA visual — materiais, luz, atmosfera — e as demais vistas herdam esse DNA, mantendo as imagens coerentes entre si. ' +
        'Cada vista pode ter o próprio DNA e você escolhe a referência na hora de gerar; a Vista Mestre pode ser trocada com histórico preservado.',
    }),
  },
  {
    id: 'editar-como',
    title: 'Como funciona o Editar?',
    keywords: ['editar', 'edicao', 'retocar', 'trocar material', 'remover objeto', 'ajuste pontual', 'mascara', 'selecao'],
    patterns: [...aboutTool('editar'), /como (funciona|uso).*edi[cs]ao/, /(trocar|remover|mudar).*(material|objeto|moveis)/],
    modules: ['editar', 'spaces'],
    faq: true,
    suggest: true,
    build: () => ({
      text:
        'O Editar faz alteração localizada sem regenerar o resto: selecione a área, descreva a mudança e o restante da imagem é preservado. ' +
        'Há um controle de qualidade automático — se o resultado não muda a área pedida ou altera o que não devia, a edição é descartada e você não é cobrado. ' +
        'O custo aparece antes de confirmar e varia conforme o tipo de correção.',
    }),
  },
  {
    id: 'custo-editar',
    title: 'Quanto custa uma edição?',
    keywords: ['custo editar', 'editar custo', 'quanto custa editar', 'nodes edicao'],
    patterns: [/quanto custa/, /custo.*(editar|edi[cs]ao|retoque)/],
    modules: ['editar'],
    build: () => ({
      text:
        'O custo depende do tipo de correção e da resolução — o valor exato aparece no botão antes de confirmar. ' +
        'Edições descartadas pelo controle de qualidade não são cobradas.',
    }),
  },
  {
    id: 'ampliar-o-que',
    title: 'Para que serve o Ampliar?',
    keywords: ['ampliar', 'upscale', 'aumentar resolucao', 'nitidez', 'melhorar imagem', 'restaurar'],
    patterns: aboutTool('ampliar'),
    modules: ['ampliar'],
    faq: true,
    suggest: true,
    build: () => ({
      text:
        'O Ampliar aumenta a resolução e a nitidez de uma imagem pronta — o caminho econômico é iterar em 2K e ampliar só a versão aprovada. ' +
        'Há modos para restauração, nitidez e fidelidade, com escala de 2×, 4× ou 8×; o custo aparece antes de confirmar.',
    }),
  },
  {
    id: 'custo-ampliar',
    title: 'Quanto custa ampliar uma imagem?',
    keywords: ['ampliar custo', 'upscale custo', 'quanto custa ampliar', 'melhorar resolucao'],
    patterns: [/quanto custa/, /custo.*(ampliar|upscale)/],
    modules: ['ampliar'],
    build: () => ({
      text:
        'Depende do modo (restauração, nitidez, fidelidade…), da escala (2×, 4× ou 8×) e do tamanho da imagem de entrada. ' +
        'O cálculo exato aparece no botão antes de confirmar — sem surpresa no débito.',
    }),
  },
  {
    id: 'finalizar-o-que',
    title: 'O que faço no Finalizar?',
    keywords: ['finalizar', 'pos producao', 'acabamento', 'exportar', 'ajuste de cor', 'comparacao'],
    patterns: [...aboutTool('finalizar'), /pos.?produ[cs]ao/],
    modules: ['finalizar'],
    suggest: true,
    build: () => ({
      text:
        'O Finalizar é a pós-produção da entrega: ajustes de cor e luz não destrutivos, correções rápidas, máscaras, comparação antes/depois e exportação com presets — inclusive em lote. ' +
        'Nada altera o arquivo original; cada ajuste pode ser revisto ou copiado entre imagens.',
    }),
  },
  {
    id: 'planta-humanizada',
    title: 'O que a Planta humanizada faz?',
    keywords: ['planta humanizada', 'planta', 'humanizada', 'planta baixa', 'apresentar planta'],
    patterns: [...aboutTool('planta'), /planta (humanizada|baixa)/],
    modules: ['planta_humanizada'],
    suggest: true,
    build: () => ({
      text:
        'Ela veste a planta técnica com materiais, mobiliário e sombras reais — o cliente leigo passa a ler o espaço sem esforço. ' +
        'Envie a planta (imagem ou print do modelo) e escolha o estilo; a geometria e a setorização do desenho são preservadas.',
    }),
  },
  {
    id: 'renderizar-como',
    title: 'Como renderizo a partir do meu modelo?',
    keywords: ['como renderizar', 'primeiro render', 'sketchup', 'revit', 'print', 'comecar', 'upload modelo'],
    patterns: [...aboutTool('renderizar'), /como (renderizo|renderizar|come[cs]o|gero)/, /(sketchup|revit|3d).*(importa|plugin|integra)/],
    modules: ['renderizar', 'dashboard'],
    faq: true,
    build: () => ({
      text:
        'O insumo é uma imagem: exporte um print do seu modelo (SketchUp, Revit, o que você usa) e envie no Renderizar — não há plugin ou importação direta de arquivo 3D. ' +
        'O motor preserva geometria, perspectiva e proporções do seu projeto; você controla estilo e materiais pela direção criativa. ' +
        'Para várias vistas do mesmo ambiente com coerência, crie um projeto em Spaces.',
    }),
  },

  {
    id: 'ferramentas-overview',
    title: 'Quais ferramentas a SpaceNode oferece?',
    keywords: ['ferramentas', 'modulos', 'recursos', 'o que da pra fazer', 'o que posso fazer', 'visao geral'],
    patterns: [/quais.*(ferramentas|modulos|recursos)/, /o que (da|consigo|posso).*(fazer|criar)/, /(pra|para) que serve a spacenode/],
    faq: true,
    build: () => ({
      text:
        'O atelier hoje: ' +
        'Renderizar (do print do modelo à imagem fotorrealista, preservando geometria e perspectiva) · ' +
        'Spaces (várias vistas do mesmo ambiente com um único DNA visual) · ' +
        'Editar (alteração localizada sem regenerar o resto) · ' +
        'Ampliar (mais resolução e nitidez na imagem aprovada) · ' +
        'Animar (vídeo de apresentação a partir da imagem) · ' +
        'Finalizar (pós-produção e exportação) · ' +
        'Planta humanizada (a planta técnica vestida para o cliente). ' +
        'Tudo fica guardado no Histórico.',
      actions: [{ type: 'navigate', label: 'Ir ao Dashboard', href: '/app' }],
    }),
  },

  // ── Histórico e gerações ────────────────────────────────────────────────────
  {
    id: 'historico-onde',
    title: 'Onde encontro minhas gerações?',
    keywords: ['historico', 'minhas imagens', 'minhas geracoes', 'onde esta', 'sumiu', 'encontrar', 'baixar de novo'],
    patterns: [/onde.*(historico|gera[cs](ao|oes)|imagens|videos)/, /(sumiu|perdi|nao (acho|encontro))/],
    modules: ['historico'],
    faq: true,
    suggest: true,
    build: () => ({
      text:
        'Tudo o que você gera fica no Histórico, na barra lateral — renders, vídeos, ampliações, edições e vistas, com filtros por tipo. ' +
        'Cada item abre os detalhes da geração (motor, resolução, nodes, status). As gerações de um projeto também aparecem dentro do próprio Space.',
      actions: [ACT.historico],
    }),
  },
  {
    id: 'geracao-falhou',
    title: 'Uma geração falhou. O que acontece com os nodes?',
    keywords: ['falhou', 'erro', 'falha', 'estorno', 'reembolso', 'devolvido', 'perdeu nodes', 'cobrou errado'],
    patterns: [/(falhou|deu erro|nao saiu)/, /(estorno|reembolso|devolv)/],
    faq: true,
    build: () => ({
      text:
        'Quando uma geração falha depois do débito, os nodes voltam automaticamente pro saldo — no Histórico o item aparece como reembolsado. ' +
        'Se você viu um débito sem estorno numa geração que falhou, me chame pelo fluxo de problema que eu analiso os dados e, se for o caso, preparo um chamado.',
      actions: [ACT.problema],
    }),
  },
  {
    id: 'geracao-demora',
    title: 'Minha geração está demorando. É normal?',
    keywords: ['demorando', 'demora', 'travou', 'processando', 'carregando', 'nao termina', 'tempo'],
    patterns: [/(demora|demorando|travou|preso|nao termina)/],
    build: () => ({
      text:
        'Renders levam de segundos a ~2 minutos, conforme o motor e a resolução. Vídeos levam mais: o Cinemático fica na casa de 2 a 4 minutos. ' +
        'O status fica registrado no Histórico. Se passou muito disso, posso consultar o status da geração agora.',
      actions: [ACT.problema, ACT.historico],
    }),
  },

  // ── Conta, equipe e plataforma ──────────────────────────────────────────────
  {
    id: 'equipe-como',
    title: 'Como funciona a Equipe (workspace)?',
    keywords: ['equipe', 'workspace', 'convidar', 'convite', 'membro', 'colaborador', 'time'],
    patterns: [/como (funciona|uso).*(equipe|workspace|time)/, /convidar.*(membro|colega|equipe)/],
    modules: ['equipe'],
    build: () => ({
      text:
        'Em Equipe você convida colegas por e-mail; todos trabalham nos projetos do workspace e o consumo sai da bolsa de nodes do dono. ' +
        'Cada membro vê o saldo da bolsa na própria sidebar. Convites pendentes ficam na mesma tela.',
      actions: [{ type: 'navigate', label: 'Abrir Equipe', href: '/app/equipe' }],
    }),
  },
  {
    id: 'tema-claro-escuro',
    title: 'Como troco entre tema claro e escuro?',
    keywords: ['tema', 'claro', 'escuro', 'dark', 'light', 'aparencia', 'modo'],
    patterns: [/tema (claro|escuro)/, /(mudar|trocar).*(tema|aparencia|modo)/],
    modules: ['conta'],
    build: () => ({
      text:
        'O seletor de aparência fica na barra lateral (expanda com o mouse) e também em Conta — claro, escuro ou seguir o sistema. ' +
        'A preferência acompanha você entre dispositivos.',
      actions: [{ type: 'navigate', label: 'Abrir Conta', href: '/app/conta' }],
    }),
  },
  {
    id: 'tour-refazer',
    title: 'Como revejo o tour de boas-vindas?',
    keywords: ['tour', 'boas vindas', 'onboarding', 'como usar', 'guia', 'apresentacao da plataforma'],
    patterns: [/(rever|refazer|reabrir).*(tour|guia|onboarding)/, /como usar a (plataforma|spacenode)/],
    modules: ['dashboard'],
    build: () => ({
      text: 'Clique em "Como usar", no fim da barra lateral — o tour reabre no Dashboard, no ponto de partida.',
      actions: [{ type: 'navigate', label: 'Ir ao Dashboard', href: '/app' }],
    }),
  },
  {
    id: 'privacidade-projetos',
    title: 'Meus projetos ficam privados?',
    keywords: ['privacidade', 'privado', 'seguranca', 'quem ve', 'meus dados', 'lgpd'],
    patterns: [/(privad|seguran[cs]a|lgpd)/, /quem (ve|acessa).*(projeto|imagem)/],
    build: () => ({
      text:
        'Sim. Seus projetos e gerações são visíveis só para você — e para o seu workspace, quando você participa de uma equipe. ' +
        'Os detalhes de tratamento de dados estão na Política de Privacidade.',
      actions: [{ type: 'link', label: 'Ler a Política de Privacidade', href: '/privacidade' }],
    }),
  },
  {
    id: 'suporte-contato',
    title: 'Como falo com o suporte?',
    keywords: ['suporte', 'contato', 'ajuda humana', 'whatsapp', 'email', 'falar com alguem', 'atendimento'],
    patterns: [/(falar|contato).*(suporte|humano|atendimento|voces)/, /whatsapp/],
    faq: true,
    build: () => ({
      text:
        `O canal direto é o WhatsApp ${SUPPORT_PHONE_DISPLAY} — ou o e-mail ${SUPPORT_EMAIL}. ` +
        'Se o assunto for uma geração específica, posso antes reunir os dados técnicos e preparar um chamado completo — o suporte resolve mais rápido com o contexto pronto.',
      actions: [ACT.whatsapp, { type: 'copy', label: 'Copiar e-mail', payload: SUPPORT_EMAIL }, ACT.problema],
    }),
  },
]
