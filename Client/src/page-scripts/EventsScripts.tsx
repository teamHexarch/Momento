'use client';

import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import start from './events.js';

/** Social: starts the page's own code (./events.js), then the shared asset scripts in `scripts` */
export default function EventsScripts({ scripts }: { scripts: LegacyScript[] }) {
  return <LegacyScripts scripts={scripts} start={start} />;
}
