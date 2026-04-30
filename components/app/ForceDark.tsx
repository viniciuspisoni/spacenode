'use client'
import { useEffect } from 'react'

export function ForceDark() {
  useEffect(() => {
    document.documentElement.classList.remove('light')
  }, [])
  return null
}
