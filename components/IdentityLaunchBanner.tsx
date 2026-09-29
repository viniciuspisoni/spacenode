import Link from 'next/link'
import styles from './IdentityLaunchBanner.module.css'

export function IdentityLaunchBanner() {
  return (
    <aside className={styles.banner} aria-label="Nova identidade visual da SpaceNode">
      <Link href="/identidade" className={styles.link}>
        <span className={styles.label}>Nova identidade SpaceNode</span>
        <span className={styles.copy}>A arquitetura continua em primeiro plano.</span>
        <span className={styles.action}>Conheça <span aria-hidden="true">↗</span></span>
      </Link>
    </aside>
  )
}
