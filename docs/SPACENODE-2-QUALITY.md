# SpaceNode 2 primeira evolução de qualidade

Escopo aprovado por Vinícius em 16/10/2026 após a análise de produto. Esta entrega prepara uma primeira mudança para revisão. Não troca modelos, não ativa o laboratório em `vega-pilot`, não altera preços ou Nodes e não executa geração paga.

## Mudanças

- Direção fotográfica de interiores: resposta de luz, encontros e leitura dos materiais existentes, sem pedir novos acabamentos ou brilho exagerado.
- Exteriores: contexto não modelado permanece neutro. A instrução genérica de vegetação e terreno foi retirada; pedidos explícitos do usuário continuam no bloco próprio.
- O fechamento do prompt não pede espelhos, água, vegetação ou desfoque como recurso para parecer fotografia.
- O bloco fotográfico é compartilhado pelos callers do modo máximo; a alteração não é um seletor de qualidade exclusivo da interface web. O caminho com âncora conserva a direção neutra existente.
- Revisão opcional no resultado: projeto, materiais, luz e detalhes, com acesso ao comparador e às ferramentas existentes. Os marcadores são conferência local da imagem atual, sem salvar aprovação nem alterar o feedback de utilidade.
- O aviso estrutural explica o alcance da comparação de contornos. Ele não certifica materiais, cores ou objetos.
- Download: tipo e extensão são conferidos nos bytes, sem recodificar a imagem. Vídeos e tipos desconhecidos mantêm o tratamento anterior, sem presumir JPEG quando falta Content-Type.

## Validação visual antes da publicação

Para conferir a interface localmente, iniciar o servidor de desenvolvimento e abrir `/dev/quality-preview`. A página usa o componente real e imagens públicas existentes; não gera imagens, não grava feedback e retorna 404 em produção. As configurações locais de QA não devem conter credenciais de produção.

Comparar o prompt anterior com esta proposta nas bases sala, cozinha e fachada autorizadas, com três amostras por braço: 18 imagens, nove pares. Usar a mesma entrada, resolução e motor efetivo. Registrar custo e todas as tentativas; não repetir saídas ruins para escolher só um bom resultado. A reserva de orçamento do outro piloto não pertence a esta rodada.

Avaliar os pares com nomes ocultos, empate e estado inconclusivo permitidos. Conferir acabamentos, luz, encontros, câmera e detalhe no arquivo real. A candidata só avança se for preferida em mais pares que o controle, não perder a maioria dos pares de nenhuma cena e não apresentar alteração crítica de projeto nas nove amostras. É uma regra de triagem, não prova estatística.

Testes de prompt verificam as instruções, não a obediência do modelo nem uma melhoria de qualidade. A revisão manual não bloqueia download ou cobra Nodes. Nenhum marcador é persistido como aprovação do cliente, e cada novo resultado começa sem marcações.

## Relação com o piloto existente

O laboratório já contém análises, contratos e testes por motor. Seus relatórios de 16/10 registram ganhos localizados e regressões, sem ganho geral validado. Esta branch mantém esses arquivos intactos e conserva o catálogo. O próximo passo é avaliar este ajuste estreito com o mecanismo existente e aceite humano, antes de promover qualquer receita ou motor.

## Vídeo

A evolução de vídeo depende da imagem aprovada e de teste temporal específico. Não ampliar o movimento para mostrar regiões ocultas sem referências, nem tratar uma imagem aprovada como prova de fidelidade do vídeo.
