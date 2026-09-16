import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease } from '../lib/anim';

const { w: W, h: H } = theme.frame;

export type Focus = [number, number]; // fração da imagem (0..1) que fica no centro do quadro

/**
 * Recorte 9:16 em tela cheia de uma imagem paisagem, com Ken Burns.
 * `zoom` vai de zoom[0] a zoom[1] ao longo de `span` (default: a duração da sequência).
 * A geometria é determinística: dois <Cover> com os mesmos parâmetros enquadram igual —
 * é assim que o corte render→modelo cai no MESMO enquadramento.
 */
export const Cover: React.FC<{
  src: string;
  aspect: number;
  focus?: Focus;
  zoom?: [number, number];
  span?: [number, number];
  drift?: [number, number]; // deslocamento em px do centro ao longo do span
  opacity?: number;
  brightness?: number;
}> = ({ src, aspect, focus = [0.5, 0.5], zoom = [1, 1], span, drift = [0, 0], opacity = 1, brightness = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [s0, s1] = span ?? [0, durationInFrames];
  const z = ease(frame, [s0, s1], [zoom[0], zoom[1]], theme.ease.soft);
  const dx = ease(frame, [s0, s1], [0, drift[0]], theme.ease.soft);
  const dy = ease(frame, [s0, s1], [0, drift[1]], theme.ease.soft);

  // cover: a altura do quadro é o lado limitante para imagem paisagem
  const baseH = Math.max(H, W / aspect);
  const imgH = baseH * z;
  const imgW = imgH * aspect;
  let left = W / 2 - focus[0] * imgW + dx;
  let top = H / 2 - focus[1] * imgH + dy;
  left = Math.min(0, Math.max(W - imgW, left));
  top = Math.min(0, Math.max(H - imgH, top));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity }}>
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          left,
          top,
          width: imgW,
          height: imgH,
          filter: brightness === 1 ? undefined : `brightness(${brightness})`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Banda: a imagem INTEIRA em 1080 de largura, centrada verticalmente, sobre a própria
 * imagem desfocada e escurecida. Preserva o enquadramento de quem projetou.
 */
export const Band: React.FC<{
  src: string;
  aspect: number;
  zoom?: [number, number];
  span?: [number, number];
  offsetY?: number;
  width?: number;
  backdrop?: boolean;
  opacity?: number;
  children?: React.ReactNode; // desenhado dentro da banda, em coordenadas da banda
}> = ({ src, aspect, zoom = [1, 1], span, offsetY = 0, width = W, backdrop = true, opacity = 1, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [s0, s1] = span ?? [0, durationInFrames];
  const z = ease(frame, [s0, s1], [zoom[0], zoom[1]], theme.ease.soft);
  const bandH = Math.round(width / aspect);
  const left = (W - width) / 2;
  const top = Math.round((H - bandH) / 2 + offsetY);
  return (
    <AbsoluteFill style={{ opacity }}>
      {backdrop && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={staticFile(src)}
            style={{
              position: 'absolute',
              left: -W * 0.35,
              top: H / 2 - (W * 1.7) / aspect / 2,
              width: W * 1.7,
              height: (W * 1.7) / aspect,
              filter: 'blur(46px) brightness(0.28) saturate(0.9)',
            }}
          />
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', left, top, width, height: bandH, overflow: 'hidden' }}>
        <Img
          src={staticFile(src)}
          style={{ position: 'absolute', left: 0, top: 0, width, height: bandH, scale: String(z), transformOrigin: '50% 50%' }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
};

export const bandGeometry = (aspect: number, width = W, offsetY = 0) => {
  const bandH = Math.round(width / aspect);
  return { left: (W - width) / 2, top: Math.round((H - bandH) / 2 + offsetY), width, height: bandH };
};

/**
 * Wipe com régua — assinatura visual da fidelidade. `over` entra pela esquerda sobre `under`.
 */
export const RulerWipe: React.FC<{
  progress: number; // 0..1
  under: React.ReactNode;
  over: React.ReactNode;
  rect?: { left: number; top: number; width: number; height: number }; // default: quadro inteiro
  lineHeight?: [number, number]; // faixa vertical da régua dentro do rect (px)
}> = ({ progress, under, over, rect, lineHeight }) => {
  const r = rect ?? { left: 0, top: 0, width: W, height: H };
  const p = Math.max(0, Math.min(1, progress));
  const x = r.left + p * r.width;
  const lineOpacity = p <= 0 || p >= 1 ? 0 : Math.min(1, Math.min(p, 1 - p) * 12);
  const [ly0, ly1] = lineHeight ?? [0, r.height];
  return (
    <>
      {under}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${r.top}px ${W - r.left - p * r.width}px ${H - r.top - r.height}px ${r.left}px)` }}>
        {over}
      </div>
      <div
        style={{
          position: 'absolute',
          left: x - 1,
          top: r.top + ly0,
          width: 2,
          height: ly1 - ly0,
          backgroundColor: theme.colors.line,
          boxShadow: '0 0 18px rgba(255,255,255,0.55), 0 0 2px rgba(0,0,0,0.6)',
          opacity: lineOpacity,
        }}
      />
    </>
  );
};

/**
 * Vista de uma REGIÃO da imagem (frações) dentro de uma caixa — para o split de detalhes.
 * Retorna também a função que converte frações da imagem em px da caixa (para as marcações).
 */
export const regionTransform = (aspect: number, region: [number, number, number, number], boxW: number, boxH: number, zoom = 1) => {
  const [rx, ry, rw, rh] = region;
  const S = Math.min(boxW / rw, (boxH * aspect) / rh) * zoom; // largura da imagem em px
  const imgW = S;
  const imgH = S / aspect;
  const left = -rx * imgW + (boxW - rw * imgW) / 2;
  const top = -ry * imgH + (boxH - rh * imgH) / 2;
  const toBox = (fx: number, fy: number) => ({ x: left + fx * imgW, y: top + fy * imgH });
  return { imgW, imgH, left, top, toBox };
};

export const RegionView: React.FC<{
  src: string;
  aspect: number;
  region: [number, number, number, number];
  box: { left: number; top: number; width: number; height: number };
  zoom?: [number, number];
  span?: [number, number];
  radius?: number;
  children?: (toBox: (fx: number, fy: number) => { x: number; y: number }) => React.ReactNode;
}> = ({ src, aspect, region, box, zoom = [1, 1], span, radius = 28, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [s0, s1] = span ?? [0, durationInFrames];
  const z = ease(frame, [s0, s1], [zoom[0], zoom[1]], theme.ease.soft);
  const t = regionTransform(aspect, region, box.width, box.height, z);
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        overflow: 'hidden',
        borderRadius: radius,
        border: `1px solid ${theme.colors.glassBorder}`,
        backgroundColor: theme.colors.card,
      }}
    >
      <Img src={staticFile(src)} style={{ position: 'absolute', left: t.left, top: t.top, width: t.imgW, height: t.imgH }} />
      {children?.(t.toBox)}
    </div>
  );
};
