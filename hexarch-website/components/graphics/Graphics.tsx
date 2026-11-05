/** Original Hexarch graphics, drawn in SVG. No image files from any template. */

const chrome = (id: string) => (
  <defs>
    <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#f4f4f4" />
      <stop offset="0.45" stopColor="#8a8a8a" />
      <stop offset="1" stopColor="#262626" />
    </linearGradient>
    <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#3a3a3a" />
      <stop offset="1" stopColor="#121212" />
    </linearGradient>
    <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
      <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
  </defs>
);

export function BuildIcon({ kind, className }: { kind: string; className?: string }) {
  const id = `ic-${kind}`;
  return (
    <svg viewBox="0 0 140 120" className={className} aria-hidden="true">
      {chrome(id)}
      <ellipse cx="70" cy="108" rx="44" ry="6" fill="#ffffff" opacity="0.06" />
      {kind === "album" && (
        <g>
          <rect x="36" y="30" width="58" height="58" rx="12" fill={`url(#${id}-b)`} stroke="#4a4a4a" transform="rotate(-10 65 59)" />
          <rect x="46" y="24" width="58" height="58" rx="12" fill={`url(#${id}-a)`} />
          <circle cx="64" cy="44" r="7" fill="#1b1b1b" opacity="0.8" />
          <path d="M50 76 66 58l10 10 8-8 16 16v0a6 6 0 0 1-6 6H56a6 6 0 0 1-6-6Z" fill="#1b1b1b" opacity="0.75" />
          <rect x="46" y="24" width="58" height="10" rx="5" fill={`url(#${id}-c)`} opacity="0.5" />
        </g>
      )}
      {kind === "design" && (
        <g>
          <rect x="28" y="26" width="84" height="62" rx="12" fill={`url(#${id}-b)`} stroke="#4a4a4a" />
          <path d="M44 74 62 50l12 14 8-9 14 19Z" fill={`url(#${id}-a)`} />
          <circle cx="90" cy="44" r="7" fill={`url(#${id}-a)`} />
          <path d="m96 18 14 14-30 30-17 4 4-17Z" fill={`url(#${id}-a)`} stroke="#111" strokeWidth="1.5" />
        </g>
      )}
      {kind === "code" && (
        <g>
          <rect x="24" y="22" width="92" height="70" rx="12" fill={`url(#${id}-b)`} stroke="#4a4a4a" />
          <rect x="24" y="22" width="92" height="16" rx="8" fill="#2b2b2b" />
          <circle cx="36" cy="30" r="3" fill="#777" />
          <circle cx="46" cy="30" r="3" fill="#777" />
          <circle cx="56" cy="30" r="3" fill="#777" />
          <path d="m56 52-12 12 12 12M84 52l12 12-12 12" stroke={`url(#${id}-a)`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="m74 50-8 28" stroke="#d8d8d8" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
      {kind === "research" && (
        <g>
          <rect x="30" y="64" width="14" height="26" rx="4" fill={`url(#${id}-b)`} stroke="#4a4a4a" />
          <rect x="50" y="50" width="14" height="40" rx="4" fill={`url(#${id}-b)`} stroke="#4a4a4a" />
          <rect x="70" y="36" width="14" height="54" rx="4" fill={`url(#${id}-a)`} />
          <circle cx="92" cy="48" r="18" fill="none" stroke={`url(#${id}-a)`} strokeWidth="7" />
          <path d="m105 61 12 12" stroke="#e5e5e5" strokeWidth="8" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** A Momento album screen in Momento's own palette (dusk, lavender, blush, copper, tide). */
export function MomentoPhone({ className }: { className?: string }) {
  const tiles = [
    ["#D9D0EA", "#6F9896"],
    ["#E6CDD6", "#9A603D"],
    ["#6F9896", "#2E2C3A"],
    ["#C08A66", "#E6CDD6"],
    ["#2E2C3A", "#D9D0EA"],
    ["#9A603D", "#ECEAF0"],
  ];
  return (
    <svg viewBox="0 0 300 600" className={className} role="img" aria-label="Momento album screen showing a grid of guest photos">
      <defs>
        <linearGradient id="mp-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5a5866" />
          <stop offset="0.5" stopColor="#1a1922" />
          <stop offset="1" stopColor="#3b3946" />
        </linearGradient>
        {tiles.map(([a, b], i) => (
          <linearGradient key={i} id={`mp-t${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
      </defs>
      <rect x="2" y="2" width="296" height="596" rx="46" fill="url(#mp-frame)" />
      <rect x="12" y="12" width="276" height="576" rx="38" fill="#F8F7FA" />
      <rect x="110" y="24" width="80" height="22" rx="11" fill="#0d0d0d" />
      <text x="32" y="86" fontFamily="Inter, sans-serif" fontSize="12" fill="#8A8697">Saved to your cloud</text>
      <text x="32" y="114" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="600" fill="#2E2C3A">Saturday&apos;s album</text>
      {["All", "Phones", "Cameras"].map((t, i) => (
        <g key={t}>
          <rect x={32 + i * 74} y="130" width={i === 0 ? 44 : 66} height="26" rx="13" fill={i === 0 ? "#2E2C3A" : "#ECEAF0"} />
          <text x={32 + i * 74 + (i === 0 ? 22 : 33)} y="147" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fill={i === 0 ? "#fff" : "#5C596B"}>
            {t}
          </text>
        </g>
      ))}
      {tiles.map((_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return <rect key={i} x={32 + col * 122} y={172 + row * 122} width="114" height="114" rx="16" fill={`url(#mp-t${i})`} />;
      })}
      <rect x="70" y="540" width="160" height="34" rx="17" fill="#2E2C3A" />
      <text x="150" y="562" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fill="#fff">
        248 photos saved
      </text>
    </svg>
  );
}

/** Placeholder portrait until a real team photo is added to public/team/. */
export function PortraitPlaceholder({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_90%_at_50%_10%,#3a3a3a_0%,#161616_55%,#0a0a0a_100%)]">
      <span className="font-serif text-[160px] leading-none text-white/80 italic">{name.charAt(0)}</span>
    </div>
  );
}

/** Slowly moving wave lines for the contact panel background. */
export function WaveLines({ className }: { className?: string }) {
  const lines = Array.from({ length: 22 }, (_, i) => i);
  const path = (i: number) => {
    const y = 40 + i * 22;
    const amp = 18 + i * 1.6;
    let d = `M0 ${y}`;
    for (let x = 0; x < 2400; x += 200) {
      const peak = (x / 200) % 2 === 0 ? y - amp : y + amp;
      d += ` Q ${x + 100} ${peak} ${x + 200} ${y}`;
    }
    return d;
  };
  return (
    <div className={`pointer-events-none overflow-hidden ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 2400 560" preserveAspectRatio="none" className="wave-track h-full w-[200%]">
        {lines.map((i) => (
          <path key={i} d={path(i)} fill="none" stroke="#ffffff" strokeOpacity={0.04 + (i / 22) * 0.1} strokeWidth="1" />
        ))}
      </svg>
    </div>
  );
}
