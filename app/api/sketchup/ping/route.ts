// GET /api/sketchup/ping
//
// Sonda de conectividade do plugin — sem auth, sem banco, sem efeito.
// Existe porque o painel mostrava a MESMA frase ("verifique sua internet")
// para dois problemas opostos: o SketchUp não sai da máquina (antivírus com
// inspeção de HTTPS, firewall, proxy) × o SketchUp sai mas não chega aqui
// (DNS, bloqueio do domínio, servidor fora do ar). O "Testar conexão" bate
// aqui e numa URL neutra: o par de respostas diz de que lado está o bloqueio.
//
// Não usa /api/sketchup/pair/start como sonda de propósito: aquela rota cria
// um dispositivo pendente no banco e tem limite de 10 por IP a cada 10 min —
// diagnosticar não pode gastar a cota de quem já está tentando conectar.
//
// Retorna: { ok, now, plugin }

import { NextResponse } from 'next/server'
import { PLUGIN_VERSION } from '@/lib/sketchup/plugin-release'

// Zero cache: uma resposta guardada na borda diria "online" com o servidor
// fora do ar — exatamente o que a sonda precisa detectar.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { ok: true, now: new Date().toISOString(), plugin: PLUGIN_VERSION },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
