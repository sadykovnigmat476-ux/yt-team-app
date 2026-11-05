// Состояние приложения: S — последний ответ state, ui — выбор на экране. Отсюда же запросы-изменения.
import { api } from "./api.js?v=f1e8780b";
import * as L from "./logic.js?v=27fff957";
import { haptic, nativeProgress } from "./tg.js?v=f1d7ce1d";
import { clearError, showError, toast } from "../ui/toast.js?v=c026fd86";

export let S = null;

export function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem("yt." + k);
    localStorage.setItem("yt." + k, v);
  } catch (_) { return null; }
}

export const ui = {
  project: store("project") || "all", showDone: false, month: null, day: null,
  sheet: null, // верхняя шторка, ведёт ui/sheet.js
  statsDays: Number(store("statsDays")) || 30, stats: null, statsLoading: null, statsError: null,
  epView: store("epView") || "board", showWaiting: true, hero: null,
  nowAll: false, newEp: null, skipKeep: null, draft: null, driveFolders: null,
  at: 0, loading: false, loadError: null, // когда обновлено, идёт ли обновление, ошибка обновления
  // пульс робота: data — ответ robot.state, at — когда пришёл, fresh — свежее ли для открытого захода во вкладку
  robot: { data: null, at: 0, error: null, loading: false, fresh: false, logs: new Set(), showDone: false },
};

let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = (opts) => renderer(opts);

// ---------- данные (S подставлен; чистые версии — в logic.js) ----------
export const ep = (id) => S.episodes.find((e) => e.id === id);
export const proj = (id) => S.projects.find((p) => p.id === id);
export const chan = (id) => S.channels.find((c) => c.id === id);
export const mem = (id) => S.members.find((m) => m.tg_id === id);
export const epHead = (e) => L.epHead(S, e);
export const epLabel = (e, mode) => L.epLabel(S, e, mode);
export const epBtn = (e) => L.epBtn(S, e);
export const rel = (d) => L.relDay(S.today, d);
export const isCompressedFor = (p, d) => L.isCompressedFor(S, p, d);
export const epTasks = (id) => L.epTasks(S, id);
export const projChannels = (pid) => L.projChannels(S, pid);
export const blocker = (t) => L.blocker(S, t);
export const isActive = (t) => L.isActive(S, t);
export const pcolor = (p) => L.pcolor(S, p);
export const pc = (p) => `--pc:${pcolor(p)}`;
export const topicBound = (pid, kind) => L.topicBound(S, pid, kind);
export const stageInfo = (eid, stage) => L.stageInfo(S, eid, stage);
export const episodeDone = (eid) => L.episodeDone(S, eid);
export const nextCode = (pid) => L.nextCode(S, pid);

// ---------- загрузка ----------
export async function load() {
  S = await api("state");
  ui.at = Date.now();
  ui.loadError = null;
  if (!ui.month) ui.month = S.today.slice(0, 7);
  if (ui.project !== "all" && !proj(Number(ui.project))) ui.project = "all";
  render({ commit: ui.skipKeep });
}

/** Обновление по таймеру и по кнопке: при сбое данные остаются, на экране — ошибка с «Повторить». */
export async function refresh() {
  if (ui.loading) return;
  ui.loading = true;
  render();
  try {
    await load();
  } catch (e) {
    ui.loadError = e.message;
  } finally {
    ui.loading = false;
    render();
  }
}

// ---------- замок запросов ----------
// Одновременно идёт один запрос-изменение. Повтор того же самого нажатия (двойной клик по «Готово» / MainButton)
// отбрасывается, другое действие ждёт своей очереди — иначе второй клик закрывал уже следующий этап или делал второй выпуск.
let busy = null;
export const isBusy = () => !!busy;

/** Кнопка и MainButton показывают, что запрос идёт; повторные нажатия в это время не проходят. */
function setBusyUI(on, el) {
  document.body.classList.toggle("busy", on);
  if (el && el.classList) { el.classList.toggle("is-busy", on); if ("disabled" in el) el.disabled = on; }
  nativeProgress(on);
}

/**
 * Запрос-изменение → тост → перезагрузка. opts: el — нажатая кнопка (блокируется до ответа),
 * undo — функция «Отменить» для тоста, commit — ключи полей data-keep, которые после успеха берутся с сервера, а не из набранного,
 * retry — что повторить вместо этого же запроса (когда за ним идут ещё шаги).
 * Ошибка остаётся на экране, пока её не закроют; набранное в форме не трогается.
 * Возвращает ответ ({} если пустой) или null при ошибке/отброшенном повторе.
 */
export async function act(action, body, msg, opts = {}) {
  const key = action + ":" + JSON.stringify(body);
  while (busy) {
    if (busy.key === key) return null;
    await busy.done;
  }
  let release;
  busy = { key, done: new Promise((r) => (release = r)) };
  setBusyUI(true, opts.el);
  ui.skipKeep = opts.commit ? new Set(opts.commit) : null;
  let failed = null;
  try {
    const r = await api(action, body);
    haptic("success");
    clearError();
    await load();
    if (msg) toast(msg, opts.undo ? { undo: opts.undo } : {});
    return r || {};
  } catch (e) {
    haptic("error");
    failed = e;
    return null;
  } finally {
    ui.skipKeep = null;
    busy = null;
    setBusyUI(false, opts.el);
    release();
    if (failed) showError(failed.message, failed.retryable ? { retry: opts.retry || (() => act(action, body, msg, opts)) } : {});
  }
}

/**
 * Отметить этапы готовыми с тостом «Отменить» (5 с). «Отменить» — только если отметил именно этот запрос
 * (changed > 0), и снимает только задачи, которые он поменял: чужую отметку (Павел успел раньше) не трогаем.
 */
export async function markDone(ids, el) {
  const r = await act("tasks.done", { ids, done: true }, null, { el });
  if (!r) return r;
  if (r.changed > 0) {
    const mine = Array.isArray(r.ids) && r.ids.length ? r.ids : ids;
    const t = S.tasks.find((x) => x.id === mine[0]);
    const e = t && ep(t.episode_id);
    const msg = e ? `Готово: ${L.META[t.stage].n} · ${epLabel(e)}` : "Отмечено";
    toast(msg, { undo: () => act("tasks.done", { ids: mine, done: false }, "Отметка снята") });
  } else toast("Уже отмечено");
  return r;
}
