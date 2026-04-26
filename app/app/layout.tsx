import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/app/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName = user.user_metadata.full_name ?? user.email ?? 'usuário'
  const userAvatar = user.user_metadata.avatar_url ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar userName={userName} userAvatar={userAvatar} />
      <main style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </main>
    </div>
  )
}
