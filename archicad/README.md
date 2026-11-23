# SpaceNode para Archicad

Add-on nativo (C++ / API DevKit oficial / CMake) que renderiza **a vista 3D
atual do Archicad** com o mesmo motor de fidelidade do app web. Mesmo produto
da extensão SketchUp (`sketchup/`): pareamento pelo navegador, catálogo,
captura da vista, upload assinado, `/api/generate`, recuperação do render e
salvamento — numa paleta ancorável com a identidade SpaceNode (Brand v2.0).

| | |
|---|---|
| **Alvo** | Archicad **29** · API DevKit **29.3100** (a mais recente pública) |
| **Plataformas** | macOS (universal `x86_64` + `arm64`) · Windows x64 (VS 2022, toolset v143) |
| **Status** | macOS: compila e linka contra o DevKit 29; carregou no Archicad 29 BRA build 3000 e abriu a paleta em modo Demo (out/2026). O backend `/api/integrations/*` agora existe neste repositório (ver abaixo), mas ainda não está em produção; captura nativa com licença ativa pendente. Windows: ver [Limites](#o-que-foi-e-o-que-não-foi-verificado). |
| **Versão** | 1.0.0 (`config.json`) |

## Como funciona

```
Archicad ─ janela 3D ─┐
                      ▼
 Paleta (DG::Browser, HTML) ◀── eventos JSON ── Controller (core/) ── HTTPS ──▶ SpaceNode
        │  SpaceNode.post(JSON)      ▲                │                         /api/integrations/*
        └──────── comandos ──────────┘                ├─ ICapture  → Save 3D → PNG (Src/ArchicadCapture)
                                                      ├─ IShell    → abrir URL, pasta Imagens, arquivos
                                                      └─ ICredentialStore → Keychain / Credential Manager
```

1. **Conectar** — `POST /api/integrations/pair/start` (`platform:"archicad"`), o
   add-on abre `/integrations/pair` no navegador do sistema e mostra o código
   (RFC 8628, igual ao SketchUp). Polling em `/claim`; `deviceSecret` vai para o
   **Keychain (macOS) / Credential Manager (Windows)**, o access token fica só
   em memória e é renovado por `/refresh` (uma renovação por vez — o refresh
   token é de uso único no servidor).
2. **Catálogo** — `GET /api/integrations/catalog?platform=archicad` alimenta motores, resoluções
   (custo em Nodes), segmento/ambiente/iluminação/contexto/elementos. Nada de
   tabela de preço hardcoded; o botão mostra o custo real e bloqueia saldo
   insuficiente **antes** de capturar/enviar.
3. **Capturar** — `ACAPI_ProjectOperation_Save` com `API_SavePars_Picture`
   (`view2D=false`, sem destaque de seleção) grava a **janela 3D atual** em PNG:
   o que o usuário vê é o que a IA recebe. Janela atual não é 3D → erro claro +
   botão "Abrir janela 3D". PNG > 14 MB → recaptura em JPEG. Dimensões lidas do
   arquivo; aviso se o lado maior < 1024 px.
   **Testar captura 3D** funciona antes do pareamento: salva a vista localmente,
   informa as dimensões e remove o arquivo temporário, sem upload nem Nodes.
4. **Gerar** — `POST /api/uploads/sign` (`area: render-source`) → `PUT` direto no
   bucket → `POST /api/generate` com `sourceKey` (nada de base64 pela Vercel) e
   `client: {kind:"archicad", version}` (o servidor só registra a origem).
   Nenhum Node é cobrado antes do `/generate`. Queda de rede **depois** do POST →
   o add-on procura o render em `/api/renders/list` (mesma regra do SketchUp:
   criado após o início, exclui o anterior) antes de dizer que falhou.
5. **Apresentar / salvar** — o resultado aparece na paleta; **Salvar imagem**
   grava em `Imagens/SpaceNode/spacenode-archicad-<data>-<id>.png` (valida que o
   download é mesmo imagem), **Mostrar na pasta**, **Abrir no navegador**,
   **Atualizar link** (URLs assinadas duram 1 h → `GET /render?id=`).

## Contrato de backend

Implementado em `app/api/integrations/*` + página `app/integrations/pair`, com a
mesma lógica das rotas do SketchUp (`lib/integrations/pairing.ts`, `account.ts`,
`catalog.ts`); o plugin Revit usa o mesmo contrato. Os dispositivos ficam em
`sketchup_devices`, agora com a coluna `platform` (migration
`supabase/migrations/20261122120000_integration_devices_platform.sql` —
**aplicar no banco antes do deploy das rotas**). A página de pareamento recebe
`?app=archicad` e o servidor recusa aprovar ali um código de outra plataforma.
Testes: `tests/integrations/*.test.ts`.

| Chamada | Usa |
|---|---|
| `POST /api/integrations/pair/start` `{platform:"archicad", deviceName}` | → `{deviceId (uuid), deviceSecret, userCode, verificationUrl (mesmo host da API), expiresIn, pollInterval}` |
| `POST /api/integrations/pair/claim` `{deviceId, deviceSecret}` | → `{status:"pending"}` · `410` expirado · `{status:"ready", accessToken, expiresAt (epoch s), userEmail}` |
| `POST /api/integrations/pair/refresh` `{deviceId, deviceSecret}` | → `{accessToken, expiresAt}` · `401` = dispositivo revogado (o add-on esquece as credenciais) |
| `GET /api/integrations/session` | → `{user:{email}, balance:{totalBalance}, theme}` |
| `GET /api/integrations/catalog?platform=archicad` | mesmo formato de `GET /api/sketchup/catalog`: `engines[].resolutions[].nodes`, `defaults`, `projectTypes[].segments[]`, `i18n.en` |
| `GET /api/integrations/render?id=` | → `{id, status, inputUrl, outputUrl, previewUrl, nodesCharged}` |
| *existentes, com Bearer do dispositivo* | `POST /api/uploads/sign`, `PUT <uploadUrl>`, `POST /api/generate` (`sourceKey`, `engine`, `resolution`, `projectType`, `segment`, `environment`, `lighting`, `background`, `sceneElements`, `fidelityLevel:"maximum"`, `refinementText`, `client`), `GET /api/renders/list` |

Segurança do cliente: HTTPS obrigatório (HTTP só em `localhost`); `verificationUrl`
e URLs de upload/download são validadas (host/esquema) antes de abrir ou enviar;
o Bearer nunca acompanha redirects nem PUT/GET de URLs assinadas; segredos nunca
vão para eventos da UI nem para mensagens de erro; HTML da paleta escapa todo
texto vindo do servidor e só carrega imagem `https`.

## Estrutura

```
archicad/
├─ core/                 C++20 portátil, sem DevKit: Json, ApiClient, Generation, Controller
├─ platform/             mac/MacPlatform.mm (NSURLSession, Keychain, NSWorkspace) · win/WinPlatform.cpp (WinHTTP, Credential Manager)
├─ Src/                  só o que fala com o Archicad: AddOnMain, SpaceNodePalette (DG::Palette + DG::Browser), ArchicadCapture
├─ ui/panel.html         a interface (uma página; fonte Geist e logo inlinados no build)
├─ RINT/ RFIX/ RFIX.win/ recursos Graphisoft (.grc, ícone, MDID)
├─ tools/archicad.py     deps · test · build · package · install
├─ tools/gen_ui.py       ui/panel.html → RFIX/Images/SpaceNodePanel.html
├─ tests/                unit (core), e2e (HTTP real), ui (harness no navegador)
├─ CMakeLists.txt        espelha o template oficial GRAPHISOFT/archicad-addon-cmake
└─ config.json           nome, versão, copyright
```

## Build

Pré-requisitos: CMake ≥ 3.19; **Python ≥ 3.10** (as ferramentas de recursos da
Graphisoft exigem; use `--python`); macOS: Xcode ou Command Line Tools; Windows:
Visual Studio 2022 + toolset v143.

```bash
python3 archicad/tools/archicad.py deps       # baixa o DevKit 29.3100 (SHA-256 fixado) + archicad-addon-cmake-tools (commit fixado) em archicad/.deps/
python3 archicad/tools/archicad.py build      # → archicad/build/29/INT/RelWithDebInfo/SpaceNode.bundle  (.apx no Windows)
python3 archicad/tools/archicad.py package    # → archicad/dist/SpaceNode-Archicad-1.0.0-AC29-MAC.zip (+ .sha256)
python3 archicad/tools/archicad.py install    # copia ao lado do Archicad e imprime os passos do Add-On Manager
```

O DevKit não é versionado (licença Graphisoft) — `deps` baixa do release oficial
e confere o hash. Para Windows: `ARCHICAD_CMAKE_GENERATOR` troca o gerador.

**Distribuição.** O build padrão é "privado" (`AC_ADDON_FOR_DISTRIBUTION=OFF`).
Antes de distribuir: (1) gerar o par MDID real em
<https://archicadapi.graphisoft.com/profile/add-ons> e trocar em
[RFIX/AddOnFix.grc](RFIX/AddOnFix.grc) (hoje `1 / 1`, de desenvolvimento); (2)
`build --release`; (3) macOS: `package --sign "Developer ID Application: …"` e
notarizar (o pacote sem identidade usa assinatura ad-hoc, só para teste local).

API de desenvolvimento/staging: `SPACENODE_API_URL=http://localhost:3000` (abra o
Archicad pelo terminal) ou `{"apiBaseUrl": "…"}` em
`~/Library/Application Support/SpaceNode/archicad.json` / `%APPDATA%\SpaceNode\archicad.json`.
O Keychain separa credenciais por URL da API.

## Testes sem Archicad

```bash
python3 archicad/tools/archicad.py test       # 28 testes / 258 checagens do núcleo (~6 s), -Wall -Wextra -Werror
node archicad/tests/e2e/run.mjs               # fluxo completo por HTTP REAL (NSURLSession) contra um backend simulado
node archicad/tests/ui/panel_test.mjs           # estados e comandos da paleta, PT/EN, custo, erros, resultado e escape de HTML (sem navegador)
python3 archicad/tests/ui/harness.py          # abre a UI no navegador com uma ponte falsa (#lowres #no3d #short #lost #expire #warn #light)
cmake -S archicad/tests -B archicad/build/tests && cmake --build archicad/build/tests && ctest --test-dir archicad/build/tests   # idem, portátil (Windows)
```

Cobrem: JSON/URL/imagem/datas; pareamento (feliz, código expirado, cancelamento,
`verificationUrl` de outro host rejeitada); renovação por expiração e por 401;
dispositivo revogado; geração (ordem sign→PUT→generate, payload, bloqueios antes
de cobrar, captura falha libera o slot, 402, falha de upload sem cobrança, queda
de rede com e sem render recuperável); salvar (inclui download que não é imagem);
desligar abortando requisições em voo; e, no e2e, bytes enviados = bytes
capturados, bytes salvos = bytes renderizados, nenhum token obsoleto reutilizado.
Os mesmos testes passam sob **TSAN** e **ASAN+UBSAN**.
O teste automatizado da paleta usa o motor JavaScript do Node com um DOM mínimo;
ele verifica a lógica e o HTML gerado, mas não substitui a inspeção visual no
`DG::Browser` do Archicad.

## O que foi e o que não foi verificado

Verificado nesta máquina (macOS, Command Line Tools): build completo do `.bundle`
universal contra o DevKit 29.3100 com os flags `-Wall -Werror` do template;
símbolos exportados (`GetExportedFuncAddrs`/`SetImportedFuncAddrs`); testes
acima; UI no navegador (fluxo, estados, escape de HTML, URL `javascript:`
recusada).

**Verificado no Archicad:** registro e carregamento do add-on, abertura/fechamento
da paleta e comunicação com o servidor até a recusa do pareamento. A captura
3D nativa e a geração completa ainda precisam de teste no aplicativo. O código Windows foi só
**compilado com MinGW-w64** (`core/` e `platform/win/WinPlatform.cpp`) — o alvo
Windows completo (MSVC + DevKit WIN) nunca foi construído nem executado. A lista
objetiva do que exige o aplicativo está em [TESTING.md](TESTING.md).

## Decisões e limites

- **Sem `modelFacts` (câmera/sol) e sem lote de cenas/vistas.** Dois motivos: o
  contrato do backend comum para metadados não está fechado, e a semântica de
  `API_PerspPars.viewCone` (horizontal × vertical, unidade) e a leitura de vistas
  salvas do Navigator **não puderam ser comprovadas sem o Archicad**. Mandar um
  FOV errado pioraria o prompt; um lote cobraria Nodes por algo não validado. O
  encaixe existe (`CapturedView::facts` → `modelFacts` já é repassado ao
  `/api/generate`), falta só alimentar com valor comprovado.
- **Resolução da captura = tamanho da janela 3D.** `Save` grava o que a janela
  mostra; o painel avisa quando está pequena. Foto-render em alta (APIDo_PhotoRender)
  seria uma segunda etapa — é lento e não é WYSIWYG.
- **Modo Demo não permite a captura por `Save`.** O DevKit 29 documenta essa
  restrição e o teste no Archicad 29 BRA build 3000 confirmou
  `APIERR_REFUSEDCMD`. A captura verifica `APIPROT_DEMO_MASK` antes do comando e
  mostra uma mensagem específica. Não há fallback de tela sem fidelidade
  comprovada; a imagem real exige licença ativa.
- Idioma: PT-BR por padrão, EN quando o sistema está em inglês (rótulos de preset
  vêm de `i18n.en` do catálogo; o valor enviado à API segue em PT-BR).
