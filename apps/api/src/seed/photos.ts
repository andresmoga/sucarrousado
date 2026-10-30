/**
 * Fotos de demostración en SVG (ilustraciones, no fotos reales) para poblar el sitio
 * mientras no hay avisos de usuarios. Cada carro sale con su carrocería y su color.
 */

export const COLOR_HEX: Record<string, string> = {
  Blanco: "#F1F2EF",
  Negro: "#1E2125",
  Gris: "#7D838B",
  Plata: "#BFC4C9",
  Rojo: "#A92A2E",
  Azul: "#2A4F86",
  Verde: "#3F6B4E",
  Beige: "#CDBB98",
  Café: "#6B4C36",
};

/** Siluetas laterales en un lienzo de 800×500, ruedas en x≈220 y x≈590. */
const BODY_PATH: Record<string, string> = {
  "Sedán":
    "M90 330 C95 300 130 290 175 285 L265 280 L330 215 C345 200 365 195 390 195 L520 195 C550 195 570 205 590 225 L640 280 L700 290 C725 295 735 310 735 330 L735 350 L90 350 Z",
  Hatchback:
    "M110 330 C112 300 140 290 180 285 L260 280 L320 210 C335 195 355 190 380 190 L560 190 C590 190 605 200 615 225 L650 290 C680 297 700 310 700 330 L700 350 L110 350 Z",
  SUV:
    "M95 335 C95 295 120 280 165 275 L250 270 L300 185 C310 170 330 162 355 162 L610 162 C640 162 655 175 665 200 L690 275 C720 285 735 305 735 335 L735 355 L95 355 Z",
  "Pick-up":
    "M80 335 C80 300 105 285 150 282 L250 278 L295 190 C305 175 320 168 345 168 L470 168 C490 168 500 178 505 195 L515 270 L740 270 L745 335 L745 355 L80 355 Z",
  "Coupé":
    "M95 330 C100 302 135 292 180 288 L280 282 L360 222 C375 211 395 207 420 207 L520 207 C545 207 565 218 585 240 L630 284 L705 292 C728 297 736 312 736 330 L736 348 L95 348 Z",
  Van:
    "M95 340 C95 300 110 285 140 282 L190 280 L230 170 C240 150 260 140 290 140 L680 140 C705 140 720 155 722 180 L730 290 C735 305 738 320 738 340 L738 358 L95 358 Z",
};

const shade = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function exterior(body: string, color: string, flip: boolean, sky: string) {
  const fill = COLOR_HEX[color] ?? "#7D838B";
  const path = BODY_PATH[body] ?? BODY_PATH["Sedán"]!;
  const t = flip ? ' transform="translate(820 0) scale(-1 1)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#E8EAE6"/></linearGradient></defs>
  <rect width="800" height="380" fill="url(#s)"/>
  <rect y="370" width="800" height="130" fill="#3A3F45"/>
  <rect y="430" width="800" height="6" fill="#F2C200" opacity=".85"/>
  <g${t}>
    <ellipse cx="410" cy="378" rx="330" ry="16" fill="#000" opacity=".22"/>
    <path d="${path}" fill="${fill}" stroke="${shade(fill, 0.55)}" stroke-width="3"/>
    <path d="M100 318 L730 318" stroke="${shade(fill, 0.75)}" stroke-width="2" opacity=".6"/>
    <g fill="#2A3138" opacity=".88"><path d="M345 222 L380 205 L455 205 L455 270 L300 270 Z"/><path d="M470 205 L530 205 C548 205 560 213 575 232 L610 270 L470 270 Z"/></g>
    <g><circle cx="220" cy="350" r="48" fill="#16191C"/><circle cx="220" cy="350" r="26" fill="#9AA0A6"/><circle cx="590" cy="350" r="48" fill="#16191C"/><circle cx="590" cy="350" r="26" fill="#9AA0A6"/></g>
    <rect x="705" y="300" width="26" height="12" rx="3" fill="#F7E7A6"/>
    <rect x="92" y="300" width="22" height="12" rx="3" fill="#B3262B"/>
  </g>
  <text x="24" y="40" font-family="sans-serif" font-size="18" fill="#22272E" opacity=".55">Foto de demostración</text>
</svg>`;
}

function dashboard(km: number) {
  const kmText = km.toLocaleString("es-CO");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <rect width="800" height="500" fill="#24282D"/>
  <path d="M0 330 Q400 250 800 330 L800 500 L0 500 Z" fill="#1A1D21"/>
  <g fill="none" stroke="#5B636C" stroke-width="10"><circle cx="270" cy="230" r="110"/><circle cx="530" cy="230" r="110"/></g>
  <g stroke="#F2C200" stroke-width="6" stroke-linecap="round"><line x1="270" y1="230" x2="200" y2="170"/><line x1="530" y1="230" x2="590" y2="160"/></g>
  <rect x="300" y="360" width="200" height="54" rx="8" fill="#0F1113" stroke="#3B4148"/>
  <text x="400" y="397" text-anchor="middle" font-family="monospace" font-size="28" fill="#9BE3B4">${kmText} km</text>
  <text x="24" y="40" font-family="sans-serif" font-size="18" fill="#fff" opacity=".5">Foto de demostración</text>
</svg>`;
}

function interior(color: string) {
  const seat = color === "Beige" || color === "Café" ? "#8C6A4A" : "#2F3338";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <rect width="800" height="500" fill="#DADDD8"/>
  <rect y="380" width="800" height="120" fill="#3A3F45"/>
  <g fill="${seat}"><rect x="150" y="140" width="190" height="240" rx="40"/><rect x="460" y="140" width="190" height="240" rx="40"/><rect x="175" y="80" width="140" height="80" rx="30"/><rect x="485" y="80" width="140" height="80" rx="30"/></g>
  <rect x="360" y="250" width="80" height="150" rx="12" fill="#262A2F"/>
  <text x="24" y="40" font-family="sans-serif" font-size="18" fill="#22272E" opacity=".55">Foto de demostración</text>
</svg>`;
}

const SKIES = ["#C9DCEB", "#D9E4EC", "#E7E1D4", "#CFE0E3"];

/** Devuelve [slot, svg] para las fotos de un aviso de demostración. */
export function demoPhotos(body: string, color: string, km: number, seed: number): [string, string][] {
  const sky = SKIES[seed % SKIES.length]!;
  return [
    ["tres_cuartos", exterior(body, color, false, sky)],
    ["frente", exterior(body, color, true, sky)],
    ["lateral", exterior(body, color, false, SKIES[(seed + 1) % SKIES.length]!)],
    ["trasera", exterior(body, color, true, SKIES[(seed + 2) % SKIES.length]!)],
    ["tablero", dashboard(km)],
    ["sillas_delanteras", interior(color)],
  ];
}
