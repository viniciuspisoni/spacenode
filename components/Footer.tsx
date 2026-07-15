import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from '@/lib/support'

export default function Footer() {
  return (
    <footer className="spn-footer">
      <span className="spn-footer-brand">
        spacenode · 2026
      </span>

      <div className="spn-footer-links">
        <a href="/termos">TERMOS</a>
        <a href="/privacidade">PRIVACIDADE</a>
        <a href={`mailto:${SUPPORT_EMAIL}`}>CONTATO</a>
        <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WHATSAPP</a>
        <a href="https://instagram.com/spacenode.app" target="_blank" rel="noopener noreferrer">INSTAGRAM</a>
      </div>

      <style jsx>{`
        .spn-footer {
          padding: 32px 40px;
          border-top: 0.5px solid rgba(255,255,255,0.06);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          background: #0a0a0a;
          color: #6e6e73;
        }
        .spn-footer-brand {
          font-size: 11px;
          letter-spacing: -0.01em;
          font-weight: 400;
        }
        .spn-footer-links {
          display: flex;
          gap: 24px;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .spn-footer-links a {
          transition: color 0.2s;
          cursor: pointer;
        }
        .spn-footer-links a:hover {
          color: var(--color-text-primary);
        }

        @media (max-width: 768px) {
          .spn-footer {
            flex-direction: column;
            padding: 28px 20px 120px;
            gap: 20px;
            text-align: center;
          }
          .spn-footer-links {
            gap: 14px 20px;
            flex-wrap: wrap;
            justify-content: center;
          }
        }
      `}</style>
    </footer>
  );
}
