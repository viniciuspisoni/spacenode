import React from 'react';
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video } from '@remotion/media';
import { theme, ASPECT } from '../theme';
import { ease } from '../lib/anim';
import { Bg, Scrim, Vignette } from '../components/Layers';
import { Band, Cover, RulerWipe, bandGeometry } from '../components/Picture';
import { Hook, Chip } from '../components/Typo';
import { FinalCard } from '../components/Brand';
import { PanelStage, ClickRing, PanelCompare } from '../components/Plugin';
import { Bed, Sfx } from '../components/Sound';

export type V2Props = { audio: boolean };

const { w: W, h: H } = theme.frame;
const TL_SRC = 'assets/gerando-timelapse-sem-saldo.mp4';
const TL_FRAMES = 133;

// 0–3,5 enquadramento (modelo → render) · 3,5–5 SketchUp · 5–8 painel + captura ·
// 8–12,4 geração (tempo real do time-lapse) · 12,4–14 resultado · 14–17,5 comparador · 17,5–20 fecho
const T = { pair: 105, su: 150, panel: 240, tl: 373, result: 420, compare: 525, end: 600 } as const;

const Pair: React.FC = () => {
  const frame = useCurrentFrame();
  const p = ease(frame, [36, 62], [0, 1], theme.ease.inOut);
  const band = bandGeometry(ASPECT.sala);
  return (
    <RulerWipe
      progress={p}
      lineHeight={[band.top, band.top + band.height]}
      under={<Band src="assets/sala-base.jpg" aspect={ASPECT.sala} zoom={[1, 1.02]} />}
      over={<Band src="assets/sala-render.jpg" aspect={ASPECT.sala} zoom={[1, 1.02]} />}
    />
  );
};

const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  // 0–45 viewport do SketchUp · 45–90 painel entra · 90–135 captura · 135–268 gerando · 268–315 resultado
  const stageIn = ease(frame, [40, 52], [0, 1], theme.ease.out);
  return (
    <AbsoluteFill>
      <Cover src="assets/su-43-center.png" aspect={ASPECT.sketchup43} focus={[0.5, 0.56]} zoom={[1, 1.04]} span={[0, 60]} />
      {frame >= 40 && frame < 96 && (
        <Sequence from={40} durationInFrames={56} layout="none">
          <PanelStage src="assets/panel-00-estado-inicial.png" opacity={stageIn} slideFrom={260}>
            <ClickRing px={109} py={484} at={40} />
          </PanelStage>
        </Sequence>
      )}
      {frame >= 96 && frame < 135 && <PanelStage src="assets/panel-01-apos-capturar.png" />}
      {frame >= 135 && frame < 268 && (
        <AbsoluteFill style={{ backgroundColor: theme.colors.card }}>
          <Sequence from={135} durationInFrames={TL_FRAMES} layout="none">
            <Video src={staticFile(TL_SRC)} playbackRate={1} muted style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
          </Sequence>
        </AbsoluteFill>
      )}
      {frame >= 268 && <PanelStage src="assets/panel-11-resultado-novo.png" />}
    </AbsoluteFill>
  );
};

const Compare: React.FC = () => {
  const frame = useCurrentFrame();
  const p = ease(frame, [12, 66], [0, 1], theme.ease.inOut);
  return <PanelCompare progress={p} capture="assets/panel-12-comparar2-100.png" render="assets/panel-14-comparar2-000.png" />;
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = ease(frame, [0, 10], [0, 1], theme.ease.out);
  const dark = ease(frame, [0, 24], [0, 0.78], theme.ease.soft);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Band src="assets/sala-render.jpg" aspect={ASPECT.sala} zoom={[1.02, 1.05]} />
      <Scrim full={dark} />
    </AbsoluteFill>
  );
};

export const V2: React.FC<V2Props> = ({ audio }) => (
  <Bg>
    <Sequence from={0} durationInFrames={T.pair} name="enquadramento">
      <Pair />
    </Sequence>
    <Sequence from={T.pair} durationInFrames={T.result - T.pair} name="sketchup-plugin">
      <Stage />
    </Sequence>
    <Sequence from={T.result} durationInFrames={T.compare - T.result} name="comparador">
      <Compare />
    </Sequence>
    <Sequence from={T.compare} durationInFrames={T.end - T.compare} name="fecho">
      <Close />
    </Sequence>

    <Sequence from={0} durationInFrames={T.pair} layout="none">
      <ScrimTop />
    </Sequence>
    <Sequence from={6} durationInFrames={96} layout="none">
      <Hook text="o enquadramento começa aqui." top={300} />
    </Sequence>
    <Sequence from={T.pair + 6} durationInFrames={90} layout="none">
      <Hook text="a vista que você escolheu." top={250} size={54} />
    </Sequence>
    <Sequence from={T.pair + 140} durationInFrames={126} layout="none">
      <Chip text="espera comprimida · o render leva minutos" top={1556} />
    </Sequence>
    <Sequence from={T.pair + 272} durationInFrames={100} layout="none">
      <Hook text="o render volta ao painel." top={250} size={54} />
    </Sequence>
    <Sequence from={T.result + 56} durationInFrames={T.compare - T.result - 50} layout="none">
      <Hook text="compare com o seu modelo." top={250} size={54} />
    </Sequence>
    <Sequence from={T.compare + 10} durationInFrames={T.end - T.compare - 10} layout="none">
      <FinalCard cta="renderize seu projeto." url="spacenode.app/sketchup" logoTop={690} />
    </Sequence>

    <Vignette strength={0.18} />

    {audio && (
      <>
        <Bed src="audio/bed-24s.wav" volume={0.5} />
        <Sfx name="whoosh" at={36} volume={0.55} />
        <Sfx name="impact" at={40} volume={0.6} />
        <Sfx name="tick" at={T.pair} volume={0.45} />
        <Sfx name="whoosh" at={T.pair + 40} volume={0.4} />
        <Sfx name="click" at={T.pair + 40 + 40} volume={0.8} />
        <Sfx name="tick" at={T.pair + 96} volume={0.5} />
        <Sfx name="tick" at={T.pair + 268} volume={0.6} />
        <Sfx name="whoosh" at={T.result + 12} volume={0.5} />
        <Sfx name="tick" at={T.result + 66} volume={0.5} />
        <Sfx name="whoosh" at={T.compare} volume={0.4} />
      </>
    )}
  </Bg>
);

const ScrimTop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = Math.min(ease(frame, [0, 8], [0, 1], theme.ease.out), ease(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], theme.ease.in));
  return <Scrim top={0.5} opacity={o} />;
};
