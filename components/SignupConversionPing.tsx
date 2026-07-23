'use client'

// Dispara a conversão de cadastro do Google Ads quando a URL chega com
// ?signup=1 (setado por app/auth/callback pra usuários novos) e depois limpa
// o parâmetro — refresh da página não deve disparar de novo.

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { reportSignupConversion } from '@/lib/gtag'

export default function SignupConversionPing() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isSignup = searchParams.get('signup') === '1'

  useEffect(() => {
    if (!isSignup) return

    reportSignupConversion()

    const params = new URLSearchParams(searchParams.toString())
    params.delete('signup')
    const query = params.toString()
    router.replace(query ? `?${query}` : window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignup])

  return null
}
