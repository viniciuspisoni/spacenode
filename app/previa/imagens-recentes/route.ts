import { isLandingReview } from '@/lib/landing-review'

// Documento de revisão independente da landing. O fragmento do link fica no
// navegador e não passa pelos scripts de analytics ou pelo servidor.
export function GET() {
  if (!isLandingReview()) return new Response(null, { status: 404 })
  return new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Seleção de imagens · SpaceNode</title>
<link rel="stylesheet" href="/landing-editorial/revisao/galeria.css">
<script defer src="/landing-editorial/revisao/galeria.js"></script></head>
<body><main><header><span class="brand">SpaceNode</span><h1>Imagens para a landing</h1>
<p id="intro">Seleção privada de renders de usuários.</p></header>
<p id="loading" role="status">Abrindo a seleção…</p>
<section id="gallery" hidden aria-label="Seleção de imagens">
<div class="toolbar"><div role="group" aria-label="Filtrar imagens">
<button id="all" type="button" aria-pressed="true">Todas (30)</button>
<button id="favorites" type="button" aria-pressed="false">Favoritas (0)</button></div>
<button id="copy" type="button" disabled>Copiar números</button></div>
<p id="notice" role="status" aria-live="polite"></p>
<textarea hidden id="copy-text" readonly aria-label="Números escolhidos para copiar"></textarea>
<div id="grid"></div><p id="empty" hidden>Marque suas favoritas em Todas para vê-las aqui.</p></section></main>
<dialog id="viewer" aria-labelledby="image-title"><div class="viewer">
<button id="close" type="button">Fechar</button><img id="large" alt="">
<div class="caption"><div><h2 id="image-title"></h2><p id="image-date"></p></div><button id="pick" type="button"></button></div>
<div class="navigation"><button id="prev" type="button">Anterior</button><button id="next" type="button">Próxima</button></div>
</div></dialog></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  })
}
