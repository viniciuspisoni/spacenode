# Vidro no app — o contrato

O painel v1 do plugin (`sketchup/spacenode/dialog.html`) definiu a cara nova da
SPACENODE. A landing (PR #184) trouxe o material para o navegador. Este
documento é o contrato de como o `/app` usa esse mesmo sistema — e como ele
resolve o segundo problema, que é de **uso**, não de aparência.

## 1. O que já existe (não reinvente)

Tudo mora em `app/globals.css`. Não há componente de estilo novo por tela.

### Material

| Classe | Quando |
|---|---|
| `.spn-glass` | Superfície padrão: cartões, listas de linhas, folhas. |
| `.spn-glass--chrome` | Cromo fixo que precisa segurar leitura: sidebar, dock, cabeçalho de folha. |
| `.spn-glass--raised` | Controle elevado apoiado noutra superfície: botão, pílula, polegar do segmentado. |

Os três já degradam para superfície sólida em `@supports not (backdrop-filter)`
e em `prefers-reduced-transparency: reduce`. **É por isso que `backdropFilter`
inline está proibido**: um estilo inline não é alcançado por esses fallbacks.
Se você encontrar um, troque pela classe.

### Tokens

`--glass*`, `--ambient-*`, `--shadow-float`, `--shadow-sheet`, `--ease`,
`--r-card` (18px), `--r-inner` (12px). Nunca escreva `cubic-bezier(...)`,
`borderRadius: 18` ou uma sombra literal: use o token.

### Primitivas (classes)

`.spn-group` + `.spn-row` · `.spn-sheet` + `.spn-scrim` · `.spn-seg` ·
`.spn-pills`/`.spn-pill` · `.spn-choices`/`.spn-choice` · `.spn-cta` ·
`.spn-ghost` · `.spn-dock` · `.spn-card` · `.spn-tool` (casca painel+palco) ·
`.spn-cost` (rodapé de custo) · `.spn-balance` · `.spn-empty` · `.spn-error` ·
`.spn-field-label` · `.spn-hint` · `.spn-textarea`/`.spn-input` ·
`.spn-icon-btn` · `.spn-overlay`.

### Componentes (`components/app/glass/`)

`Ambient` / `setAmbient` / `useAmbient`, `Sheet`, `SettingGroup`,
`SettingRow`, `summarize`, `Segmented`, `PillGroup`, `MultiPillGroup`,
`ChoiceGroup`, `RowIcon`.

## 2. Regras que não se negociam

1. **Vidro precisa de papel de parede.** `<Ambient/>` já está no
   `app/app/layout.tsx`. Uma tela que tenha uma imagem em foco (o render que
   saiu, a vista aberta) chama `useAmbient(url)` — o papel passa a ser aquela
   imagem, como no plugin.
2. **Texto corrido não fica sobre o papel de parede.** Sobre o papel só
   sobrevive título, rótulo de seção e linha curta. Parágrafo, lista e tabela
   vão sobre vidro. O terciário já está levantado no escopo `.spn-app`, mas
   isso compra ~4,3:1, não mais.
3. **Um CTA primário só.** `.spn-cta` (inverso). O verde `#1D9E75` espalhado
   pelo Spaces sai. Verde é **estado**, nunca ação.
4. **Uma caixa de erro só.** `.spn-error`. As versões com `rgba(163,45,45,…)`
   hardcoded saem — elas não respondem a tema.
5. **Nada de `alert`/`confirm`/`prompt`.** Vira `Sheet`.
6. **Não coloque vidro sobre canvas que repinta em rAF** (Blocos 3D,
   Finalizar, RetocarCanvas). Painel ao LADO do canvas pode ser vidro; painel
   POR CIMA, não — use `.spn-glass` só se o canvas estiver parado.

## 3. A simplificação — o que o pedido realmente quer

O plugin não é mais simples por ter menos recursos. Ele é mais simples porque
**quase tudo já vem decidido**, e a configuração fica atrás de quatro linhas
que mostram o valor atual:

```
┌────────────────────────────────────────────────┐
│ ▣  Cena          Residencial · Sala de Estar  › │
│ ☀  Luz                    Preservar original  › │
│ ▤  Materiais         Preservar do original    › │
│ ✦  Saída            Vega · 2K · 20 nodes      › │
└────────────────────────────────────────────────┘
```

Como portar uma tela:

1. **Agrupe** os campos em 2 a 4 famílias coerentes. Uma família é um
   assunto ("Cena", "Luz", "Câmera", "Saída"), não uma gaveta de sobras.
2. **Escolha o default certo.** Toda família tem de funcionar sem ninguém
   tocar nela. Se um campo não tem default defensável, ele não pertence à
   folha — ou o produto tem um problema anterior ao layout.
3. **Escreva o resumo** com `summarize([...])`, que junta com `·` e descarta
   vazio. Regra do que entra: o que o usuário ESCOLHEU. Um valor que é
   "preservar o original" só entra se for a única coisa a dizer.
4. **Deixe na superfície** só o que reconfigura tudo o mais (o eixo
   Exterior/Interior, o tipo de vídeo, o objetivo da ampliação) — e como
   segmentado de 30px, não como cartão de 78px.
5. **O CTA vive num `.spn-dock`**, colado no rodapé do painel. O botão de
   gerar nunca some no scroll — foi por não existir isso que o Renderizar
   precisou de um "Ir para Gerar render" com animação de pulso.

O que NÃO fazer: esconder um campo obrigatório dentro de uma folha. Se o
usuário precisa preencher para o botão habilitar, ele fica na superfície.

## 4. Contrato de API

**Nenhuma mudança de payload.** Esta é uma reforma de apresentação: todo
campo que hoje viaja para `/api/generate`, `/api/video`, `/api/upscale`,
`/api/edit` continua viajando com o mesmo nome e o mesmo tipo. O que muda é
onde o usuário o encontra. Campos hoje fixos no cliente (`fidelityLevel`,
`geometryLock`) continuam fixos — expor não é o assunto deste trabalho.
