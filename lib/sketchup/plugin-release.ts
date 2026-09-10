// Fonte ÚNICA da versão publicada do plugin SketchUp.
//
// Já drifou duas vezes: a página de download serviu v0.4.0 enquanto o .rbz
// era 0.5.0 (PRs #156/#157) e o EXTENSION.version ficou preso em 0.2.0. Agora
// a página, o catálogo e o aviso de atualização dentro do plugin leem daqui.
//
// Ao publicar uma versão nova: bump aqui + em sketchup/spacenode/main.rb
// (VERSION) + em sketchup/spacenode.rb (EXTENSION.version), e regerar o .rbz.
// Os três precisam bater — o plugin compara a SUA VERSION com esta.

export const PLUGIN_VERSION = '1.0.5'

/** Caminho relativo ao site; o plugin resolve contra o api_base_url dele. */
export const PLUGIN_RBZ_PATH = '/downloads/spacenode-sketchup.rbz'

/** Uma linha, mostrada dentro do painel de quem está atrasado. */
export const PLUGIN_RELEASE_NOTE =
  'Materiais do modelo por superfície: escolha o material do piso, das paredes e do teto em vez de classificar 40 nomes.'
