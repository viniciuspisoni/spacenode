import { describe, expect, it } from 'vitest'
import { INITIAL_TICKET_LIST, ticketListReducer } from '@/components/nodi/ticket-list-state'
import type { TicketRecord } from '@/lib/nodi/types'
const ticket: TicketRecord = {id:'synthetic',protocol:'ND-1',title:'Synthetic',status:'open',priority:'normal',category:'access',createdAt:'2026-10-10'}
describe('consulta e recuperação de chamados',()=>{
 it('falha inicial não vira lista vazia',()=>{const s=ticketListReducer(ticketListReducer(INITIAL_TICKET_LIST,{type:'loading'}),{type:'failed',error:'Indisponível'});expect(s.tickets).toBeNull();expect(s.loading).toBe(false);expect(s.error).toBe('Indisponível')})
 it('atualização que falha preserva lista confirmada',()=>{const loaded=ticketListReducer(INITIAL_TICKET_LIST,{type:'loaded',tickets:[ticket]});const loading=ticketListReducer(loaded,{type:'loading'});expect(loading.tickets).toEqual([ticket]);const failed=ticketListReducer(loading,{type:'failed',error:'Falha'});expect(failed.tickets).toEqual([ticket]);expect(failed.error).toBe('Falha')})
 it('retry bem sucedido remove erro e confirma vazio verdadeiro',()=>{const failed=ticketListReducer({...INITIAL_TICKET_LIST,tickets:[ticket]},{type:'failed',error:'Falha'});const loading=ticketListReducer(failed,{type:'loading'});expect(loading.error).toBeNull();expect(loading.loading).toBe(true);const recovered=ticketListReducer(loading,{type:'loaded',tickets:[]});expect(recovered).toEqual({tickets:[],loading:false,error:null})})
})
