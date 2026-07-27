// /app/comecar — fluxo guiado até a primeira imagem.
//
// Existe porque o caminho antigo de primeiro acesso dispersava: o dashboard
// oferece 11 módulos e dois CTAs concorrentes, e /app/spaces/new abre pedindo
// uma decisão ("de onde vem a Vista Mestre?") cujo card recomendado fica
// DESABILITADO justamente pra quem ainda não tem render nenhuma. Aqui não há
// escolha de módulo, jargão nem configuração: imagem → tipo → gerar.
//
// Só é servido a quem ainda não gerou nada. Quem já tem render — ou já passou
// (ou dispensou) o fluxo — vai pro dashboard; a condição é o complemento exato
// do redirect em /app, então os dois não se cruzam.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import FirstRunClient from './FirstRunClient'

export default async function ComecarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [renderCountRes, balance] = await Promise.all([
    supabase
      .from('renders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed'),
    getPayerBalance(admin, user.id),
  ])

  // Só quem já gerou alguma imagem é devolvido ao dashboard. Ter dispensado o
  // fluxo (first_run_done_at preenchida) apenas desliga o redirect automático
  // do /app — a página continua acessível por link, senão quem clica em "pular"
  // uma vez perderia o caminho guiado pra sempre.
  if ((renderCountRes.count ?? 0) > 0) redirect('/app')

  const firstName = (user.user_metadata.full_name ?? user.email ?? 'você').split(' ')[0]

  return (
    <FirstRunClient
      firstName={firstName}
      availableNodes={balance.planBalance + balance.lumenBalance}
    />
  )
}
