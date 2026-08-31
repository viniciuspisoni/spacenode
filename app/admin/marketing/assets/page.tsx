import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listBrandAssets } from '@/lib/marketing/service'
import { BrandAssetsClient } from '../_components/BrandAssetsClient'

// Biblioteca de assets de marca: logos, arquivos de marca, capas, referências e
// vídeos no bucket privado marketing-assets. Gerações do produto (renders/
// vistas) são vinculadas direto no briefing, com registro de permissão.

export const dynamic = 'force-dynamic'

export default async function AssetsPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const assets = await listBrandAssets(ctx.admin)
  return <BrandAssetsClient initialAssets={assets} />
}
