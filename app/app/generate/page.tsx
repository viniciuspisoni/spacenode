import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import GenerateClient from './GenerateClient'

const DEFAULT_CREDITS = 12

export default async function GeneratePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let { data: profile } = await supabase
    .from('profiles')
    .select('credits, project_materials')
    .eq('id', user.id)
    .single()

  // Usuário pré-existente (antes do trigger handle_new_user) — cria profile agora
  if (!profile) {
    const admin = createAdminClient()
    await admin.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: user.user_metadata?.full_name ?? null,
      credits: DEFAULT_CREDITS,
    })
    profile = { credits: DEFAULT_CREDITS, project_materials: null }
  }

  return (
    <GenerateClient
      initialCredits={profile.credits}
      initialMaterials={profile.project_materials ?? undefined}
    />
  )
}
