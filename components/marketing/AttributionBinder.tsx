'use client'

// Vincula (uma única vez por CONTA) a jornada pré-login ao usuário autenticado:
// POST /api/marketing/track {type:'bind_signup'} — o SERVIDOR lê os cookies
// first-party da requisição (sn_attribution + sn_aid + sn_intent) e grava o
// evento de signup; o browser não envia dado nenhum além do type. O flag em
// localStorage evita repetir a chamada a cada visita (o índice único no banco
// já garante idempotência de qualquer forma).
//
// Roda TAMBÉM sem cookie de atribuição: cadastro sem campanha gera o evento de
// signup do mesmo jeito (sem UTM, origem classificada no servidor) — sem isso
// o funil visita→cadastro só enxergava tráfego de campanha.
//
// Duas correções de confiabilidade (16/09/26), depois de 70 contas ficarem
// fora do funil:
//
//   1. O flag é POR USUÁRIO. Era global do navegador: a segunda conta criada
//      na mesma máquina encontrava o flag do primeiro cadastro e nunca
//      vinculava — buraco silencioso e permanente.
//   2. Só marca como vinculado quando o servidor CONFIRMA a gravação
//      (`bound: true`). Antes bastava o HTTP 200: o rastreamento é
//      best-effort e responde 200 mesmo quando o insert falha, então uma
//      falha momentânea de banco apagava o cadastro do funil para sempre.
//
// Renderiza null; o integrador monta no layout autenticado (/app).

import { useEffect } from 'react'

const BOUND_PREFIX = 'sn_attr_bound'

export default function AttributionBinder({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return
    const flag = `${BOUND_PREFIX}:${userId}`
    try {
      if (window.localStorage.getItem(flag) === '1') return
      void fetch('/api/marketing/track', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bind_signup' }),
      })
        .then(async (res) => {
          if (!res.ok) return
          const data = (await res.json().catch(() => null)) as { bound?: boolean } | null
          // `bound !== true` (erro de escrita, resposta inesperada) = tenta de
          // novo na próxima visita, que é exatamente o que se quer.
          if (data?.bound === true) window.localStorage.setItem(flag, '1')
        })
        .catch(() => {
          // Silencioso: tenta de novo na próxima visita.
        })
    } catch {
      // localStorage/cookies indisponíveis — melhor não vincular do que quebrar.
    }
  }, [userId])

  return null
}
