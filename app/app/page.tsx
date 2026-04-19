import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black text-white">
      <h1 className="text-2xl font-semibold">Bem-vindo, {user.user_metadata.full_name ?? user.email}</h1>
      <form action="/auth/signout" method="POST">
        <button
          type="submit"
          className="rounded-lg border border-white/20 bg-white/5 px-6 py-2 text-sm font-medium uppercase tracking-widest transition hover:bg-white/10"
        >
          Sair
        </button>
      </form>
    </main>
  )
}
