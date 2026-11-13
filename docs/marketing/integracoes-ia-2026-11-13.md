# Integrações de IA — auditoria da landing

Data: 13/11/2026. Escopo: tecnologias exibidas na landing atual da SpaceNode, sem antecipar recursos da versão 3.0.

## Base e evidências

- Revisão auditada: `6334774`, do checkout `spacenode-2`.
- A correspondência entre essa revisão e o deployment de produção foi conferida pela coordenação da tarefa no Vercel. A auditoria abaixo é de código e configuração declarada; não realizou gerações pagas nem extraiu valores de ambiente.
- O fundador confirmou OpenAI, Kling e Topaz em uso. Também esclareceu que Claude está previsto apenas para a SpaceNode 3.0.
- Integração de tecnologia não significa parceria comercial, patrocínio ou endosso. A legenda do carrossel deve identificar tecnologias utilizadas pela plataforma.

## Catálogo aprovado para o carrossel

Os caminhos abaixo são relativos à raiz do repositório auditado. Versões dos modelos servem para rastreabilidade técnica; a landing deve preferir os nomes estáveis das marcas e famílias.

| Grupo | Modelos e finalidade | Estado observado | Evidência no código |
|---|---|---|---|
| Google | Gemini/Nano Banana para imagem, análise e assistência; Veo para vídeo | Vega e Pulsar no catálogo de imagem; Gemini na análise e no Nodi; Veo é o padrão dos presets de vídeo | `lib/engines.ts`, `lib/gemini.ts`, `lib/fidelity-engine.ts`, `lib/nodi/v2/llm.ts`, `lib/video/models.ts`, `lib/video/videoPresets.ts` |
| OpenAI | GPT Image, motor Orion do Renderizar | Implementação direta e alternativa via FAL; público quando o gate de Orion está ativo. Uso confirmado pelo fundador | `lib/orion/access.ts`, `lib/orion/config.ts`, `lib/orion/provider.ts` |
| BytePlus | Seedream, da ByteDance, para geração e edição de imagens | Quasar/Seedream é o padrão de Renderizar; rota ModelArk e alternativa via FAL implementadas | `lib/engines.ts`, `lib/ai/image-provider.ts`, `lib/ai/ark/seedreamEdit.ts` |
| Kling | Vídeos no modo Rápido | Disponível no catálogo, adaptador implementado; uso confirmado pelo fundador | `lib/video/models.ts`, `lib/video/adapters/falAdapter.ts` |
| Topaz | Ampliação e recuperação de imagens | Primário dos modos fidelidade, recuperar e melhoria inteligente; uso confirmado pelo fundador | `lib/upscale/orchestrator.ts`, `lib/upscale/providers/topaz.ts` |
| Tripo | Blocos 3D, qualidade Padrão | Catálogo e chamada ao fornecedor implementados | `lib/blocos3d/config.ts`, `lib/blocos3d/fal.ts`, `lib/blocos3d/provider.ts` |
| Hyper3D / Rodin | Blocos 3D, qualidade Alta | Catálogo e chamada ao fornecedor implementados | `lib/blocos3d/config.ts`, `lib/blocos3d/fal.ts`, `lib/blocos3d/provider.ts` |
| Meshy | Blocos 3D, qualidade Premium | Catálogo utiliza Meshy via FAL; adaptador direto também existe, fora do catálogo corrente | `lib/blocos3d/config.ts`, `lib/blocos3d/fal.ts`, `lib/blocos3d/provider.ts` |

FAL é uma infraestrutura de acesso a vários modelos, não a desenvolvedora de todos eles. BytePlus é a plataforma de acesso; Seedream é a família de modelos da ByteDance. Não contar a mesma integração como duas tecnologias diferentes apenas por haver mais de um transporte.

## Inventário complementar e exclusões

| Tecnologia | Tratamento na landing | Motivo e evidência |
|---|---|---|
| Clarity | FAQ/inventário, fora dos oito grupos principais | Fallback implementado para falhas do Topaz nos modos de ampliação: `lib/upscale/orchestrator.ts`, `lib/upscale/providers/clarity.ts` |
| NAFNet e restauração de imagem | Inventário técnico, sem novo logo no carrossel | Modos especializados de redução de ruído, desfoque e restauração: `lib/upscale/orchestrator.ts`, `lib/upscale/providers/nafnet.ts`, `lib/upscale/providers/photo-restoration.ts` |
| Anthropic / Claude | Excluir da landing atual | Integração antiga de análise substituída por Gemini; fundador confirmou previsão apenas para a 3.0. Histórico em `lib/fidelity-engine.ts`, `lib/spaces/dna.ts`, `lib/gemini.ts` |
| FLUX / Black Forest Labs | Excluir do carrossel atual | Implementações existem, mas Google-first é padrão e fallback FLUX fica desligado por padrão: `lib/spaces/edit-router.ts` |
| xAI / Grok | Excluir | Comparação restrita ao piloto interno de preparo da primeira imagem; público usa controle Gemini: `lib/nodi/first-image/agent.ts`, `lib/nodi/first-image/access.ts`, `app/api/nodi/first-image/route.ts` |
| Seedance | Excluir | Modelo explicitamente indisponível no catálogo: `lib/video/models.ts` |
| Google Flow e Gemini Omni | Excluir | Placeholders de integração, sem implementação de geração utilizável: `lib/video/models.ts`, `lib/video/adapters/googleFlowAdapter.ts`, `lib/video/adapters/omniAdapter.ts` |

## O que a plataforma escolhe e o que o usuário pode ajustar

| Fluxo | Comportamento atual | Evidência |
|---|---|---|
| Renderizar | Começa com Quasar/2K; usuário pode escolher outro motor e resolução. Configurações anteriores também podem ser restauradas | `lib/engines.ts`, `app/app/generate/GenerateClient.tsx` |
| Animar | O objetivo aplica defaults de motor, movimento, duração e formato; todos os presets atuais usam Veo. A folha de saída permite trocar o motor | `lib/video/videoPresets.ts`, `app/app/video/_hooks/useAnimateState.ts`, `app/app/video/_components/OutputSheet.tsx` |
| Editar | Roteia conforme ferramenta, máscara, referência e qualidade. Premium exige seleção explícita | `lib/spaces/edit-router.ts` |
| Ampliar | A finalidade escolhida determina o fornecedor; Topaz é primário dos modos que ampliam, com Clarity como fallback | `lib/upscale/orchestrator.ts` |
| Blocos 3D | O nível de qualidade determina Tripo, Rodin ou Meshy | `lib/blocos3d/config.ts`, `lib/blocos3d/provider.ts` |

## Regra de comunicação

A promessa atual pode afirmar que a SpaceNode reúne tecnologias de IA em um fluxo orientado ao projeto, oferece configurações prontas e cuida da seleção técnica em recursos específicos. O usuário não precisa conhecer os nomes dos fornecedores para começar e pode ajustar opções disponíveis.

Formulação de referência: **“Você escolhe o que quer fazer. A SpaceNode cuida da tecnologia por trás.”** Complemento de precisão: **“Comece com as configurações da plataforma e ajuste quando precisar.”**

Evitar “sempre escolhe a melhor IA”, “todas as melhores IAs do mercado”, “nenhum usuário precisa escolher um motor”, aprendizado automático não demonstrado ou alegação de exclusividade. A existência de presets, defaults e roteamento não comprova comparação dinâmica entre todos os fornecedores a cada pedido.

O carrossel deve mostrar apenas marcas do catálogo aprovado, com arquivos oficiais e sem sugerir endosso. Logos apoiam a explicação do mecanismo; exemplos reais de entrada e resultado continuam sendo a prova do benefício para o projeto.

Alterações posteriores em catálogo, gates, fornecedores ou disponibilidade exigem atualização desta auditoria antes de novas afirmações públicas.
