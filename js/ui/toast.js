// Тост гаснет сам. Ошибка остаётся, пока её не закроют или не повторят: её нельзя пропустить.

let timer = null;
const button = (text, cls, onClick) => {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  b.onclick = onClick;
  return b;
};
const message = (msg) => { const s = document.createElement("span"); s.textContent = msg; return s; };

/** {undo} добавляет кнопку «Отменить» на 5 секунд (undo — функция, возвращающая промис). */
export function toast(msg, opt = {}) {
  const el = document.getElementById("toast");
  el.textContent = "";
  el.append(message(msg));
  const hide = () => el.classList.remove("show");
  if (opt.undo) el.append(button("Отменить", "toast-btn", () => { clearTimeout(timer); hide(); opt.undo(); }));
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(hide, opt.undo ? 5000 : 2600);
}

/** Ошибка: {retry} добавляет «Повторить». */
export function showError(msg, opt = {}) {
  const el = document.getElementById("alert");
  el.textContent = "";
  el.append(message(msg));
  if (opt.retry) el.append(button("Повторить", "toast-btn", () => { clearError(); opt.retry(); }));
  el.append(button("Закрыть", "toast-btn ghost", clearError));
  el.classList.add("show");
}

export function clearError() {
  const el = document.getElementById("alert");
  if (el) el.classList.remove("show");
}
