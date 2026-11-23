'use client';

import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import start from './albums.js';

/** My albums: starts the page's own code (./albums.js), then the shared asset scripts in `scripts` */
export default function AlbumsScripts({ scripts }: { scripts: LegacyScript[] }) {
  return <LegacyScripts scripts={scripts} start={start} />;
}
