'use client';

import LegacyScripts, { type LegacyScript } from '@/legacy/LegacyScripts';
import start from './settings.js';

/** Settings: starts the page's own code (./settings.js), then the shared asset scripts in `scripts` */
export default function SettingsScripts({ scripts }: { scripts: LegacyScript[] }) {
  return <LegacyScripts scripts={scripts} start={start} />;
}
