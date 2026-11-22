'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef } from 'react'
import { Projects } from '@/components/landing/Projects'
import { EditorialTools } from '@/components/landing/EditorialTools'
import { EditorialPricing } from '@/components/landing/EditorialPricing'
import LpViewPing from '@/components/marketing/LpViewPing'
import { track } from '@/lib/analytics/client'
import { FREE_SIGNUP_NODES } from '@/lib/plans'
import { LEGAL_NAME, LEGAL_CNPJ, SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from '@/lib/support'
import styles from './home.module.css'

const signup = '/login?mode=signup&next=%2Fapp%2Fgenerate'
const landing = 'home-editorial-v2'
const navigation = [
  { href: '#projetos', label: 'Projetos' },
  { href: '#produto', label: 'Plataforma' },
  { href: '#planos', label: 'Planos' },
]

function Navigation() {
  const menu = useRef<HTMLDetailsElement>(null)
  const links = navigation.map(item => <a href={item.href} key={item.href}>{item.label}</a>)

  return (
    <header className={styles.header} data-cta-position="navigation">
      <div className={styles.navinner}>
        <Link className={styles.wordmark} href="/" aria-label="SpaceNode, início">
          <Image src="/brand/spacenode-logo-horizontal-dark.svg" width={145} height={27} alt="SpaceNode" />
        </Link>
        <nav className={styles.desktopNav} aria-label="Navegação principal">{links}</nav>
        <div className={styles.navActions}>
          <a href="/login" className={styles.login}>Entrar</a>
          <a className={styles.navButton} href={signup}>Começar agora</a>
          <details className={styles.mobileMenu} ref={menu} onKeyDown={event => {
            if (event.key === 'Escape' && menu.current) {
              menu.current.open = false
              menu.current.querySelector('summary')?.focus()
            }
          }}>
            <summary aria-label="Menu de navegação"><span /><span /></summary>
            <nav aria-label="Navegação móvel" onClick={() => { if (menu.current) menu.current.open = false }}>{links}</nav>
          </details>
        </div>
      </div>
    </header>
  )
}

const questions = [
  {
    title: 'Posso começar com um print do meu modelo?',
    answer: 'Sim. Envie uma vista exportada do SketchUp, Revit, Archicad ou outro modelador. No navegador, você escolhe luz, materiais e estilo. O plugin do SketchUp também permite enviar a vista direto do modelo.',
  },
  {
    id: 'tecnologias',
    title: 'Que tecnologias estão integradas?',
    answer: 'A SpaceNode integra modelos do Google, OpenAI e BytePlus para criação e edição, Kling e Veo para vídeo e Topaz para ampliação. Para blocos 3D, há opções de Tripo, Hyper3D e Meshy. Você pode começar com as configurações sugeridas para cada tarefa.',
  },
  {
    title: 'Como confiro a fidelidade ao projeto?',
    answer: 'Compare o render com a vista original e confira aberturas, mobiliário, proporções e acabamentos. A IA pode interpretar detalhes de outra forma. Você pode refinar a imagem antes de apresentá-la.',
  },
  {
    title: 'Posso usar os renders em apresentações comerciais?',
    answer: 'Sim. Você pode usar as imagens e os vídeos gerados em apresentações para clientes, portfólio e materiais de divulgação. Nos planos Pro e Studio, o link da apresentação pode levar a marca do seu escritório.',
  },
  {
    title: 'Como funciona o primeiro teste?',
    answer: `O cadastro inclui ${FREE_SIGNUP_NODES} Nodes para experimentar, sem cartão e sem assinatura automática. Nodes são os créditos usados para gerar imagens e vídeos. O consumo varia por ferramenta e resolução e aparece antes de confirmar.`,
  },
]

export default function Home() {
  return (
    <div className={styles.page} onClick={event => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      const url = new URL(link.href)
      if (url.origin === window.location.origin && url.pathname === '/login' && url.searchParams.get('mode') === 'signup') {
        track('cta_clicked', { lp: landing, cta: link.closest('[data-cta-position]')?.getAttribute('data-cta-position') ?? 'navigation' })
      }
    }}>
      <a href="#conteudo" className={styles.skip}>Pular para o conteúdo</a>
      <Navigation />
      <LpViewPing slug={landing} />
      <main id="conteudo">
        <section className={styles.hero} data-cta-position="hero">
          <div>
            <p className={styles.discipline}>Visualização arquitetônica com IA</p>
            <h1>Seu projeto,<br />em outra luz.</h1>
          </div>
          <div className={styles.heroLead}>
            <p>Transforme uma vista do seu modelo em render. Explore luz e materiais, refine os detalhes e leve o ambiente em imagem ou vídeo para a reunião com o cliente.</p>
            <a className={styles.primary} href={signup}>Testar no meu projeto</a>
            <small>{FREE_SIGNUP_NODES} Nodes de teste · sem cartão</small>
          </div>
        </section>
        <Projects />
        <EditorialTools />
        <EditorialPricing />
        <section className={styles.faq} id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Perguntas <br />frequentes.</h2>
          <div>{questions.map(question =>
            <details key={question.title} id={question.id}>
              <summary>{question.title}<span aria-hidden="true" /></summary>
              <p>{question.answer}</p>
            </details>
          )}</div>
        </section>
        <section className={styles.close} data-cta-position="final">
          <div className={styles.closeInner}>
            <h2>Experimente com<br />um projeto seu.</h2>
            <div><a className={styles.primaryLight} href={signup}>Testar no meu projeto</a><small>{FREE_SIGNUP_NODES} Nodes de teste · sem cartão</small></div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" aria-label="SpaceNode, início"><Image src="/brand/spacenode-logo-horizontal.svg" width={133} height={25} alt="SpaceNode" /></Link>
          <nav aria-label="Contato e informações"><a href="/sketchup">Plugin SketchUp</a><a href={SUPPORT_WHATSAPP_URL}>WhatsApp</a><a href={`mailto:${SUPPORT_EMAIL}`}>Contato</a><a href="https://instagram.com/spacenode.app">Instagram</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a></nav>
          <small>{LEGAL_NAME} · CNPJ {LEGAL_CNPJ}</small>
        </div>
      </footer>
    </div>
  )
}
