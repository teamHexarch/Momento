import type { CSSProperties } from 'react';

export default function SvgSprite() {
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' } as CSSProperties} aria-hidden="true">
        <symbol id="glyph-album" viewBox="165.5 161.5 700 700">
          <g fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
            <g fill="none" strokeWidth="22">
              <rect x="197" y="328" width="130" height="40" rx="20" />
              <rect x="197" y="432" width="130" height="40" rx="20" />
              <rect x="197" y="536" width="130" height="40" rx="20" />
              <rect x="197" y="640" width="130" height="40" rx="20" />
            </g>
            <rect x="262" y="232" width="560" height="559" rx="88" fill="none" strokeWidth="44" />
            <polygon points="428,331 658,331 543,468" strokeWidth="20" />
            <circle cx="542" cy="524" r="27" stroke="none" />
            <polygon points="361,691 457,557 542,616 627,557 726,691" strokeWidth="20" />
          </g>
        </symbol>
        {/* Letters take currentColor; the final o is a dawn sky over still water, in this palette */}
        <symbol id="wordmark" viewBox="-81.92 -1601.72 9217 1726">
          <g transform="scale(1 -1)">
            <defs>
              <linearGradient id="wm-sky" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#EED8D2" /><stop offset="1" stopColor="#B98AA8" /></linearGradient>
              <clipPath id="wm-up"><rect x="7842.7" y="586.7" width="1164.0" height="582.0" /></clipPath>
              <clipPath id="wm-dn"><rect x="7842.7" y="-27.0" width="1164.0" height="550.3" /></clipPath>
            </defs>
            <circle cx="8424.7" cy="555.0" r="577.0" fill="url(#wm-sky)" clipPath="url(#wm-up)" />
            <circle cx="8424.7" cy="555.0" r="577.0" fill="#6F9896" clipPath="url(#wm-dn)" />
            <g fill="currentColor">
              <path d="M135 0H438V703C438 815 430 1034 427 1215C480 1015 540 806 575 703L826 0H1083L1330 703C1365 809 1428 1026 1478 1227C1475 1039 1467 815 1467 703V0H1774V1490H1304L1066 806C1036 711 990 512 956 351C921 513 875 712 845 806L603 1490H135Z" />
              <path transform="translate(1815.8 0)" d="M628 -22C964 -22 1175 210 1175 554C1175 900 964 1132 628 1132C291 1132 81 900 81 554C81 210 291 -22 628 -22ZM628 214C468 214 387 360 387 555C387 753 468 896 628 896C788 896 870 752 870 555C870 360 788 214 628 214Z" />
              <path transform="translate(2979.7 0)" d="M128 0H428V676C428 810 509 884 615 884C717 884 789 814 789 705V0H1079V688C1079 805 1149 884 1263 884C1364 884 1440 823 1440 697V0H1741V754C1741 997 1589 1135 1384 1135C1230 1135 1088 1056 1025 884C973 1054 880 1135 737 1135C603 1135 478 1064 418 901L406 1118H128Z" />
              <path transform="translate(4756.5 0)" d="M633 -22C893 -22 1071 99 1126 285L854 336C822 250 743 204 638 204C487 204 385 298 378 481H1143V565C1143 947 910 1132 618 1132C291 1132 81 898 81 553C81 200 291 -22 633 -22ZM380 669C392 807 478 906 621 906C760 906 839 815 854 669Z" />
              <path transform="translate(5884.4 0)" d="M428 647C428 795 517 881 645 881C771 881 847 798 847 659V0H1147V711C1147 973 995 1132 763 1132C591 1132 478 1043 415 887L411 1118H128V0H428Z" />
              <path transform="translate(7067.2 0)" d="M683 1118H474V1384H174V1118H20V889H174V301C174 96 296 -16 520 -16C580 -16 647 -9 714 11L671 236C649 230 599 223 576 223C503 223 474 256 474 327V889H683Z" />
            </g>
          </g>
        </symbol>
      </svg>
    </>
  );
}
