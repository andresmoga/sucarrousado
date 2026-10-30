/** Logo oficial (versión G: línea de luz y vía amarilla), mismo dibujo que en la web. Lo usan el video del servidor y el de la demostración. */
export function logoSvg(width: number, opts: { text?: boolean } = {}): string {
  const text = opts.text ?? true;
  const h = Math.round((width * 205) / 730);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 60 730 205">
  <defs><filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#g)">
    <path d="M10 238 H720" stroke="#F2C200" stroke-width="6" stroke-linecap="round"/>
    <g fill="#F2C200" opacity="0.6"><rect x="10" y="254" width="34" height="5" rx="2.5"/><rect x="64" y="254" width="34" height="5" rx="2.5"/><rect x="118" y="254" width="34" height="5" rx="2.5"/><rect x="172" y="254" width="34" height="5" rx="2.5"/></g>
    <path d="M240 236 Q246 212 250 194 C254 172 264 158 282 148 L312 130 C340 96 370 80 410 76 L508 74 C540 74 562 86 580 106 L614 138 C652 144 684 152 692 176 L696 200 Q698 218 702 236" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="300" cy="196" r="28" fill="none" stroke="#FFFFFF" stroke-width="13"/>
    <g transform="translate(623 196)"><circle r="28" fill="none" stroke="#FFFFFF" stroke-width="13"/><path d="M 3 -17 A 17 17 0 0 1 15 -8" fill="none" stroke="#2FD38A" stroke-width="4"/><path d="M0 0 L10 -11" stroke="#F2C200" stroke-width="4" stroke-linecap="round"/><circle r="4" fill="#F2C200"/></g>
  </g>
  ${text ? `  <text x="40" y="232" textLength="196" lengthAdjust="spacingAndGlyphs" font-family="Barlow Condensed" font-weight="600" font-size="132" fill="#FFFFFF">carr</text>
  <text x="344" y="232" textLength="235" lengthAdjust="spacingAndGlyphs" font-family="Barlow Condensed" font-weight="600" font-size="132" fill="#FFFFFF">usad</text>` : ""}
  <circle cx="300" cy="196" r="5" fill="#F2C200"/>
</svg>`;
}

