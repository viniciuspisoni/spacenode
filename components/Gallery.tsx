const styles = [
  { name: "contemporâneo", gradient: "linear-gradient(145deg, #d4c5a9 0%, #8b7355 100%)" },
  { name: "escandinavo", gradient: "linear-gradient(145deg, #e8e4df 0%, #a39e96 100%)" },
  { name: "industrial", gradient: "linear-gradient(145deg, #3d4a5c 0%, #1a2332 100%)" },
  { name: "tropical", gradient: "linear-gradient(145deg, #b8a888 0%, #6b5d45 100%)" },
  { name: "serrano", gradient: "linear-gradient(145deg, #c8b896 0%, #7d6b4a 100%)" },
  { name: "minimalista", gradient: "linear-gradient(145deg, #d8d0c4 0%, #918878 100%)" },
  { name: "biofílico", gradient: "linear-gradient(145deg, #8b9b8e 0%, #3d4d40 100%)" },
  { name: "rústico BR", gradient: "linear-gradient(145deg, #a89578 0%, #5b4d35 100%)" },
];

export default function Gallery() {
  return (
    <section
      id="galeria"
      style={{
        padding: "80px 40px",
        borderTop: "0.5px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 64px" }}>
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              fontWeight: 500,
              display: "inline-block",
              marginBottom: 16,
            }}
          >
            GALERIA
          </span>
          <h2
            style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 400,
              letterSpacing: "-0.04em",
              margin: "0 0 16px",
              lineHeight: 1.1,
            }}
          >
            visuais feitos por profissionais reais.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-tertiary)",
              lineHeight: 1.55,
            }}
          >
            Criados na plataforma por arquitetos e designers do beta. Zero pós-produção.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {styles.map((s) => (
            <div
              key={s.name}
              style={{
                aspectRatio: "1",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                background: s.gradient,
                transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <span
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 14,
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "#fff",
                  textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                }}
              >
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
