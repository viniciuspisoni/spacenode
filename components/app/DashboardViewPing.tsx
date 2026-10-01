'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics/client'

export default function DashboardViewPing() {
  useEffect(() => { track('dashboard_viewed') }, [])
  return null
}
