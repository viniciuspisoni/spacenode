# Narrativa e shot list

Para o método geral de sequência (beats, continuidade, first/last frame),
invoque a skill `storytelling`. Este arquivo é o recorte SpaceNode: como uma
história de arquitetura se arma em 6 a 30 segundos.

---

## 1. Os cinco beats

| Beat | Função | Peso típico num Reel de 12s |
|---|---|---|
| **Hook** | razão visual imediata para não passar | 0–2s |
| **Setup** | o que é isso, de quem é o projeto | 2–4s |
| **Desenvolvimento** | o movimento, a prova, o processo | 4–8s |
| **Virada** | a transformação, o resultado | 8–10,5s |
| **Fecho** | marca + CTA | 10,5–12s |

Em peça de 6–8s o Setup desaparece: hook → virada → fecho. Em 20–30s o
Desenvolvimento ganha dois ou três shots e é onde mora a educação.

## 2. A história que a SpaceNode conta

Tudo se reduz a uma tensão só, e ela já está documentada em
`.agents/product-marketing.md`:

> *O arquiteto tem medo de que a IA entregue algo "parecido" com o projeto dele,
> mas não o projeto dele.*

Portanto a virada boa não é "olha que render bonito". É **"é o mesmo projeto"**.
Toda peça que provar isso visualmente performa melhor do que uma que só mostra
beleza. A mecânica mais forte é a comparação com geometria travada: mesma câmera,
mesma esquadria, mesmo móvel — outra realidade.

## 3. Ordem de shots: escolha por objetivo

**Orgânico** — a curiosidade pode preceder a explicação:
```
detalhe intrigante → contexto → processo → resultado → marca
```

**Pago** — a clareza vem primeiro, sempre:
```
resultado/problema (0–2s) → o que é → como funciona → prova → CTA
```
Ver `paid-social.md`.

## 4. Ficha por shot

Todo shot da lista carrega:

```
SHOT nn        [início–fim]s
purpose        o beat que ele cumpre
source         caminho real do asset ($ACERVO/... , marketing/renders/..., captura)
camera         movimento + ficha da cinematografia
model          endpoint, ou "reel-kit (sem IA)"
prompt concept não o prompt final; a ideia em uma linha
text           o card que aparece por cima, se houver
transition     como entra o próximo (cut / wipeleft+ruler / fade)
```

Se um shot não tem `source` real, ele não existe ainda: ou você encontra o asset
no acervo, ou o shot muda. Não invente material (LEI 3).

## 5. Ritmo

- Shot mais curto que 0,8s não é lido, é piscada — só serve em sequência rítmica.
- Shot de arquitetura parado com mais de 4s cansa, a não ser que a câmera ande.
- O "antes" (print do SketchUp, estudo) fica **no máximo ~1,5s** na tela. Regra do
  BRIEF e ela vale: o antes é a pergunta, não a resposta.
- Nada fica mais de 3s sem uma mudança visual (movimento, corte, texto novo).
- O card final tem 1,2s. Menos que isso não lê o logo; mais que isso é pedágio.

## 6. Continuidade

Âncoras que precisam se repetir entre shots da mesma peça:

- **mesmo projeto** — nunca misture dois projetos no mesmo antes/depois;
- **mesma câmera** no par antes/depois (é o argumento inteiro);
- **mesma banda/geometria de quadro** — o reel-kit já força isso: todos os cards
  de uma peça dividem a geometria da banda;
- **mesma temperatura de luz** entre shots vizinhos, a não ser que a mudança de
  luz *seja* o assunto;
- **mesma família tipográfica e posição de hook** durante a peça.

## 7. Durações-alvo suportadas

6s · 8s · 10s · 12s · 15s · 20s · 30s.

Formato principal **9:16 — 1080×1920, 30fps**. Outros formatos quando pedidos:
1:1 e 4:5 para feed, 16:9 para filme de marca e YouTube (aí o assembler é o
cinema-kit, ver `assembly.md`).

A soma das durações dos shots tem que bater com o alvo **antes** de gerar
qualquer coisa. Um take de IA a mais que não entra na montagem é dinheiro
queimado.
