import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Video } from '@remotion/media';
import { theme, ASPECT } from '../theme';
import { ease, enter } from '../lib/anim';
import { Bg, Scrim, Vignette } from '../components/Layers';
import { Cover, RulerWipe } from '../components/Picture';
import { Hook, Credit, Chip } from '../components/Typo';
import { FinalCard } from '../components/Brand';
import { PanelStage, ClickRing } from '../components/Plugin';
import { Bed, Sfx } from '../components/Sound';
import { useVideoConfig } from 'remotion';

export type Opening = 'main' | 'A' | 'B';
export type V1Props = { audio: boolean; opening: Opening };

const { w: W, h: H } = theme.frame;
const RENDER = 'assets/cozinha-render-2x.jpg';
const BASE = 'assets/cozinha-base-2x.jpg';
const CREDIT = 'muda arquitetura';

// Timeline (frames @30fps) — bate com o roteiro: 0–3 gancho · 3–8 resultado · 8–14 plataforma ·
// 14–22 plugin · 22–29 continuidade · 29–35 encerramento.
const T = {
  hookEnd: 90,
  detail: 168,
  result: 240,
  platform: 420,
  plugin: 660,
  app: 870,
  end: 1050,
} as const;

const F_HERO: [number, number] = [0.22, 0.56]; // pia, ladrilho, planta, janela
const F_DETAIL: [number, number] = [0.13, 0.63]; // materialidade: ladrilho + bancada de madeira

// ------------------------------------------------------------------ gancho ----
const Opening: React.FC<{ opening: Opening }> = ({ opening }) => {
  const frame = useCurrentFrame();
  if (opening === 'A') {
    // A. resultado pronto (parado, como fotografia) → corte para o modelo
    return frame < 52 ? (
      <Cover src={RENDER} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1, 1]} />
    ) : (
      <Cover src={BASE} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1, 1]} brightness={0.9} />
    );
  }
  if (opening === 'B') {
    // B. modelo → render revelado por comparação (régua)
    const p = ease(frame, [40, 80], [0, 1], theme.ease.inOut);
    return (
      <RulerWipe
        progress={p}
        under={<Cover src={BASE} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1.03, 1.06]} span={[0, 90]} brightness={0.9} />}
        over={<Cover src={RENDER} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1.03, 1.06]} span={[0, 90]} />}
      />
    );
  }
  // principal: o take mais forte (push-in no render) → corte preciso para o modelo no MESMO enquadramento
  return frame < 48 ? (
    <Cover src={RENDER} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1, 1.06]} span={[0, 90]} />
  ) : (
    <Cover src={BASE} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[1, 1.06]} span={[0, 90]} brightness={0.9} />
  );
};

// --------------------------------------------------------------- resultado ----
const Result: React.FC<{ opening: Opening }> = ({ opening }) => {
  const frame = useCurrentFrame();
  const z0 = opening === 'A' ? 1 : 1.06;
  const p = opening === 'B' ? 1 : ease(frame, [0, 16], [0, 1], theme.ease.inOut);
  return (
    <RulerWipe
      progress={p}
      under={<Cover src={BASE} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[z0, z0 + 0.03]} brightness={0.9} />}
      over={<Cover src={RENDER} aspect={ASPECT.cozinha} focus={F_HERO} zoom={[z0, z0 + 0.03]} />}
    />
  );
};

// -------------------------------------------------------------- plataforma ----
// O render em tela cheia encolhe até a célula onde ele mora na landing (seção Projetos),
// o site aparece em volta, e a câmera sobe até o hero em Glass Mode.
const PAGE_W = 1080;
const PAGE_SCALE = PAGE_W / 1290;
const PAGE_H = Math.round(6600 * PAGE_SCALE);
const CELL = { left: 69 * PAGE_SCALE, top: 3271 * PAGE_SCALE, width: 1152 * PAGE_SCALE, height: 648 * PAGE_SCALE };
const CARD_TOP = 330;
const PAGE_Y0 = 500 - CELL.top; // célula a 500px do topo do cartão
const Platform: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = enter(frame, 0, fps, theme.spring.settle);
  const cardTop = CARD_TOP * s;
  const cardRadius = 40 * s;
  const pageOpacity = ease(frame, [16, 44], [0, 1], theme.ease.out);
  const pageY = ease(frame, [66, 160], [PAGE_Y0, 0], theme.ease.inOut);
  // camada do render: de tela cheia até o retângulo da célula
  const rl = ease(s, [0, 1], [0, CELL.left], theme.ease.out);
  const rt = ease(s, [0, 1], [0, CARD_TOP + 500], theme.ease.out);
  const rw = ease(s, [0, 1], [W, CELL.width], theme.ease.out);
  const rh = ease(s, [0, 1], [H, CELL.height], theme.ease.out);
  const rr = 18 * s;
  const renderOpacity = ease(frame, [56, 68], [1, 0], theme.ease.in);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: cardTop,
          width: W,
          height: H - cardTop,
          overflow: 'hidden',
          borderTopLeftRadius: cardRadius,
          borderTopRightRadius: cardRadius,
          borderTop: `1px solid ${theme.colors.glassBorder}`,
          backgroundColor: theme.colors.bg,
          opacity: pageOpacity,
        }}
      >
        <Img src={staticFile('assets/site-mobile-top.png')} style={{ position: 'absolute', left: 0, top: pageY, width: PAGE_W, height: PAGE_H }} />
      </div>
      <div style={{ position: 'absolute', left: rl, top: rt, width: rw, height: rh, borderRadius: rr, overflow: 'hidden', opacity: renderOpacity }}>
        <Img src={staticFile(RENDER)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '38% 55%' }} />
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ plugin ----
const TL_SRC = 'assets/gerando-timelapse-sem-saldo.mp4';
const TL_FRAMES = 133; // 4,43s gravados
const Plugin: React.FC = () => {
  const frame = useCurrentFrame();
  const stageIn = ease(frame, [46, 56], [0, 1], theme.ease.out);
  return (
    <AbsoluteFill>
      <Cover src="assets/su-43-center.png" aspect={ASPECT.sketchup43} focus={[0.5, 0.56]} zoom={[1, 1.045]} span={[0, 60]} />
      {frame >= 46 && frame < 92 && (
        <PanelStage src="assets/panel-00-estado-inicial.png" opacity={stageIn}>
          <ClickRing px={109} py={484} at={76} />
        </PanelStage>
      )}
      {frame >= 92 && frame < 120 && <PanelStage src="assets/panel-01-apos-capturar.png" />}
      {frame >= 120 && frame < 210 && (
        <AbsoluteFill style={{ backgroundColor: theme.colors.card }}>
          <Sequence from={120} durationInFrames={90} layout="none">
            <Video src={staticFile(TL_SRC)} playbackRate={TL_FRAMES / 90} muted style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
          </Sequence>
        </AbsoluteFill>
      )}
      {frame >= 210 && <PanelStage src="assets/panel-11-resultado-novo.png" />}
    </AbsoluteFill>
  );
};

// --------------------------------------------------------------------- app ----
const APP_REF = { x: 1036, y: 1243, w: 700, h: 369 }; // retângulo da referência no PNG 1800x2800
const App: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = ease(frame, [0, 8], [0, 1], theme.ease.out);
  if (frame < 120) {
    // a página inteira do Renderizar (painel + referência) → aproximação suave até a referência,
    // onde o render entra pela régua. A âncora é o centro da imagem de referência.
    const cx0 = APP_REF.x + APP_REF.w / 2;
    const cy0 = APP_REF.y + APP_REF.h / 2;
    const s = ease(frame, [0, 110], [0.6, 1.08], theme.ease.soft);
    // termina com a referência centrada e o painel lateral fora do quadro (nada de custo em nodes em cena)
    const cx = ease(frame, [0, 110], [cx0 * 0.6, 540], theme.ease.soft);
    const cy = ease(frame, [0, 110], [120 + cy0 * 0.6, 900], theme.ease.soft);
    const left = cx - cx0 * s;
    const top = cy - cy0 * s;
    const rect = { left: left + APP_REF.x * s, top: top + APP_REF.y * s, width: APP_REF.w * s, height: APP_REF.h * s };
    const p = ease(frame, [56, 100], [0, 1], theme.ease.inOut);
    return (
      <AbsoluteFill style={{ backgroundColor: '#F4F1EC', opacity: fadeIn }}>
        <RulerWipe
          progress={p}
          rect={rect}
          under={<Img src={staticFile('assets/app-renderizar.png')} style={{ position: 'absolute', left, top, width: 1800 * s, height: 2800 * s }} />}
          over={
            <div style={{ position: 'absolute', ...rect, overflow: 'hidden' }}>
              <Img src={staticFile(RENDER)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          }
        />
      </AbsoluteFill>
    );
  }
  const f = frame - 120;
  const s = ease(f, [0, 90], [0.6, 0.64], theme.ease.soft);
  const cut = ease(f, [0, 6], [0, 1], theme.ease.out);
  return (
    <AbsoluteFill style={{ backgroundColor: '#F4F1EC', opacity: cut }}>
      <Img src={staticFile('assets/app-spaces.png')} style={{ position: 'absolute', left: (W - 1800 * s) / 2, top: 120 - (1800 * s - 1080) * 0.2, width: 1800 * s, height: 2800 * s }} />
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------------- fecho ----
const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = ease(frame, [0, 10], [0, 1], theme.ease.out);
  const dark = ease(frame, [50, 82], [0, 0.76], theme.ease.soft);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Cover src={RENDER} aspect={ASPECT.cozinha} focus={[0.5, 0.52]} zoom={[1, 1.05]} />
      <Scrim full={dark} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------- V1 ----
export const V1: React.FC<V1Props> = ({ audio, opening }) => {
  const wipeAt = opening === 'B' ? 40 : 90;
  return (
    <Bg>
      <Sequence from={0} durationInFrames={T.hookEnd} name="gancho">
        <Opening opening={opening} />
      </Sequence>
      <Sequence from={T.hookEnd} durationInFrames={T.detail - T.hookEnd} name="resultado">
        <Result opening={opening} />
      </Sequence>
      <Sequence from={T.detail} durationInFrames={T.result - T.detail} name="materialidade">
        <Cover src={RENDER} aspect={ASPECT.cozinha} focus={F_DETAIL} zoom={[1.75, 1.86]} drift={[-26, 0]} />
      </Sequence>
      <Sequence from={T.result} durationInFrames={T.platform - T.result} name="plataforma">
        <Platform />
      </Sequence>
      <Sequence from={T.platform} durationInFrames={T.plugin - T.platform} name="plugin">
        <Plugin />
      </Sequence>
      <Sequence from={T.plugin} durationInFrames={T.app - T.plugin} name="app">
        <App />
      </Sequence>
      <Sequence from={T.app} durationInFrames={T.end - T.app} name="fecho">
        <Close />
      </Sequence>

      {/* scrims sob os textos */}
      <Sequence from={48} durationInFrames={62} layout="none">
        <ScrimFade top={0.62} />
      </Sequence>
      <Sequence from={T.platform + 4} durationInFrames={150} layout="none">
        <ScrimFade top={0.5} />
      </Sequence>

      {/* textos — trocam em corte, nunca atravessados pelo wipe */}
      <Sequence from={opening === 'B' ? 6 : 50} durationInFrames={opening === 'B' ? 62 : 58} layout="none">
        <Hook text="começou com este modelo." top={286} />
      </Sequence>
      <Sequence from={100} durationInFrames={T.result - 100} layout="none">
        <Credit author={CREDIT} />
      </Sequence>
      <Sequence from={356} durationInFrames={T.platform - 356} layout="none">
        <Hook text="conheça a SpaceNode." top={236} size={58} />
      </Sequence>
      <Sequence from={T.platform + 6} durationInFrames={150} layout="none">
        <Hook text="renderize de dentro do SketchUp." top={250} size={54} />
      </Sequence>
      <Sequence from={T.platform + 124} durationInFrames={86} layout="none">
        <Chip text="espera comprimida · o render leva minutos" top={1556} />
      </Sequence>
      <Sequence from={T.plugin + 40} durationInFrames={T.app - T.plugin - 46} layout="none">
        <Hook text="do modelo à apresentação." top={250} size={54} glass />
      </Sequence>
      <Sequence from={T.app + 60} durationInFrames={T.end - T.app - 60} layout="none">
        <FinalCard cta="veja no seu próprio projeto." url="spacenode.app" logoTop={690} />
      </Sequence>
      <Sequence from={T.app + 16} durationInFrames={T.end - T.app - 16} layout="none">
        <Credit author={CREDIT} />
      </Sequence>

      <Vignette strength={0.2} />

      {audio && (
        <>
          <Bed src="audio/bed-40s.wav" volume={0.5} />
          <Sfx name="whoosh" at={wipeAt} volume={0.55} />
          <Sfx name="impact" at={opening === 'B' ? 62 : 92} volume={0.7} />
          <Sfx name="tick" at={T.detail} volume={0.45} />
          <Sfx name="whoosh" at={T.result + 4} volume={0.4} />
          <Sfx name="tick" at={T.result + 60} volume={0.5} />
          <Sfx name="whoosh" at={T.result + 70} volume={0.35} />
          <Sfx name="click" at={T.platform + 76} volume={0.8} />
          <Sfx name="tick" at={T.platform + 92} volume={0.5} />
          <Sfx name="tick" at={T.platform + 210} volume={0.6} />
          <Sfx name="whoosh" at={T.plugin} volume={0.35} />
          <Sfx name="click" at={T.plugin + 56} volume={0.7} />
          <Sfx name="tick" at={T.plugin + 120} volume={0.5} />
          <Sfx name="whoosh" at={T.app} volume={0.4} />
          <Sfx name="tick" at={T.app + 60} volume={0.5} />
        </>
      )}
    </Bg>
  );
};

/** Scrim que entra e sai suave junto com o texto que ele sustenta. */
const ScrimFade: React.FC<{ top?: number; bottom?: number }> = ({ top = 0, bottom = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = Math.min(ease(frame, [0, 10], [0, 1], theme.ease.out), ease(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], theme.ease.in));
  return <Scrim top={top} bottom={bottom} opacity={o} />;
};
