// /p/[slug] — link compartilhável público (acesso sem auth via share_token).
// Server Component. Lê via service-role (bypass RLS). Layout responsivo
// desktop + mobile.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccentColor } from '@/lib/spaces/identity'
import { getVisualDna } from '@/lib/spaces/dna'
import type { Pack, Space, Vista, ArchitectIdentity } from '@/lib/spaces/types'
import { findAxisOption } from '@/lib/spaces/axes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PublicPackPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: packRow } = await admin
    .from('packs')
    .select('*')
    .eq('share_token', slug)
    .single()
  if (!packRow) notFound()

  const pack = packRow as Pack
  // eslint-disable-next-line react-hooks/purity -- Server Component runs once per request; Date.now() is OK here
  if (pack.expires_at && new Date(pack.expires_at).getTime() < Date.now()) {
    notFound()
  }

  const [spaceRes, identityRes] = await Promise.all([
    admin.from('spaces').select('*').eq('id', pack.space_id).single(),
    admin.from('architect_identity').select('*').eq('user_id', pack.user_id).maybeSingle(),
  ])
  if (!spaceRes.data) notFound()

  const space    = spaceRes.data    as Space
  const identity = (identityRes.data ?? null) as ArchitectIdentity | null

  const orderedIds = (pack.vistas_ordered ?? []) as string[]
  let vistas: Vista[] = []
  if (orderedIds.length > 0) {
    const { data: vistasRows } = await admin
      .from('vistas')
      .select('*')
      .in('id', orderedIds)
    const map = new Map((vistasRows ?? []).map(v => [v.id, v as Vista]))
    vistas = orderedIds.map(id => map.get(id)).filter(Boolean) as Vista[]
  }

  const dna    = getVisualDna(space.dna)
  const accent = getAccentColor(identity, dna)
  const officeName    = identity?.name      ?? 'Estúdio'
  const officeContact = identity?.email_contact ?? null
  const showSpAttr    = !identity?.white_label_enabled

  const today = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
                          .format(new Date(pack.created_at))

  // Bucketing por axis pra seções
  const ilum   = vistas.filter(v => v.axis === 'iluminacao')
  const angulo = vistas.filter(v => v.axis === 'angulo')
  const detalhe = vistas.filter(v => v.axis === 'detalhe')
  const hero   = vistas[0] ?? null

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafafa',
      color: '#1a1a1a',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      padding: '24px 16px',
    }}>
      <div className="ppk-wrap" style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Header */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, paddingBottom: 16, marginBottom: 16,
          borderBottom: `2px solid ${accent}`,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {identity?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.logo_url} alt={officeName}
                   style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
            ) : (
              <span style={{
                width: 36, height: 36, borderRadius: 999, background: accent,
              }} />
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {officeName}
              </div>
              {identity?.subtitle && (
                <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>
                  {identity.subtitle}
                </div>
              )}
            </div>
          </div>
          {officeContact && (
            <a href={`mailto:${officeContact}`} style={{
              fontSize: 12, color: '#424245', textDecoration: 'none',
            }}>
              {officeContact}
            </a>
          )}
        </header>

        {/* Project intro */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#86868b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {pack.client_name ? `Apresentação para ${pack.client_name}` : 'Apresentação de projeto'}
          </div>
          <h1 className="ppk-title" style={{
            fontSize: 30, fontWeight: 500, color: '#1a1a1a',
            letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 6,
          }}>
            {space.name}
          </h1>
          {pack.description && (
            <p style={{ fontSize: 14, color: '#424245', marginTop: 10, lineHeight: 1.6, maxWidth: 720 }}>
              {pack.description}
            </p>
          )}
          <div style={{ fontSize: 11, color: '#86868b', marginTop: 12 }}>
            {today}
          </div>
        </section>

        {/* Hero */}
        {hero?.image_url && (
          <div className="ppk-hero" style={{
            borderRadius: 12, overflow: 'hidden',
            aspectRatio: '16 / 9', background: '#eee',
            marginBottom: 32,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Sobre este projeto (DNA reframado) */}
        {dna && (
          <section style={{ marginBottom: 36 }}>
            <SectionTitle accent={accent}>Sobre este projeto</SectionTitle>
            <div className="ppk-about" style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              padding: '20px 0',
            }}>
              <AboutItem label="Estilo">{dna.estilo.nome}</AboutItem>
              <AboutItem label="Materiais">
                {dna.materiais.slice(0, 3).map(m => m.nome).join(' · ')}
              </AboutItem>
              <AboutItem label="Paleta">
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {dna.paleta.slice(0, 6).map((c, i) => (
                    <span key={i} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '0.5px solid rgba(0,0,0,0.1)' }} />
                  ))}
                </div>
              </AboutItem>
              <AboutItem label="Contexto">{dna.contexto.slice(0, 3).join(' · ')}</AboutItem>
            </div>
          </section>
        )}

        {/* Momentos do dia (iluminação) */}
        {ilum.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionTitle accent={accent}>Momentos do dia</SectionTitle>
            <div className="ppk-grid-2" style={{
              display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              marginTop: 12,
            }}>
              {ilum.map(v => <PublicImageCard key={v.id} vista={v} accent={accent} />)}
            </div>
          </section>
        )}

        {/* Diferentes ângulos */}
        {angulo.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionTitle accent={accent}>Diferentes ângulos</SectionTitle>
            <div className="ppk-grid-3" style={{
              display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: 12,
            }}>
              {angulo.map(v => <PublicImageCard key={v.id} vista={v} accent={accent} />)}
            </div>
          </section>
        )}

        {/* Detalhes */}
        {detalhe.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <SectionTitle accent={accent}>Detalhes</SectionTitle>
            <div className="ppk-grid-3" style={{
              display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: 12,
            }}>
              {detalhe.map(v => <PublicImageCard key={v.id} vista={v} accent={accent} />)}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer style={{
          marginTop: 56, paddingTop: 24,
          borderTop: '1px solid #e5e5ea',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12, color: '#424245' }}>
            {officeName}
            {identity?.footer_message && (
              <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>{identity.footer_message}</div>
            )}
          </div>
          {showSpAttr && (
            <div style={{ fontSize: 10, color: '#86868b', letterSpacing: '0.04em' }}>
              criado com spacenode
            </div>
          )}
        </footer>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .ppk-wrap   { padding: 0 4px; }
          .ppk-title  { font-size: 22px !important; }
          .ppk-hero   { aspect-ratio: 4 / 3 !important; }
          .ppk-about  { grid-template-columns: 1fr !important; }
          .ppk-grid-3 { grid-template-columns: repeat(2, 1fr) !important; }
          .ppk-grid-2 { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}

function SectionTitle({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: '#86868b',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 18, height: 1.5, background: accent }} />
      {children}
    </h2>
  )
}

function AboutItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#86868b', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.5, letterSpacing: '-0.005em' }}>
        {children}
      </div>
    </div>
  )
}

function PublicImageCard({ vista, accent }: { vista: Vista; accent: string }) {
  const opt = vista.axis && vista.axis_value ? findAxisOption(vista.axis, vista.axis_value) : null
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      aspectRatio: '4 / 3', background: '#eee',
      position: 'relative',
    }}>
      {vista.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vista.image_url} alt={vista.axis_label ?? ''}
             style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {opt && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '20px 12px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
          color: '#fff',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: accent }} />
          <span style={{ fontSize: 11, fontWeight: 500 }}>{opt.label}</span>
        </div>
      )}
    </div>
  )
}
