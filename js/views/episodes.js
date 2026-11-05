// «Выпуски»: поиск, фильтры, доска и список; вопросы бота по папкам Диска.
import { api } from "../core/api.js?v=531be1d4";
import { agoText, daysBetween, epColumn, esc, fmt, META, STAGES } from "../core/logic.js?v=c38baec6";
import { currentRoute, go } from "../core/router.js?v=ac21beab";
import { act, epHead, episodeDone, mem, pc, proj, rel, render, S, stageInfo, store, ui } from "../core/store.js?v=5b428fdb";
import { icon } from "../ui/icons.js?v=2008de79";
import { dueBadge, emptyBlock, epHtml, initial, isManaged, onboarding, progressBars, projectChips, sheetHead } from "../ui/parts.js?v=f1715159";
import { closeSheet, openSheet } from "../ui/sheet.js?v=1a030604";
import { toast } from "../ui/toast.js?v=c026fd86";

// ---------- поиск и фильтры ----------
const F = { q: "", stage: "", person: "", late: false };
const filtersOn = () => !!(F.q.trim() || F.stage || F.person || F.late || ui.project !== "all");

const COLS = [...STAGES.map((id) => ({ id, i: META[id].i, n: META[id].n })), { id: "done", i: "check-circle", n: "Вышло" }];

const isLate = (e) => !episodeDone(e.id) && STAGES.some((st) => stageInfo(e.id, st).late);

/** Подходит ли выпуск под запрос и фильтры. Запрос — слова через пробел, каждое ищется в коде, названии и проекте. */
function matches(e) {
  if (ui.project !== "all" && String(e.project_id) !== ui.project) return false;
  if (F.stage && epColumn(S, e.id) !== F.stage) return false;
  if (F.late && !isLate(e)) return false;
  if (F.person && !S.tasks.some((t) => t.episode_id === e.id && !t.done_at && String(t.assignee_id) === F.person)) return false;
  const words = F.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const p = proj(e.project_id);
  const hay = `${e.code} ${e.title} ${p ? p.name : ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Что сейчас отфильтровано — одной фразой для пустого результата. */
function filterText() {
  const parts = [];
  if (F.q.trim()) parts.push(`запрос «${esc(F.q.trim())}»`);
  if (ui.project !== "all") parts.push(`проект ${esc((proj(Number(ui.project)) || { name: "?" }).name)}`);
  if (F.stage) parts.push(`этап «${esc((COLS.find((c) => c.id === F.stage) || { n: F.stage }).n)}»`);
  if (F.person) parts.push(`человек ${esc((mem(Number(F.person)) || { name: "?" }).name)}`);
  if (F.late) parts.push("только просроченные");
  return parts.join(", ");
}

function toolbar(total, shown) {
  const mode = ui.epView || "board";
  const stageOpts = `<option value="">Любой этап</option>${COLS.map((c) => `<option value="${c.id}" ${F.stage === c.id ? "selected" : ""}>${c.n}</option>`).join("")}`;
  const personOpts = `<option value="">Любой человек</option>${S.members.map((m) => `<option value="${m.tg_id}" ${F.person === String(m.tg_id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}`;
  const hint = matchMedia("(hover: hover) and (pointer: fine)").matches ? "Код или тема · Ctrl+K" : "Код или тема";
  return `<div class="ep-tools">
    <div class="search">${icon("search")}<input class="inp" id="ep-q" type="search" data-act-input="ep-q" value="${esc(F.q)}" placeholder="${hint}" aria-label="Поиск выпуска по коду или теме" autocomplete="off" enterkeyhint="search"></div>
    <div class="seg"><button class="${mode === "board" ? "on" : ""}" data-act="ep-view" data-v="board">${icon("board")}Доска</button><button class="${mode === "list" ? "on" : ""}" data-act="ep-view" data-v="list">${icon("list")}Список</button></div>
    ${projectChips()}
    <div class="filters">
      <select class="inp sel" id="ep-stage" data-act-change="ep-stage" aria-label="Фильтр по этапу">${stageOpts}</select>
      <select class="inp sel" id="ep-person" data-act-change="ep-person" aria-label="Фильтр по человеку">${personOpts}</select>
      <button class="chip ${F.late ? "on" : ""}" data-act="ep-late" aria-pressed="${F.late}">${icon("alert")}Просрочено</button>
      ${filtersOn() ? `<button class="chip" data-act="ep-reset">${icon("x")}Сбросить</button>` : ""}
      <span class="muted small count" data-key="ep-count">${filtersOn() ? `Найдено ${shown} из ${total}` : `Выпусков: ${total}`}</span>
    </div></div>`;
}

// ---------- карточки ----------
function episodeRow(e) {
  const p = proj(e.project_id);
  const done = episodeDone(e.id);
  const anyLate = isLate(e);
  const badge = done ? `<span class="badge ok">готово</span>` : `<span class="badge ${anyLate ? "late" : daysBetween(S.today, e.publish_date) <= 0 ? "today" : ""}">${fmt(e.publish_date)}</span>`;
  return `<div class="card clickable pc-stripe" style="${pc(p)}" data-act="open-episode" data-id="${e.id}">
    <div class="row"><div class="grow"><div class="ellipsis">${epHtml(e)}</div>
    <div class="muted ellipsis">выход ${fmt(e.publish_date, true)} · ${rel(e.publish_date)}${isManaged(e) ? " · ведёт робот" : ""}</div></div>${badge}</div>
    ${progressBars(e.id)}
    <div class="stage-labels">${STAGES.map((s) => `<span>${META[s].n}</span>`).join("")}</div></div>`;
}

function kanbanCard(e, col) {
  const p = proj(e.project_id);
  let meta = "";
  if (col === "done") meta = `<span class="to-end badge ok">${fmt(e.publish_date)}</span>`;
  else {
    const i = stageInfo(e.id, col);
    const who = [...new Set(i.ts.filter((t) => !t.done_at).map((t) => t.assignee_id))].map(mem).filter(Boolean);
    meta = who.map((m) => `<span class="mini-ava" title="${esc(m.name)}">${initial(m)}</span>`).join("")
      + (i.total > 1 ? `<span class="num">${i.done}/${i.total}</span>` : "")
      + (!i.active ? `<span title="ждёт предыдущий этап">${icon("hourglass")}</span>` : "")
      + `<span class="to-end">${i.active ? dueBadge(i.due) : `<span class="badge">выход ${fmt(e.publish_date)}</span>`}</span>`;
  }
  return `<div class="kcard" style="${pc(p)}" data-act="open-episode" data-id="${e.id}">
    <div class="muted small ellipsis"><b>${esc(epHead(e))}</b>${isManaged(e) ? ` <span title="Выпуск ведёт робот">${icon("robot")}</span>` : ""}</div>
    <div class="tt">${esc(e.title)}</div><div class="mt">${meta}</div></div>`;
}

// ---------- вопросы бота по папкам ----------
const folders = { data: null, loading: false, error: null };

/** Вопросы по папкам и файлы без выпуска. Только админам: у остальных ответ 403 не нужен. */
export async function loadFolders() {
  if (!S || !S.me.is_admin || folders.loading) return;
  folders.loading = true;
  try {
    folders.data = await api("folder.list");
    folders.error = null;
  } catch (e) {
    folders.error = e.message;
  } finally {
    folders.loading = false;
    if (currentRoute().tab === "episodes") render();
  }
}

const ago = (iso) => (iso ? agoText(Date.now() - Date.parse(iso)) : "");

function foldersBlock() {
  if (!S.me.is_admin) return "";
  if (folders.error && !folders.data) {
    return `<div class="banner"><span class="grow">Вопросы по папкам не загрузились · ${esc(folders.error)}</span><button class="btn sm" data-act="folders-retry">Повторить</button></div>`;
  }
  const d = folders.data;
  if (!d || (!d.questions.length && !d.unmatched.length)) return "";
  const qs = d.questions.map((q) => `<div class="line-row row" data-key="fq-${q.id}">
      ${icon("folder")}<div class="grow"><div class="ellipsis"><b>${esc(q.folder_name)}</b></div>
      <div class="muted small ellipsis">${esc(q.project || (proj(q.project_id) || {}).name || "")} · ${esc(ago(q.created_at))} · к какому выпуску?</div></div>
      <button class="btn sm" data-act="folder-open" data-id="${q.id}">Ответить</button></div>`).join("");
  const um = d.unmatched.map((f) => `<div class="line-row row" data-key="um-${esc(f.file_id)}">
      ${icon(f.kind === "video" ? "film" : "script")}<div class="grow"><div class="ellipsis">${esc(f.name)}</div>
      <div class="muted small ellipsis">${esc((proj(f.project_id) || { name: "" }).name)} · ${esc(ago(f.created_at))}</div></div></div>`).join("");
  return `<div class="card folders" data-key="folders">
    ${d.questions.length ? `<h3>${icon("folder")}Бот спрашивает про папки · ${d.questions.length}</h3>${qs}` : ""}
    ${d.unmatched.length ? `<h3>${icon("alert")}Файлы без выпуска · ${d.unmatched.length}</h3>${um}
      <div class="muted small mt-2">Бот не понял, к какому выпуску относятся эти файлы. Проверь название файла: в нём должны быть код выпуска и язык.</div>` : ""}</div>`;
}

/** Ответ на вопрос бота кнопками: выпуск из списка, «новый выпуск» или «игнорировать». */
export async function openFolderQuestion(id) {
  if (!folders.data) await loadFolders();
  const q = folders.data && folders.data.questions.find((x) => x.id === id);
  if (!q) return toast("На этот вопрос уже ответили");
  openSheet(() => {
    const cur = folders.data && folders.data.questions.find((x) => x.id === id);
    if (!cur) { closeSheet({ force: true }); return ""; }
    const cand = (cur.candidates || []).map((c) => `<button class="btn ghost block choice" data-act="folder-pick" data-id="${cur.id}" data-choice="${c.id}">${icon("check")}<span class="ellipsis">${esc(c.label)}</span></button>`).join("");
    return `${sheetHead("Папка на Диске")}
      <div class="card"><b class="break">${esc(cur.folder_name)}</b>
      <div class="muted small">${esc(cur.project || (proj(cur.project_id) || {}).name || "")} · бот нашёл её ${esc(ago(cur.created_at))}</div></div>
      <h2>К какому выпуску относится?</h2>
      ${cand || `<div class="muted small">Подходящих выпусков бот не нашёл.</div>`}
      <button class="btn block choice" data-act="folder-pick" data-id="${cur.id}" data-choice="n">${icon("plus")}Это новый выпуск</button>
      <button class="btn ghost block choice" data-act="folder-pick" data-id="${cur.id}" data-choice="x">${icon("x")}Игнорировать папку</button>`;
  });
}

// ---------- Ctrl+K ----------
/** Поиск по выпускам с любого экрана. */
async function focusSearch() {
  if (!S) return;
  if (currentRoute().tab !== "episodes" && !(await go({ tab: "episodes" }))) return;
  setTimeout(() => { const el = document.getElementById("ep-q"); if (el) { el.focus(); el.select(); } }, 0);
}
document.addEventListener("keydown", (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && String(ev.key).toLowerCase() === "k") { ev.preventDefault(); focusSearch(); }
});

// ---------- экран ----------
export function view() {
  const all = S.episodes;
  const list = all.filter(matches);
  const mode = ui.epView || "board";
  let html = toolbar(all.length, list.length) + onboarding() + foldersBlock();
  if (!S.projects.length) return html;
  if (!all.length) {
    return html + emptyBlock("board", "Выпусков пока нет", "Каждый выпуск проходит четыре этапа: сценарий, озвучка, монтаж, выкладка.", `<button class="btn" data-act="new-episode">${icon("plus")}Новый выпуск</button>`);
  }
  if (!list.length) {
    return html + emptyBlock("search", "Ничего не нашлось", `Под ${filterText() || "условия"} выпусков нет. Выпусков всего: ${all.length}.`, `<button class="btn" data-act="ep-reset">${icon("x")}Сбросить поиск и фильтры</button>`);
  }
  if (mode === "list") {
    const done = list.filter((e) => episodeDone(e.id));
    const active = list.filter((e) => !episodeDone(e.id));
    html += active.length ? `<div class="list">${active.map(episodeRow).join("")}</div>` : `<div class="empty">Активных выпусков нет.</div>`;
    if (done.length) {
      html += `<h2 class="clickable" data-act="toggle-done" aria-expanded="${ui.showDone}">${icon(ui.showDone ? "chevron-down" : "chevron-right")}Готовые (${done.length})</h2>`;
      if (ui.showDone) html += `<div class="list">${done.slice().reverse().map(episodeRow).join("")}</div>`;
    }
    return html;
  }
  const byCol = Object.fromEntries(COLS.map((c) => [c.id, []]));
  for (const e of list) byCol[epColumn(S, e.id)].push(e);
  const dueOf = (e, col) => (col === "done" ? e.publish_date : stageInfo(e.id, col).due || e.publish_date);
  html += `<div class="board" data-key="board">${COLS.map((c) => {
    let items = byCol[c.id].slice().sort((a, b) => dueOf(a, c.id).localeCompare(dueOf(b, c.id)));
    let more = "";
    if (c.id === "done") {
      items = items.reverse();
      if (!ui.showDone && items.length > 6) {
        more = `<button class="btn ghost sm block" data-act="toggle-done">Ещё ${items.length - 6}</button>`;
        items = items.slice(0, 6);
      }
    }
    const late = c.id !== "done" && items.some((e) => stageInfo(e.id, c.id).late);
    return `<div class="col" data-key="col-${c.id}"><div class="col-h">${icon(c.i)}${c.n}<span class="n ${late ? "late" : ""}">${byCol[c.id].length}</span></div>
      ${items.map((e) => kanbanCard(e, c.id)).join("") || `<div class="col-empty">пусто</div>`}${more}</div>`;
  }).join("")}</div>
  <div class="muted small note-line">Выпуск стоит в колонке этапа, который ещё не закрыт. Песочные часы — ждёт предыдущий этап.</div>`;
  return html;
}

export function enter() { loadFolders(); }
export const refresh = enter;

const setField = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

export const actions = {
  "ep-view": (el) => { ui.epView = el.dataset.v; store("epView", ui.epView); render(); },
  "input:ep-q": (el) => { F.q = el.value; render(); },
  "change:ep-stage": (el) => { F.stage = el.value; render(); },
  "change:ep-person": (el) => { F.person = el.value; render(); },
  "ep-late": () => { F.late = !F.late; render(); },
  "ep-reset": () => {
    Object.assign(F, { q: "", stage: "", person: "", late: false });
    ui.project = "all";
    store("project", "all");
    // поля, которые человек правил, морф не перезаписывает: сбрасываем руками
    setField("ep-q", ""); setField("ep-stage", ""); setField("ep-person", "");
    render();
  },
  "folders-retry": () => { folders.error = null; loadFolders(); },
  "folder-open": (el) => openFolderQuestion(Number(el.dataset.id)),
  "folder-pick": async (el) => {
    const choice = /^\d+$/.test(el.dataset.choice) ? Number(el.dataset.choice) : el.dataset.choice;
    const r = await act("folder.answer", { id: Number(el.dataset.id), choice }, null, { el });
    if (!r) return;
    toast(r.text || "Ответ записан");
    closeSheet({ force: true });
    folders.data = null;
    loadFolders();
    // список «Ждёт тебя» на экране «Сейчас» устарел: вопрос закрыт
    document.dispatchEvent(new CustomEvent("inbox-stale"));
  },
};
