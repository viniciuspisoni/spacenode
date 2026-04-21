# SpaceNode — Status do Projeto (Sprint Motor de Geração)

## Stack Técnica

- **Frontend**: Next.js 16.2.4 (App Router + Turbopack), React 19, TypeScript
- **Backend**: Next.js API Routes
- **IA de Imagem**: `@fal-ai/client` v1.9.5
- **Banco de Dados**: Supabase (PostgreSQL + Auth + RLS)
- **Branch ativa**: `claude/spacenode-engine-integration-ZXyTw`

---

## O que está funcionando ✅

### Infraestrutura completa
- Autenticação Google via Supabase (login/logout)
- Tabela `profiles` com sistema de créditos (campo `credits`)
- Tabela `renders` com histórico de gerações
- RLS configurado (cada usuário vê só seus dados)
- Trigger `handle_new_user` cria profile automaticamente no cadastro
- Função `consume_credit(user_id_input uuid)` — decremento atômico com SELECT FOR UPDATE
- Admin client (`lib/supabase/admin.ts`) com service role para bypassar RLS

### Pipeline de geração (ponta a ponta)
- Upload da imagem → `fal.storage.upload()` → URL temporária
- Chamada à Fal.ai → retorna URL da imagem gerada
- Salvamento no Supabase (`renders.insert`)
- Débito de crédito (`consume_credit` RPC)
- Exibição no comparador ANTES/DEPOIS com slider
- Botão "Baixar Render"

### UI `/app/generate`
- Upload com drag-and-drop
- Seletores: Ambiente / Estilo / Iluminação
- Slider Geometry Lock (0–100%)
- Seletor de Motor de IA (5 modelos disponíveis)
- Exibição de créditos em tempo real
- Loading com textos rotativos

---

## Arquivos-chave

```
app/
  api/generate/route.ts        ← Motor principal (POST handler)
  app/generate/
    page.tsx                   ← Server component (auth + profile)
    GenerateClient.tsx         ← Client component (UI completa)
lib/
  supabase/
    admin.ts                   ← Service role client
    server.ts                  ← SSR client
    client.ts                  ← Browser client
supabase-schema.sql            ← Schema completo do banco
.env.local                     ← Variáveis de ambiente (não commitado)
```

---

## Configuração atual do motor (`route.ts`)

```typescript
// Modelo padrão
'fal-ai/flux/dev/image-to-image'

// Modelos disponíveis para teste (seletor na UI)
'fal-ai/flux/dev/image-to-image'
'fal-ai/flux/krea/image-to-image'
'fal-ai/flux-control-lora-canny/image-to-image'
'fal-ai/flux-control-lora-depth/image-to-image'
'fal-ai/flux-general/image-to-image'

// Parâmetros atuais
strength = 1 - (geometryLock / 100)  // com geometryLock default 30% → strength 0.7
num_inference_steps = 40
guidance_scale = 3.5                  // valor correto para Flux (não SDXL)

// Prompt = buildPrompt(ambient, style, lighting) + QUALITY_SUFFIX
// QUALITY_SUFFIX atual:
', convert 3D SketchUp model to real photograph, photorealistic architectural photography,
shot on Canon EOS R5, real building materials, concrete glass steel, real sunlight shadows,
hyperrealistic, 8K RAW photo, not a render, not CGI, real life photo'
```

**Importante**: `fal-ai/flux/dev/image-to-image` NÃO suporta `negative_prompt`.

---

## Problema em aberto ❌ — Qualidade do Output

### Sintoma
A imagem gerada é tecnicamente diferente da entrada (URL diferente, confirmado via log `same as input? false`), mas visualmente quase indistinguível ou sem qualidade fotorrealista.

### Input típico de teste
SketchUp rendering do projeto comercial PISONI — fachada com painel preto, logotipo, vegetação lateral.

### O que já foi tentado
| Tentativa | Resultado |
|-----------|-----------|
| `guidance_scale: 7.5` (SDXL range) | Piora — incorreto para Flux |
| `guidance_scale: 3.5` (Flux correto) | Sem melhora visual notável |
| `num_inference_steps: 28 → 40` | Sem diferença perceptível |
| Prompt em português | Ruim — Flux é treinado em inglês |
| Prompt em inglês com tradução | Melhorou estrutura mas não realismo |
| Quality suffix com termos técnicos | Sem impacto visual significativo |
| `strength: 0.02` (bug geometry lock 98%) | Erro 422 ValidationError |
| `strength: 0.6` (geometry lock 40%) | Imagem muda mas não fica realista |
| `strength: 0.7` (geometry lock 30%) | Em teste |
| Flux Krea image-to-image | Similar ao Dev em qualidade |
| Prompt "convert SketchUp to real photo" | Em teste |

### Hipótese principal
`fal-ai/flux/dev/image-to-image` é um modelo **generalista**. Não foi treinado especificamente para transformar modelos 3D/SketchUp em fotografias arquitetônicas reais. O modelo tende a manter a "assinatura estética" do input em vez de transformá-lo.

### O que explorar a seguir
1. **ControlNet com Canny/Depth** — preserva geometria e aplica estilo fotorrealista sobre as linhas do modelo 3D. Mais adequado para arquitetura.
2. **Modelos especializados em arquitetura** na Fal.ai ou Replicate — fine-tuned em datasets de renders arquitetônicos.
3. **Pipeline de dois estágios**: (1) Canny/Depth extrai linhas do SketchUp → (2) modelo txt2img gera foto real a partir das linhas.
4. **Replicate API** — modelos como `archilabs/archimind` ou similares focados em arquitetura.
5. **Testar strength mais alto (0.85–0.95)** com geometry lock 5–15% — dar máxima liberdade à IA.
6. **Seed fixo** para testes comparativos reproduzíveis.

---

## Variáveis de Ambiente necessárias (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://nucyyqmurhnakhldshwr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FAL_KEY=173d400b-...:99611ea83ff5e1252a5900805039e739
```

---

## Como rodar localmente

```bash
cd C:\Users\Pisoni\spacenode
git checkout claude/spacenode-engine-integration-ZXyTw
git pull origin claude/spacenode-engine-integration-ZXyTw
npm install
npm run dev
# Acesse: http://localhost:3000/app/generate
```

---

## Próxima sessão — Perguntas para o Claude

1. Qual modelo Fal.ai ou Replicate é mais indicado para transformar SketchUp/3D renders em fotografias arquitetônicas fotorrealistas?
2. Como implementar um pipeline ControlNet (canny edge → img2img) usando `@fal-ai/client`?
3. Existe algum modelo fine-tuned em renders arquitetônicos disponível via API?
4. Como usar `fal-ai/flux-control-lora-canny/image-to-image` corretamente — quais parâmetros aceita além de `image_url` e `prompt`?
