# Fidelidade arquitetônica

A regra mais importante da skill. A SpaceNode vende exatamente isto: *"a IA não
reinterpreta seu projeto"*. Um criativo em que a parede respira é um criativo que
prova a tese do concorrente.

**Em qualquer conflito entre impacto cinematográfico e fidelidade arquitetônica,
a fidelidade ganha.** Não é uma preferência, é a peça inteira.

---

## 1. O que tem que ser preservado

Geometria · volumetria · paredes · esquadrias · mobiliário · materiais ·
proporções · layout · iluminação arquitetônica relevante · composição ·
identidade do projeto.

## 2. Catálogo de defeitos (o que procurar nos takes)

| Defeito | Como aparece | Gravidade |
|---|---|---|
| Parede andando | plano de fundo desliza em relação ao piso | fatal |
| Esquadria deformando | montante da janela entorta ou muda de espessura | fatal |
| Porta morphing | folha vira parede, batente respira | fatal |
| Móvel nascendo/sumindo | cadeira aparece no meio do take | fatal |
| Material trocando | madeira vira concreto, tecido vira couro | fatal |
| Textura deslizando | piso escorrega sob os móveis (texture swim) | fatal |
| Luminária mudando | pendente muda de forma ou quantidade | alto |
| Planta crescendo | folhagem se expande antinaturalmente | alto |
| Arquitetura "respirando" | tudo pulsa de leve, sem parecer nada em específico | alto |
| Perspectiva quebrando | linhas de fuga deixam de convergir | alto |
| Reflexo inventando | espelho/vidro mostra um ambiente que não existe | médio |
| Vegetação parada demais | árvore estática em cena com vento | baixo (é prompt) |

Os `fatal` reprovam o take sem discussão. Os `alto` reprovam se estiverem no
terço central do quadro ou visíveis por mais de ~0,5s.

## 3. Táticas que previnem o defeito (na ordem de eficácia)

### 3.1 Não gerar com IA quando não precisa
O caminho mais fiel é o que não passa por um modelo generativo. Um push-in lento
sobre um render real, feito com `zoompan`/Ken Burns no reel-kit, tem fidelidade
**perfeita** por construção. Use vídeo de IA só quando a cena exige:
paralaxe real, movimento de folhagem/água/tecido, mudança de luz, presença humana.

### 3.2 Sempre image-to-video, nunca text-to-video, quando há projeto
Arquitetura entra no modelo como imagem. `text-to-video` é permitido apenas em
placas abstratas de marca (partículas, campo de luz, fundo) — nunca para gerar
"um ambiente".

Endpoints: ver `model-routing.md`. O campo é `image_url` (Seedance i2v) e o
primeiro frame **é** a verdade do projeto.

### 3.3 Take curto
A deriva geométrica cresce com o tempo. Prefira 4–6s e monte vários shots.
Fato medido no projeto: **Veo 3.1 é fiel só nos ~2,5s iniciais; em dolly-out ele
inventa geometria.** Trate qualquer take acima de 6s como suspeito por padrão.

### 3.4 Câmera se move, cena fica parada
Descreva movimento **de câmera**, não movimento **de cena**. Modelos que recebem
"a room comes alive" mexem na arquitetura. Modelos que recebem "camera pushes in
slowly, everything else static" mexem só na câmera.

Frase de trava que funciona bem em prompt (adapte, não cole cego):
> static architecture, no changes to geometry, walls, window frames, furniture or
> materials; only the camera moves; no morphing, no new objects

### 3.5 Movimento mínimo viável
Se o endpoint tiver controle de intensidade de movimento, use o menor valor que
ainda lê como movimento. Confirme o nome do campo com `genmedia schema` — não
assuma que existe.

### 3.6 Ancorar o fim do take
Quando o schema aceitar `end_image_url` (Seedance 2.0 i2v aceita), ancore a
transição entre dois frames reais do mesmo projeto. O modelo interpola entre duas
verdades em vez de inventar o destino. É a tática mais forte para before/after e
para "mesma geometria, outra luz".

### 3.7 Evitar o que quebra
- dolly-out longo (revela área que o modelo não viu → ele inventa)
- órbita ampla (idem, pior)
- qualquer movimento rápido
- corte de lente virtual (mudança de focal dentro do take)
- prompts com adjetivo de transformação ("becomes", "turns into", "transforms")
  quando o assunto é o ambiente

## 4. Onde a fidelidade é negociável

Só em uma situação: quando a peça **assume** que aquilo é abstração e o
espectador entende que não é um projeto. Fundo de marca, campo de partículas,
textura de luz, grafismo. Nesse caso não há arquitetura em cena e a lei não se
aplica. No segundo em que um ambiente reconhecível entra no quadro, ela volta.

## 5. QA de fidelidade (executável)

Para cada take gerado, antes de montar:

1. Extraia 4 frames: início, 1/3, 2/3, fim.
   ```bash
   for t in 0.1 1.5 3.0 4.4; do
     ffmpeg -v error -ss $t -i take.mp4 -frames:v 1 qa_$t.png
   done
   ```
2. **Olhe os frames** (ferramenta Read). Compare o primeiro e o último contra a
   imagem de origem.
3. Percorra o catálogo da seção 2 focando em: esquadrias, batentes, pés de móveis,
   rodapé, junção piso/parede, e qualquer linha reta longa.
4. Um `fatal` → take reprovado. Vá para "Failure handling" em `qa.md`.

Compare sempre **o mesmo enquadramento**: se o take faz push-in, o último frame
está mais fechado — recorte a origem antes de comparar, não conclua que "mudou"
porque o crop mudou.

## 6. A fidelidade também vale na montagem

- Nunca aplique correção de cor que mude material percebido (madeira quente
  virando cinza).
- Nunca espelhe horizontalmente um render: inverte o projeto real.
- Nunca use speed ramp dentro de um take de arquitetura — o motion blur inventa
  borda.
- Ken Burns até 1.08 de zoom (limite do reel-kit). Acima disso a interpolação
  começa a amolecer aresta.
