import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import sharp from 'sharp'
import { callFlash,callVision,FLASH_MODEL,PLAN_SCHEMA } from '@/lib/edit-v4/economic/providers'
beforeEach(()=>{
 vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','0');vi.stubEnv('ARK_API_KEY','test');vi.stubEnv('OPENAI_API_KEY','test')
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('OFFLINE_NO_FETCH')}))
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('provider HTTP contracts: all responses simulated',()=>{
 it('hard-stops both provider adapters while paid calls are disabled',async()=>{
  await expect(callFlash({image:Buffer.alloc(0),prompt:'x',references:[]})).rejects.toMatchObject({code:'paid_calls_disabled'})
  await expect(callVision({system:'x',payload:{},images:[],schema:PLAN_SCHEMA,name:'plan'})).rejects.toMatchObject({code:'paid_calls_disabled'})
  expect(fetch).not.toHaveBeenCalled()
 })
 it('sends one Flash request with the exact model, clean PNG and 1K tariff, never Pro/fal',async()=>{
  vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','1')
  const http=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'YWJj'}]}),{headers:{'x-request-id':'flash1'}}))
  const result=await callFlash({image:Buffer.from('source'),prompt:'change',references:[]},http)
  expect(http).toHaveBeenCalledTimes(1);const req=JSON.parse(http.mock.calls[0][1]!.body as string)
  expect(req).toMatchObject({model:FLASH_MODEL,size:'1K',output_format:'png',response_format:'b64_json'})
  expect(result.usd).toBe(.018);expect(result.requestId).toBe('flash1');expect(result.value.toString()).toBe('abc')
 })
 it('does not retry a failed Flash call',async()=>{
  vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','1');const http=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:503}))
  await expect(callFlash({image:Buffer.from('x'),prompt:'x',references:[]},http)).rejects.toThrow();expect(http).toHaveBeenCalledTimes(1)
 })
 it('uses strict image + JSON Responses input, disables storage and prices full token usage',async()=>{
  vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','1');const image=await sharp({create:{width:20,height:20,channels:3,background:'#888'}}).png().toBuffer()
  const http=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:'r1',status:'completed',usage:{input_tokens:2000,output_tokens:500},output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]})))
  const result=await callVision({system:'read',payload:{requestVerbatim:'paint'},images:[image],schema:PLAN_SCHEMA,name:'plan'},http)
  expect(result.usd).toBeCloseTo(.00045,12);expect(result.value).toEqual({ok:true})
  const body=JSON.parse(http.mock.calls[0][1]!.body as string)
  expect(body).toMatchObject({model:'gpt-6-luna',store:false,text:{format:{type:'json_schema',strict:true}}})
  expect(body.input[0].content[1]).toMatchObject({type:'input_image',detail:'high'})
 })
 it.each(['incomplete','failed'])('cannot approve %s response; known token usage is retained',async status=>{
  vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','1')
  const http=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({status,usage:{input_tokens:100,output_tokens:10},output:[{content:[{type:'output_text',text:'{}'}]}]})))
  const result=await callVision({system:'judge',payload:{},images:[],schema:PLAN_SCHEMA,name:'plan'},http)
  expect(result.value).toBe(null);expect(result.usd).toBeGreaterThan(0)
 })
})
