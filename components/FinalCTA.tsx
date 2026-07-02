export default function FinalCTA() {
  return (
    <section className="spn-final">
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "var(--color-text-tertiary)",
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
            background: "var(--color-accent-green)",
            boxShadow: "0 0 8px var(--color-accent-green-glow)",
          }}
        />
        PRÓXIMO PROJETO
      </span>

      <h2 className="spn-final-title">
        apresente melhor seus projetos,{" "}
        <br className="spn-final-br" />
        sem perder o controle sobre eles.
      </h2>

      <p className="spn-final-sub">
        Comece com uma imagem base e veja o que muda no fluxo de visualização
        do seu escritório.
      </p>

      <div className="spn-final-ctas">
        <a
          href="/login?mode=signup"
          className="spn-final-primary"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            textDecoration: "none",
            transition: "opacity 0.2s",
          }}
        >
          Começar agora →
        </a>
        <a
          href="#planos"
          className="spn-final-secondary"
          style={{
            color: "var(--color-text-secondary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            border: "0.5px solid var(--color-border)",
            letterSpacing: "-0.005em",
            transition: "border-color 0.2s",
          }}
        >
          Ver planos
        </a>
      </div>

      <p style={{ color: "var(--color-text-tertiary)", fontSize: 11, marginTop: 4 }}>
        40 nodes grátis · sem cartão de crédito · sem compromisso
      </p>

      <style jsx>{`
        .spn-final {
          padding: 140px 40px;
          background: var(--color-bg);
          color: var(--color-text-primary);
          text-align: center;
        }
        .spn-final-title {
          color: var(--color-text-primary);
          font-size: clamp(28px, 4.5vw, 42px);
          font-weight: 400;
          letter-spacing: -0.04em;
          margin: 20px 0;
          line-height: 1.15;
        }
        .spn-final-sub {
          color: var(--color-text-secondary);
          font-size: 15px;
          max-width: 480px;
          margin: 0 auto 36px;
          line-height: 1.55;
        }
        .spn-final-ctas {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .spn-final-primary {
          padding: 15px 28px;
          font-size: 13px;
          min-height: 52px;
        }
        .spn-final-secondary {
          padding: 15px 22px;
          font-size: 13px;
          min-height: 52px;
        }

        @media (max-width: 768px) {
          .spn-final {
            padding: 80px 20px 200px;
          }
          .spn-final-br {
            display: none;
          }
          .spn-final-title {
            font-size: 26px;
            margin: 18px 0;
          }
          .spn-final-sub {
            font-size: 14px;
            margin: 0 auto 28px;
          }
          .spn-final-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            margin-bottom: 18px;
          }
          .spn-final-primary,
          .spn-final-secondary {
            width: 100%;
            padding: 16px 22px;
            font-size: 15px;
            min-height: 54px;
          }
        }
      `}</style>
    </section>
  );
}
