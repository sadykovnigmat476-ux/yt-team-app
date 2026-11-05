// Шторки со стеком. Режимы:
//   form  — на телефоне лист снизу, от 600 px окно по центру;
//   panel — на телефоне весь экран, на планшете окно, от 1024 px панель справа от списка (страница остаётся рабочей).
// Каждая шторка — запись в истории, поэтому закрывается всегда через «Назад»: и крестик, и Esc, и кнопка Telegram.
import { markTappable } from "../core/logic.js?v=470b6fea";
import { morph } from "../core/morph.js?v=b4de8c1c";
import { currentRoute, writeHistory } from "../core/router.js?v=06c283eb";
import { ui } from "../core/store.js?v=1246c5bb";
import { confirmBox } from "./confirm.js?v=56ec688f";
import { domDirty } from "./form.js?v=995456f6";

const stack = [];
let waiter = null; // кто ждёт завершения history.go
let silent = false; // закрываем сами: вопрос уже задан
let leaving = null;
let afterChange = () => {};
export const onSheetsChanged = (fn) => { afterChange = fn; };

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
const QUESTION = "Закрыть без сохранения? Изменения пропадут.";
const DESKTOP = "(min-width: 1024px)";

export const sheetDepth = () => stack.length;
const top = () => stack[stack.length - 1] || null;
const isDirty = (s) => (s.dirty ? s.dirty() : domDirty(s.el));
/** Можно ли уйти с верхней шторки: есть правки — спросить. */
export const canLeave = async () => !top() || !isDirty(top()) || confirmBox(QUESTION, { ok: "Закрыть", cancel: "Остаться" });

function sync() {
  ui.sheet = top();
  const root = document.documentElement;
  root.classList.toggle("locked", stack.some((s) => s.mode === "form"));
  root.classList.toggle("has-panel", stack.some((s) => s.mode === "panel"));
  afterChange();
}

function makeLayer(s) {
  const layer = document.createElement("div");
  layer.className = `layer ${s.mode}`;
  layer.innerHTML = `<div class="scrim" data-act="close-sheet"></div>
    <section class="sheet" role="dialog" tabindex="-1"><div class="grip"></div><div class="sheet-body"></div></section>`;
  layer.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || !layer.classList.contains("trap")) return;
    const all = Array.from(layer.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
    if (!all.length) return;
    const first = all[0], last = all[all.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });
  document.getElementById("sheets").append(layer);
  s.layer = layer;
  s.el = layer.querySelector(".sheet");
  s.body = layer.querySelector(".sheet-body");
}

function paint(s, opts) {
  morph(s.body, markTappable(s.renderFn()), opts);
  const title = s.body.querySelector(".sheet-title b");
  if (title) s.el.setAttribute("aria-label", title.textContent);
}

function placeLayer(s) {
  // панель на ноутбуке не перекрывает страницу: фокус не запирается
  const modal = s.mode === "form" || !matchMedia(DESKTOP).matches;
  s.layer.classList.toggle("trap", modal);
  s.el.setAttribute("aria-modal", modal ? "true" : "false");
}

/**
 * Открыть шторку поверх текущих. renderFn → разметка; native → кнопки Telegram {main, second}.
 * opts: mode ("form" | "panel"), ep — id выпуска (попадает в адрес), dirty() — своя проверка несохранённого,
 * replace — заменить верхнюю (форма сменилась результатом), silent — запись в истории уже есть (пришли по адресу).
 */
export function openSheet(renderFn, native, opts = {}) {
  const mode = opts.mode || "form";
  if (opts.replace && top()) {
    const s = top();
    Object.assign(s, { renderFn, native, dirty: opts.dirty, ep: opts.ep ?? null, mode });
    s.layer.className = `layer ${mode}`;
    placeLayer(s);
    writeHistory({ ep: opts.ep ?? null }, stack.length, true);
    s.body.textContent = "";
    paint(s);
    s.el.scrollTop = 0;
    return sync();
  }
  const s = {
    renderFn, native, dirty: opts.dirty, ep: opts.ep ?? null, mode, before: document.activeElement,
    render: (o) => paint(s, { force: true, ...o }), // явная перерисовка: черновик формы и есть правда
  };
  makeLayer(s);
  stack.push(s);
  if (!opts.silent) writeHistory(opts.ep != null ? { ep: opts.ep } : {}, stack.length, false);
  paint(s);
  placeLayer(s);
  s.el.focus({ preventScroll: true });
  sync();
}

function dropTop() {
  const s = stack.pop();
  s.layer.remove();
  if (s.before && s.before.isConnected) s.before.focus({ preventScroll: true });
  if (s.ep != null && !stack.some((x) => x.ep != null) && currentRoute().ep != null) writeHistory({ ep: null }, stack.length, true);
}

/** history.go и ожидание popstate; если браузер не ответил (нет записи) — снимаем сами. */
function stepBack(n) {
  return new Promise((res) => {
    const target = stack.length - n;
    const finish = () => { clearTimeout(t); waiter = null; res(); };
    const t = setTimeout(() => { while (stack.length > target) dropTop(); sync(); finish(); }, 600);
    waiter = finish;
    history.go(-n);
  });
}

/** Закрытие уже идёт (например, выпуск удалён: и обработчик, и перерисовка просят закрыть) — второго шага назад нет. */
function leave(n) {
  if (!leaving) {
    silent = true;
    leaving = stepBack(n).finally(() => { silent = false; leaving = null; });
  }
  return leaving;
}

/** Закрыть верхнюю; форма с изменениями спрашивает. false — человек передумал. */
export async function closeSheet(opts = {}) {
  const s = top();
  if (!s) return true;
  if (!opts.force && !(await canLeave())) return false;
  await leave(1);
  return true;
}

/** Закрыть все шторки разом (переход в другой раздел). */
export async function closeAllSheets() {
  if (!stack.length) return true;
  if (stack.some(isDirty) && !(await confirmBox(QUESTION, { ok: "Закрыть", cancel: "Остаться" }))) return false;
  await leave(stack.length);
  return true;
}

/** Обратный ход истории (кнопка браузера или свой history.go): снять лишние шторки. */
export async function syncToDepth(depth) {
  if (stack.length > depth && !silent && stack.slice(depth).some(isDirty)) {
    // «Назад» уже случился: возвращаем запись и спрашиваем, как при закрытии крестиком
    const s = top();
    writeHistory(s.ep != null ? { ep: s.ep } : {}, stack.length, false);
    await closeSheet();
    return;
  }
  while (stack.length > depth) dropTop();
  sync();
  if (waiter) waiter();
}

/** Перерисовать шторки вместе с экраном (данные обновились): правки в полях сохраняются. */
export function repaintSheets(opts) {
  for (const s of stack) paint(s, opts);
}
export const refitSheets = () => stack.forEach(placeLayer);
export const openEpisodeId = () => { const s = stack.find((x) => x.ep != null); return s ? s.ep : null; };
