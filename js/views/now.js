// «Сейчас»: что ждёт владельца, главная задача крупно, остальное по срочности.
import { api } from "../core/api.js?v=19a8d20a";
import { agoText, dueInfo, esc, fmt, folderLink, META, nowBuckets, nowGroups, PREV } from "../core/logic.js?v=470b6fea";
import { currentRoute, go } from "../core/router.js?v=06c283eb";
import { act, blocker, ep, epBtn, epLabel, markDone, mem, pc, proj, rel, render, S, ui } from "../core/store.js?v=1246c5bb";
import { openUrl } from "../core/tg.js?v=a2517d83";
import { icon } from "../ui/icons.js?v=2008de79";
import { closeLocked, dueBadge, langChip, LOCK_TEXT, onboarding, progressBars } from "../ui/parts.js?v=4f5be782";
import { toast } from "../ui/toast.js?v=c026fd86";
import { openEpisode } from "./episode.js?v=a4e2b560";
import { loadFolders, openFolderQuestion } from "./episodes.js?v=83ebd1c6";
import { noEmoji } from "./robot.js?v=c5e23fc1";

// ---------- «Ждёт тебя»: решения владельца в одном списке ----------
const inbox = { data: null, error: null, loading: false, all: false };

/** Проверки, приёмки, сбои, потолки, вопросы по папкам, нехватка токенов. Только владельцу. */
async function loadInbox() {
  if (!S || !S.me.is_owner || inbox.loading) return;
  inbox.loading = true;
  try {
    inbox.data = await api("robot.inbox");
    inbox.error = null;
  } catch (e) {
    inbox.error = e.message;
  } finally {
    inbox.loading = false;
    if (currentRoute().tab === "now") render();
  }
}

document.addEventListener("inbox-stale", () => loadInbox());

const WAIT_ICON = { stills: "eye", accept: "check-circle", failed: "alert-circle", fail_cap: "alert", final_cap: "alert", dead_end: "alert", script_stuck: "alert", folder: "folder", tokens: "mic" };
const WAIT_BAD = ["failed", "fail_cap", "final_cap", "dead_end", "script_stuck"];
const WAIT_BTN = { review: "Проверить", retry: "Повторить", again: "Ещё заход", folder: "Ответить", episode: "Открыть" };
const WAIT_SHOWN = 5;

function waitRow(it) {
  const bad = WAIT_BAD.includes(it.kind);
  return `<div class="wait-row ${bad ? "bad" : ""}" data-key="wait-${esc(it.id)}">
    <span class="wait-ic">${icon(WAIT_ICON[it.kind] || "bolt")}</span>
    <div class="grow"><div class="wait-label"><b>${esc(it.label || "")}</b></div>
      <div class="small wait-text">${esc(noEmoji(it.text))}${it.at ? ` <span class="muted">· ${esc(agoText(Date.now() - Date.parse(it.at)))}</span>` : ""}</div></div>
    <button class="btn sm ${bad ? "ghost" : ""}" data-act="wait-go" data-id="${esc(it.id)}">${WAIT_BTN[it.action] || "Открыть"}</button></div>`;
}

function waitingBlock() {
  if (!S.me.is_owner) return "";
  if (inbox.error && !inbox.data) {
    return `<div class="banner"><span class="grow">«Ждёт тебя» не загрузилось · ${esc(inbox.error)}</span><button class="btn sm" data-act="wait-retry">Повторить</button></div>`;
  }
  if (!inbox.data) return `<div class="card wait sk-card" aria-busy="true"><span class="sk sk-line" style="width:40%"></span><span class="sk sk-line" style="width:75%"></span></div>`;
  const items = inbox.data.items;
  if (!items.length) {
    return `<div class="card wait calm-line">${icon("check-circle", "tone-ok")}<span class="small"><b>Ждёт тебя: ничего.</b> Проверок, сбоев и вопросов бота сейчас нет.</span></div>`;
  }
  const shown = inbox.all ? items : items.slice(0, WAIT_SHOWN);
  const more = items.length > WAIT_SHOWN
    ? `<button class="btn ghost sm block mt-2" data-act="wait-all">${inbox.all ? "Свернуть" : `Показать все ${items.length}`}</button>` : "";
  return `<div class="card wait" data-key="wait-card"><h2>${icon("flame")}Ждёт тебя · ${items.length}</h2>${shown.map(waitRow).join("")}${more}</div>`;
}

// ---------- главная задача и список ----------
/** Главная задача: самая срочная из тех, что можно делать прямо сейчас. */
function heroCard(g) {
  const e = ep(g.eid), p = proj(e.project_id), m = META[g.stage];
  const d = dueInfo(S.today, g.due);
  const single = g.info.total === 1 && !g.info.ts[0].channel_id;
  const langs = single ? "" : `<div class="chips wrap">${g.info.ts.map(langChip).join("")}</div>`;
  // G13: у выпуска, который ведёт робот, участнику закрывать этап нельзя — объясняем вместо кнопки
  const locked = closeLocked(e, g.stage);
  const done = locked ? ""
    : g.activeMine.length > 1
      ? `<button class="btn dup-main" data-act="done" data-ids="${g.activeMine.map((t) => t.id).join(",")}">${icon("check")}Все ${g.activeMine.length} готовы</button>`
      : g.activeMine.length === 1 && single ? `<button class="btn dup-main" data-act="done" data-ids="${g.activeMine[0].id}">${icon("check")}Готово</button>` : "";
  const folder = e.drive_folder_id ? `<a class="btn ghost dup-second" href="${esc(folderLink(e.drive_folder_id))}" data-act="open-link">${icon("folder")}Папка</a>` : "";
  return `<div class="hero" style="${pc(p)}">
    <div class="kicker"><span class="pdot"></span>главное сейчас</div>
    <div class="stage">${icon(m.i)}${m.n}</div>
    <a class="ep" href="#" data-act="open-episode" data-id="${e.id}">${esc(epLabel(e))}${icon("chevron-right")}</a>
    <div class="muted small">выход ${fmt(e.publish_date, true)} · ${rel(e.publish_date)}</div>
    <span class="due ${d.cls}">${icon(d.i)}${d.t}</span>${langs}
    ${progressBars(e.id)}
    ${locked ? `<div class="note lock-note">${icon("robot")}<span>${LOCK_TEXT}</span></div>` : ""}
    ${folder || done ? `<div class="acts">${folder}${done}</div>` : ""}
  </div>`;
}

/** Строка задачи в «Горит / Дальше / Ждёт»; под заголовком проекта выпуск подписан коротко («🔭 S04»). */
function nextRow(g) {
  const e = ep(g.eid), p = proj(e.project_id), m = META[g.stage];
  const who = ui.nowAll && g.who.length ? ` · ${g.who.map((x) => esc(x.name)).join(", ")}` : "";
  const sub = g.waiting ? `ждёт ${META[PREV[g.stage]].n.toLowerCase()}` : "";
  return `<div class="next-row" style="${pc(p)}" data-key="now-${e.id}-${g.stage}" data-act="open-episode" data-id="${e.id}">
    ${icon(m.i)}
    <div class="t"><div class="ellipsis"><b>${esc(epLabel(e, "short"))}</b> ${esc(e.title)}</div>
      <div class="muted small ellipsis">${m.n}${sub ? ` · ${sub}` : ""}${who}</div></div>
    ${g.waiting ? `<span class="badge" aria-label="ждёт">${icon("hourglass")}</span>` : dueBadge(g.due)}</div>`;
}

/** Секция списка: заголовок и строки, сгруппированные по проектам. */
function nowSection(title, groups) {
  if (!groups.length) return "";
  const rows = S.projects.map((p) => ({ p, gs: groups.filter((g) => ep(g.eid).project_id === p.id) })).filter((x) => x.gs.length);
  return title + rows.map(({ p, gs }) => `<div class="pgroup" style="${pc(p)}"><div class="ph"><span class="pdot"></span>${esc(p.emoji)} ${esc(p.name)}</div>${gs.map(nextRow).join("")}</div>`).join("");
}

/** Кого ждём: для моих задач, которые ещё нельзя начать, — чей предыдущий этап. */
function waitingFor(g) {
  const t = g.info.ts.find((x) => !x.done_at);
  const b = t && blocker(t);
  const who = b && mem(b.assignee_id);
  return b ? `${META[b.stage].n.toLowerCase()} ${esc(epLabel(ep(g.eid), "short"))}${who ? ` от ${esc(who.name)}` : ""}` : "";
}

function calm(all, b) {
  const w = b.waiting[0], soon = b.next[0] || b.later[0];
  const hint = all ? "Новый выпуск — кнопка «+»." : w ? `Дальше ждём: ${waitingFor(w)}`
    : soon ? `Следующее: ${esc(epLabel(ep(soon.eid), "short"))}, ${META[soon.stage].n.toLowerCase()}` : "Отдыхай или запланируй новый выпуск кнопкой «+».";
  return `<div class="card calm">${icon(all ? "inbox" : "check-circle", "big")}<b>${all ? "Открытых задач нет" : "Всё сделано"}</b>
    <div class="muted small">${hint}</div></div>`;
}

export function view() {
  const all = ui.nowAll;
  const gs = nowGroups(S, all);
  // главная карточка и кнопка Telegram — только в «Мои»: в «Все» чужие задачи отмечать отсюда не надо
  const hero = all ? null : gs.find((g) => !g.waiting) || null;
  ui.hero = hero;
  const b = nowBuckets(S, gs, hero);
  const unassigned = S.tasks.filter((t) => !t.done_at && t.assignee_id == null).length;
  const seg = `<div class="seg"><button class="${all ? "" : "on"}" data-act="now-all" data-v="0">Мои</button><button class="${all ? "on" : ""}" data-act="now-all" data-v="1">Все</button></div>`;
  const html = waitingBlock() + onboarding() + `<div class="row now-head"><div class="grow"><div class="hello">Привет, ${esc(S.me.name)}</div>
    <div class="muted">${fmt(S.today, true)}</div></div>${seg}</div>`;
  if (!S.projects.length) return html;
  const left = [];
  if (hero) left.push(heroCard(hero));
  else if (!all || !gs.length) left.push(calm(all, b));
  const right = [];
  right.push(nowSection(`<h2>${icon("flame")}Горит · ${b.hot.length}</h2>`, b.hot));
  right.push(nowSection(`<h2>Дальше · ${b.next.length}</h2>`, b.next));
  if (b.later.length) right.push(`<div class="muted small note-line">Ещё позже: ${b.later.length} ${b.later.length === 1 ? "задача" : "задач(и)"}${all ? "" : " — они в «Выпусках»"}.</div>`);
  if (b.waiting.length) {
    right.push(`<h2 class="clickable" data-act="toggle-waiting" aria-expanded="${ui.showWaiting}">${icon(ui.showWaiting ? "chevron-down" : "chevron-right")}Ждёт${all ? "" : " других"} · ${b.waiting.length}</h2>`);
    if (ui.showWaiting) right.push(nowSection("", b.waiting));
  }
  if (unassigned) right.push(`<div class="card small warn-line">${icon("alert")}<span>${unassigned} задач(и) без ответственного — назначь роли в <a href="#" data-act="tab" data-tab="settings">Настройках</a>.</span></div>`);
  return html + `<div class="now-wrap"><div>${left.join("")}</div><div>${right.join("")}</div></div>`;
}

/** Кнопки Telegram для главной задачи: только там, где нет нижней панели (иначе два этажа кнопок). */
export function native() {
  const g = ui.hero;
  if (!g || !matchMedia("(min-width: 600px)").matches) return null;
  const e = ep(g.eid);
  const single = g.info.total === 1 && !g.info.ts[0].channel_id;
  const ids = closeLocked(e, g.stage) ? [] : g.activeMine.map((t) => t.id);
  const main = ids.length && (single || ids.length > 1)
    ? { text: ids.length > 1 ? `Все ${ids.length} готовы · ${epBtn(e)}` : `${META[g.stage].n} готово · ${epBtn(e)}`, run: () => markDone(ids) }
    : null;
  const second = e.drive_folder_id ? { text: "Папка", kind: "second", run: () => openUrl(folderLink(e.drive_folder_id)) } : null;
  return { main: main || second, second: main ? second : null };
}

export function enter() { inbox.all = false; loadInbox(); loadFolders(); }
export const refresh = loadInbox;

export const actions = {
  "wait-retry": () => { inbox.error = null; loadInbox(); },
  "wait-all": () => { inbox.all = !inbox.all; render(); },
  "wait-go": async (el) => {
    const it = inbox.data && inbox.data.items.find((x) => x.id === el.dataset.id);
    if (!it) return;
    if (it.action === "review") return go({ tab: "review", run: it.run_id });
    if (it.action === "folder") return openFolderQuestion(it.question_id);
    if (it.action === "episode") return openEpisode(it.episode_id);
    if (it.action === "retry" || it.action === "again") {
      const r = await act("robot.run", { episode_id: it.episode_id, op: it.action }, null, { el });
      if (r) { toast(it.action === "retry" ? "Повтор поставлен: робот возьмётся за выпуск" : "Ещё один заход разрешён"); loadInbox(); }
    }
  },
  "toggle-waiting": () => { ui.showWaiting = !ui.showWaiting; render(); },
  "now-all": (el) => { ui.nowAll = el.dataset.v === "1"; render(); },
};
