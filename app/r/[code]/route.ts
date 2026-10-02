import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { REFERRAL_COOKIE, referralId } from '@/lib/referrals'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const referrer = referralId(code)
  const response = NextResponse.redirect(new URL('/login?mode=signup', request.url))
  if (!referrer) return response

  const { data } = await createAdminClient()
    .from('profiles').select('id').eq('id', referrer).maybeSingle()
  if (!data) return response

  response.cookies.set(REFERRAL_COOKIE, referrer, {
    path: '/', maxAge: 30 * 24 * 60 * 60,
    sameSite: request.nextUrl.protocol === 'https:' ? 'none' : 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
  return response
}
