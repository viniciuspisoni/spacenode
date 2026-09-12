/**
 * Variações do REEL TRANSFORMAÇÃO. O roteiro-base do BRIEF.md é `base`; os outros
 * atacam dores diferentes do público (custo de terceirizar, apresentação travada)
 * para o feed não repetir a mesma legenda com imagem trocada.
 *
 * `accent` marca a ÚNICA palavra que sai em #30D158 no vídeo.
 * Hook do "antes" tem que fazer sentido olhando o modelo cinza do SketchUp.
 */
export const ROTEIROS = {
  base: {
    par: 'banheiro',
    hookAntes: 'Seu cliente não entende isso…',
    hookDepois: '…mas entende isso.',
    sub: 'Gerado em {minutos} com IA.',
  },

  entrega: {
    par: 'living',
    hookAntes: 'Isso é o que você manda pro cliente.',
    hookDepois: 'Isso é o que ele precisa ver.',
    sub: 'Mesmo projeto. Gerado em {minutos}.',
  },

  preco: {
    par: 'casa',
    hookAntes: 'Terceirizar esse render: R$150 a R$600.',
    hookDepois: 'Do seu próprio modelo: {minutos}.',
    sub: 'Mesma geometria, mesma câmera, mesmo projeto.',
  },

  apresentacao: {
    par: 'industrial',
    hookAntes: 'O projeto está pronto. A apresentação, não.',
    hookDepois: 'Agora está.',
    sub: 'Render com IA em {minutos}, sobre o seu SketchUp.',
  },
};

/** `{palavra}` → <span class="accent">palavra</span> */
export function accentuate(text) {
  return text.replace(/\{([^}]+)\}/g, '<span class="accent">$1</span>');
}
