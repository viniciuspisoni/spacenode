import { editV4Enabled, editV4PaidCallsEnabled } from './flags'
import { economicEnabled, economicHalfPriceFits, economicPaidCallsEnabled } from './economic/policy'

/** Shared server-side decision for quotations and every editor entry point. */
export function editV4ExecutionAvailable(userId: string): boolean {
  return editV4Enabled() && editV4PaidCallsEnabled()
    && (!economicEnabled(userId) || (economicPaidCallsEnabled() && economicHalfPriceFits()))
}
