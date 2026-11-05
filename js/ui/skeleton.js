// Заглушка на время загрузки: форма экрана видна сразу, контент встаёт на место без скачка.
const line = (w) => `<span class="sk sk-line" style="width:${w}%"></span>`;
const card = (lines = [70, 45]) => `<div class="card sk-card">${lines.map(line).join("")}</div>`;

export function skeleton(kind = "list", n = 4) {
  if (kind === "tiles") return `<div class="tiles" aria-hidden="true">${`<div class="tile sk-card">${line(40)}${line(70)}</div>`.repeat(4)}</div>`;
  if (kind === "text") return `<div class="sk-text" aria-hidden="true">${line(90)}${line(70)}${line(80)}</div>`;
  return `<div class="sk-list" role="status" aria-label="Загрузка">${Array.from({ length: n }, () => card()).join("")}</div>`;
}
