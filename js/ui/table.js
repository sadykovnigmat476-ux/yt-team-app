// Таблица рабочей панели: cols — [{title, align?, cell(row)}]; cell отдаёт готовую (уже экранированную) разметку.
// Широкая таблица прокручивается внутри своего блока, страница вбок не едет.
import { esc } from "../core/logic.js?v=c38baec6";

export function table(cols, rows, opt = {}) {
  if (!rows.length) return `<div class="empty">${esc(opt.empty || "Пока пусто")}</div>`;
  const cls = (c) => (c.align === "right" ? ` class="num"` : "");
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${cols.map((c) => `<th scope="col"${cls(c)}>${esc(c.title)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${cls(c)}>${c.cell(r)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}
