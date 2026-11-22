'use client';

import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import start from './support.js';

/** Support: starts the page's own code (./support.js), then the shared asset scripts in `scripts` */
export default function SupportScripts({ scripts }: { scripts: LegacyScript[] }) {
  return <LegacyScripts scripts={scripts} start={start} />;
}
