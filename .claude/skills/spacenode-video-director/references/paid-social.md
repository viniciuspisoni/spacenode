# Orgânico vs pago, hooks e variantes

Um Reel bonito **não é** automaticamente um bom anúncio. As duas peças têm
objetivos diferentes e por isso montagens diferentes.

Para hook craft e taxonomia de formato, invoque a skill `ad-creative`
(`references/hook-system.md`, `references/short-form-video-specs.md`,
`references/meta-creative-formats.md`). Para estratégia de campanha, `meta-ads`.
Este arquivo é o que essas skills não sabem: como a SpaceNode faz.

---

## 1. A separação

| | ORGÂNICO | PAGO |
|---|---|---|
| Objetivo | atenção, autoridade, salvamento | cadastro, assinatura |
| Primeiros 2s | podem intrigar | têm que **entregar** |
| Texto | pode ser mínimo | precisa carregar o benefício |
| Beleza | é o produto | é o meio |
| CTA | "teste grátis no link da bio" | vem do botão do Meta; o vídeo carrega o benefício |
| Áudio | entra no app do Instagram | tem que funcionar **mudo** |
| Fecho | card de marca | card com o benefício + prova |
| Sucesso | shares, saves, follows | CPL, custo por assinatura |

**Prioridades em orgânico:** estética, compartilhabilidade, curiosidade, marca,
satisfação visual, educação, novidade.

**Prioridades em pago:** hook em 0–2s, clareza, benefício, demonstração,
resultado, prova, retenção, CTA, performance.

## 2. Anúncio tem que funcionar mudo

A maioria vê sem som. O vídeo precisa ser compreensível só com imagem e texto na
tela. Isso muda a montagem: em pago o texto não é enfeite, é a narração.

## 3. O hook em 0–2s

Três coisas ao mesmo tempo, no primeiro segundo:
1. **pattern interrupt visual** — algo que não parece anúncio de SaaS;
2. **relevância imediata** — o espectador reconhece que é sobre o trabalho dele;
3. **promessa** — o que ele vai ver se ficar.

Territórios de hook que funcionam para este público (arquiteto BR):

- **O print cru.** Abrir com um SketchUp feio e sem textura. É a imagem que ele
  tem aberta agora no monitor. Reconhecimento instantâneo.
- **O medo.** "A IA muda o seu projeto." Dor citada literalmente por leads reais.
- **O tempo.** "Renderizar não deveria levar horas."
- **A comparação travada.** Duas imagens, mesma esquadria, régua atravessando.
- **O número.** "3 vistas antes das 14h."

Evite: pergunta retórica genérica, "você sabia que...", contagem regressiva,
qualquer coisa que precise de 3s para fazer sentido.

## 4. Estrutura de criativo de performance

```
0,0–2,0   pattern interrupt + reconhecimento
2,0–4,0   problema nomeado (ou resultado, se o hook foi o problema)
4,0–8,0   solução acontecendo — o produto em ação, sem enfeite
8,0–11,0  prova — o antes/depois com geometria travada
11,0–12,0 benefício + marca
```

## 5. Variantes A/B

Mude **uma dimensão por vez**, senão o teste não ensina nada. Dimensões, em ordem
de impacto medido no mercado:

1. **first frame** (a thumbnail decide o scroll)
2. **hook** (as 6 primeiras palavras)
3. **headline / primary text**
4. ordem dos shots
5. benefício enfatizado (velocidade vs fidelidade vs preço)
6. pacing
7. CTA
8. duração

Um lote de teste saudável: 3 a 4 criativos que compartilham corpo e diferem no
hook + first frame. O reel-kit rende isso barato — mesmo spec, `overlays`
diferentes, segmentos reordenados. Custo zero de geração.

Exemplo de trio de hook:
```
A  "Seu SketchUp pode parecer assim."
B  "Renderizar não deveria levar horas."
C  "Do SketchUp ao real em minutos."
```

## 6. Especificações de entrega para Meta

- 9:16 · 1080×1920 · 30fps · H.264 · yuv420p
- Zona segura: nada de texto acima de y=220 nem abaixo de y=1600. Em anúncio a
  base é pior que no orgânico (o botão de CTA come mais espaço) — desça o limite
  para y≈1500 quando houver texto no fim.
- Áudio: peça de anúncio **pode** sair com trilha embutida (não passa pelo app do
  Instagram). Ver `sound-design.md`.
- Duração: 8–15s costuma ser a faixa; acima de 20s só com retenção comprovada.

## 7. Armadilhas operacionais já pagas neste projeto

- **Vídeo local não sobe pela API daqui.** A montagem de anúncio com vídeo tem
  que terminar com o arquivo em mãos para upload manual no Gerenciador. Planeje a
  entrega assim: `mp4` + `caption.txt` + instrução de upload, não "vou subir".
- **A identidade do Instagram só existe na conta de negócio** — anúncio que roda
  como @spacenode.app precisa da conta certa selecionada.
- **Nunca use o R$ 0,15/visita de julho como benchmark.** É indicador diferente e
  97% não atribuível. O número real de comparação é R$ 5,18 vs R$ 0,43. Se uma
  peça for justificada por CPA prometido, use os números do painel de tráfego
  pago, não memória.
- **Ligar campanha sem pausar o impulsionamento existente** custa R$ 79/dia.
  Criativo é escopo desta skill; ligar campanha **não é** — isso é do dono.

## 8. O que esta skill NÃO faz

Não cria, edita, ativa, pausa ou orça campanha. Não sobe criativo. Produz o
arquivo, a legenda e o racional — a decisão de gastar mídia é do dono.
