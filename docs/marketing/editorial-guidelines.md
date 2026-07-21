# SPACENODE — Diretrizes editoriais

> Regras operacionais de escrita e estrutura para todo conteúdo do sistema editorial.
> Precedência: [`content-factory/brand-rules.md`](../../content-factory/brand-rules.md) §2 (voz) e
> §4 (copy) vencem em caso de conflito. Limites numéricos são validados automaticamente pelo
> verificador de marca (`lib/marketing/brand-check.ts`).

---

## 1. Títulos e headlines

- **Headline na arte:** máx. 8 palavras. Uma ideia só. Sem ponto de exclamação.
- Título carrega um argumento específico, não uma promessa vaga: "Linhas de fuga no lugar" ✓;
  "Renderize melhor" ✗.
- Convenção tipográfica: minúsculas com ponto final são aceitas ("que respeita seu projeto.").
- Nunca headline em verde, nunca emoji em headline.

## 2. Legendas (estrutura e tamanho)

1. **Gancho na 1ª linha** — ≤125 caracteres (é o que aparece antes do "mais"). Deve funcionar
   sozinho.
2. **Corpo** — 2 a 4 parágrafos curtos. Um argumento por parágrafo. Frases curtas, voz ativa.
3. **CTA no fim** — um único CTA, da lista aprovada (§4).
4. **Hashtags na última linha** — ver §9.

Total da legenda: alvo de 400–900 caracteres. Legenda não repete a headline da arte — complementa.

## 3. Grau de linguagem técnica

- Vocabulário do ofício é bem-vindo e desejado: linhas de fuga, pé-direito, planta, corte,
  fachada, vista, prancha, escala, esquadria, setorização, especificação.
- Jargão de IA é evitado: não falar de modelo, prompt, inferência, "IA generativa" — falamos do
  resultado e do controle, não da tecnologia.
- Termo técnico usado precisa estar correto. Na dúvida, não usar.
- Explicar termo apenas quando o conteúdo é educativo para cliente final do arquiteto
  (pilar de apresentação); entre arquitetos, não se explica o óbvio.

## 4. CTAs

**Lista aprovada** (única fonte; qualquer outro CTA reprova na validação):
- "Renderize seu projeto"
- "Teste com um projeto real"
- "Comece agora"
- "Veja no seu próprio projeto"
- "Comece grátis"

Regras:
- Um CTA por peça. Destino: link na bio (orgânico) / botão do anúncio (pago).
- Não escrever URL na arte.
- Botões de anúncio Meta: apenas `SIGN_UP` ("Cadastre-se") ou `LEARN_MORE` ("Saiba mais").
- "Comece grátis" é válido (cadastro concede nodes gratuitos), mas **não** citar a quantidade sem
  conferir o valor vigente no código.

## 5. Estrutura de roteiros (Reels/vídeo)

- **Gancho nos primeiros 3 segundos — visual, não promessa.** Mostrar o resultado ou a tela real,
  não um texto "você não vai acreditar".
- Duração alvo: 15–30s.
- Estrutura: gancho visual → demonstração real (tela do produto, projeto real) → resultado →
  CTA único no encerramento.
- Texto em tela: mínimo. Headline + 1 apoio + CTA.
- Sem trilha "épica". Sem narração exagerada.
- Roteiro escrito cena a cena: `[cena] o que aparece na tela + texto em tela (se houver)`.

## 6. Carrosséis

- **5 slides, 1080×1350.**
- Slide 1 = gancho (a headline carrega sozinha — se o slide 1 não segura, a peça morre).
- Slides 2–4 = desenvolvimento, **um argumento por slide**.
- Slide 5 = fechamento + CTA.
- Título de slide: máx. 7 palavras. Corpo de slide: máx. 220 caracteres.
- Progressão lógica: o leitor que parar no slide 3 ainda levou valor.

## 7. Anúncios (Meta Ads — estrutura preparada, não ativa neste sprint)

- Texto primário: a primeira linha carrega (≤125 caracteres visíveis). Total até ~300.
- Título: **máx. 40 caracteres**. Descrição: **máx. 30 caracteres**.
- Sempre 3 variações por peça, cada uma com um ângulo diferente (ex.: fidelidade / prazo /
  apresentação ao cliente).
- Botão: `SIGN_UP` ou `LEARN_MORE`.
- Anúncio segue as mesmas regras de voz e claims do orgânico — não existe "voz de anúncio".

## 8. Stories

- Texto em tela mínimo: headline + 1 apoio + CTA.
- Tela real do produto ou imagem real de projeto; nunca stock.
- Sequências de mais de 3 stories precisam de arco (abertura → demonstração → CTA).

## 9. Hashtags

- **3 a 5 hashtags**, técnicas e de nicho, na última linha da legenda.
- Universo recomendado: #arquitetura #renderizacao #visualizacaoarquitetonica #archviz
  #designdeinteriores #projetodearquitetura #sketchup #render #apresentacaodeprojeto.
- Proibido: hashtags de hype (#ai #inteligenciaartificial #futuro #tech) e hashtags genéricas de
  alcance (#love #instagood).

## 10. Regras anti-repetição

- Antes de aprovar uma pauta, consultar os conteúdos anteriores (o painel e o serviço
  `findSimilarContent` fazem isso automaticamente ao criar briefing).
- Não repetir o mesmo ângulo do mesmo pilar num intervalo de 3 semanas; o mesmo tema pode voltar
  com **ângulo ou formato diferente**.
- Variação mínima entre peças do mesmo pilar: trocar o exemplo, a vista, o módulo demonstrado ou o
  argumento — nunca só sinônimos.
- Reuso de imagem: uma mesma imagem de projeto pode aparecer em peças diferentes só se o recorte
  ou a função dela mudar (ex.: antes/depois → zoom de detalhe).

## 11. Critérios de qualidade (checklist de produção)

Uma peça está pronta para revisão quando:

1. Headline ≤8 palavras com argumento específico.
2. Gancho ≤125 caracteres que funciona sozinho.
3. Zero palavras do léxico proibido; zero claims falsos.
4. Todo claim verificável (recurso ativo, número conferido, projeto real).
5. Um CTA, da lista aprovada.
6. Hashtags 3–5, técnicas.
7. Direção visual definida: qual imagem real, qual enquadramento, onde entra o verde funcional.
8. Imagens de projeto com permissão registrada (`content_projects.permission_status = granted`)
   quando forem de cliente/usuário.
9. Verificador de marca executado com score ≥ 80 e sem issues bloqueantes.

## 12. Critérios de aprovação (revisão humana)

O revisor aprova quando, além do checklist acima:

- A peça soa como arquiteto sênior falando com arquiteto (leitura em voz alta ajuda).
- A peça não poderia ser de um concorrente genérico de IA — se trocar o logo e ela continuar
  fazendo sentido para um gerador genérico, reprova.
- O antes/depois é honesto (mesmo projeto, insumo real → resultado real).
- A imagem valoriza o projeto original — nada foi redesenhado/reinterpretado para caber no layout.
- Não há promessa de resultado de negócio sem base ("dobre suas aprovações" ✗).

**A validação automática nunca substitui a aprovação humana final.** Fluxo completo em
[`content-workflow.md`](./content-workflow.md).
