# Animar: motores e interface

A tela usa um fluxo único: referência, motor/variante, câmera, duração/formato e geração. Direção criativa, fidelidade, atmosfera e frame final ficam em ajustes opcionais. O palco continua exibindo upload, análise, geração, resultado e erro.

## Catálogo proposto

| Família | Variantes | Integração |
|---|---|---|
| Orbit | Lite, Original, Pro | Kling 2.5 Standard, Kling 2.5 Pro e Kling O3 Pro via FAL |
| Lyra | Lite, Fast, Pro | Veo 3.1; Lite/Fast via Vertex e Standard via integração existente |
| Nebula | Lite, Pro | Seedance 1.5 via FAL; Seedance 2.5 via BytePlus pendente |
| Astra | 720p, 1080p | Luma pendente |

`NEXT_PUBLIC_ENABLE_VIDEO_VARIANTS=1` libera as novas variantes implementadas. O padrão é desligado enquanto a avaliação visual estiver pendente. A página resolve no servidor os modelos com configuração disponível e envia somente IDs para o cliente. Nebula Pro e Astra continuam indisponíveis mesmo com a flag ligada; seus valores no catálogo são propostas, não tarifas efetivas comprovadas.

Lite e Fast de Lyra precisam de `VERTEX_VEO_ENABLED=1`, projeto GCP e uma credencial suportada pelo adapter. O upload atual também precisa de `FAL_KEY`. Nenhum teste desta alteração chama um motor pago, valida credenciais de produção ou comprova qualidade visual dos vídeos.

A FAL anuncia o encerramento do endpoint Standard legado em **22/10/2026**, assim como seus endpoints Lite/Fast. Revisar a migração do Standard para Vertex antes dessa data; o registro antigo permanece para compatibilidade com histórico. Fonte consultada em 11/10/2026: https://fal.ai/models/fal-ai/veo3.1/image-to-video . As novas variantes Lite/Fast já usam Vertex.

## Preço e saldo

Os valores de Nodes são uma proposta de catálogo com contribuição acima de 80% sob as premissas do teste: câmbio R$6/USD, reserva de 20%, tentativas extras de 25%, R$0,50 de custo por resultado e 10% de deduções de receita, incluindo o Office anual legado. Não são garantia de margem real ou de taxa de aprovação dos vídeos.

A proposta também altera os preços das variantes existentes: Orbit 5/10s passa de 60/120 para 300/600 Nodes e Lyra Pro 8s passa de 280 para 1.200 Nodes. Essa reprecificação precisa ser revisada antes de publicar. As variantes econômicas implementadas começam em 200 Nodes, dentro desse novo catálogo. Preços e disponibilidade de produção não foram alterados nesta revisão.

O painel utiliza saldo total (plano e extras) antes e depois de gerar. Duração, resolução, frame final e disponibilidade são validados antes de baixar as referências e debitar. Ao trocar de motor, duração incompatível volta à menor opção, sem selecionar automaticamente a mais cara.

## Verificação

- Testes de catálogo, seleção, adapters, rota, painel e saldo.
- TypeScript e ESLint dos arquivos alterados.
- Layout desktop conferido no navegador local. A validação visual em celular e o envio de referência pelo navegador permanecem pendentes após falha da sessão de teste.
- Rodada paga de qualidade visual pendente; consultar `animar-architectural-takes.md` para o protocolo de revisão.
