# Auditoria de acesso e primeiro uso — 11/09/2026

Escopo: inspeção somente leitura do código local. Nenhuma conta criada, nenhum e-mail enviado, nenhuma autenticação, compra ou geração executada. Produção pode estar em outra revisão; os achados abaixo precisam ser cruzados com o navegador. AGENTS.md e guias Next.js locais de autenticação e useSearchParams foram consultados.

Prioridades: P1 = corrigir antes do refinamento visual; P2 = próxima etapa da melhoria de experiência; P3 = refinamento de menor alcance.

| ID | Prioridade | Evidência local | Impacto e recomendação |
| --- | --- | --- | --- |
| A01 | P1 | `components/landing/PricingToggle.tsx:53` redireciona 401 para `/login?mode=signup`; `app/login/page.tsx:95` lê apenas `next`, cujo padrão em `lib/auth/safe-next-path.ts:8` é `/app`. | O plano e o ciclo selecionados na landing são descartados antes do cadastro. Preservar uma intenção de compra validada, mostrá-la no acesso e conduzir a uma revisão explícita de plano/preço após entrar; não executar compra automaticamente. |
| A02 | P1 | `proxy.ts:36`–`39` muda a rota protegida para `/login` sem transportar o caminho original em `next`. `app/auth/callback/route.ts:30` e `app/auth/google/route.ts:80` também perdem o destino em falhas. | Links profundos e reentrada após sessão expirada perdem a tarefa. Preservar pathname e query em `next` validado em todos os caminhos, inclusive erros e recuperação de senha. |
| A03 | P1 | `app/login/page.tsx:115` inicializa `error` de `?error=`, mas `:129` limpa `error` e `success` em um efeito com `[mode]`, que também executa na montagem. | Erros de autenticação, Google ou sessão expirada desaparecem ao abrir a tela. Limpar feedback apenas na troca efetiva de modo; manter mensagem contextual com ação recuperável. |
| A04 | P2 | `components/landing/PricingToggle.tsx:56` faz retorno silencioso em resposta não OK; `:286`–`:292` usa `try/finally` sem feedback de erro. | A tentativa de assinar pode terminar sem explicação. Exibir falha próxima ao CTA, manter seleção e oferecer nova tentativa; testar resposta 5xx e falha de rede sem abrir checkout real. |
| A05 | P2 | `app/login/page.tsx:244` mostra somente “Verifique seu email...” e `:340` oculta formulário; `app/forgot-password/page.tsx:85` e `:100` mostram sucesso e ocultam formulário. Não há reenviar, corrigir endereço ou identificação do endereço na confirmação. | E-mail atrasado ou digitado errado leva a um fim de fluxo sem recuperação direta. Criar estado de verificação com endereço, corrigir e-mail, reenvio com intervalo, orientação de spam e retorno ao login mantendo intenção. Erro de link expirado deve voltar à mesma jornada. |
| A06 | P2 | Inputs em `app/login/page.tsx:342`, `app/forgot-password/page.tsx:102`, `app/update-password/page.tsx:132` usam placeholder sem label/aria-label; banners são divs sem anúncio dinâmico; acesso não tem h1; inputs usam 14 px. | Identificação dos campos desaparece ao digitar e fica fraca para tecnologias assistivas. Usar rótulos permanentes associados, título da etapa, erros associados e anunciados e opção de mostrar senha. Validar foco, autofill e zoom no Safari iOS; o zoom ainda não foi reproduzido. |
| A07 | P2 | `components/app/WelcomeTour.tsx:181` inicia tour de cinco etapas após 700 ms, `:66` bloqueia interação no elemento destacado e `:147` conclui em `/app/spaces/new`. Novo Space pergunta “Vista Mestre” (`app/app/spaces/new/page.tsx:45`), e sem render leva a `/app/generate?return=spaces/new` (`:63`). O dashboard promete “modelo 3D” (`app/app/page.tsx:322`), mas upload do Space aceita JPG/PNG/WebP (`components/spaces/NewSpaceFlow.tsx:440`). | Existe onboarding e guia de geração; não precisam ser recriados. Simplificar primeira sessão para escolher objetivo → enviar imagem ou usar exemplo → ver custo → gerar. Apresentar Spaces e terminologia quando forem úteis. Ajustar promessa de upload para print/exportação do modelo, salvo suporte real ao arquivo 3D. Separar criação/extração do Space (8 nodes) da geração de imagem no custo explicado ao usuário. |
| A08 | P3 | `components/app/GenerateGuide.tsx:16` define chave global `spn:generate-guide:dismissed`; `app/app/generate/GenerateClient.tsx:411` e `:432` leem/gravam sem usuário. Guia também usa “À esquerda” e “aqui ao lado” (`components/app/GenerateGuide.tsx:107`, `:123`). | Dispensar o guia em uma conta impede sua abertura automática para outra conta no mesmo navegador. Vincular estado à conta e usar instruções independentes da posição da tela, especialmente no mobile. |

## Jornadas de validação sugeridas

1. Deslogado, selecionar Pro na landing, entrar/cadastrar e confirmar se o plano reaparece antes da revisão de compra. Não concluir pagamento.
2. Deslogado, abrir `/app/billing` e `/app/generate?return=spaces/new`; conferir a URL de login e destino após acesso.
3. Abrir `/login?error=auth`, `/login?error=google` e `/login?error=session`, esperar hidratação e confirmar que a mensagem permanece. Não exige credenciais.
4. Em conta de teste autorizada, cadastro por e-mail: verificar estado de envio, reenvio, correção de endereço e confirmação no mesmo e em outro dispositivo. Verificar expiração/reutilização do link com caminhos recuperáveis.
5. Recuperação de senha em conta de teste: chegada ao e-mail, nova senha, erro de confirmação e link expirado, sem perder a tarefa original.
6. Conta sem geração: tour em 390 px de largura, pular/reabrir, Novo Space, primeira render, upload válido/inválido, custo, estado de geração, resultado e retorno com imagem selecionada. Não consumir nodes reais sem autorização.
7. Formulários por teclado e leitor de tela, auto-preenchimento e Safari iOS com teclado virtual aberto.

## Capacidades já presentes a preservar

- Login por e-mail e Google, com validação de destino interno `safeNextPath`.
- Recuperação de senha e definição de senha para contas Google.
- Tour pulável e reabrível via “Como usar”, persistido por perfil.
- Guia de primeira geração com três etapas que acompanham o estado real.
- Fluxo de novo Space sem renders oferece gerar a primeira e retornar com a imagem selecionada.
- Conta grátis recebe configuração inicial econômica (Pulsar/HD), com custo e estimativa de saldo na geração.

Nota: o workspace força tema claro na home em `app/layout.tsx:81`; isso difere da descrição escura da avaliação anterior e deve ser confirmado no site publicado antes de recomendar mudanças de tema.
