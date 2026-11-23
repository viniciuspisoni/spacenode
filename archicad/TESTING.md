# O que exige teste dentro do Archicad

Tudo abaixo **não pôde ser provado sem o aplicativo** (o que foi provado está em
[README.md](README.md#o-que-foi-e-o-que-não-foi-verificado)). Ordem = risco
decrescente: se os itens 1–5 falharem, o resto nem começa.

Preparação: Archicad **29**. O modo Demo recusa `Save`; **Testar captura 3D**
mostra a restrição sem pareamento ou cobrança. Para validar a imagem e o fluxo
completo, use licença ativa.
`python3 archicad/tools/archicad.py build && python3 archicad/tools/archicad.py install`,
registre o `.bundle`/`.apx` em *Options ▸ Add-On Manager ▸ Edit List of Available
Add-Ons… ▸ Add…*, reinicie. Backend: o ambiente com `/api/integrations/*` no ar
(ou `SPACENODE_API_URL=http://localhost:3000`, abrindo o Archicad pelo terminal).

## A. Carregamento e paleta (bloqueantes)

| # | Passo | Esperado | Se falhar, suspeitar de |
|---|---|---|---|
| 1 | Add-On Manager lista **SpaceNode**, sem aviso de incompatibilidade; reiniciar | Carrega; item de menu "SpaceNode" existe (nome/posição dependem de `MenuCode_Tools` + [RINT/AddOn.grc](RINT/AddOn.grc)) | símbolos/frameworks, MDID, assinatura (E) |
| 2 | Clicar no item | Paleta abre; item fica marcado; clicar de novo fecha | `PaletteControlCallBack`, `SetMenuItemCheckedState` |
| 3 | Paleta renderiza (fonte Geist, tema claro/escuro conforme o sistema, logo **N**) e **o botão "Conectar conta" responde** | Prova que `SpaceNode.post` (ponte JS) chega ao C++ | `RegisterAsynchJSObject` com parâmetro string em `JS::Function` |
| 4 | Eventos C++ → página (ex.: ao conectar, a tela muda sem interação) | `PanelIdle` chama `ExecuteJS` | `EnableIdleEvent(true)` não disparando; trocar por timer DG |
| 5 | Ancorar a paleta, redimensionar, trocar planta/3D/layout, ocultar com Tab | Mantém estado; reaparece; sem travar | flags `API_PalEnabled_*` |

## B. Captura da vista 3D (o ponto técnico central)

| # | Passo | Esperado |
|---|---|---|
| 6 | 3D em **perspectiva**, enquadre algo reconhecível, clique **Testar captura 3D**; depois, com conta conectada, *Gerar* | Teste local informa dimensões sem upload ou cobrança; na geração, imagem enviada = a vista (confira baixando o resultado "Original" no Histórico do site); **sem** destaque de seleção, sem UI do Archicad |
| 7 | Idem em **axonometria** | Idem |
| 8 | Dimensões: janela 3D pequena × grande × tela Retina/4K | `Última captura` mostra w×h coerente com a janela (em Retina, 1× ou 2×? anotar); aviso "imagem pequena" abaixo de 1024 px |
| 9 | Janela ativa é **planta** | Erro "Abra a janela 3D…"; botão **Abrir janela 3D** troca para o 3D |
| 10 | Chamar `ACAPI_ProjectOperation_Save` a partir de `PanelIdle` | **Não** retorna `APIERR_REFUSEDCMD`. Se recusar → mover a captura para o *menu handler* (Archicad documenta Save como comando completo, fora de notificação/undo) |
| 11 | Com um diálogo/ferramenta ativa, ou outro add-on rodando | Mensagem clara (não crash); slot de geração liberado |
| 12 | Projeto **sem título/não salvo** e projeto em **Teamwork** | Captura funciona; nenhum "salvar alterações?" novo; sem entrada no Undo; projeto não vira "modificado" |
| 13 | Cena pesada (PNG > 14 MB) | Recaptura em JPEG, upload OK; se ainda > 15 MB, erro `image_too_large` |
| 14 | Arquivos temporários | `spacenode-archicad-*.png/jpg` não sobram em `TemporaryFolder` |

## C. Conta e sessão

| # | Passo | Esperado |
|---|---|---|
| 15 | Conectar: navegador abre `/integrations/pair`; digitar o código; aprovar | Paleta vira "conectada" em ≤ ~3 s **mesmo com o Archicad em segundo plano**; saldo e catálogo carregam |
| 16 | Keychain Access ▸ item `app.spacenode.archicad` (conta = URL da API) | Existe; **nenhum prompt** de acesso ao Keychain; reiniciar o Archicad → continua conectado |
| 17 | Desconectar | Item do Keychain some; paleta volta ao início |
| 18 | Revogar o dispositivo no site e clicar *Atualizar saldo* | Paleta volta a "desconectado" (credenciais esquecidas) |
| 19 | Código de pareamento expirando / cancelar | Mensagens corretas; polling para |

## D. Geração e resultado (precisa do backend comum no ar)

| # | Passo | Esperado |
|---|---|---|
| 20 | Gerar (Pulsar HD, barato) | Ordem sign → PUT → generate; custo cobrado = custo exibido; saldo atualiza; imagem aparece |
| 21 | *Salvar imagem* / *Mostrar na pasta* / *Abrir no navegador* | Arquivo em `Imagens/SpaceNode/…`; Finder/Explorer seleciona; navegador abre a URL assinada |
| 22 | Esperar > 55 min (ou `#expire` no harness para ver a UI) | Aviso de link expirado + **Atualizar link** busca `/render?id=` e volta a mostrar |
| 23 | Desligar a rede durante *Gerar* | Se o servidor terminou: render recuperado do histórico (aviso "Recuperado…"); senão `generate_lost` |
| 24 | Fechar a paleta e sair do Archicad **durante** a geração | Sem crash/travamento (≤ 3 s no encerramento); o render ainda aparece no Histórico |
| 25 | Saldo insuficiente | Botão bloqueado **antes** de capturar; link "Ver planos e Nodes" abre o site |

## E. Distribuição

| # | Passo | Esperado |
|---|---|---|
| 26 | macOS arm64 com `package` (assinatura ad-hoc) | Archicad carrega o add-on; senão testar `package --sign "Developer ID…"` + notarização e o *library validation* do Archicad |
| 27 | Zip baixado da internet (quarentena) | Instruções do `INSTALL.txt` (`xattr -dr com.apple.quarantine`) funcionam |
| 28 | `build --release` com MDID real | Add-on aparece como não-privado; sem aviso de MDID |

## F. Windows (nada executado aqui)

Build `archicad.py build` com VS 2022/v143; carregar `.apx`; itens 1–25 repetidos.
Específicos: WinHTTP atrás de proxy corporativo/PAC; TLS 1.2/1.3; Credential
Manager (`SpaceNode/Archicad/<url>`); `ShellExecuteW` abrindo navegador e
`explorer /select`; caminhos com acento/OneDrive em *Imagens*; DPI 125–200 %;
`WinPlatform.cpp` compilando isolado (sem PCH, `/Zc:wchar_t` nativo) dentro do
projeto que usa `/Zc:wchar_t-`.

## G. Estabilidade

Abrir/fechar a paleta 20×; trocar de projeto com a paleta aberta; Archicad em
segundo plano por horas com a paleta conectada (renovação de token a cada ~1 h,
sem vazamento de threads); `ACAPI_KeepInMemory(true)` não impedir o encerramento.

## H. Se quiser ir além do MVP (só depois de A–D)

Câmera/sol em `modelFacts` e lote de vistas salvas: leia `API_3DProjectionInfo`
(`ACAPI_View_Get3DProjectionSets`) e confirme **no aplicativo** a unidade e o
eixo de `viewCone`, a altura do olho em relação ao pavimento e a enumeração do
Navigator antes de enviar qualquer valor ao `/api/generate`.
