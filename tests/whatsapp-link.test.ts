import { describe, expect, it } from 'vitest'
import {canonicalMobile,createWhatsAppLink,readWhatsAppLink,whatsappAccountRef} from '../lib/customer-contact/whatsapp-link'
const secret='s'.repeat(64), uid='11111111-1111-4111-8111-111111111111', now=1790856000000
describe('WhatsApp account confirmation',()=>{
  it('links only the matching phone within ten minutes and hides identity',()=>{
    const token=createWhatsAppLink(secret,uid,'+5551999998888',now)
    expect(token).not.toContain(uid)
    expect(token).not.toContain('5551999998888')
    expect(readWhatsAppLink(secret,token,'+555199998888',now+1)).toBe(uid)
    expect(()=>readWhatsAppLink(secret,token,'+5551888887777',now)).toThrow()
    expect(()=>readWhatsAppLink(secret,token,'+5551999998888',now+600000)).toThrow()
  })
  it('rejects tampering and a different secret',()=>{
    const token=createWhatsAppLink(secret,uid,'+15550000002',now)
    expect(()=>readWhatsAppLink('x'.repeat(64),token,'+15550000002',now)).toThrow()
    expect(()=>readWhatsAppLink(secret,token.slice(0,30)+'A'+token.slice(31),'+15550000002',now)).toThrow()
  })
  it('preserves landline identities and uses the existing account reference',()=>{
    expect(canonicalMobile('+555182127288')).toBe('555182127288')
    expect(canonicalMobile('+15550000002')).toBe('15550000002')
    expect(whatsappAccountRef(secret,uid)).toHaveLength(64)
  })
})
