# Renderizar: revisão dos prompts por motor

Revisão de 30/10/2026, sobre `739edbb`. Versão: `render-model-fidelity-v1`.

O problema relatado inclui alterações de geometria/câmera/objetos e de materiais/cores/texturas. Esta mudança corrige a composição das instruções. Testes de contrato não demonstram, sozinhos, ganho visual dos modelos.

## Motores e fontes

| Motor | Modelo já configurado no código | Tratamento do prompt |
| --- | --- | --- |
| Vega | Gemini 3 Pro Image; `fal-ai/nano-banana-pro/edit` | Intenção, papéis das referências e preservação em linguagem descritiva |
| Pulsar | Gemini 3.1 Flash Image; `fal-ai/nano-banana-2/edit` | Mesmos invariantes, organizados em passos curtos |
| Quasar | Seedream 5.0 Pro; `bytedance/seedream/v5/pro/edit` | Edição direta e concisa; orçamento recomendado de 600 palavras |
| Orion | GPT Image 2.5 Flare, qualidade `high`; Sunburst continua disponível no benchmark | Seções de tarefa, referências, elementos fixos, alterações e saída |

IDs acima são os defaults do repositório, não uma inspeção das variáveis de produção. Permanecem os modelos, resolução, qualidade, cobrança, parâmetros, provedores e tentativas existentes. Uma troca de modelo ou qualidade exigiria outra comparação.

Fontes oficiais consultadas:

- [Google: geração e edição de imagens](https://ai.google.dev/gemini-api/docs/image-generation): intenção explícita, instruções específicas, etapas para cenas complexas e restrições expressas pelo resultado desejado. A página também apresenta modelos mais novos; não os substituímos pelos modelos configurados.
- [Google DeepMind: guia de prompts](https://deepmind.google/models/gemini-image/prompt-guide/): orientar a edição com referências e descrever o resultado visual.
- [BytePlus: Image generation API](https://docs.byteplus.com/en/docs/modelark/image-generation-api): inclui Seedream 5.0 Pro e recomenda até 600 palavras em inglês, alertando que excesso de texto pode dispersar a atenção aos detalhes. Esse valor é recomendação, não limite rígido da API.
- [BytePlus: guia de prompts vinculado pela API](https://docs.byteplus.com/en/docs/modelark/seedream-4-0-5-0-prompt-guide): recomenda edição concisa com alvo e elementos fixos explícitos. A página ainda se intitula 4.0–4.5; não a tratamos como evidência de funcionalidades exclusivas do 5.0.
- [OpenAI: GPT Image 2.5 prompting](https://developers.openai.com/api/docs/guides/image-prompting): separar o que muda do que permanece, explicitar referências e avaliar preservação em repetições. A orientação sobre Sunburst para casos exigentes justifica uma futura comparação; não invalida automaticamente o piloto anterior que escolheu Flare.
- Schemas do transporte: [Vega](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api), [Pulsar](https://fal.ai/models/fal-ai/nano-banana-2/edit/api), [Quasar](https://fal.ai/models/bytedance/seedream/v5/pro/edit/api), [Orion](https://developers.openai.com/api/reference/resources/images/methods/edit). Não acrescentamos parâmetros de outro motor nem presumimos que um campo de prompt negativo exista.

## Correções

1. A rota seleciona um perfil pelo motor. Os quatro preservam o mesmo contrato, com organização própria; diferenças de formato são uma hipótese de implementação a validar visualmente, não uma promessa da documentação.
2. O contrato distingue a geometria da aparência: com âncora, imagem 2 define câmera, estrutura e posição dos objetos; imagem 1 fornece acabamentos nas superfícies correspondentes. Amostras e mapas mantêm seus índices reais.
3. Refinamentos não recebem mais a instrução contraditória “remover janela = parede” dentro de Renderizar. Pedidos estruturais continuam subordinados à preservação; o novo prompt não autoriza mudar aberturas.
4. Mudanças explícitas de acabamento valem somente nas superfícies nomeadas. Sai a lista global de proibições que também proibia a alteração solicitada.
5. Análise visual vira observação falível, subordinada aos pixels e medidas do modelo. A lente estimada pela análise não é reapresentada como uma nova instrução de câmera.
6. Entrada sem âncora não é automaticamente declarada CAD: detalhe já fotográfico permanece; linhas esquemáticas são tratadas condicionalmente. Retiradas repetições e sugestão de profundidade de campo que poderia desfocar detalhes.
7. Luz mantém fontes sustentadas pela cena, estado explícito das luminárias, cortinas fechadas e prioridade das restrições do usuário.
8. Quasar omite apenas o bloco inteiro de observações inferidas quando ele estoura a recomendação. Nunca corta instruções do usuário, mapas, medidas, margens ou papéis de imagens. Pedidos obrigatórios acima do orçamento são preservados e sinalizados em `generation_log.prompt_profile`.

## Verificação

Prompt interior mínimo, todos os seletores em preservar, sem briefing/âncora/mapas:

| Perfil | Palavras | Caracteres |
| --- | ---: | ---: |
| Legado | 1298 | 8692 |
| Vega | 352 | 2551 |
| Pulsar | 365 | 2614 |
| Quasar | 348 | 2517 |
| Orion | 360 | 2599 |

Contagem por espaços, não tokens. O Quasar cai cerca de 73% nesse caso; isso mede concisão, não ganho de fidelidade.

- 387 testes passaram nas suítes de fidelidade, provedores, Orion, luzes, medidas e preservação de cena; 3 testes pagos/opt-in ficaram ignorados.
- ESLint dos arquivos alterados e `next typegen` + `tsc --noEmit` passaram.
- Os 36 novos casos cobrem os quatro motores, âncora, direções estruturais conflitantes, alterações locais de material, índices de amostras/mapas, margens, luzes, medidas, orçamento e consumidores legados.
- A geração real comparativa não foi executada nesta revisão local: o checkout não contém o conjunto `tests/fidelity/bench/inputs`. Não há evidência A/B para afirmar melhora visual quantificada.

## Comparação visual reproduzível

O benchmark usa o novo perfil por padrão. `BENCH_PROMPT_PROFILE=legacy` seleciona o controle anterior; o perfil entra no resultado e no nome dos PNGs, evitando sobrescrever os dois lados. O benchmark mede chamadas ao motor, não reproduz toda a rota autenticada: briefing, padding Gemini, mapas, tentativas e referências auxiliares da produção precisam de validação adicional no fluxo completo.

Usar os mesmos projetos, motor, fornecedor, resolução, qualidade e pelo menos três repetições por lado. Incluir interior com marcenaria lisa, piso paginado, fachada com esquadrias finas, espelho, cortina fechada e refinamento com âncora. As chamadas são pagas e continuam opt-in.

```sh
FIDELITY_BENCH=1 BENCH_ENGINE=quasar BENCH_REPEAT=3 BENCH_PROMPT_PROFILE=legacy npx vitest run tests/fidelity/bench.test.ts
# Preservar o last-run.json como baseline.json antes da próxima rodada.
FIDELITY_BENCH=1 BENCH_ENGINE=quasar BENCH_REPEAT=3 npx vitest run tests/fidelity/bench.test.ts
```

Repetir com `vega`, `pulsar` e `orion-flare`. Avaliar geometria e materiais separadamente, inclusive pior resultado, além de latência e custo por imagem aceita. Score geométrico isolado não aprova troca de material. Inspecionar a sequência de refinamentos, não só uma geração. A escolha do perfil fica registrada no histórico técnico para comparação após a publicação.
