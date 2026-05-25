// GET / PUT /api/users/me/identity
//
// PUT recebe multipart/form-data:
//   logo:                  File (opcional)
//   remove_logo:           '1' (opcional)
//   name:                  string
//   subtitle:              string
//   email_contact:         string
//   social_link:           string
//   accent_color_mode:     'fixed' | 'derived_from_dna'
//   accent_color_fixed:    '#RRGGBB' (opcional)
//   footer_message:        string
//   white_label_enabled:   '1' / '0'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_LOGO_MIME = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
const MAX_LOGO_BYTES    = 2 * 1024 * 1024

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('architect_identity')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({ identity: data ?? null })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const fd = await req.formData()
  const update: Record<string, unknown> = { user_id: user.id }

  const text = (key: string): string | null => {
    const v = fd.get(key)
    return typeof v === 'string' ? v : null
  }

  if (text('name') !== null)               update.name               = text('name')
  if (text('subtitle') !== null)           update.subtitle           = text('subtitle')
  if (text('email_contact') !== null)      update.email_contact      = text('email_contact')
  if (text('social_link') !== null)        update.social_link        = text('social_link')
  if (text('footer_message') !== null)     update.footer_message     = text('footer_message')

  const accentMode = text('accent_color_mode')
  if (accentMode === 'fixed' || accentMode === 'derived_from_dna') {
    update.accent_color_mode = accentMode
  }
  const accentFixed = text('accent_color_fixed')
  if (accentFixed) {
    if (!/^#[0-9a-f]{6}$/i.test(accentFixed)) {
      return NextResponse.json({ error: 'accent_color_fixed inválido' }, { status: 400 })
    }
    update.accent_color_fixed = accentFixed
  }

  const wl = text('white_label_enabled')
  if (wl !== null) update.white_label_enabled = wl === '1' || wl === 'true'

  // Logo upload
  const logo = fd.get('logo')
  const removeLogo = text('remove_logo') === '1'
  const admin = createAdminClient()

  if (removeLogo) {
    update.logo_url = null
  } else if (logo instanceof File && logo.size > 0) {
    if (!ALLOWED_LOGO_MIME.includes(logo.type)) {
      return NextResponse.json({ error: 'Formato de logo não suportado' }, { status: 400 })
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: 'Logo maior que 2 MB' }, { status: 400 })
    }
    const ext = logo.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')
    const key = `${user.id}/logo-${Date.now()}.${ext}`
    const buffer = Buffer.from(await logo.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from('architect-identity')
      .upload(key, buffer, { contentType: logo.type, upsert: true })
    if (upErr) {
      console.error('[identity.put] upload failed:', upErr)
      return NextResponse.json({ error: 'Erro ao salvar logo' }, { status: 500 })
    }
    const { data: { publicUrl } } = admin.storage.from('architect-identity').getPublicUrl(key)
    update.logo_url = publicUrl
  }

  // Upsert
  const { data, error } = await admin
    .from('architect_identity')
    .upsert(update, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) {
    console.error('[identity.put] upsert failed:', error)
    return NextResponse.json({ error: 'Erro ao salvar identidade' }, { status: 500 })
  }
  return NextResponse.json({ identity: data })
}
