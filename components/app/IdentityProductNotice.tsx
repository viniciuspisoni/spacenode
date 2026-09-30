import Link from 'next/link'
import styles from './IdentityProductNotice.module.css'

export function IdentityProductNotice() {
  return (
    <aside className={styles.notice} aria-label="Nova identidade visual">
      <div>
        <span className={styles.label}>Nova identidade SpaceNode</span>
        <p>O projeto continua no centro de tudo.</p>
      </div>
      <Link href="/identidade">Conheça a nova identidade <span aria-hidden="true">↗</span></Link>
    </aside>
  )
}
