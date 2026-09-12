# QA — 2026-09-11-dogfood-cozinha-muda

Plano: `marketing/specs/2026-09-11-dogfood-cozinha-muda/plan.json`  ·  hash `dc26a031dc98`
Formato alvo: 1080x1920 · 30fps · 12s
Shots: 4 (1 pago)
Tipo: organic

> Um QA que não olhou a imagem não aconteceu. Extraia os frames, abra os PNGs
> com a ferramenta Read, e só então marque. Descrever o que "deveria" estar lá
> não substitui ver.

## Container

```
ffprobe -v error -show_entries stream=width,height,r_frame_rate,pix_fmt \
        -show_entries format=duration -of default=nw=1 <peca>.mp4
```

Esperado: 1080x1920 · 30/1 · yuv420p · 12s

- [ ] ffprobe roda e bate com o esperado

## 1. ARQUITETURA (fatal reprova o take)

- [ ] geometria preservada do primeiro ao último frame
- [ ] mobiliário preservado — nada nasceu, nada sumiu
- [ ] materiais preservados — madeira continua madeira
- [ ] esquadrias, batentes e rodapés íntegros
- [ ] linhas retas longas continuam retas (junção piso/parede, peitoril)
- [ ] perspectiva coerente — linhas de fuga ainda convergem
- [ ] sem morphing, sem "respiração", sem texture swim
- [ ] sem hallucination (objeto que não existe no projeto)

## 2. VÍDEO

- [ ] consistência temporal dentro do take
- [ ] movimento de câmera suave, sem solavanco
- [ ] sem artefato de compressão visível
- [ ] sem ghosting de interpolação
- [ ] sem flash claro no corte (erro mais comum em xfade)
- [ ] a banda fica alinhada durante o wipe
- [ ] primeiro frame é uma boa thumbnail

## 3. DESIGN

- [ ] tipografia Geist, pesos corretos
- [ ] alinhamento e hierarquia — uma ideia por tela
- [ ] zona segura: nada acima de y=220 nem abaixo de y=1600
- [ ] verde só na palavra marcada — no máximo uma por card
- [ ] logo presente, monocromático, no card final
- [ ] consistência visual entre shots
- [ ] texto legível sobre a imagem (scrim onde precisa)
- [ ] sem emoji dentro da arte

## 4. PERFORMANCE (recomendado)

- [ ] o hook é claro nos primeiros 2 segundos
- [ ] o benefício é compreensível com o som desligado
- [ ] o CTA é claro
- [ ] o pacing segura — nada parado por mais de 3s
- [ ] funciona para quem nunca ouviu falar da SpaceNode

## 5.1 CRÉDITO (peça usa projeto de cliente)

Autoria declarada no plano:

- **muda arquitetura** — autorização para: organic

- [ ] o crédito está NA peça, não só na legenda (legenda some no repost)
- [ ] a grafia é exatamente como a pessoa assina (muda arquitetura é minúsculo)
- [ ] marketing/AUTORIZACOES.md tem linha cobrindo ESTE canal
- [ ] orgânico: a coluna "orgânico" do registro está ✅, não ❓
- [ ] o par usado é -base/-render do public/, conferido em cheio
- [ ] nada no enquadramento identifica endereço, morador ou dado privado

## 5. MARCA

- [ ] parece SpaceNode: premium, arquitetônico, tecnológico, minimal
- [ ] nenhum item da lista de proibições do brand.md
- [ ] voz certa — "nodes" e não "créditos", sem hype de IA
- [ ] nenhum dado do produto desatualizado (preço, plano, nodes)
- [ ] LEI 3: todo output do produto mostrado saiu da SpaceNode de verdade

## Frames olhados

| arquivo | segundo | veredito |
|---|---|---|
|  |  |  |

## Correções aplicadas

-
