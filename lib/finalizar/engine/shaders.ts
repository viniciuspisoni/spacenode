// lib/finalizar/engine/shaders.ts — fontes GLSL do motor do Finalizar.
//
// WebGL2 / GLSL ES 3.00. Pipeline:
//   GEOMETRY  — perspectiva/rotação/lente (homografia inversa) sobre a base
//   ELEMENT   — composita UMA camada de elemento (transform + máscara + blend)
//   COLOR     — WB, exposição, tom, curva LUT, HSL, grading, saturação,
//               correspondência de cor e ajustes LOCAIS por máscara
//   BLUR      — gaussiano separável (nitidez/ruído: fino; clareza: grosso)
//   FINISH    — nitidez, redução de ruído, clareza (global + local) e vinheta
//   COPY      — passthrough (downsample/upsample)
//
// Máscaras locais: até MAX_LOCAL_ADJUSTMENTS slots com código UNROLLED —
// GLSL ES não permite indexar samplers dinamicamente. Cada slot tem textura
// própria (R = pincel/adicionar, G = borracha) + forma analítica.
//
// O modelo de white balance é o MESMO de color-math.ts (wbGains) — mudanças
// precisam acontecer nos dois lugares.

import { MAX_LOCAL_ADJUSTMENTS } from '../types'

export const VERT_FULLSCREEN = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const COMMON = `
precision highp float;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srgb2lin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 lin2srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRY — homografia inversa + lente. Fora da imagem → alpha 0.
// ═══════════════════════════════════════════════════════════════════════════

export const FRAG_GEOMETRY = `#version 300 es
${COMMON}
uniform sampler2D uTex;
uniform mat3 uInvH;
uniform float uLensK;
uniform float uCoverScale;
uniform float uAspect;
in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0) / uCoverScale;
  float r2 = dot(c, c);
  c *= (1.0 + uLensK * r2);
  vec3 s = uInvH * vec3(c, 1.0);
  vec2 src = (s.xy / max(s.z, 1e-6)) / vec2(uAspect, 1.0) + 0.5;
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0 || s.z <= 1e-6) {
    outColor = vec4(0.0);
    return;
  }
  outColor = texture(uTex, src);
}
`

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT — composita uma camada de elemento sobre o destino (ping→pong).
// Transform inverso no fragment: uv do canvas → coords locais do elemento.
// ═══════════════════════════════════════════════════════════════════════════

export const FRAG_ELEMENT = `#version 300 es
${COMMON}
uniform sampler2D uDst;      // composição até aqui
uniform sampler2D uElem;     // imagem do elemento
uniform sampler2D uElemMask; // R = revelar acumulado (já com fill inicial)
uniform vec2 uCenter;        // centro em uv do canvas
uniform vec2 uHalfSize;      // meia-largura/altura em uv do canvas
uniform float uRotation;     // rad
uniform vec2 uFlip;          // 1 ou -1
uniform float uOpacity;
uniform int uBlend;          // 0 normal 1 multiply 2 screen 3 overlay 4 soft 5 lighten 6 darken
uniform float uAspect;       // aspect do canvas (w/h) p/ rotação sem distorção
in vec2 vUv;
out vec4 outColor;

vec3 blendPix(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s;
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (mode == 4) return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b),
                            b + (2.0 * s - 1.0) * (sqrt(max(b, 0.0)) - b), step(0.5, s));
  if (mode == 5) return max(b, s);
  if (mode == 6) return min(b, s);
  return s;
}

void main() {
  vec4 dst = texture(uDst, vUv);

  // uv → coords locais do elemento (0..1 dentro do quad do elemento)
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  float cs = cos(-uRotation);
  float sn = sin(-uRotation);
  vec2 r = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);
  vec2 half2 = uHalfSize * vec2(uAspect, 1.0);
  vec2 local = r / (2.0 * half2) * uFlip + 0.5;

  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
    outColor = dst;
    return;
  }
  vec4 el = texture(uElem, local);
  float m = texture(uElemMask, vUv).r;
  float a = el.a * uOpacity * m;
  vec3 blended = blendPix(dst.rgb, el.rgb, uBlend);
  outColor = vec4(mix(dst.rgb, blended, a), max(dst.a, a));
}
`

// ═══════════════════════════════════════════════════════════════════════════
// Máscaras locais — chunk compartilhado entre COLOR e FINISH
// ═══════════════════════════════════════════════════════════════════════════
// Por slot i:
//   uLocalMode[i]  : 0 desligado · 1 pincel/céu (só textura) · 2 linear ·
//                    3 radial · 4 luminosidade
//   uLocalInvert[i], uLocalP0[i] (params da forma), uLocalTex{i} (RG)
//   uLocalAdjA[i] = (exposure, contrast, highlights, shadows)   [-1..1]
//   uLocalAdjB[i] = (temperature, tint, saturation, clarity)    [-1..1]
//   uLocalAdjC[i] = (sharpness, 0, 0, 0)                        [-1..1]

const N = MAX_LOCAL_ADJUSTMENTS

function maskUniformDecls(): string {
  const texDecls = Array.from({ length: N }, (_, i) => `uniform sampler2D uLocalTex${i};`).join('\n')
  return `
uniform int uLocalMode[${N}];
uniform float uLocalInvert[${N}];
uniform vec4 uLocalP0[${N}];
uniform vec4 uLocalP1[${N}];
uniform vec4 uLocalAdjA[${N}];
uniform vec4 uLocalAdjB[${N}];
uniform vec4 uLocalAdjC[${N}];
${texDecls}

float analyticMask(int mode, vec4 p, vec4 p1, float sceneLuma, vec2 uv) {
  if (mode == 2) { // linear: 1.0 no lado de p0, esvanece até p1
    vec2 a = p.xy;
    vec2 b = p.zw;
    vec2 ab = b - a;
    float len2 = max(dot(ab, ab), 1e-6);
    float t = dot(uv - a, ab) / len2;
    return 1.0 - smoothstep(0.0, 1.0, t);
  }
  if (mode == 3) { // radial: p = (cx, cy, rx, ry); p1.x = suavidade da borda
    vec2 q = (uv - p.xy) / max(p.zw, vec2(1e-4));
    float d = length(q);
    float inner = 1.0 - clamp(p1.x, 0.05, 0.95);
    return 1.0 - smoothstep(inner, 1.0, d);
  }
  if (mode == 4) { // luminosidade: p = (min, max, smooth, 0)
    float sm = max(p.z, 0.003);
    float lo = smoothstep(p.x - sm, p.x + sm, sceneLuma);
    float hi = p.y >= 0.999 ? 1.0 : 1.0 - smoothstep(p.y - sm, p.y + sm, sceneLuma);
    return lo * hi;
  }
  return 0.0;
}
`
}

/** m = clamp(analitica + pincel_add) · (1 − pincel_erase); invertível. */
function maskValueFn(): string {
  const cases = Array.from({ length: N }, (_, i) => `
float maskValue${i}(vec2 uv, float sceneLuma) {
  if (uLocalMode[${i}] == 0) return 0.0;
  vec2 rg = texture(uLocalTex${i}, uv).rg;
  float base = uLocalMode[${i}] == 1 ? 0.0 : analyticMask(uLocalMode[${i}], uLocalP0[${i}], uLocalP1[${i}], sceneLuma, uv);
  float m = clamp(base + rg.r, 0.0, 1.0) * (1.0 - rg.g);
  return mix(m, 1.0 - m, uLocalInvert[${i}]);
}
`).join('\n')
  return cases
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR — ajustes globais + locais (cor). Detalhe (nitidez etc.) fica no FINISH.
// ═══════════════════════════════════════════════════════════════════════════

export const FRAG_COLOR = `#version 300 es
${COMMON}
uniform sampler2D uTex;
uniform sampler2D uCurveLut;

// globais (normalizados: -1..1, exceto onde indicado)
uniform vec4 uAdjA;   // exposure, contrast, highlights, shadows
uniform vec4 uAdjB;   // whites, blacks, temperature, tint
uniform vec4 uAdjC;   // saturation, vibrance, curveActive(0/1), hslActive(0/1)
uniform vec3 uMatchGain;
uniform vec3 uMatchOffset;
uniform float uMatchAmount; // 0..1 (0 = sem correspondência)

// HSL: 8 faixas — centros fixos, ajustes por uniform
uniform vec3 uHsl[8]; // (hueShift -1..1, sat -1..1, lum -1..1) por faixa

// grading: rodas como cor RGB pré-computada no JS + intensidades
uniform vec3 uGradeShadowColor;   // cor da roda (croma), já × sat
uniform vec3 uGradeMidColor;
uniform vec3 uGradeHighColor;
uniform vec3 uGradeLum;           // lum de cada zona (-1..1): x=sh, y=mid, z=hi
uniform vec2 uGradeRange;         // blending 0..1, balance -1..1
uniform float uGradeActive;

${maskUniformDecls()}
${maskValueFn()}

in vec2 vUv;
out vec4 outColor;

const float BAND_HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 275.0, 320.0);
const float BAND_WIDTH = 45.0;

vec3 applyWbExposure(vec3 c, float temp, float tint, float expo) {
  vec3 lin = srgb2lin(c);
  vec3 gains = vec3(1.0 + 0.30 * temp + 0.12 * tint,
                    1.0 - 0.16 * tint,
                    1.0 - 0.30 * temp + 0.12 * tint);
  lin *= gains * exp2(expo * 2.2);
  return lin2srgb(lin);
}

float toneRemap(float L, float contrast, float highlights, float shadows, float whites, float blacks) {
  float wSh = (1.0 - L) * (1.0 - L);
  float wHl = L * L;
  float Ln = L;
  Ln += 0.38 * shadows * wSh * (1.0 - L);
  Ln += 0.50 * highlights * wHl * (1.2 - L);
  Ln *= 1.0 + 0.30 * whites * smoothstep(0.4, 1.0, L);
  Ln += 0.28 * blacks * (1.0 - smoothstep(0.0, 0.5, L));
  Ln = (Ln - 0.5) * (1.0 + 0.85 * contrast) + 0.5;
  return clamp(Ln, 0.0, 1.6);
}

vec3 applyTone(vec3 c, float contrast, float highlights, float shadows, float whites, float blacks) {
  float L = luma(c);
  float Ln = toneRemap(L, contrast, highlights, shadows, whites, blacks);
  return c * (Ln + 1e-4) / (L + 1e-4);
}

vec3 applySatVib(vec3 c, float sat, float vib) {
  float L = luma(c);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float pixSat = (mx - mn) / max(mx, 1e-4);
  float f = 1.0 + sat + vib * (1.0 - smoothstep(0.1, 0.8, pixSat)) * 0.9;
  return mix(vec3(L), c, max(f, 0.0));
}

vec3 applyHsl(vec3 c) {
  vec3 hsv = rgb2hsv(c);
  float hueDeg = hsv.x * 360.0;
  float wSat = smoothstep(0.04, 0.18, hsv.y);
  float hueShift = 0.0;
  float satMul = 1.0;
  float lumMul = 1.0;
  for (int i = 0; i < 8; i++) {
    float d = abs(hueDeg - BAND_HUES[i]);
    d = min(d, 360.0 - d);
    float w = (1.0 - smoothstep(BAND_WIDTH * 0.35, BAND_WIDTH, d)) * wSat;
    hueShift += w * uHsl[i].x * (30.0 / 360.0);
    satMul *= 1.0 + w * uHsl[i].y * 0.85;
    lumMul *= 1.0 + w * uHsl[i].z * 0.55;
  }
  hsv.x = fract(hsv.x + hueShift + 1.0);
  hsv.y = clamp(hsv.y * satMul, 0.0, 1.0);
  hsv.z = clamp(hsv.z * lumMul, 0.0, 1.5);
  return hsv2rgb(hsv);
}

vec3 applyGrading(vec3 c) {
  float L = luma(c);
  float blend = uGradeRange.x;
  float bal = uGradeRange.y * 0.15;
  float shW = 1.0 - smoothstep(0.15 + bal, 0.50 + bal + blend * 0.25, L);
  float hiW = smoothstep(0.50 + bal - blend * 0.25, 0.85 + bal, L);
  float midW = clamp(1.0 - shW - hiW, 0.0, 1.0);
  c += uGradeShadowColor * shW + uGradeMidColor * midW + uGradeHighColor * hiW;
  c *= 1.0 + 0.25 * (uGradeLum.x * shW + uGradeLum.y * midW + uGradeLum.z * hiW);
  return c;
}

vec3 applyLocal(vec3 c, vec4 adjA, vec4 adjB) {
  // exposição+WB aproximados em espaço gama (2^(EV/2.2) ≈ ganho perceptual)
  vec3 gains = vec3(1.0 + 0.30 * adjB.x + 0.12 * adjB.y,
                    1.0 - 0.16 * adjB.y,
                    1.0 - 0.30 * adjB.x + 0.12 * adjB.y);
  c *= pow(gains, vec3(1.0 / 2.2)) * exp2(adjA.x * 2.2 / 2.2);
  c = applyTone(c, adjA.y, adjA.z, adjA.w, 0.0, 0.0);
  c = applySatVib(c, adjB.z, 0.0);
  return c;
}

void main() {
  vec4 base = texture(uTex, vUv);
  vec3 c = base.rgb;
  float sceneLuma = luma(c);

  // 1. correspondência de cor (referência) — primeiro, os demais refinam sobre ela
  if (uMatchAmount > 0.001) {
    vec3 matched = clamp(c * uMatchGain + uMatchOffset, 0.0, 1.0);
    c = mix(c, matched, uMatchAmount);
  }

  // 2. WB + exposição (linear) → tom → curva → HSL → grading → saturação
  c = applyWbExposure(c, uAdjB.z, uAdjB.w, uAdjA.x);
  c = applyTone(c, uAdjA.y, uAdjA.z, uAdjA.w, uAdjB.x, uAdjB.y);

  if (uAdjC.z > 0.5) {
    float L = clamp(luma(c), 0.0, 1.0);
    float Lc = texture(uCurveLut, vec2(L, 0.5)).r;
    c *= (Lc + 1e-4) / (L + 1e-4);
  }
  if (uAdjC.w > 0.5) c = applyHsl(c);
  if (uGradeActive > 0.5) c = applyGrading(c);
  c = applySatVib(c, uAdjC.x, uAdjC.y);

  // 3. ajustes locais por máscara
${Array.from({ length: N }, (_, i) => `  {
    float m = maskValue${i}(vUv, sceneLuma);
    if (m > 0.001) c = mix(c, applyLocal(c, uLocalAdjA[${i}], uLocalAdjB[${i}]), m);
  }`).join('\n')}

  outColor = vec4(clamp(c, 0.0, 1.0), base.a);
}
`

// ═══════════════════════════════════════════════════════════════════════════
// BLUR — gaussiano separável 9 taps
// ═══════════════════════════════════════════════════════════════════════════

export const FRAG_BLUR = `#version 300 es
${COMMON}
uniform sampler2D uTex;
uniform vec2 uDir; // (1/w, 0) ou (0, 1/h)
in vec2 vUv;
out vec4 outColor;
void main() {
  float w0 = 0.2270270270;
  float w1 = 0.1945945946;
  float w2 = 0.1216216216;
  float w3 = 0.0540540541;
  float w4 = 0.0162162162;
  vec4 c = texture(uTex, vUv) * w0;
  c += (texture(uTex, vUv + uDir * 1.0) + texture(uTex, vUv - uDir * 1.0)) * w1;
  c += (texture(uTex, vUv + uDir * 2.0) + texture(uTex, vUv - uDir * 2.0)) * w2;
  c += (texture(uTex, vUv + uDir * 3.0) + texture(uTex, vUv - uDir * 3.0)) * w3;
  c += (texture(uTex, vUv + uDir * 4.0) + texture(uTex, vUv - uDir * 4.0)) * w4;
  outColor = c;
}
`

// ═══════════════════════════════════════════════════════════════════════════
// FINISH — nitidez, redução de ruído, clareza (global+local), vinheta
// ═══════════════════════════════════════════════════════════════════════════

export const FRAG_FINISH = `#version 300 es
${COMMON}
uniform sampler2D uTex;     // resultado do COLOR
uniform sampler2D uScene;   // cena original (p/ máscara de luminosidade)
uniform sampler2D uFine;    // blur fino
uniform sampler2D uCoarse;  // blur grosso (1/4 res, upsample bilinear)
uniform vec4 uDetail;       // sharpen 0..1, nr 0..1, clarity -1..1, detailActive
uniform vec4 uVignette;     // amount -1..1, size 0..1, feather 0..1, active

${maskUniformDecls()}
${maskValueFn()}

in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 src = texture(uTex, vUv);
  vec3 c = src.rgb;

  if (uDetail.w > 0.5) {
    vec3 fine = texture(uFine, vUv).rgb;
    vec3 coarse = texture(uCoarse, vUv).rgb;
    float sceneLuma = luma(texture(uScene, vUv).rgb);

    // nitidez/suavização locais somadas por máscara
    float localSharp = 0.0;
    float localClarity = 0.0;
${Array.from({ length: N }, (_, i) => `    {
      float m = maskValue${i}(vUv, sceneLuma);
      localSharp += m * uLocalAdjC[${i}].x;
      localClarity += m * uLocalAdjB[${i}].w;
    }`).join('\n')}

    // redução de ruído: puxa áreas planas para o blur fino, preserva bordas
    float nr = uDetail.y;
    if (nr > 0.001) {
      vec3 diff = c - fine;
      float edge = smoothstep(0.015, 0.11, length(diff));
      c = mix(mix(fine, c, edge), c, 1.0 - nr);
    }
    float softLocal = max(-localSharp, 0.0);
    if (softLocal > 0.001) c = mix(c, fine, clamp(softLocal, 0.0, 1.0) * 0.8);

    // nitidez (unsharp) global + local
    float sharpAmt = clamp(uDetail.x * 1.15 + max(localSharp, 0.0), 0.0, 2.0);
    if (sharpAmt > 0.001) c += (c - fine) * sharpAmt;

    // clareza: contraste local no luma via blur grosso
    float clarityAmt = clamp(uDetail.z + localClarity, -1.0, 1.0);
    if (abs(clarityAmt) > 0.001) {
      float lc = luma(c) - luma(coarse);
      c += lc * clarityAmt * 0.55;
    }
  }

  if (uVignette.w > 0.5) {
    vec2 d = vUv - 0.5;
    float dist = length(d) * 1.4142;
    float start = uVignette.y;
    float feather = max(uVignette.z, 0.02);
    float v = smoothstep(start, start + feather, dist);
    c *= 1.0 + uVignette.x * v * 0.85;
  }

  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`

export const FRAG_COPY = `#version 300 es
${COMMON}
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }
`
