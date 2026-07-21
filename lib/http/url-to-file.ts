// lib/http/url-to-file.ts
//
// Busca uma URL https de imagem e converte em File — usado pelos fluxos de
// "importar do histórico" (Ampliar, Blocos 3D). Client-safe.

export async function urlToFile(url: string, baseName = 'historico'): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Não foi possível importar a imagem')
  const blob = await res.blob()
  const ext = blob.type.split('/')[1] || 'jpg'
  return new File([blob], `${baseName}.${ext}`, { type: blob.type })
}
