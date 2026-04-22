"use client";

import { useState } from "react";

export default function Hero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section
      id="waitlist"
      style={{
        padding: "120px 40px 64px",
        textAlign: "center",
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 24,
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
        BETA ABERTO
      </span>

      <h1
        style={{
          fontSize: "clamp(32px, 6vw, 56px)",
          fontWeight: 400,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          margin: "24px 0",
          color: "var(--color-text-primary)",
        }}
      >
        renders fotorrealistas
        <br />
        <span style={{ color: "var(--color-text-tertiary)" }}>
          em segundos, não dias.
        </span>
      </h1>

      <p
        style={{
          fontSize: 17,
          color: "var(--color-text-secondary)",
          lineHeight: 1.55,
          margin: "0 auto 40px",
          maxWidth: 560,
        }}
      >
        A plataforma de visualização arquitetônica feita por arquiteto, para
        arquitetos. Transforme sketches, plantas ou modelagens 3D em imagens de
        apresentação em segundos.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          maxWidth: 480,
          margin: "0 auto 16px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          required
          disabled={status === "loading" || status === "success"}
          style={{
            flex: 1,
            minWidth: 220,
            padding: "14px 18px",
            fontSize: 14,
            borderRadius: 12,
            border: "0.5px solid var(--color-border-strong)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg)",
            borderRadius: 12,
            padding: "14px 24px",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {status === "loading"
            ? "Enviando..."
            : status === "success"
              ? "Adicionado ✓"
              : "Entrar no beta →"}
        </button>
      </form>

      {status === "success" && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-accent-green)",
            margin: "12px 0 0",
          }}
        >
          Você está na lista. Em breve você recebe o acesso.
        </p>
      )}
      {status === "error" && (
        <p style={{ fontSize: 12, color: "#E24B4A", margin: "12px 0 0" }}>
          Algo deu errado. Tenta de novo?
        </p>
      )}

      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          display: "flex",
          justifyContent: "center",
          gap: 14,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <span>3 renders grátis ao entrar</span>
        <span>·</span>
        <span>sem cartão de crédito</span>
        <span>·</span>
        <span>em português</span>
      </div>
    </section>
  );
}
