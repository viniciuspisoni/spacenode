# Qualificação dos 70 perfis do banco — 2026-09-11

**Nada foi seguido, curtido, comentado ou enviado nesta etapa.** Os 30 follows do dia já estavam
gastos. Isto é só leitura e classificação.

Os 70 perfis que ficaram em `a-qualificar-bio` hoje de manhã estão **todos qualificados agora**,
com a bio lida uma a uma. Não precisei da API: `header.innerText` da página do perfil traz nome,
seguidores, posts e a bio inteira, e o endpoint `users/web_profile_info/` continuou em 429 a
sessão inteira.

Planilha: **465 → 483 linhas**.

---

## 1. O resultado em uma tabela

| Classificação | Quantos | O que é |
|---|---|---|
| **Estudante de arquitetura** | 26 | "Arq e Urb 4/10", "8/10", UFPel, UFMG, UFF, USJT, UFOP… |
| **Descartado** | 19 | bio vazia, fora do ramo ou fora do Brasil |
| **Profissional, fila de follow** | 13 | atua, tem escritório ou serviço |
| **Tem conta profissional separada** | 9 | a pessoal não é o alvo — a de trabalho é |
| **Fora do Brasil, mas do ramo** | 2 | Angola e Itália |
| **Parceria** | 1 | @protagonistadamarcenaria, 47,6 mil seguidores |

---

## 2. O achado que muda a fonte de prospecção: 37% são estudantes

**26 dos 70 são estudantes de graduação.** Não é ruído — são arquitetos em formação, usam SketchUp
todo dia e um dia compram. Mas hoje não têm cliente, não têm orçamento e não têm projeto para
apresentar, que é o problema que o SPACENODE resolve.

Isso explica uma coisa que vinha incomodando: **a isca "comenta EU QUERO e eu te mando"
seleciona quem tem tempo e não tem dinheiro.** Quanto mais barato é comentar, mais o público
pende para estudante. Os comentários técnicos do @fabiocoutinho.sketchup ("rodapé invertido",
"esquadria") vieram de profissionais; os "eu quero" em massa do @maikelle.ssilva vieram de
estudantes.

**O que fazer com eles:** seguir sim, DM de venda não. Eles servem para o algoritmo entender que
a conta é de arquitetura, e são audiência real para o conteúdo de tutorial. Ficaram com status
`estudante-seguir` e tier `E`, separados justamente para não entrarem em lote de DM por engano.

---

## 3. O achado que rende público novo: a conta profissional mora em outro @

**17 dos 70 citavam na bio uma segunda conta, a de trabalho** — e **nenhuma das 17 estava na
planilha**. Seguir a conta pessoal era seguir o lugar errado: é onde a pessoa posta viagem,
namorado e versículo. O projeto está na outra.

Conferi as 17 uma a uma. **11 são contas de trabalho reais**, e entraram na planilha como perfis
novos:

| Conta | O que é | Seguidores / posts | Veio da bio de |
|---|---|---|---|
| **@tgarquitetura** | TG Arquitetura, projetos autorais, Tamires Barretto | **5.873 / 188** | @gracearroxelas |
| **@studiolimarquitetura** | Escritório, arquitetura contemporânea SC/SP | **3.493 / 473** | @_sofiabueno |
| **@iullymaiaarquitetura** | Iully Maia, Arquitetura e Interiores | **2.374 / 667** | @iullymaia |
| **@gustavpinhe** | Arte e Design de Interiores, SP, atendimento online | 633 / 93 | @theeegust |
| **@arquitetadaniguedes** | Danielle Guedes, projeto arquitetônico | 582 / 82 | @guedesdani |
| **@vcpan.arq** | Vivian Cortez Pancheri, SP | 251 / 38 | @vcpancheri |
| **@maiarquitetura** | Maia Arquitetura, Fortaleza | 250 / 33 | @tuliomoliveiraa |
| **@studio98.render** | **RENDER 3D como serviço** — "te ajudo a apresentar seus projetos" | 242 / 22 | @beattriznobre |
| **@arq.thauanaavila** | Thauana Ávila, arquiteta freelancer | 200 / 8 | @taata_avila |
| **@liviatozi.interiores** | Lívia Tozi, designer de interiores | 128 / 5 | @lliviatozi |
| **@fvarquiteturadesign** | Fernanda Vieira, conta recém-criada | 25 / 1 | @fernandavie_ |

As outras 6: 3 são portfólios de estudante (@sabrinabispoarq, @archraissa, @arq_taysareck), 1 é
de Angola (@arqspire04), e 2 estão mortas ou vazias (@beatriznobrearquitetura com 0 posts e 2
seguidores, @obras.almeida sem bio).

**@studio98.render é o caso a olhar com atenção:** é a Beatriz Nobre vendendo render como
serviço. Não é compradora de assinatura no fluxo normal — ou é concorrente, ou é a pessoa para
quem a ferramenta vale mais do que para qualquer arquiteto, porque ela cobra por imagem. Não
mandar DM de venda padrão.

**Isso vira uma fonte de prospecção nova, e melhor que a atual:** ler a bio de quem já está na
planilha e seguir a conta de trabalho citada. Taxa de acerto hoje: 11 profissionais em 17
tentativas, contra 13 profissionais em 70 comentaristas minerados. **Quatro vezes mais eficiente**,
e sem depender de achar post-isca.

Os dois escritórios maiores (@tgarquitetura e @studiolimarquitetura) também são mina em si: quem
segue um escritório de arquitetura pequeno é, em boa parte, gente do ramo.

---

## 4. Os 19 descartados, com motivo

Confirmam que a peneira por bio é obrigatória:

- **@vinicius.paes1** — acadêmico de **Psicologia** (comentou 😍 num post de SketchUp)
- **@anateresafranco** — **agente imobiliário em Torres Vedras, Portugal**
- **@achadinhosasreis** — loja de achadinhos e acessórios
- **@gabocoramdeo** — estúdio de render **hispanofalante**
- **@metegkc** — *interior architect* **turco**
- **@alejo0702.arq** — sem bio, 215 seguidores e **5.641 seguindo**: perfil de consumo
- 13 outros com bio vazia ou puramente pessoal

Dois ficaram em `observar` por serem do ramo mas fora do mercado: **@emer_slv** (Arq & Urb em
Angola) e **@ana_cechin** (arquiteta brasileira com modelagem 3D e render, morando em **Ascoli
Piceno, Itália** — perfil perfeito, mercado errado).

---

## 5. Como está a fila agora

| Fila | Perfis prontos |
|---|---|
| `fila-follow-qualificado` (bio conferida hoje) | 24 |
| `fila-follow-sketchup` (rodada de manhã) | 20 |
| **Total pronto para seguir, tier A/B/C** | **44** (28 deles tier A) |
| `estudante-seguir` (seguir, nunca DM de venda) | 29 |
| Tier-1 antigo parado (comentaristas de IA) | 65 |
| Pool total sem follow e não descartado | **294** |

Com teto de ~25 follows úteis por dia, **isso é quase duas semanas de fila sem precisar minerar
nada**. A prospecção nova pode parar por uns dias sem prejuízo.

---

## 6. Sugestão de ordem

| Dia | Quem | Por quê |
|---|---|---|
| Sábado 12 | 11 contas profissionais novas + 13 profissionais do banco | maior densidade de profissional atuante da planilha inteira |
| Segunda 14 | Tier-1 antigo (aarquitetablog, human___academy) | intenção declarada, esfriando há 3 dias |
| Terça 15 | Fila A e B do SketchUp (20) | @fabiocoutinho e @maikelle |
| Quarta 16 | Estudantes (29), em lote | audiência de algoritmo, sem DM |

---

## 7. Duas mudanças que valem para a rotina da manhã

1. **Qualificar pelo DOM, não pela API.** A tarefa hoje depende de `web_profile_info`, que fica em
   429 quase todo dia depois das primeiras chamadas. Ler `header.innerText` do perfil não tem esse
   limite. Custa ~4 s por perfil e **tem que clicar em "mais" antes de ler** — a bio truncada
   esconde justamente a parte da profissão, como aconteceu com a @manuu_myranda hoje de manhã.
2. **Ler a bio procurando um segundo @.** Quando a pessoa cita a própria conta profissional, o
   alvo é aquela, não a que comentou. Só hoje isso rendeu 11 perfis que nenhuma mineração tinha
   achado.
