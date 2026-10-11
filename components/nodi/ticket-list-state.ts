import type { TicketRecord } from '@/lib/nodi/types'

export interface TicketListState {
  tickets: TicketRecord[] | null
  loading: boolean
  error: string | null
}
export const INITIAL_TICKET_LIST: TicketListState = { tickets: null, loading: false, error: null }
export type TicketListAction =
  | { type: 'loading' }
  | { type: 'loaded'; tickets: TicketRecord[] }
  | { type: 'failed'; error: string }

// A failed refresh preserves the last confirmed list; unknown never means empty.
export function ticketListReducer(state: TicketListState, action: TicketListAction): TicketListState {
  if (action.type === 'loading') return { ...state, loading: true, error: null }
  if (action.type === 'loaded') return { tickets: action.tickets, loading: false, error: null }
  return { ...state, loading: false, error: action.error }
}
