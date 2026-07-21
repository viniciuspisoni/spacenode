# SPACENODE — Conteúdo proibido

> Lista consolidada do que **nunca** entra em uma peça, orgânica ou paga. É a base do verificador
> automático (`lib/marketing/brand-check.ts` + tabela `marketing.brand_rules`, chave
> `prohibited_lexicon`). Fonte da verdade: `content-factory/brand-rules.md` §2–3.
> Mudou aqui → atualizar a seed/linha correspondente em `brand_rules`.

---

## 1. Léxico proibido (qualquer peça, qualquer contexto)

revolucionário(a), incrível/incríveis, mágico(a)/magia, alucinante(s), transforme,
transformador(a), potencialize, surreal, insano(a), chocante, inacreditável, game changer,
disruptivo(a), "o futuro chegou", "vai mudar tudo", segredo, hack, truque, turbine, alavanque,
desbloqueie, imperdível.

Frases-molde de marketing genérico de IA (proibidas):
- "transforme suas ideias"
- "potencialize sua criatividade"
- "eleve seus projetos"
- "tecnologia do futuro"
- "resultados mágicos"
- "deixe a IA criar por você"

Emojis proibidos em qualquer contexto: 🚀 🔥 🤯 ✨. Nenhum emoji em headline/anúncio/arte;
emoji pontual e sóbrio tolerado apenas em legenda orgânica.

## 2. Claims falsos (não reintroduzir — já removidos da landing)

- "Importação direta do SketchUp" / "plugin do SketchUp" — não existe. O correto: *upload de
  imagens/prints do modelo*.
- "Histórico de 30 dias" / "histórico ilimitado por plano" — não existe retenção por plano.
- Lumens como exclusividade do plano Office — disponíveis a partir do Pro.

## 3. Invenções (proibição absoluta)

- Inventar funcionalidade que não existe ou está desativada (conferir
  `lib/nav/modules-config.ts` — hoje: Isométricas, Prancha IA e Moodboard estão OFF).
- Inventar dado, número, métrica ou resultado ("90% mais rápido" sem medição real).
- Inventar depoimento, caso de uso ou cliente. Sem material real e autorização, o pilar de prova
  social espera.
- Citar preço, custo em nodes, quantidade de nodes grátis ou número de plano sem conferir o valor
  vigente no código.
- Prometer resultado de negócio garantido ("dobre suas aprovações", "feche mais contratos").

## 4. Posicionamentos proibidos

- Comunicar o SpaceNode como gerador genérico de imagens ou entretenimento com IA.
- Sugerir que a IA substitui o arquiteto ou cria o projeto ("deixe a IA criar por você").
- Atacar concorrente nominalmente; a crítica ao render genérico é técnica, com régua, e sem alvo
  nominal.
- Desmerecer renderistas/visualizadores profissionais (o alvo é a fila/espera, nunca a pessoa).
- Falar de "IA" como assunto principal — a tecnologia é meio; o assunto é o projeto.
- Antes/depois desonesto (projetos diferentes, "antes" maquiado, resultado que não veio da
  plataforma).

## 5. Visual proibido

Resumo do [`visual-guidelines.md`](./visual-guidelines.md) §5: gradientes neon, glow, partículas,
blobs, robôs, cérebros, circuitos, stock de tecnologia, mockups genéricos, emoji na arte, selos
"NOVO!!", grandes áreas verdes, headline verde, wordmark colorido, mais de 2 pesos de fonte,
redesenhar/reinterpretar imagem arquitetônica para caber no layout.

## 6. Dados e privacidade

- Nenhuma imagem/geração de usuário sem permissão registrada
  (`content_projects.permission_status = granted`).
- Nenhum dado pessoal de usuário em peça ou screenshot (nome, e-mail, saldo, projeto
  identificável sem autorização).
- Nenhum prompt interno, endpoint de provider, request id ou detalhe de stack em conteúdo público
  (inclusive em "bastidores").

## 7. Processo proibido

- Publicar sem revisão humana peça a peça (o sistema gera para revisão; **não publica**).
- Subir campanha paga ativa — mídia paga entra pausada e a ativação é decisão humana fora do
  sistema.
- Aprovar conteúdo pulando o verificador de marca ou ignorando issue bloqueante sem registro do
  motivo em `review_notes`.
