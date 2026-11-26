# Harness de takes arquitetônicos

`architectural-take-v1` corrige conflitos de direção do Animar: cenas e presets
adicionavam profundidade anamórfica, mudança de luz, foco raso e percursos que uma
imagem não comprovava. A política agora fica em `lib/video/takePolicy.ts` e é
compartilhada entre interface e API. O builder atende também clientes antigos.

## Contrato de direção

- Um take contínuo, câmera estabilizada e composição ancorada na referência.
- Geometria, esquadrias, materiais, mobiliário, luminárias e reflexos consistentes.
- Luz e estado das luminárias preservados por padrão. Atmosfera só por seleção.
- Vida ambiental somente em vegetação ou água já presentes. Sem adicionar efeitos.
- Deslocamento total curto: mais segundos diminuem o ritmo, sem ampliar o percurso.
- Câmera fixa sem zoom, translação ou rotação, inclusive nas intensidades maiores.
- Entrada, walkthrough e drone com imagem única recebem movimento local. O painel
  informa o ajuste, e histórico/resposta registram o movimento efetivo e o pedido.
- Frame final orienta o endpoint, mas não comprova áreas ocultas intermediárias.
- O modo criativo não libera redesign, cortes ou movimentos fora da política.

Os valores de 2–5% para mudança de enquadramento e 1–3 graus para ângulo são
**alvos textuais experimentais**, não limites físicos impostos pelas APIs nem
medições do vídeo entregue. Só uma comparação visual pode validar o resultado.
A avaliação do benchmark não bloqueia entregas nem dispara tentativas pagas.

## Comparação dos motores

Use a mesma imagem, movimento, atmosfera, formato e duração compatível em cada
variante. Registre resolução, provider real, ID do request, Nodes, tarifa efetiva
quando disponível e versão da política. Se duração/resolução forem diferentes,
registre essa diferença e não trate a rodada como comparação equivalente.
Não troque de variante silenciosamente nem deduza margem a partir dos Nodes.

| Cena | Movimento | Falha a procurar |
|---|---|---|
| Sala com esquadrias | Aproximação suave | Mudança de aberturas, paredes ou mobiliário |
| Cozinha com marcenaria | Deslizar | Armários, juntas, puxadores e metais deformados |
| Fachada | Arco curto | Fundos, cobertura ou entorno inventados |
| Banheiro com espelho | Câmera fixa | Reflexos incompatíveis, ondulação e luz oscilante |
| Material em detalhe | Zoom editorial | Textura rastejando, troca de material ou foco instável |
| Espaço com outra vista real | Avanço com frame final | Colisão, transição de cena e geometria intermediária inventada |

Comece com um clip curto por família. Amplie a rodada se houver ganho ou dúvida.
Compare versão anterior e nova na mesma referência; prompts sozinhos e testes de
código não comprovam melhora visual. Considere custo por vídeo **aprovado**,
incluindo tentativas cobradas e reprovações, ao comparar fornecedores.

## Preparar uma revisão local

Requer Node com suporte nativo a TypeScript (22.18+), `ffmpeg`, `ffprobe` e as
dependências já instaladas do repositório. Não chama providers nem cobra Nodes.
Escolha um diretório novo por clip para preservar revisões anteriores.

```sh
node scripts/review-video-take.mjs --video /tmp/clip.mp4 --reference /tmp/source.png --out /tmp/review-orbit
```

O script extrai quadros em 0%, 25%, 50%, 75% e próximo ao final. Cria
`contact-sheet.png`, `samples.json` com timestamps reais e `review.json` com todos
os critérios inicialmente **não verificados**. `--end /tmp/end.png` acrescenta a
referência final à prancha. A extração não afirma que o vídeo foi assistido.

Assista ao clip completo, compare a referência e os cinco quadros e preencha:

- `watchedFullClip`, `comparedReference` e `reviewedFractions`;
- `geometry`, `materials`, `cameraPath`, `singleTake`, `lightingAndEnvironment`
  e `referenceSupport`, com `pass`, `fail` ou `unverified`;
- `evidence` com o elemento observado e seus timestamps/quadros.

```sh
node scripts/review-video-take.mjs --assess /tmp/review-orbit/review.json
```

Qualquer falha documentada reprova o clip. Critério ausente, sem evidência,
frame faltante ou clip não assistido torna a avaliação inconclusiva. Apenas a
revisão completa pode aprovar. Não existe média que compense geometria errada.
Exit codes: `0` aprovado, `1` reprovado, `2` inconclusivo.

## Verificação de código

```sh
npm test -- tests/video
npm run typecheck
```

Os testes cobrem câmera fixa, limites por duração, movimentos com imagem única,
contexto sem direção conflitante, escopo de atmosfera, compatibilidade antiga,
Seedance sem negative prompt e persistência/resposta da API. Não geram vídeos.

Referência técnica consultada em 11/10/2026:
[guia oficial de direção do Veo](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1/).
Os limites e critérios de fidelidade acima são decisões da SpaceNode a validar
em projetos reais; não são garantias documentadas dos fornecedores.
