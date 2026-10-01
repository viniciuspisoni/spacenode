// /termos — Termos de Uso da SpaceNode.
//
// Conteúdo redigido para refletir o produto real (planos/nodes de
// lib/plans.ts e lib/extra-nodes.ts, Stripe, workspaces, provedores de IA) e
// proteger o operador: natureza ilustrativa das imagens (cláusulas 8–9),
// indenização por conteúdo de terceiros (7), limitação de responsabilidade
// (14) e arrependimento nos termos do CDC (6).
//
// TODO(dono): se quiser fixar a comarca do foro (cláusula 17), trocar
// "comarca da sede" pela cidade registrada no CNPJ.
//
// ⚠️ NÃO MERGEAR ANTES DO CÓDIGO (2026-09-19).
//
// A cláusula 5 passou a descrever a regra de créditos v2: validade de 90 dias
// POR CRÉDITO (não mais por saldo), congelamento do saldo no fim da
// assinatura e 30 dias para reativar e recuperar. Hoje o código faz outra
// coisa — `start_nodes_grace` deixa o saldo GASTÁVEL por 90 dias depois do
// cancelamento, `profiles.credits` é um escalar único com uma só data em
// `profiles.nodes_expire_at`, e "congelado" não existe como estado.
//
// Enquanto for assim, estes Termos prometem MENOS do que o produto entrega —
// a direção segura da assimetria, mas que não fecha a brecha que motivou a
// mudança (assinar e cancelar no mesmo dia e usar o saldo por 90 dias). Quem
// fecha a brecha é o código, não este arquivo.
//
// A data de corte do direito adquirido é o próprio UPDATED_AT: a cláusula de
// transição cita essa data, então ela precisa ser a data real de publicação,
// e a checagem de grandfathering no código tem de usar exatamente a mesma.

import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalSection, P, UL, LI, Callout, Strong } from '@/components/legal/LegalShell'
import { LEGAL_CNPJ, LEGAL_NAME, SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/lib/support'

export const metadata: Metadata = {
  title: 'Termos de Uso · SpaceNode',
  description:
    'Termos de Uso da SpaceNode — condições para uso da plataforma de visualização arquitetônica com IA: planos, créditos, direitos sobre imagens e responsabilidades.',
  robots: { index: true, follow: true },
}

const UPDATED_AT = '19 de setembro de 2026'

export default function TermosPage() {
  return (
    <LegalShell
      title="Termos de Uso"
      updatedAt={UPDATED_AT}
      intro={
        <>
          Resumo em linguagem simples: a SpaceNode gera <Strong>visualizações arquitetônicas com IA</Strong> a
          partir do material que você envia. As imagens geradas são suas, mas têm natureza{' '}
          <Strong>ilustrativa</Strong> — não substituem projeto técnico nem responsabilidade profissional.
          Os créditos do plano renovam todo mês, <Strong>acumulam</Strong> e valem{' '}
          <Strong>90 dias a contar de cada crédito</Strong>; encerrada a assinatura, o saldo fica
          congelado e você tem <Strong>30 dias</Strong> para reativar e recuperá-lo. Quem assinou antes
          de {UPDATED_AT} segue na regra anterior. O plano anual é pago antecipadamente. Este resumo não
          substitui o texto completo abaixo.
        </>
      }
    >
      <LegalSection n={1} title="Aceitação">
        <P>
          Estes Termos de Uso (&ldquo;Termos&rdquo;) regulam o acesso e o uso da plataforma SpaceNode
          (&ldquo;Plataforma&rdquo;), disponível em spacenode.app e operada por{' '}
          <Strong>{LEGAL_NAME}</Strong>, inscrita no CNPJ sob o nº {LEGAL_CNPJ}
          (&ldquo;SpaceNode&rdquo;, &ldquo;nós&rdquo;). Ao criar uma conta,
          acessar ou usar a Plataforma, você (&ldquo;Usuário&rdquo;) declara que leu, compreendeu e aceita
          integralmente estes Termos e a{' '}
          <Link href="/privacidade" style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            Política de Privacidade
          </Link>
          . Se você não concorda, não utilize a Plataforma.
        </P>
        <P>
          Se você usa a Plataforma em nome de um escritório, empresa ou equipe, declara ter poderes para
          vinculá-los a estes Termos, que se aplicam a todos os membros do seu workspace.
        </P>
      </LegalSection>

      <LegalSection n={2} title="O serviço">
        <P>
          A SpaceNode é uma plataforma de visualização arquitetônica assistida por inteligência artificial.
          A partir de imagens, estudos, modelos e instruções fornecidos pelo Usuário, ela gera visualizações,
          edições, ampliações, vídeos e materiais de apresentação.
        </P>
        <P>
          A Plataforma é uma <Strong>ferramenta de apoio visual</Strong> ao trabalho de arquitetos, designers
          e profissionais criativos. Ela não presta serviços de arquitetura ou engenharia, não elabora
          projetos técnicos e não emite documentos com responsabilidade técnica.
        </P>
      </LegalSection>

      <LegalSection n={3} title="Elegibilidade e conta">
        <P>
          Para usar a Plataforma você deve ter 18 anos ou mais e plena capacidade civil. Você se compromete a
          fornecer informações verdadeiras no cadastro e a mantê-las atualizadas.
        </P>
        <P>
          As credenciais de acesso são pessoais e intransferíveis. Você é responsável por toda atividade
          realizada com a sua conta e deve nos notificar imediatamente, pelos canais oficiais, em caso de
          suspeita de uso não autorizado.
        </P>
      </LegalSection>

      <LegalSection n={4} title="Workspaces e equipes">
        <P>
          O titular de um workspace pode convidar membros para colaborar. Os membros consomem o saldo de
          créditos do titular, que permanece o único responsável pela relação contratual, pelos pagamentos e
          pelo cumprimento destes Termos por todos os membros do seu workspace.
        </P>
      </LegalSection>

      <LegalSection n={5} title="Planos e nodes">
        <UL>
          <LI>
            <Strong>Nodes</Strong> são os créditos de uso da Plataforma. Cada geração, edição, ampliação ou
            vídeo consome nodes conforme o motor, a resolução e as opções escolhidas — o custo é exibido
            antes da confirmação.
          </LI>
          <LI>
            Os <Strong>nodes mensais</Strong>, incluídos no plano, são creditados a cada ciclo e têm{' '}
            <Strong>validade de 90 (noventa) dias corridos contados da data de cada crédito</Strong>. Os
            nodes não utilizados em um ciclo <Strong>permanecem no saldo e somam-se aos do ciclo
            seguinte</Strong>, até o fim da validade de cada um. O consumo utiliza sempre os nodes de
            vencimento mais próximo.
          </LI>
          <LI>
            <Strong>Encerrada a assinatura</Strong> — por cancelamento ou falta de pagamento —, o saldo de
            nodes mensais fica <Strong>congelado</Strong>: permanece visível na sua conta, mas não pode
            ser utilizado.
          </LI>
          <LI>
            Se você <Strong>reativar ou contratar uma nova assinatura em até 30 (trinta) dias
            corridos</Strong> contados do fim da assinatura, o saldo congelado é liberado e volta a ser
            utilizável. A validade de 90 dias de cada crédito <Strong>continua correndo durante o
            congelamento</Strong>, de modo que voltam a ficar disponíveis apenas os nodes que ainda não
            tenham vencido.
          </LI>
          <LI>
            Passados os <Strong>30 dias</Strong> sem reativação, o saldo mensal congelado{' '}
            <Strong>expira</Strong>, sem direito a reembolso ou conversão.
          </LI>
          <LI>
            <Strong>Assinaturas iniciadas antes de {UPDATED_AT}</Strong> seguem a regra anterior: os nodes
            mensais não têm validade enquanto a assinatura estiver ativa e, encerrada a assinatura, o saldo
            permanece <Strong>utilizável</Strong> por 90 (noventa) dias corridos, em vez de congelado. Essa
            condição acompanha a assinatura enquanto ela permanecer ativa e ininterrupta; uma nova
            assinatura contratada a partir daquela data segue as regras acima.
          </LI>
          <LI>
            Os <Strong>nodes extras</Strong> são créditos avulsos, comprados separadamente, <Strong>sem prazo
            de validade</Strong>, disponíveis conforme as condições do seu plano. O consumo utiliza primeiro
            os nodes mensais e, depois, os nodes extras.
          </LI>
          <LI>
            Contas gratuitas podem receber créditos de cortesia, cuja quantidade e disponibilidade podem ser
            alteradas ou descontinuadas a qualquer momento, sem gerar direito adquirido.
          </LI>
          <LI>
            No <Strong>plano anual</Strong>, o valor total é cobrado antecipadamente e o compromisso é de 12
            meses, com os nodes liberados em ciclos mensais.
          </LI>
          <LI>
            Preços, planos e a tabela de consumo por ferramenta podem ser alterados. Alterações não são
            retroativas: valem a partir do ciclo seguinte e serão comunicadas com antecedência razoável.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection n={6} title="Pagamentos, cancelamento e reembolso">
        <UL>
          <LI>
            Os pagamentos são processados pela <Strong>Stripe</Strong>. Não armazenamos os dados completos do
            seu cartão.
          </LI>
          <LI>
            Você pode cancelar a assinatura a qualquer momento no painel, sem burocracia. O acesso aos
            recursos do plano permanece até o fim do período já pago, e não há novas cobranças. O
            tratamento do saldo de nodes mensais após o fim da assinatura segue a cláusula 5.
          </LI>
          <LI>
            No plano anual, o cancelamento interrompe a renovação ao fim dos 12 meses contratados; o
            pagamento antecipado corresponde ao compromisso anual.
          </LI>
          <LI>
            <Strong>Direito de arrependimento:</Strong> em contratações realizadas pela internet, você pode
            desistir em até 7 (sete) dias corridos a contar da contratação, nos termos do art. 49 do Código
            de Defesa do Consumidor, com reembolso do valor pago.
          </LI>
          <LI>
            Fora das hipóteses previstas em lei ou nestes Termos, os valores pagos não são reembolsáveis —
            inclusive nodes não utilizados, mensais ou extras —, na máxima extensão permitida pela legislação.
          </LI>
          <LI>
            Em caso de falha ou estorno de pagamento, os recursos pagos podem ser suspensos até a
            regularização.
          </LI>
        </UL>
      </LegalSection>

      <LegalSection n={7} title="Conteúdo do usuário">
        <P>
          Você mantém todos os direitos sobre as imagens, projetos e demais materiais que envia à Plataforma
          (&ldquo;Conteúdo do Usuário&rdquo;). Ao enviá-los, você nos concede uma licença limitada, não
          exclusiva e revogável para armazenar, processar, reproduzir tecnicamente e transmitir esse conteúdo
          aos provedores de tecnologia contratados, exclusivamente na medida necessária para operar a
          Plataforma e prestar o serviço. Não usamos seus projetos em publicidade ou material promocional sem
          a sua autorização expressa.
        </P>
        <P>
          Você declara e garante que possui os direitos necessários sobre todo o conteúdo que envia e que o
          envio e o uso pretendido não violam direitos de terceiros — incluindo direitos autorais, de imagem,
          de propriedade e de confidencialidade. <Strong>Você responde integralmente pelo Conteúdo do
          Usuário</Strong> e concorda em nos manter indenes de reclamações, perdas e despesas (inclusive
          honorários advocatícios) decorrentes de violações causadas pelo seu conteúdo ou pelo seu uso da
          Plataforma em desacordo com estes Termos.
        </P>
      </LegalSection>

      <LegalSection n={8} title="Imagens geradas e uso profissional">
        <P>
          Os direitos sobre as imagens e vídeos gerados a partir do seu conteúdo pertencem a você, na máxima
          extensão permitida pela legislação aplicável, para uso em apresentações comerciais, portfólio,
          redes sociais, sites e materiais de apoio ao projeto.
        </P>
        <Callout>
          As imagens geradas são <Strong>visualizações conceituais e ilustrativas</Strong>. Elas não
          constituem projeto arquitetônico, projeto executivo, memorial descritivo, levantamento, cálculo ou
          qualquer documento técnico, e <Strong>não substituem a responsabilidade técnica
          profissional</Strong> (ART/RRT) nem dispensam a verificação por profissional habilitado. É sua
          responsabilidade revisar e validar os resultados antes de qualquer uso profissional e comunicar aos
          seus clientes a natureza ilustrativa das imagens.
        </Callout>
      </LegalSection>

      <LegalSection n={9} title="Natureza da inteligência artificial">
        <P>
          A Plataforma utiliza modelos de inteligência artificial, inclusive de provedores terceiros.
          Resultados de IA são probabilísticos: podem variar entre execuções e podem conter imprecisões,
          artefatos ou divergências em relação à imagem base, mesmo com as tecnologias de preservação da
          Plataforma. Não garantimos que um resultado específico atenderá a expectativas estéticas ou de
          fidelidade.
        </P>
        <P>
          Créditos consumidos em gerações tecnicamente concluídas não são restituíveis por insatisfação com o
          resultado. Em caso de falha técnica (geração não entregue ou com defeito comprovado), nosso suporte
          poderá recreditar os nodes correspondentes.
        </P>
      </LegalSection>

      <LegalSection n={10} title="Uso aceitável">
        <P>É proibido usar a Plataforma para:</P>
        <UL>
          <LI>criar, enviar ou distribuir conteúdo ilegal, difamatório, discriminatório ou que viole direitos de terceiros;</LI>
          <LI>gerar imagens de pessoas reais sem autorização, ou conteúdo enganoso apresentado como registro real;</LI>
          <LI>violar direitos autorais, marcas ou segredos de negócio de terceiros;</LI>
          <LI>realizar engenharia reversa, raspagem de dados, acesso automatizado não autorizado ou revenda do serviço;</LI>
          <LI>burlar limites técnicos, de segurança ou de cobrança, inclusive compartilhando contas;</LI>
          <LI>sobrecarregar ou interferir na infraestrutura da Plataforma.</LI>
        </UL>
        <P>
          Podemos recusar o processamento de conteúdo que viole esta cláusula e aplicar as medidas da
          cláusula 12.
        </P>
      </LegalSection>

      <LegalSection n={11} title="Propriedade intelectual da Plataforma">
        <P>
          O software, a marca SpaceNode, a identidade visual, a interface e a tecnologia da Plataforma são
          protegidos por lei e permanecem de nossa titularidade ou de nossos licenciantes. Estes Termos
          concedem apenas uma licença pessoal, limitada e intransferível de uso da Plataforma conforme o
          plano contratado — nenhum outro direito é transferido.
        </P>
      </LegalSection>

      <LegalSection n={12} title="Suspensão e encerramento">
        <P>
          Podemos suspender ou encerrar contas em caso de violação destes Termos, uso fraudulento, risco à
          segurança da Plataforma ou de terceiros, ou exigência legal — quando razoável, mediante notificação
          prévia. Você pode encerrar sua conta a qualquer momento.
        </P>
        <P>
          O encerramento por violação não gera direito a reembolso fora das hipóteses legais. Após o
          encerramento, o acesso a créditos remanescentes, projetos e histórico cessa, observados os prazos
          de retenção descritos na Política de Privacidade.
        </P>
      </LegalSection>

      <LegalSection n={13} title="Disponibilidade, alterações do serviço e cópias">
        <P>
          Trabalhamos para manter a Plataforma disponível e estável, mas não garantimos operação ininterrupta
          ou livre de erros: dependemos de provedores terceiros (infraestrutura de nuvem, modelos de IA,
          meios de pagamento) e realizamos manutenções programadas ou emergenciais.
        </P>
        <P>
          Podemos evoluir, alterar ou descontinuar funcionalidades. Se uma alteração reduzir de forma
          substancial o serviço contratado, você poderá cancelar sem ônus quanto ao período não usufruído.
        </P>
        <P>
          A Plataforma <Strong>não é um serviço de backup</Strong>. Mantenha cópias próprias do seu material
          original e exporte os resultados que considerar importantes.
        </P>
      </LegalSection>

      <LegalSection n={14} title="Limitação de responsabilidade">
        <P>
          Na máxima extensão permitida pela legislação aplicável — e sem afastar direitos do consumidor que
          não possam ser excluídos por lei:
        </P>
        <UL>
          <LI>a Plataforma é fornecida no estado em que se encontra, sem garantias além das legais;</LI>
          <LI>
            não respondemos por danos indiretos, lucros cessantes, perda de chance ou danos decorrentes do
            uso profissional dos resultados em desacordo com a cláusula 8;
          </LI>
          <LI>
            nossa responsabilidade total, por qualquer causa, fica limitada ao valor efetivamente pago por
            você à SpaceNode nos 12 (doze) meses anteriores ao evento.
          </LI>
        </UL>
        <P>Nada nestes Termos exclui responsabilidades que não podem ser excluídas por lei.</P>
      </LegalSection>

      <LegalSection n={15} title="Alterações destes Termos">
        <P>
          Podemos atualizar estes Termos para refletir mudanças no serviço ou na legislação. Alterações
          relevantes serão comunicadas com antecedência razoável, por e-mail ou aviso na Plataforma. O uso
          continuado após a entrada em vigor vale como concordância; se você não concordar, pode cancelar e
          encerrar sua conta.
        </P>
      </LegalSection>

      <LegalSection n={16} title="Disposições gerais">
        <P>
          A eventual tolerância quanto ao descumprimento de qualquer cláusula não implica renúncia ou
          novação. Se qualquer disposição destes Termos for considerada inválida, as demais permanecem em
          vigor. Estes Termos, junto com a Política de Privacidade, constituem o acordo integral entre você e
          a SpaceNode quanto ao uso da Plataforma.
        </P>
      </LegalSection>

      <LegalSection n={17} title="Lei aplicável e foro">
        <P>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Para relações de consumo,
          fica assegurado o foro do domicílio do Usuário. Nos demais casos, fica eleito o foro da comarca da
          sede da {LEGAL_NAME}, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
        </P>
      </LegalSection>

      <LegalSection n={18} title="Contato">
        <P>
          Dúvidas sobre estes Termos podem ser enviadas pelos canais oficiais:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            {SUPPORT_EMAIL}
          </a>{' '}
          ou WhatsApp{' '}
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-primary)', textUnderlineOffset: 3 }}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
          .
        </P>
      </LegalSection>
    </LegalShell>
  )
}
