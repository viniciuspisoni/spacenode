// Edge Function: expire-lumens
//
// Marca como 'expired' todos os lumen_packs com status='active' cuja
// expires_at já passou. Não-bloqueante para o consumo: consume_nodes_v2
// já filtra por `expires_at > NOW()`, então packs vencidos nunca são
// debitados — esta função serve só pra manter o status visualmente correto.
//
// Agendamento via pg_cron (rodar diário às 06:00 UTC = 03:00 BRT):
//
//   SELECT cron.schedule(
//     'expire-lumens-daily',
//     '0 6 * * *',
//     $$
//       SELECT net.http_post(
//         url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/expire-lumens',
//         headers := jsonb_build_object(
//           'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
//           'Content-Type',  'application/json'
//         )
//       );
//     $$
//   );
//
// pg_cron está disponível mas não-instalado neste projeto. Habilitar via
// Dashboard → Database → Extensions antes de agendar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error, count } = await supabase
    .from('lumen_packs')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('id', { count: 'exact' })

  if (error) {
    console.error('expire-lumens error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({ expired_count: count ?? 0, expired_ids: (data ?? []).map(r => r.id) }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
