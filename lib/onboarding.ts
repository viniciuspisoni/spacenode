export type OnboardingSource = 'model' | 'render' | 'photo'

export const ONBOARDING_GOALS = {
  presentation: {
    label: 'Apresentar o projeto', panel: 'cena', action: 'Conferir a cena',
    instruction: 'Confira Interior ou Exterior. Se o projeto já está definido, mantenha os materiais e o entorno da referência.',
    review: 'Confira se a imagem comunica o projeto que você quer apresentar.',
  },
  lighting: {
    label: 'Explorar a luz', panel: 'luz', action: 'Escolher a iluminação',
    instruction: 'Escolha uma iluminação e mantenha os outros ajustes. Assim fica mais fácil comparar o efeito da luz.',
    review: 'Compare a iluminação e confira se ela ajuda a visualizar o espaço.',
  },
  materials: {
    label: 'Estudar um material', panel: 'materiais', action: 'Escolher um material',
    instruction: 'Comece por uma superfície. Descreva o material ou envie uma amostra; deixe os outros campos vazios para preservar a referência.',
    review: 'Confira a superfície escolhida e veja se os outros materiais foram preservados.',
  },
} as const

export type OnboardingGoal = keyof typeof ONBOARDING_GOALS

export const ONBOARDING_PATHS = {
  model: {
    label: 'Um modelo 3D', detail: 'Tenho uma vista do SketchUp ou de outro modelador.',
    title: 'Escolha uma vista que conte seu projeto.',
    instruction: 'Exporte uma imagem do modelo. Comece com um ambiente ou uma fachada, em um enquadramento que você usaria na apresentação.',
    action: 'Criar minha primeira imagem', href: '/app/generate?onboarding=model#guia',
    checklist: ['Uma vista com o projeto bem enquadrado', 'Imagem sem menus ou ferramentas por cima', 'Materiais visíveis, quando já definidos'],
  },
  render: {
    label: 'Um render existente', detail: 'Quero melhorar uma imagem que já tenho.',
    title: 'Escolha um detalhe para melhorar.',
    instruction: 'No Editar, envie o render e comece com uma mudança específica: luz, um material ou um detalhe. Confira o restante da imagem depois.',
    action: 'Ajustar meu render', href: '/app/editar?onboarding=1',
    checklist: ['O render que você quer ajustar', 'Uma mudança específica em mente', 'Uma amostra de material, se for necessária'],
  },
  photo: {
    label: 'Uma foto do projeto', detail: 'Quero explorar a visualização de um espaço.',
    title: 'Comece pela foto que mostra o espaço.',
    instruction: 'Escolha uma foto nítida, com o ambiente bem visível. Ela será a referência da visualização; confira os elementos do projeto no resultado.',
    action: 'Visualizar meu espaço', href: '/app/generate?onboarding=photo#guia',
    checklist: ['Foto nítida e bem iluminada', 'O ambiente inteiro no enquadramento', 'Uma intenção clara para a visualização'],
  },
} as const

/** Completion alone is not evidence of useful output. */
export function canOfferAfterValue(eligible: boolean, useful: boolean | null): boolean {
  return eligible && useful === true
}
