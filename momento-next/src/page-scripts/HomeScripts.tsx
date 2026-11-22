'use client';

import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import start from './home.js';

/** Home: starts the page's own code (./home.js), then the shared asset scripts in `scripts` */
export default function HomeScripts({ scripts }: { scripts: LegacyScript[] }) {
  return <LegacyScripts scripts={scripts} start={start} />;
}
