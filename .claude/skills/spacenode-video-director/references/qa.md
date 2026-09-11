# Quality control

QA não é opcional e não é "olhei e tá bom". São cinco blocos, executados em dois
momentos: **nos takes crus** (antes de montar) e **na peça final** (antes de
entregar).

---

## 1. Como olhar

O reel-kit e o cinema-kit já produzem `qa-frames/*.png` e `probe.json`. Use-os.
Para um take cru de IA, use o script — ele resolve o binário do ffmpeg e já
confere o container junto:

```bash
node .claude/skills/spacenode-video-director/scripts/qa-frames.mjs take.mp4 --n 6
node .claude/skills/spacenode-video-director/scripts/qa-frames.mjs peca.mp4 --expect 1080x1920@30
node .claude/skills/spacenode-video-director/scripts/qa-frames.mjs take.mp4 --at 0.1,1.5,3,4.4
```

Ele falha (exit 1) se a resolução, o fps ou o `pix_fmt` divergirem, e se o
`ffprobe` não conseguir ler o arquivo — **um mp4 pode estar corrompido existindo
em disco**, quando o processo foi morto durante a escrita.

Não chame `ffmpeg` cru: ele vem do winget e **pode ou não estar no PATH do shell
atual**. O script usa `marketing/scripts/lib/tools.mjs`, que resolve na ordem
env var → PATH → diretório de pacotes do winget.

Depois **abra os PNGs com a ferramenta Read**. Um QA que não olhou a imagem não
aconteceu. Descrever o que "deveria" estar lá não substitui ver.

---

## 2. Bloco ARQUITETURA (o mais importante)

- [ ] geometria preservada do primeiro ao último frame?
- [ ] mobiliário preservado — nada nasceu, nada sumiu?
- [ ] materiais preservados — madeira continua madeira?
- [ ] esquadrias, batentes e rodapés íntegros?
- [ ] linhas retas longas continuam retas (junção piso/parede, peitoril)?
- [ ] perspectiva coerente — linhas de fuga ainda convergem?
- [ ] sem morphing, sem "respiração", sem texture swim?
- [ ] sem hallucination (objeto que não existe no projeto)?

Catálogo completo de defeitos e gravidade: `architecture-fidelity.md`, seção 2.
Qualquer defeito `fatal` reprova o take.

## 3. Bloco VÍDEO

- [ ] consistência temporal dentro do take?
- [ ] movimento de câmera suave, sem solavanco, sem aceleração?
- [ ] sem artefato de compressão visível (blocagem em área escura)?
- [ ] sem problema de interpolação de frame (fantasma, ghosting)?
- [ ] sem flash claro no corte (o erro mais comum em xfade)?
- [ ] a banda fica alinhada durante o wipe?
- [ ] primeiro frame é uma boa thumbnail (é ele que decide o scroll)?

## 4. Bloco DESIGN

- [ ] tipografia Geist, pesos corretos?
- [ ] alinhamento e hierarquia — uma ideia por tela?
- [ ] zona segura: nada acima de y=220 nem abaixo de y=1600?
- [ ] verde só na palavra marcada — no máximo uma por card?
- [ ] logo presente, monocromático, no card final?
- [ ] consistência visual entre shots (mesma altura de hook, mesma banda)?
- [ ] texto legível sobre a imagem (scrim presente onde precisa)?
- [ ] sem emoji dentro da arte?

## 5. Bloco PERFORMANCE (obrigatório em pago, recomendado em orgânico)

- [ ] o hook é claro nos primeiros 2 segundos?
- [ ] o benefício é compreensível **com o som desligado**?
- [ ] o CTA é claro?
- [ ] o pacing segura — nada parado por mais de 3s?
- [ ] a peça funciona para quem nunca ouviu falar da SpaceNode?

## 6. Bloco MARCA

- [ ] parece SpaceNode?
- [ ] premium?
- [ ] arquitetônico?
- [ ] tecnológico?
- [ ] minimal?
- [ ] nenhum item da lista de proibições do `brand.md`?
- [ ] a voz está certa — "nodes" e não "créditos", sem hype de IA?
- [ ] nenhum dado do produto desatualizado (preço, plano, quantidade de nodes)?

## 7. Registro

Grave o resultado em `marketing/output/<slug>/QA.md`: os 5 blocos, o que passou,
o que foi corrigido, e os frames que você olhou. Um QA sem registro não sobrevive
à próxima peça.

---

## 8. Failure handling — quando um take dá errado

**Nunca regenere no impulso.** Regeneração é geração paga e volta ao portão de
custo. Diagnostique primeiro:

| Sintoma | Causa provável | Correção |
|---|---|---|
| Geometria derretendo no fim do take | duração longa demais | corte para 4–5s e monte dois shots |
| Parede/piso deslizando | movimento de cena no prompt | reescreva: só a câmera se move; adicione a trava de fidelidade |
| Objeto novo aparecendo | prompt descreve o que "deveria" existir | descreva o que **já está** na imagem, não o que você quer |
| Deriva geral, tudo instável | modelo errado para o shot | troque o endpoint (ver `model-routing.md`) |
| Fim do take inventado | pull-back/órbita revelando área não vista | ancore com `end_image_url`, ou faça em Ken Burns |
| Imagem de origem borrada/pequena | problema na fonte, não no modelo | pegue o asset em resolução maior no acervo |
| Movimento fraco demais | intensidade baixa ou prompt vago | aumente um degrau só; não mude duas coisas por vez |
| 422 na chamada | campo inexistente ou valor fora do enum | `genmedia schema` e corrija o campo exato (422 **é cobrado**) |
| Falha 5xx | erro do servidor | pode repetir — 5xx **não é cobrado** |

### Formato do pedido de regeneração

```
PROBLEMA          o defeito observado, no take X, no segundo Y
DIAGNÓSTICO       a causa da tabela acima
CORREÇÃO          o que muda exatamente (prompt / duração / modelo / origem)
NOVO MODELO       se mudou, e por quê
CUSTO ADICIONAL   US$ X,XX

Posso regerar?
```

Mude **uma variável por tentativa**. Duas mudanças ao mesmo tempo e você paga
duas vezes sem aprender nada.

Se três tentativas falharem no mesmo shot: pare de gastar. O shot provavelmente
não deveria ser IA — resolva com Ken Burns sobre o still, ou corte o shot da
peça. Reporte isso ao dono em vez de insistir.
