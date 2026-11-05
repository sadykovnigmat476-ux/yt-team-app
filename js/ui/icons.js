// Свой SVG-спрайт: контуры на сетке 24×24, цвет от текста. Эмодзи проекта — это данные, они остаются; в интерфейсе — только иконки.
const SYMBOLS = {
  bolt: `<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>`,
  board: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9.5 4v16M15 4v16"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`,
  chart: `<path d="M4 20h16"/><path d="M7.5 20v-7M12 20V6M16.5 20v-10"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>`,
  robot: `<rect x="4.5" y="8" width="15" height="11" rx="2.5"/><path d="M12 8V4.5M9 13v1M15 13v1M2.5 12.5v2.5M21.5 12.5v2.5"/><circle cx="12" cy="4" r="1"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  more: `<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>`,
  refresh: `<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.3l1.7-1.8"/><path d="M20 20v-4.5h-4.5"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>`,
  x: `<path d="M6 6l12 12M18 6 6 18"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  "check-circle": `<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.4 2.6 2.6 5-5.4"/>`,
  alert: `<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>`,
  "alert-circle": `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16v.3"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.3"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.3 2"/>`,
  hourglass: `<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 1.5 1.3 2.7 4 5.3-2.7 2.6-4 3.8-4 5.3v3.2M16 3.5v3.2c0 1.5-1.3 2.7-4 5.3 2.7 2.6 4 3.8 4 5.3v3.2"/>`,
  flame: `<path d="M12 3c.5 3.3 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2 .9-3.5 2.2-4.5.2 1.6 1 2.4 1.8 2.8C10.3 9.5 10.5 6 12 3z"/>`,
  folder: `<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>`,
  link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1-1"/>`,
  script: `<path d="M6.5 3.500h8l4 4v13h-12z"/><path d="M14.5 3.500v4h4M9.5 12h5M9.5 16h5"/>`,
  mic: `<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.500a6.5 6.5 0 0 0 13 0M12 18v3"/>`,
  film: `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M8 4.500v15M16 4.500v15M3.5 9.500H8M3.5 14.500H8M16 9.500h4.500M16 14.500h4.5"/>`,
  upload: `<path d="M12 16V4.500M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15.500v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>`,
  trash: `<path d="M4.5 7h15M9.5 7V4.500h5V7M6.5 7l1 13h9l1-13M10 11v5.500M14 11v5.5"/>`,
  pencil: `<path d="m4.5 19.5.9-4.100L16.3 4.500a1.5 1.5 0 0 1 2.1 0l1.1 1.100a1.5 1.5 0 0 1 0 2.100L8.6 18.600z"/><path d="m14.5 6.5 3 3"/>`,
  play: `<path d="M7.5 5v14l11-7z"/>`,
  pause: `<path d="M8.5 5v14M15.5 5v14"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="1.5"/>`,
  moon: `<path d="M20 14.500A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.500z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.5 12H5M19 12h2.500M5.3 5.3 7 7M17 17l1.7 1.700M18.7 5.3 17 7M7 17l-1.7 1.7"/>`,
  "chevron-left": `<path d="m14.5 6-6 6 6 6"/>`,
  "chevron-right": `<path d="m9.5 6 6 6-6 6"/>`,
  "chevron-down": `<path d="m6 9.5 6 6 6-6"/>`,
  user: `<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.500a7.5 7.5 0 0 1 15 0"/>`,
  users: `<circle cx="9.5" cy="8.5" r="3.5"/><path d="M2.5 20a7 7 0 0 1 14 0"/><path d="M16 5.300a3.5 3.5 0 0 1 0 6.400M18.5 14.500a7 7 0 0 1 3 5.5"/>`,
  list: `<path d="M8.5 6h12M8.5 12h12M8.5 18h12M4 6v.1M4 12v.1M4 18v.1"/>`,
  bulb: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6.5 6.5 0 0 0-3.5 12c.5.4 1 1 1 1.500V18h5v-1.500c0-.5.5-1.1 1-1.500A6.5 6.5 0 0 0 12 3z"/>`,
  monitor: `<rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M8.5 20.500h7M12 17v3.5"/>`,
  expand: `<path d="M4.5 9.500v-5h5M19.5 9.500v-5h-5M4.5 14.500v5h5M19.5 14.500v5h-5"/>`,
  collapse: `<path d="M9.5 4.500v5h-5M14.5 4.500v5h5M9.5 19.500v-5h-5M14.5 19.500v-5h5"/>`,
  logout: `<path d="M9.5 4.500h-3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3M15.5 8l4.5 4-4.5 4M20 12H9.5"/>`,
  rocket: `<path d="M12 3c3.5 2.5 5 6 5 10l-2.5 3.500h-5L7 13c0-4 1.5-7.5 5-10z"/><circle cx="12" cy="10" r="1.7"/><path d="M9.5 16.5 8 21l4-2 4 2-1.5-4.5"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`,
  inbox: `<path d="M3.5 13.5 6.5 5h11l3 8.500V19a1.5 1.5 0 0 1-1.5 1.500H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.500h5l1 2.500h5l1-2.500h5"/>`,
  dot: `<circle cx="12" cy="12" r="3.5" fill="currentColor"/>`,
};

export function spriteMarkup() {
  const symbols = Object.entries(SYMBOLS).map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true">${symbols}</svg>`;
}

/** Иконка строкой; смысл должен быть рядом текстом либо в aria-label кнопки. */
export const icon = (name, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
