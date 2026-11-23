// Aprovação do pareamento do plugin SketchUp em campo (o plugin abre esta
// URL). Página genérica: components/integrations/PairApproval.tsx.

import { PairApproval } from '@/components/integrations/PairApproval'

export default function SketchUpPairPage() {
  return (
    <PairApproval
      appLabel="SketchUp"
      platform={null}
      approveEndpoint="/api/sketchup/pair/approve"
      loginNext="/sketchup/pair"
    />
  )
}
