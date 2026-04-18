export default function Footer() {
  return (
    <footer
      style={{
        padding: "32px 40px",
        borderTop: "0.5px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        background: "#0a0a0a",
        color: "#6e6e73",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          fontWeight: 500,
        }}
      >
        SPACENODE · 2026
      </span>

      <div
        style={{
          display: "flex",
          gap: 24,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        <a
          href="/termos"
          style={{ transition: "color 0.2s", cursor: "pointer" }}
        >
          TERMOS
        </a>
        <a
          href="/privacidade"
          style={{ transition: "color 0.2s", cursor: "pointer" }}
        >
          PRIVACIDADE
        </a>
        <a
          href="mailto:contato@spacenode.app"
          style={{ transition: "color 0.2s", cursor: "pointer" }}
        >
          CONTATO
        </a>
        <a
          href="https://instagram.com/spacenode.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{ transition: "color 0.2s", cursor: "pointer" }}
        >
          INSTAGRAM
        </a>
      </div>
    </footer>
  );
}
