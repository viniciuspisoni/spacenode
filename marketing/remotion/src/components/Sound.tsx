import React from 'react';
import { Audio } from '@remotion/media';
import { Sequence, staticFile, interpolate, useVideoConfig } from 'remotion';

/**
 * Trilha: bed sintetizado (marketing/remotion/tools/synth-audio.mjs). Fade in 0,3s / out 0,8s.
 * Volume baixo o bastante para caber embaixo de fala; os SFX sentam por cima.
 */
export const Bed: React.FC<{ src: string; volume?: number; durationInFrames?: number }> = ({ src, volume = 0.55, durationInFrames }) => {
  const { fps, durationInFrames: compDur } = useVideoConfig();
  const dur = durationInFrames ?? compDur;
  return (
    <Audio
      src={staticFile(src)}
      trimAfter={dur}
      volume={(f) =>
        interpolate(f, [0, 0.3 * fps, dur - 0.8 * fps, dur - 1], [0, volume, volume, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};

/** Efeito no frame `at` — começa 2 frames ANTES do movimento visual (soa sincronizado). */
export const Sfx: React.FC<{ name: 'click' | 'tick' | 'whoosh' | 'impact' | 'riser'; at: number; volume?: number }> = ({ name, at, volume = 0.8 }) => (
  <Sequence from={Math.max(0, at - 2)} layout="none">
    <Audio src={staticFile(`audio/${name}.wav`)} volume={volume} />
  </Sequence>
);
