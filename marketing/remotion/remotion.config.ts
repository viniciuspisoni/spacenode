import path from 'node:path';
import { Config } from '@remotion/cli/config';

// Rode sempre a partir desta pasta: `cd marketing/remotion && npx remotion ...`
// public/ fica aqui ao lado (brand/, assets/, audio/). O Remotion resolve a raiz pelo
// package.json mais próximo (a raiz do repo), então o public/ precisa ser apontado à mão.
Config.setPublicDir(path.join(process.cwd(), 'public'));
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(17);
Config.setConcurrency(4);
