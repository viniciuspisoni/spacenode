export default function FinalCTA() {
  return (
    <section className="spn-final">
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

      <h2 className="spn-final-title">
        comece em 30 segundos.
      </h2>

      <p className="spn-final-sub">
        Junte-se a arquitetos e designers de interiores que já economizam dias
        de trabalho por semana.
      </p>

      <div className="spn-final-ctas">
        <a
          href="/login"
          className="spn-final-primary"
          style={{
            background: "#f5f5f7",
            color: "#0a0a0a",
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
          Começar grátis →
        </a>
        <a
          href="#planos"
          className="spn-final-secondary"
          style={{
            color: "rgba(255,255,255,0.5)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            border: "0.5px solid rgba(255,255,255,0.1)",
            letterSpacing: "-0.005em",
            transition: "border-color 0.2s",
          }}
        >
          Ver planos
        </a>
      </div>

      <p style={{ color: "#6e6e73", fontSize: 11, marginTop: 4 }}>
        12 nodes grátis · sem cartão de crédito · cancele quando quiser
      </p>

      <style jsx>{`
        .spn-final {
          padding: 140px 40px;
          background: #0a0a0a;
          color: #fff;
          text-align: center;
        }
        .spn-final-title {
          color: #f5f5f7;
          font-size: clamp(32px, 5.5vw, 48px);
          font-weight: 400;
          letter-spacing: -0.04em;
          margin: 20px 0;
          line-height: 1.1;
        }
        .spn-final-sub {
          color: #86868b;
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
          .spn-final-title {
            font-size: 30px;
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
