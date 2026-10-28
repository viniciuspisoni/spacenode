import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { CONSENT_COOKIE } from './consent'
import { isInternalTraffic } from './internal'
import { marketingConsentSnapshot } from './stripe-metadata'
import { buildMetaRegistration, metaConversionsConfigured, sendMetaConversion } from './adapters/meta-conversions'

export type SignupConversionStatus = 'accepted' | 'failed' | 'unconfigured' | 'consent_required' | 'ineligible'
export interface SignupConversionResult {
  status: SignupConversionStatus
  eventId?: string
}

// An acknowledgment is final even if another tab finishes a stale request.
const NOT_ACCEPTED = 'metadata->meta_registration->>status.is.null,metadata->meta_registration->>status.neq.accepted'

/** Canonical signup, never a conversion claimed in the request body. The saved
 * acknowledgment prevents replay on later logins/devices. Concurrent requests
 * share the same event ID. UTMs and user_metadata never establish consent. */
export async function deliverSignupConversion(
  admin: SupabaseClient, user: User, req: NextRequest,
): Promise<SignupConversionResult> {
  try {
    if (isInternalTraffic(req)) return { status: 'ineligible' }
    const { data: signup, error } = await admin.schema('marketing').from('acquisition_events')
      .select('id,metadata,is_internal').eq('user_id', user.id).eq('event_type', 'signup').maybeSingle()
    if (error || !signup) return { status: 'failed' }
    const { data: actor, error: actorError } = await admin.schema('marketing').from('internal_actors')
      .select('user_id').eq('user_id', user.id).maybeSingle()
    if (actorError) return { status: 'failed' }
    if (signup.is_internal || actor) return { status: 'ineligible' }

    const createdAt = Date.parse(user.created_at)
    if (!user.email_confirmed_at || !Number.isFinite(createdAt) || createdAt > Date.now()
      || createdAt <= Date.now() - 7 * 86400000) return { status: 'ineligible' }

    const consent = marketingConsentSnapshot(req.cookies.get(CONSENT_COOKIE)?.value)
    const metadata = signup.metadata ?? {}
    const previous = metadata.meta_registration
    // Revocation also prevents returning a browser Pixel instruction.
    if (consent !== 'granted') {
      if (previous?.status !== 'accepted') {
        await admin.schema('marketing').from('acquisition_events').update({ metadata: {
          ...metadata, meta_registration: { status: 'consent_required', consent, checked_at: new Date().toISOString() },
        } }).eq('id', signup.id).or(NOT_ACCEPTED)
      }
      return { status: 'consent_required' }
    }
    const eventId = `signup:${user.id}`
    if (previous?.status === 'accepted') return { status: 'accepted' }

    const event = buildMetaRegistration({
      userId: user.id, createdAt: user.created_at, consent,
      fbc: req.cookies.get('_fbc')?.value, fbp: req.cookies.get('_fbp')?.value,
      userAgent: req.headers.get('user-agent'),
    })
    if (!event) return { status: 'ineligible' }
    let status: SignupConversionStatus = 'unconfigured'
    if (metaConversionsConfigured()) {
      try {
        await sendMetaConversion(event)
        status = 'accepted'
      } catch (err) {
        status = 'failed'
        console.warn('[analytics] signup conversion:', err instanceof Error ? err.message : 'transport failed')
      }
    }
    const { error: saveError } = await admin.schema('marketing').from('acquisition_events').update({ metadata: {
      ...metadata, meta_registration: {
        status, consent, event_id: eventId, checked_at: new Date().toISOString(),
        has_fbc: Boolean(event.user_data.fbc), has_fbp: Boolean(event.user_data.fbp),
      },
    } }).eq('id', signup.id).or(NOT_ACCEPTED)
    if (saveError) return { status: 'failed', eventId }
    return { status, eventId }
  } catch {
    console.warn('[analytics] signup conversion persistence failed')
    return { status: 'failed' }
  }
}
