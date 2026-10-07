/** Knowledge shortcuts are for standalone questions, never execution or follow-ups. */
export function canUseKnowledgeShortcut(message: string, historyLength: number, hasAttachment: boolean): boolean {
  if (hasAttachment || historyLength > 0) return false
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(gera|gerar|gere|cria|criar|faz|faca|refaz|refazer|aplique|aplicar|configure|configurar|monte|montar|analise|analisar|compare|comparar|me ajude|quero)\b/.test(normalized)) return false
  return /^(como|quanto|qual|quais|onde|por que|o que|posso)\b/.test(normalized.trim())
}
