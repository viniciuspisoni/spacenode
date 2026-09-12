import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme, ASPECT } from '../theme';
import { ease } from '../lib/anim';
import { Bg, Scrim, Vignette } from '../components/Layers';
import { Band, Cover, RegionView, RulerWipe, bandGeometry } from '../components/Picture';
import { Hook, Credit, Label } from '../components/Typo';
import { FinalCard } from '../components/Brand';
import { MarkRect, MarkLine } from '../components/Marks';
import { Bed, Sfx } from '../components/Sound';

export type V3Props = { audio: boolean };

const RENDER = 'assets/cozinha-render-2x.jpg';
const BASE = 'assets/cozinha-base-2x.jpg';
const CREDIT = 'muda arquitetura';
const A = ASPECT.cozinha;

// 0–1,5 modelo · 1,5–4,5 régua + resultado · 4,5–8 detalhe 1 (esquadria) · 8–11 detalhe 2 (mobiliário) ·
// 11–12,5 render limpo · 12,5–15 fecho
const T = { wipe: 45, split1: 135, split2: 240, clean: 330, close: 375, end: 450 } as const;

const BOX_TOP = { left: 0, top: 330, width: 1080, height: 590 };
const BOX_BOT = { left: 0, top: 1010, width: 1080, height: 590 };

// Regiões conferidas em cheio (base 1545x815 vs render 1600x845, mesma câmera):
// 1. porta de correr e batente, à direita  2. lava-louças, geladeira e estante, ao centro-direita
const REGION_DOOR: [number, number, number, number] = [0.6, 0.04, 0.4, 0.92];
const REGION_FURN: [number, number, number, number] = [0.38, 0.3, 0.44, 0.68];

const Pair: React.FC = () => {
  const frame = useCurrentFrame();
  const p = ease(frame, [T.wipe, T.wipe + 26], [0, 1], theme.ease.inOut);
  const band = bandGeometry(A);
  return (
    <RulerWipe
      progress={p}
      lineHeight={[band.top, band.top + band.height]}
      under={<Band src={BASE} aspect={A} zoom={[1, 1.015]} />}
      over={<Band src={RENDER} aspect={A} zoom={[1, 1.015]} />}
    />
  );
};

/** Split empilhado: modelo em cima, resultado embaixo, o MESMO recorte, as MESMAS marcações. */
const Split: React.FC<{ region: [number, number, number, number]; marks: 'door' | 'furniture' }> = ({ region, marks }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = ease(frame, [0, 8], [0, 1], theme.ease.out);
  const drawMarks = (toBox: (fx: number, fy: number) => { x: number; y: number }) => {
    if (marks === 'door') {
      const a = toBox(0.775, 0.1);
      const b = toBox(0.975, 0.94);
      return <MarkRect x={a.x} y={a.y} w={b.x - a.x} h={b.y - a.y} label="esquadria" delay={14} />;
    }
    const a = toBox(0.435, 0.37);
    const b = toBox(0.745, 0.94);
    const l1 = toBox(0.39, 0.635);
    const l2 = toBox(0.8, 0.635);
    return (
      <>
        <MarkRect x={a.x} y={a.y} w={b.x - a.x} h={b.y - a.y} label="mobiliário" delay={14} />
        <MarkLine x1={l1.x} y1={l1.y} x2={l2.x} y2={l2.y} delay={30} label="alinhamento" />
      </>
    );
  };
  void fps;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg, opacity: fadeIn }}>
      <RegionView src={BASE} aspect={A} region={region} box={BOX_TOP} zoom={[1, 1.03]}>
        {drawMarks}
      </RegionView>
      <RegionView src={RENDER} aspect={A} region={region} box={BOX_BOT} zoom={[1, 1.03]}>
        {drawMarks}
      </RegionView>
      <Label text="modelo" left={24} top={BOX_TOP.top + 22} delay={4} />
      <Label text="resultado" left={24} top={BOX_BOT.top + 22} delay={8} />
    </AbsoluteFill>
  );
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = ease(frame, [0, 10], [0, 1], theme.ease.out);
  const dark = ease(frame, [4, 30], [0, 0.76], theme.ease.soft);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Cover src={RENDER} aspect={A} focus={[0.3, 0.55]} zoom={[1.02, 1.07]} />
      <Scrim full={dark} />
    </AbsoluteFill>
  );
};

export const V3: React.FC<V3Props> = ({ audio }) => (
  <Bg>
    <Sequence from={0} durationInFrames={T.split1} name="modelo-resultado">
      <Pair />
    </Sequence>
    <Sequence from={T.split1} durationInFrames={T.split2 - T.split1} name="detalhe-esquadria">
      <Split region={REGION_DOOR} marks="door" />
    </Sequence>
    <Sequence from={T.split2} durationInFrames={T.clean - T.split2} name="detalhe-mobiliario">
      <Split region={REGION_FURN} marks="furniture" />
    </Sequence>
    <Sequence from={T.clean} durationInFrames={T.close - T.clean} name="render-limpo">
      <CleanBand />
    </Sequence>
    <Sequence from={T.close} durationInFrames={T.end - T.close} name="fecho">
      <Close />
    </Sequence>

    <Sequence from={4} durationInFrames={T.wipe - 2} layout="none">
      <Hook text="o modelo." top={540} />
    </Sequence>
    <Sequence from={T.wipe + 14} durationInFrames={T.split1 - T.wipe - 14} layout="none">
      <Hook text="o resultado." top={540} />
    </Sequence>
    <Sequence from={T.split1 + 6} durationInFrames={T.clean - T.split1 - 10} layout="none">
      <Hook text="compare os detalhes." top={236} size={54} />
    </Sequence>
    <Sequence from={T.wipe + 30} durationInFrames={T.split1 - T.wipe - 30} layout="none">
      <Credit author={CREDIT} top={1560} />
    </Sequence>
    <Sequence from={T.clean + 6} durationInFrames={T.end - T.clean - 6} layout="none">
      <Credit author={CREDIT} top={1540} />
    </Sequence>
    <Sequence from={T.close + 24} durationInFrames={T.end - T.close - 24} layout="none">
      <FinalCard cta="teste com um projeto real." url="spacenode.app" logoTop={690} />
    </Sequence>

    <Vignette strength={0.18} />

    {audio && (
      <>
        <Bed src="audio/bed-18s.wav" volume={0.5} />
        <Sfx name="whoosh" at={T.wipe} volume={0.55} />
        <Sfx name="impact" at={T.wipe + 4} volume={0.65} />
        <Sfx name="tick" at={T.split1} volume={0.5} />
        <Sfx name="tick" at={T.split1 + 14} volume={0.4} />
        <Sfx name="tick" at={T.split2} volume={0.5} />
        <Sfx name="tick" at={T.split2 + 14} volume={0.4} />
        <Sfx name="whoosh" at={T.clean} volume={0.4} />
        <Sfx name="tick" at={T.close + 24} volume={0.5} />
      </>
    )}
  </Bg>
);

const CleanBand: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = ease(frame, [0, 8], [0, 1], theme.ease.out);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Band src={RENDER} aspect={A} zoom={[1.015, 1.03]} />
    </AbsoluteFill>
  );
};
