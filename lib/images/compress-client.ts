// Compressão de imagem no client (browser-only — usa Image/canvas).
//
// Aceita um dataURL de qualquer tamanho e devolve um JPEG normalizado em até
// maxSide px no maior lado. Garante que o payload base64 enviado pro
// /api/generate fique confortavelmente abaixo do limite de ~4.5 MB da Vercel,
// independente do que o usuário subir (foto de celular, PNG enorme, render
// exportado em alta).

export async function compressImage(
  dataUrl: string,
  maxSide: number = 2048,
  quality: number = 0.92,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const longest = Math.max(width, height)
      const scale   = longest > maxSide ? maxSide / longest : 1
      const targetW = Math.round(width * scale)
      const targetH = Math.round(height * scale)
      const canvas  = document.createElement('canvas')
      canvas.width  = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('CANVAS_UNSUPPORTED')); return }
      ctx.drawImage(img, 0, 0, targetW, targetH)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = dataUrl
  })
}
