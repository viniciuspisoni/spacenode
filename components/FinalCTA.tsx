"use client";

export default function FinalCTA() {
  const scrollToWaitlist = () => {
    const el = document.getElementById("waitlist");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      style={{
        padding: "140px 40px",
        background: "#0a0a0a",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "#6e6e73",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 20,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#30d158",
            boxShadow: "0 0 8px rgba(48,209,88,0.5)",
          }}
        />
        PRÓXIMO PROJETO
      </span>

      <h2
        style={{
          color: "#f5f5f7",
          fontSize: "clamp(32px, 5.5vw, 48px)",
          fontWeight: 400,
          letterSpacing: "-0.04em",
          margin: "20px 0",
          lineHeight: 1.1,
        }}
      >
        comece em 30 segundos.
      </h2>

      <p
        style={{
          color: "#86868b",
          fontSize: 15,
          maxWidth: 480,
          margin: "0 auto 36px",
          lineHeight: 1.55,
        }}
      >
        Junte-se aos arquitetos que já economizam dias de trabalho por semana.
      </p>

      <button
        onClick={scrollToWaitlist}
        style={{
          background: "#f5f5f7",
          color: "#0a0a0a",
          borderRadius: 12,
          padding: "15px 28px",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "transform 0.2s",
        }}
      >
        Entrar no beta →
      </button>

      <p style={{ color: "#6e6e73", fontSize: 11, marginTop: 16 }}>
        3 renders grátis · sem cartão de crédito
      </p>
    </section>
  );
}
