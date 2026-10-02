import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

// The ninth digit alias is used only for Brazilian mobile numbers. Landlines
// and international numbers retain their exact identity.
export function canonicalMobile(value: string): string {
  const digits=value.replace(/^\+/, '')
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) throw new Error('Invalid phone')
  return /^55[1-9][0-9]9[6-9][0-9]{7}$/.test(digits) ? digits.slice(0,4)+digits.slice(5) : digits
}
const digest=(secret:string, value:string)=>createHmac('sha256',secret).update(value).digest()
const key=(secret:string)=>digest(secret,'whatsapp-link-encryption-v1')
const proof=(secret:string,phone:string)=>digest(secret,'whatsapp-link-phone:'+canonicalMobile(phone)).toString('hex')

export function createWhatsAppLink(secret:string, userId:string, phone:string, now=Date.now()):string {
  if(secret.length<48) throw new Error('Unavailable')
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(secret),iv)
  const body=Buffer.from(JSON.stringify({uid:userId,proof:proof(secret,phone),exp:now+600_000}))
  const encrypted=Buffer.concat([cipher.update(body),cipher.final()])
  return 'SNV1.'+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url')
}

export function readWhatsAppLink(secret:string, token:string, phone:string, now=Date.now()):string {
  if(secret.length<48 || !/^SNV1\.[A-Za-z0-9_-]{40,600}$/.test(token)) throw new Error('Invalid link')
  const packed=Buffer.from(token.slice(5),'base64url'), decipher=createDecipheriv('aes-256-gcm',key(secret),packed.subarray(0,12))
  decipher.setAuthTag(packed.subarray(12,28))
  const payload=JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)),decipher.final()]).toString())
  if(typeof payload.uid!=='string' || !/^[0-9a-f-]{36}$/i.test(payload.uid) || typeof payload.exp!=='number'
    || payload.exp<=now || payload.exp>now+600_000 || payload.proof!==proof(secret,phone)) throw new Error('Invalid link')
  return payload.uid
}

export function whatsappAccountRef(secret:string,userId:string):string {
  return digest(secret,'account:'+userId).toString('hex')
}
