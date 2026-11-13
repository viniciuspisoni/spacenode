/** Local-only smoke. The quotation must confirm paid execution is OFF before any execution probe. */
import fs from 'node:fs'
const base='http://127.0.0.1:9384/api/edit-v4',owner='00000000-0000-0000-0000-000000000001'
async function post(id,testUser,body){
 const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...(testUser?{'x-edit-v4-test-user':testUser}:{})},body:JSON.stringify(body)})
 return {id,status:response.status,response:await response.json()}
}
const quote=await post('economic_quote',owner,{action:'swap_material',dry_run:true})
if(quote.response.nodes_cost!==10||quote.response.execution_available!==false)throw Error('Refusing execution probe: expected an internal 10-Node quotation with paid calls OFF')
const rows=[quote,
 await post('paid_execution_paused',owner,{action:'swap_material',source_image_url:'https://preview.invalid/source.png',mask_url:'https://preview.invalid/mask.png',instruction:'Pinte o painel de azul-marinho.',selection_confirmed:true,client_request_id:owner}),
 await post('unauthenticated',null,{action:'remove',dry_run:true}),
 await post('other_user_legacy_quote','00000000-0000-0000-0000-000000000003',{action:'remove',dry_run:true}),
]
const passed=rows[1].status===503&&rows[2].status===401&&rows[3].response.nodes_cost===18
const report={localNextServer:true,realProviderCredentials:false,realDatabase:false,passed,newPaidCalls:0,rows}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({passed,statuses:rows.map(x=>[x.id,x.status,x.response.nodes_cost])}))
if(!passed)process.exitCode=1
