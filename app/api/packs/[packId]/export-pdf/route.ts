// POST /api/packs/[packId]/export-pdf
//
// STUB no Bloco 1 — geração de PDF (Puppeteer ou react-pdf) entra em sprint
// dedicado depois. Por enquanto retorna 503 com mensagem clara.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:   'pdf_export_pending',
      message: 'Exportação em PDF estará disponível em breve. Por ora, use o link compartilhável.',
    },
    { status: 503 },
  )
}
