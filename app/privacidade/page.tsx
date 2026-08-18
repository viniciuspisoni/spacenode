// /privacidade — Política de Privacidade da SpaceNode (LGPD).
//
// Redigida para refletir o tratamento REAL de dados do produto: Supabase
// (auth/banco/storage), Vercel (hospedagem), Google Cloud e fal.ai (IA),
// Stripe (pagamentos), zero analytics/pixel de TERCEIROS (cookies essenciais +
// tema em localStorage + cookies PRÓPRIOS de medição/atribuição sn_attribution,
// sn_aid e sn_intent — first-party, sem dados pessoais, citados na cláusula 7;
// sn_attribution em 2026-07-18, sn_aid/sn_intent em 2026-08-18). Se algum
// tracker de terceiro for adicionado no futuro (GA4/Meta — adapters existem
// desligados em lib/analytics/adapters), a cláusula 7 PRECISA ser atualizada
// junto (e consentimento, quando exigido).
import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalSection, P, UL, LI, Strong } from '@/components/legal/LegalShell'
import { LEGAL_CNPJ, LEGAL_NAME, SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/lib/support'

export const metadata: Metadata = {
  title: 'Política de Privacidade · SpaceNode',
  description:
    'Política de Privacidade da SpaceNode — como coletamos, usamos e protegemos seus dados pessoais, em conformidade com a LGPD.',
  robots: { index: true, follow: true },
}

const UPDATED_AT = '18 de agosto de 2026'

export default function PrivacidadePage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      updatedAt={UPDATED_AT}
      intro={
        <>
          Resumo em linguagem simples: coletamos o necessário para operar a plataforma — seus dados de
          cadastro, as imagens que você envia e registros técnicos de uso. Suas imagens são processadas por
          provedores de IA contratados <Strong>apenas para gerar os seus resultados</Strong>; não usamos seu
          conteúdo para treinar modelos próprios nem vendemos dados. Pagamentos ficam com a Stripe. Não
          usamos cookies de publicidade de terceiros. Este resumo não substitui o texto completo abaixo.
        </>
      }
    >
      <LegalSection n={1} title="Quem somos">
        <P>
          Esta Política descreve como a <Strong>{LEGAL_NAME}</Strong>, inscrita no CNPJ sob o nº{' '}
          {LEGAL_CNPJ} (&ldquo;SpaceNode&rdquo;, &ldquo;nós&rdquo;), operadora da plataforma de visualização
          arquitetônica com inteligência artificial disponível em spacenode.app, trata dados pessoais na
          qualidade de <Strong>controladora</Strong>, em conformidade com a Lei Geral de Proteção de Dados —
          LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).
        </P>
        <P>
          Ela se aplica a visitantes do site e a usuários da plataforma, e complementa os{' '}
          <Link href="/termos" style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            Termos de Uso
          </Link>
          .
        </P>
      </LegalSection>

      <LegalSection n={2} title="Quais dados coletamos">
        <UL>
          <LI>
            <Strong>Cadastro:</Strong> nome, e-mail e senha (armazenada de forma criptografada); no login com
            Google, recebemos nome, e-mail e foto de perfil da sua conta Google.
          </LI>
          <LI>
            <Strong>Conteúdo:</Strong> imagens e materiais que você envia, instruções e configurações de
            geração, e os resultados gerados (imagens e vídeos), organizados em projetos e histórico.
          </LI>
          <LI>
            <Strong>Pagamento:</Strong> processado pela Stripe. Recebemos identificadores da transação, plano
            contratado e status do pagamento — <Strong>não armazenamos o número completo do seu cartão</Strong>.
          </LI>
          <LI>
            <Strong>Uso técnico:</Strong> registros de acesso (endereço IP, data e hora, conforme o art. 15 do
            Marco Civil), identificadores técnicos das gerações, tipo de navegador/dispositivo e métricas de
            consumo de créditos.
          </LI>
          <LI>
            <Strong>Equipe:</Strong> e-mails de pessoas convidadas para o seu workspace.
          </LI>
          <LI>
            <Strong>Preferências:</Strong> configurações de interface, como o tema escolhido.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection n={3} title="Para que usamos e com quais bases legais">
        <UL>
          <LI>
            <Strong>Prestar o serviço</Strong> — gerar visualizações, manter projetos e histórico, processar
            pagamentos e dar suporte (base legal: execução de contrato).
          </LI>
          <LI>
            <Strong>Autenticação e segurança da conta</Strong> (execução de contrato e legítimo interesse).
          </LI>
          <LI>
            <Strong>Prevenção a fraudes e abusos</Strong>, proteção da plataforma e dos usuários (legítimo
            interesse e obrigação legal).
          </LI>
          <LI>
            <Strong>Melhoria do produto</Strong>, com dados de uso considerados de forma agregada (legítimo
            interesse).
          </LI>
          <LI>
            <Strong>Comunicações operacionais</Strong> — confirmações, avisos de conta e de pagamento
            (execução de contrato). Comunicações de novidades e ofertas dependem de consentimento e podem ser
            desativadas a qualquer momento.
          </LI>
          <LI>
            <Strong>Cumprimento de obrigações legais</Strong>, fiscais e de ordens de autoridades (obrigação
            legal).
          </LI>
        </UL>
      </LegalSection>

      <LegalSection n={4} title="Suas imagens e a inteligência artificial">
        <P>
          Para gerar os resultados, as imagens e instruções que você envia são transmitidas de forma segura a
          provedores de IA contratados — atualmente Google Cloud (Vertex AI/Gemini) e fal.ai — exclusivamente
          para processar a sua solicitação.
        </P>
        <P>
          <Strong>Não usamos o seu conteúdo para treinar modelos de IA próprios</Strong>, e contratamos os
          provedores em modalidades que, conforme os termos deles, não utilizam conteúdo de clientes para
          treinamento de seus modelos. Seus projetos são privados por padrão e não são exibidos publicamente
          sem uma ação sua.
        </P>
      </LegalSection>

      <LegalSection n={5} title="Com quem compartilhamos">
        <P>Compartilhamos dados apenas com operadores que sustentam o serviço, no limite de cada finalidade:</P>
        <UL>
          <LI><Strong>Supabase</Strong> — banco de dados, autenticação e armazenamento de arquivos;</LI>
          <LI><Strong>Vercel</Strong> — hospedagem e infraestrutura da aplicação;</LI>
          <LI><Strong>Google Cloud</Strong> e <Strong>fal.ai</Strong> — processamento de IA das suas gerações;</LI>
          <LI><Strong>Stripe</Strong> — processamento de pagamentos.</LI>
        </UL>
        <P>
          Esses provedores atuam sob contratos com deveres de proteção de dados. Também podemos compartilhar
          dados quando exigido por lei ou por ordem de autoridade competente. <Strong>Não vendemos dados
          pessoais</Strong> e não compartilhamos seu conteúdo para publicidade de terceiros.
        </P>
      </LegalSection>

      <LegalSection n={6} title="Transferência internacional">
        <P>
          Os provedores acima processam dados em servidores localizados fora do Brasil (como Estados Unidos e
          União Europeia). Essas transferências são realizadas com as salvaguardas do art. 33 da LGPD,
          incluindo cláusulas contratuais de proteção de dados e os padrões de segurança adotados por esses
          provedores.
        </P>
      </LegalSection>

      <LegalSection n={7} title="Cookies e tecnologias locais">
        <P>
          Usamos apenas o essencial para a plataforma funcionar: cookies de sessão para manter você
          autenticado, armazenamento local do navegador para preferências de interface (como o tema) e
          cookies próprios de medição de audiência e atribuição de campanha —{' '}
          <Strong>sn_attribution</Strong>, que guarda por até 90 dias os parâmetros da campanha que trouxe
          você ao site (como utm_source e utm_campaign), o endereço da página de origem e a data do acesso;{' '}
          <Strong>sn_aid</Strong>, um identificador aleatório de visita que nos permite contar visitantes e
          medir o funil de cadastro sem identificar você; e <Strong>sn_intent</Strong>, que guarda por até 1
          dia o plano que você escolheu antes de entrar, para retomar a contratação depois do login. Esses
          cookies são nossos (first-party), não contêm dados pessoais e não são compartilhados com terceiros.
        </P>
        <P>
          <Strong>Não usamos cookies de publicidade de terceiros nem rastreadores de terceiros.</Strong> Se
          isso mudar, esta Política será atualizada antes e, quando exigido, o seu consentimento será
          solicitado.
        </P>
      </LegalSection>

      <LegalSection n={8} title="Por quanto tempo guardamos">
        <P>
          Mantemos seus dados enquanto sua conta existir e pelo tempo necessário às finalidades desta
          Política. Após a exclusão da conta, os dados são eliminados ou anonimizados, ressalvados os prazos
          legais — por exemplo, registros de acesso por 6 meses (art. 15 do Marco Civil) e documentos
          fiscais/contratuais pelos prazos da legislação — e a preservação necessária ao exercício regular de
          direitos.
        </P>
      </LegalSection>

      <LegalSection n={9} title="Seus direitos (art. 18 da LGPD)">
        <P>Você pode solicitar, a qualquer momento:</P>
        <UL>
          <LI>confirmação da existência de tratamento e acesso aos seus dados;</LI>
          <LI>correção de dados incompletos, inexatos ou desatualizados;</LI>
          <LI>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</LI>
          <LI>portabilidade, observados os segredos comercial e industrial;</LI>
          <LI>informação sobre com quem compartilhamos seus dados;</LI>
          <LI>revogação do consentimento e oposição a tratamentos baseados em legítimo interesse;</LI>
          <LI>eliminação dos dados tratados com base no seu consentimento.</LI>
        </UL>
        <P>
          Para exercer seus direitos, fale com a gente pelos canais da cláusula 12. Responderemos nos prazos
          da LGPD. Você também pode apresentar petição à Autoridade Nacional de Proteção de Dados (ANPD).
        </P>
      </LegalSection>

      <LegalSection n={10} title="Segurança">
        <P>
          Adotamos medidas técnicas e organizacionais compatíveis com o mercado para proteger seus dados —
          como criptografia em trânsito, controle de acesso e isolamento de dados por usuário. Nenhum sistema
          é absolutamente seguro; em caso de incidente de segurança com risco relevante aos titulares,
          comunicaremos você e a ANPD nos termos da LGPD.
        </P>
      </LegalSection>

      <LegalSection n={11} title="Menores de idade">
        <P>
          A plataforma destina-se a maiores de 18 anos. Não coletamos intencionalmente dados de menores; se
          identificarmos uma conta nessa condição, ela será encerrada e os dados eliminados.
        </P>
      </LegalSection>

      <LegalSection n={12} title="Encarregado e contato">
        <P>
          Solicitações sobre dados pessoais podem ser enviadas ao nosso canal de privacidade:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            {SUPPORT_EMAIL}
          </a>{' '}
          (assunto &ldquo;Privacidade&rdquo;) ou WhatsApp{' '}
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
          .
        </P>
      </LegalSection>

      <LegalSection n={13} title="Alterações desta Política">
        <P>
          Podemos atualizar esta Política para refletir mudanças no serviço ou na legislação. Alterações
          relevantes serão comunicadas por e-mail ou aviso na plataforma. A versão vigente estará sempre
          nesta página, com a data de atualização no topo.
        </P>
      </LegalSection>
    </LegalShell>
  )
}
