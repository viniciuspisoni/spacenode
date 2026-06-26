# EDITAR v2 — Setup GCP/Vertex (service account com permissão mínima)

> Para: fundador. Tempo estimado: ~10 minutos no console do Google Cloud.
> Objetivo: criar a credencial que o smoke do Vertex Imagen vai usar
> (`scripts/smoke-vertex-imagen-edit.mjs`). Nenhuma chamada paga acontece até
> você rodar o smoke com `--approve-paid-call`.

## O que será criado
- 1 **service account** (uma "conta de robô" só para a SpaceNode chamar o Vertex).
- 1 **papel mínimo**: `Vertex AI User` (`roles/aiplatform.user`) — permite chamar
  os modelos; **não** permite administrar o projeto, ver billing nem criar recursos.
- 1 **chave JSON** dessa conta → vira a env `GOOGLE_VERTEX_CREDENTIALS_JSON`.

## Passo a passo (console web)

1. **Escolher o projeto**
   - Acesse https://console.cloud.google.com e selecione o projeto no topo.
   - Sugestão: o mesmo do experimento de 10/06 (`gen-lang-client-0191517804`),
     que já tem billing ativo — ou um projeto novo dedicado (ex.: `spacenode-prod`).

2. **Habilitar a API Vertex AI** (se ainda não estiver)
   - Menu ☰ → "APIs & Services" → "Enable APIs and services".
   - Busque **"Vertex AI API"** (`aiplatform.googleapis.com`) → **Enable**.

3. **Criar a service account**
   - Menu ☰ → "IAM & Admin" → "Service Accounts" → **Create service account**.
   - Nome: `spacenode-editar` (id sugerido: `spacenode-editar@<projeto>.iam.gserviceaccount.com`).
   - Em "Grant this service account access to project":
     - Role: **Vertex AI User** (digite "Vertex AI User" na busca). **Só esse papel.**
   - "Done".

4. **Gerar a chave JSON**
   - Na lista, clique na conta criada → aba **Keys** → "Add key" → "Create new key" → **JSON** → Create.
   - O navegador baixa um arquivo `.json`. **Trate como senha** (quem tem o
     arquivo consegue gastar no Vertex do projeto).

5. **Colocar no `.env.local`** (na raiz do projeto)
   - Abra o arquivo `.json` baixado, copie o conteúdo INTEIRO (uma linha só, sem
     quebras) e preencha o bloco que já está preparado no fim do `.env.local`:
     ```
     GOOGLE_VERTEX_PROJECT=<id do projeto, ex.: gen-lang-client-0191517804>
     GOOGLE_VERTEX_LOCATION=us-central1
     GOOGLE_VERTEX_CREDENTIALS_JSON=<conteúdo inteiro do .json em uma linha>
     VERTEX_IMAGEN_ENABLED=1
     ```
   - Dica Windows/PowerShell: NÃO use pipe (`>`/`|`) para gravar a chave no
     arquivo — o PowerShell adiciona um BOM invisível que quebra a autenticação.
     Cole manualmente no editor.
   - Depois de validar localmente, as mesmas envs precisam ir para a **Vercel**
     (via `vercel env add`, + redeploy) — mas isso é fase posterior, não agora.

6. **Apagar/guardar o arquivo baixado**
   - Depois de colar no `.env.local`, mova o `.json` para fora de Downloads
     (ex.: um cofre de senhas) ou apague — não deixe solto no disco.

## Alternativa via linha de comando (gcloud), se preferir
```bash
gcloud config set project <PROJETO>
gcloud services enable aiplatform.googleapis.com
gcloud iam service-accounts create spacenode-editar --display-name="SpaceNode Editar"
gcloud projects add-iam-policy-binding <PROJETO> \
  --member="serviceAccount:spacenode-editar@<PROJETO>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
gcloud iam service-accounts keys create spacenode-editar-key.json \
  --iam-account="spacenode-editar@<PROJETO>.iam.gserviceaccount.com"
```

## Depois do setup — o smoke (ainda sem gastar)
```bash
node scripts/smoke-vertex-imagen-edit.mjs
```
Sem flag nenhuma, isso só imprime o pré-voo (variáveis ✔/✖, permissões, chamada
exata, custo estimado ~US$0,02, imagem/máscara de teste, modelo, critérios de
sucesso/falha) e **sai sem chamar nada**. Quando você aprovar o gasto:
```bash
node scripts/smoke-vertex-imagen-edit.mjs --approve-paid-call
```
O mesmo vale para o Gemini direto (`scripts/smoke-gemini-image-edit.mjs`,
~US$0,067 por execução; `--pro` testa o motor de Alta precisão, ~US$0,134).

## Segurança
- A chave dá acesso de USO do Vertex — papel mínimo, sem administração.
- Nunca vai para o client/browser; só envs server-side.
- Rotação: para trocar, crie uma chave nova (passo 4), atualize a env e delete
  a antiga na aba Keys.
- Se a chave vazar: console → Service Accounts → Keys → delete a chave; o
  acesso morre na hora.
