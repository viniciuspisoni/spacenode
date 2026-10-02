import {buildKbAnswer,matchKb,KB_STRONG_SCORE} from '@/lib/nodi/knowledge'
import {whatsappAuthorized,privateReply} from '@/lib/whatsapp/private'
export const dynamic='force-dynamic'
// Answers are authored product knowledge, never generated from customer instructions.
export async function POST(request:Request) {
  if(!whatsappAuthorized(request)) return privateReply({error:'Unauthorized'},401)
  try {
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return privateReply({error:'Invalid'},400)
    const raw=await request.text()
    if(raw.length>1600) return privateReply({error:'Invalid'},400)
    const {question,context}=JSON.parse(raw)
    if(typeof question!=='string' || question.length>600 || !question.trim()) return privateReply({error:'Invalid'},400)
    const matches=matchKb(question,context==='renderizar'?'renderizar':null,2)
    const top=matches[0]
    // Generic cost patterns occur on several tools: do not guess between ties.
    if(!top || top.score<KB_STRONG_SCORE || (matches[1] && top.score-matches[1].score<2)) return privateReply({matched:false})
    const answer=buildKbAnswer(top.entry)
    const links=answer.actions.filter(a=>a.type==='navigate' && typeof a.href==='string' && a.href.startsWith('/app')).map(a=>'https://spacenode.app'+a.href)
    return privateReply({matched:true,topic:answer.id,text:[answer.text,...links].join('\n').slice(0,3500)})
  } catch {return privateReply({error:'Unavailable'},503)}
}
