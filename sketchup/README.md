# SpaceNode for SketchUp

MVP funcional da extensão SpaceNode para SketchUp. A extensão adiciona um botão/toolbar, captura o viewport atual, envia a imagem para a API da SpaceNode e exibe o resultado dentro do painel.

## Arquitetura

- `spacenode.rb` registra a extensão no SketchUp.
- `spacenode/main.rb` cria o toolbar, controla o `HtmlDialog`, captura o viewport com `Sketchup.active_model.active_view.write_image` e chama a API com `Net::HTTP`.
- `spacenode/dialog.html` é a UI local do painel.
- `/sketchup/connect` é a tela web usada pelo `HtmlDialog` para reutilizar uma sessão SpaceNode autenticada.
- `/api/generate` continua sendo o endpoint de geração; agora também aceita `Authorization: Bearer <supabase_access_token>`.
- `/api/sketchup/session` valida a sessão do plugin e retorna o saldo atual.

## Instalação no SketchUp

1. Gere o pacote:

```powershell
npm run package:sketchup
```

2. No SketchUp, abra `Window > Extension Manager > Install Extension`.
3. Selecione `dist/spacenode-sketchup-mvp.rbz`.
4. Abra o toolbar `SpaceNode`.
5. Clique em `Conectar`, entre na SpaceNode e volte ao painel.

## Desenvolvimento local

Para apontar o plugin para um servidor local:

1. Inicie o app:

```powershell
npm run dev
```

2. No painel do plugin, abra `API` e use:

```text
http://localhost:3000
```

3. Para carregar sem empacotar, execute no Ruby Console do SketchUp:

```ruby
load 'C:/Users/Pisoni/spacenode/sketchup/spacenode.rb'
```

Depois de alterar arquivos Ruby, recarregue o SketchUp ou rode o `load` novamente.

## Segurança da sessão

O plugin não recebe nem armazena senha. O fluxo de conexão abre uma página da própria SpaceNode, usa a sessão Supabase já autenticada e envia ao Ruby apenas o access token atual, que expira junto com a sessão. A URL da API e o token ficam nas preferências locais do SketchUp.

## Contrato enviado para geração

O MVP envia para `/api/generate`:

- `imageBase64`: captura JPEG do viewport, limitada a 1600 px no maior lado.
- `projectType`: `interior` ou `exterior`.
- `refinementText`: descrição do usuário.
- `engine`/`resolution`: `pulsar` + `hd` no modo rápido, `vega` + `2k` no modo alta fidelidade.
- `geometryLock`, `fidelityMode` e `fidelityLevel`: ajustados por modo.

## Arquivos do pacote RBZ

O `.rbz` precisa ter esta estrutura na raiz do zip:

```text
spacenode.rb
spacenode/
  main.rb
  dialog.html
  assets/
    spacenode.svg
```
