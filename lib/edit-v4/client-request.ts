/** Retain the exact payload after a lost response; never regenerate on a transport retry. */
export interface EditAttempt { identity:string; body:Record<string,unknown> & {client_request_id:string} }
export function prepareEditAttempt(previous:EditAttempt|null,identity:string,body:Record<string,unknown>,createId:()=>string=()=>crypto.randomUUID()):EditAttempt {
  return previous?.identity===identity?previous:{identity,body:{...body,client_request_id:createId()}}
}
export function retainEditAttempt(status:number,body:{terminal?:boolean}|null):boolean {
  return !body?.terminal && (status>=500||status===409)
}
