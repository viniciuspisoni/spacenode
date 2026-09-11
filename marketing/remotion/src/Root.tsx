import React from 'react';
import { Composition, Folder } from 'remotion';
import './fonts';
import { V1 } from './videos/V1';
import { V2 } from './videos/V2';
import { V3 } from './videos/V3';

const FPS = 30;
const W = 1080;
const H = 1920;

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Campanha-2026-09-11">
      <Composition
        id="V1-seu-projeto-em-cena"
        component={V1}
        durationInFrames={1050}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ audio: true, opening: 'main' as const }}
      />
      <Composition
        id="V1-abertura-A"
        component={V1}
        durationInFrames={1050}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ audio: true, opening: 'A' as const }}
      />
      <Composition
        id="V1-abertura-B"
        component={V1}
        durationInFrames={1050}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ audio: true, opening: 'B' as const }}
      />
      <Composition id="V2-a-vista-que-voce-escolheu" component={V2} durationInFrames={600} fps={FPS} width={W} height={H} defaultProps={{ audio: true }} />
      <Composition id="V3-olhe-para-as-linhas" component={V3} durationInFrames={450} fps={FPS} width={W} height={H} defaultProps={{ audio: true }} />
    </Folder>
  </>
);
