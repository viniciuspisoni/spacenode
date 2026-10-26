import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { EditV4Request } from '../types'
import { digest, EconomicEditError } from './contracts'
import { ECONOMIC_NODES, economicPaidCallsEnabled } from './policy'
import { runEconomicEdit } from './runner'
import type { CostEntry } from './ledger'
import { parseSupabaseStoragePath } from '@/lib/storage/cleanup'
export interface EconomicDependencies {
  admin:()=>SupabaseClient
  run:typeof runEconomicEdit
  upload:(db:SupabaseClient,userId:string,buffer:Buffer)=>Promise<string>
}
export async function handleEconomicEdit(input:{userId:string;request:EditV4Request;clientRequestId:string|null;selectionConfirmed:boolean;charge:boolean},deps:EconomicDependencies){
  if(!input.request.maskUrl||!input.selectionConfirmed||!input.request.instruction.trim())return NextResponse.json({error:'Marque a área, confira a seleção e descreva a alteração.',charge:{debited:false}},{status:400})
  if(!input.clientRequestId)return NextResponse.json({error:'Identificação do pedido ausente. Atualize a página e tente novamente.',charge:{debited:false}},{status:400})
  if(!economicPaidCallsEnabled())return NextResponse.json({error:'Este motor está em preparação. Os testes pagos continuam suspensos.',nodes_cost:ECONOMIC_NODES,charge:{debited:false}},{status:503})
  // Internal pilot accepts the authenticated owner's immutable uploads only.
  // Shared workspaces/CDN imports need an explicit ownership resolver before expanding scope.
  for (const url of [input.request.sourceImageUrl,input.request.maskUrl!,...input.request.references.map(r=>r.url)]) {
    const asset=parseSupabaseStoragePath(url)
    if(!asset || !asset.key.startsWith(`${input.userId}/`) || asset.key.split('/').some(x=>x==='..'||x==='.'||x==='')) {
      return NextResponse.json({error:'Envie uma imagem e seleção da sua conta para este teste.',charge:{debited:false}},{status:400})
    }
  }
  let jobId:string|null=null;let ledger:CostEntry[]=[];let db:SupabaseClient|null=null
  try{
    db=deps.admin()
    const {data:claim,error:claimError}=await db.rpc('begin_edit_v4_economic',{user_id_input:input.userId,client_request_id_input:input.clientRequestId,request_hash_input:digest(JSON.stringify(input.request)),request_input:input.request})
    if(claimError||!claim?.job_id)throw new EconomicEditError('claim_unavailable','Não foi possível reservar este pedido. Nenhuma edição foi iniciada.',claimError?.code==='22023'?409:503)
    if(claim.state==='completed'&&typeof claim.result_url==='string')return NextResponse.json({rejected:false,replayed:true,result_url:claim.result_url,nodes_cost:claim.nodes_cost,job_id:claim.job_id,charge:{simulated:!input.charge,debited:false}})
    if(claim.state!=='claimed')return NextResponse.json({error:claim.state==='processing'?'Este pedido ainda está em andamento. Aguarde antes de tentar novamente.':'Este pedido já foi encerrado. Confira o histórico antes de criar outra edição.',in_progress:claim.state==='processing',terminal:claim.state!=='processing',job_id:claim.job_id,charge:{debited:false}},{status:409})
    jobId=claim.job_id
    const result=await deps.run({request:input.request,checkpoint:async entries=>{
      ledger=entries
      const {data,error}=await db!.from('edit_v4_economic_requests').update({ledger:entries}).eq('job_id',jobId).eq('user_id',input.userId).eq('status','processing').select('job_id').single()
      if(error||!data)throw new EconomicEditError('cost_persistence_unavailable','O registro de custo está indisponível. Nenhum node foi consumido.',503)
    }})
    const url=await deps.upload(db,input.userId,result.buffer)
    const {data:finished,error}=await db.rpc('finish_edit_v4_economic',{user_id_input:input.userId,job_id_input:jobId,status_input:'completed',result_url_input:url,ledger_input:result.ledger,
      proof_input:{approved:true,...result.binding,candidateHash:result.candidateHash,engine:result.engine,verdict:result.verdict,metrics:result.metrics,accountedUsd:result.accountedUsd},model_input:result.model,charge_input:input.charge})
    if(error||finished?.state!=='completed'){
      const rolledBack = error?.code === 'P0001' || error?.code === '22023'
      if (rolledBack) {
        // PostgreSQL confirmed a rollback. Close the attempt, retaining its provider costs.
        try { await db.rpc('finish_edit_v4_economic', { user_id_input:input.userId,job_id_input:jobId,status_input:'failed',result_url_input:null,ledger_input:result.ledger,proof_input:{approved:false,reason:'completion_rolled_back'},model_input:result.model,charge_input:false }) } catch { /* No debit occurred; keep the durable reservation. */ }
      }
      // An uncertain response may have committed. Never mark that completion failed or debit again.
      return NextResponse.json({error:error?.code==='P0001'?'Saldo insuficiente. Nenhum node foi consumido.':'Não foi possível confirmar a conclusão. Repita o mesmo pedido para consultar o resultado.',job_id:jobId,terminal:rolledBack,completion_pending:!rolledBack}, {status:error?.code==='P0001'?402:503})
    }
    return NextResponse.json({rejected:false,result_url:finished.result_url,nodes_cost:ECONOMIC_NODES,job_id:jobId,charge:{simulated:!input.charge,debited:finished.charged===true},output:result.output})
  }catch(err){
    if(db&&jobId){
      // If this update cannot commit, the already-durable request remains processing; never regenerate it automatically.
      try { await db.rpc('finish_edit_v4_economic',{user_id_input:input.userId,job_id_input:jobId,status_input:err instanceof EconomicEditError&&err.status===422?'rejected':'failed',result_url_input:null,ledger_input:ledger,
        proof_input:{approved:false,reason:err instanceof EconomicEditError?err.code:'technical_failure'},model_input:null,charge_input:false}) } catch { /* Durable processing state blocks duplicate generation. */ }
    }
    const status=err instanceof EconomicEditError?err.status:503
    return NextResponse.json({error:err instanceof EconomicEditError?err.message:'Não foi possível concluir a edição. Nenhum node foi consumido.',rejected:status===422,terminal:true,reasons:[err instanceof EconomicEditError?err.message:'Não foi possível concluir a edição.'],job_id:jobId,nodes_cost:ECONOMIC_NODES,charge:{debited:false}},{status})
  }
}
