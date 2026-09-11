# QA — 2026-09-08-reel-tutorial-instalar-o-plugin

Tutorial de instalacao: do site ate o primeiro render dentro do SketchUp.

Fontes:
- Hero e botao "Baixar a extensao (.rbz) · v0.9.0 · Windows e macOS": pagina /sketchup em
  producao, capturada hoje (viewport 900x1400, dSF 2).
- Os 3 passos sao o bloco "COMO INSTALAR" da propria pagina, recortado sem edicao de texto.
- Painel conectado, time-lapse da geracao e painel com o resultado: capturas REAIS do
  SketchUp Pro 2022 do dono, feitas em 2026-09-07 (render de716672, 28 nodes autorizados).
  E-mail do dono mascarado em todos os quadros.

Claims conferidos:
- "instale em 3 passos" — a pagina lista exatamente 3. OK.
- "a extensao e gratis" — a pagina diz "Gratis — os renders usam os Nodes da sua conta". OK.
- "o custo aparece no botao antes de clicar" — o botao do painel mostra "28 nodes". Visivel no quadro. OK.
- "sketchup 2021+" — a pagina diz "SketchUp 2021 ou superior (recomendamos 2024+)". OK.
- Nao promete tempo de geracao (a geracao real levou 2min27 e o time-lapse e acelerado).
- probe: 1080x1920, 30fps, h264, 12,00 s, 0,96 MB.

Pendencia herdada: o .rbz ainda nao esta assinado no Extension Signature Portal da Trimble.
Quem estiver com "Identified Extensions Only" no SketchUp nao consegue instalar.

## Correcao aplicada (revisao adversarial do workflow wf_a9e08de5-dfe)

`docs/marketing/prohibited-content.md` §6 proibe saldo em screenshot. A primeira versao
mostrava o saldo do dono no painel. Foram mascarados, com a cor de fundo da propria UI:
- a pilula de saldo no cabecalho (fica "nodes Recarregar", sem numero);
- a linha "seu saldo da para ~N renders nessa configuracao";
- a linha "N nodes restantes" no rodape.
O custo da acao ("28 nodes" no botao Gerar render) foi PRESERVADO — e o que o tutorial ensina.
Mascaras aplicadas nas duas capturas de painel e em todos os quadros do time-lapse.

Pendencia: os dois Reels de 2026-09-07 (plugin-no-sketchup e plugin-render-real) ainda
mostram o saldo. Mesma correcao se aplica; regenerar com os assets `-sem-saldo`.
