// Куски разметки, общие для нескольких экранов.
import { canFullscreen, openUrl, tg } from "../core/tg.js?v=a2517d83";
import { daysBetween, esc, fmt, formatTag, KINDS, langTag, META, projChannels, STAGES } from "../core/logic.js?v=470b6fea";
import { chan, epHead, isActive, pc, render, S, stageInfo, store, topicBound, ui } from "../core/store.js?v=1246c5bb";
import { toast } from "./toast.js?v=c026fd86";
import { icon } from "./icons.js?v=2008de79";

export const initial = (m) => esc(((m && m.name) || "?").slice(0, 1).toUpperCase());

export function dueBadge(d, done) {
  if (!d) return "";
  if (done) return `<span class="badge ok" aria-label="готово">${icon("check")}</span>`;
  const n = daysBetween(S.today, d);
  const cls = n < 0 ? "late" : n === 0 ? "today" : "";
  return `<span class="badge ${cls}">${n < 0 ? icon("alert") : ""}${fmt(d)}</span>`;
}

/** HTML-строка выпуска: жирная голова + название (для карточек и списков) + 2D/3D. */
export const epHtml = (e) => {
  const tag = formatTag(e.notes);
  return `<b>${esc(epHead(e))}</b> ${esc(e.title)}${tag ? ` <span class="muted">· ${tag}</span>` : ""}`;
};

export function langChip(t) {
  const c = chan(t.channel_id);
  const st = t.done_at ? "done" : isActive(t) ? "active" : "blocked";
  return `<button class="chip lang ${st}" data-act="toggle" data-id="${t.id}">${esc(langTag(c && c.lang))}${t.done_at ? icon("check") : ""}</button>`;
}

/** Прогресс выпуска по 4 этапам (зелёная заливка, красный — просрочено, синий — в работе). */
export function progressBars(eid) {
  return `<div class="progress">${STAGES.map((st) => {
    const i = stageInfo(eid, st);
    const pct = i.total ? Math.round(i.done / i.total * 100) : 0;
    return `<i class="${i.late ? "late" : i.active ? "active" : ""}" title="${META[st].n}"><b style="width:${pct}%"></b></i>`;
  }).join("")}</div>`;
}

export function projectChips() {
  return `<div class="chips"><button class="chip ${ui.project === "all" ? "on" : ""}" data-act="filter" data-p="all">Все</button>${
    S.projects.map((p) => `<button class="chip ${String(p.id) === ui.project ? "on" : ""}" data-act="filter" data-p="${p.id}"><span class="pdot" style="${pc(p)}"></span>${esc(p.emoji)} ${esc(p.name)}</button>`).join("")}</div>`;
}

export function memberOptions(selected, emptyLabel = "— никто") {
  return `<option value="">${emptyLabel}</option>` + S.members.map((m) => `<option value="${m.tg_id}" ${m.tg_id === selected ? "selected" : ""}>${esc(m.name)}</option>`).join("");
}

/** Заголовок шторки: имя и крестик. dot — цветная точка проекта. */
export const sheetHead = (title, style) =>
  `<div class="sheet-title"${style ? ` style="${style}"` : ""}>${style ? `<span class="pdot"></span>` : ""}<b>${esc(title)}</b><button class="icon-btn" data-act="close-sheet" aria-label="Закрыть">${icon("x")}</button></div>`;

export function fullscreenChip() {
  if (!canFullscreen()) return "";
  return `<button class="chip" data-act="fullscreen" style="margin-left:auto">${icon(tg.isFullscreen ? "collapse" : "expand")}${tg.isFullscreen ? "Обычное окно" : "На весь экран"}</button>`;
}

function setupSteps() {
  const ps = S.projects;
  const kindsOk = (p) => KINDS.filter((k) => topicBound(p.id, k.id)).length;
  const topicsOk = ps.reduce((n, p) => n + kindsOk(p), 0);
  const noTopics = ps.find((p) => kindsOk(p) < KINDS.length);
  const noRoles = ps.find((p) => STAGES.some((st) => !(S.roles.find((r) => r.project_id === p.id && r.stage === st) || {}).member_id));
  const chans = S.channels.filter((c) => ps.some((p) => p.id === c.project_id));
  const noYt = ps.find((p) => projChannels(S, p.id).some((c) => !c.youtube_url));
  return [
    { ok: S.settings.group_linked, t: "Группа подключена", hint: "Добавь бота в группу админом" },
    { ok: S.drive && S.drive.enabled, t: "Google Диск подключён", hint: "Нужен ключ Google (файл google-sa.json)" },
    { ok: ps.length > 0, t: ps.length ? `Проекты: ${ps.length}` : "Создать проекты", btn: ["+ Проект", 0] },
    { ok: ps.length > 0 && !noTopics, t: `Темы в группе: ${topicsOk} из ${ps.length * KINDS.length}`, btn: noTopics && ["Настроить", noTopics.id] },
    { ok: S.members.length >= 2, t: `В команде: ${S.members.length} чел.`, hint: "Напарник появится, когда напишет боту /start или любое сообщение в группе" },
    { ok: ps.length > 0 && !noRoles, t: "Ответственные назначены", btn: noRoles && ["Назначить", noRoles.id] },
    { ok: chans.length > 0 && !noYt, optional: true, t: `YouTube-каналы: ${chans.filter((c) => c.youtube_url).length} из ${chans.length}`, hint: "Необязательно: тогда бот сам отметит выкладку, увидев ролик на канале", btn: noYt && ["Добавить", noYt.id] },
  ];
}

/**
 * Чек-лист настройки. На рабочих вкладках — пока не готово обязательное;
 * необязательное (ссылки на YouTube) напоминаем только в «Настройках».
 */
export function onboarding(where) {
  if (!S.me.is_admin) return "";
  const steps = setupSteps();
  const required = steps.filter((x) => !x.optional);
  if (where === "settings" ? steps.every((x) => x.ok) : required.every((x) => x.ok)) return "";
  const done = required.filter((x) => x.ok).length;
  const collapsed = store("onbCollapsed") === "1";
  const head = `<div class="row onb-head" data-act="toggle-onb">${icon("rocket")}<b class="grow">Настройка</b><span class="badge">${done} из ${required.length}</span>${icon(collapsed ? "chevron-right" : "chevron-down")}</div>`;
  // свёрнутая карточка помнится: настройка не должна занимать первый экран каждый раз
  if (collapsed) return `<div class="card onb">${head}</div>`;
  const mark = (x) => (x.ok ? icon("check-circle", "tone-ok") : x.optional ? icon("bulb") : icon("dot", "tone-muted"));
  return `<div class="card onb">${head}
    ${steps.map((x) => `<div class="row onb-step">${mark(x)}
      <div class="grow small">${esc(x.t)}${!x.ok && x.hint ? `<div class="muted">${esc(x.hint)}</div>` : ""}</div>
      ${!x.ok && x.btn ? `<button class="btn sm" data-act="edit-project" data-id="${x.btn[1]}">${esc(x.btn[0])}</button>` : ""}</div>`).join("")}</div>`;
}

export const actions = {
  "filter": (el) => { ui.project = el.dataset.p; store("project", ui.project); render(); },
  "toggle-onb": () => { store("onbCollapsed", store("onbCollapsed") === "1" ? "0" : "1"); render(); },
  "toggle-done": () => { ui.showDone = !ui.showDone; render(); },
  // выбор запоминаем: в следующий раз на компьютере откроется так же
  "fullscreen": () => {
    try {
      if (tg.isFullscreen) { store("fullscreen", "0"); tg.exitFullscreen(); }
      else { store("fullscreen", "1"); tg.requestFullscreen(); }
    } catch (_) { toast("Telegram не дал развернуть окно — обнови Telegram Desktop"); }
  },
  "open-link": (el, ev) => { ev.preventDefault(); openUrl(el.href); },
};

// ---------- общее для экранов команды ----------
import { proj as projectOf } from "../core/store.js?v=1246c5bb";

/** Пустое место с объяснением: что здесь будет и что сделать. extra — готовая разметка кнопок. */
export function emptyBlock(iconName, title, hint, extra = "") {
  return `<div class="empty-block">${icon(iconName, "big")}<b>${esc(title)}</b>${hint ? `<div class="muted small">${hint}</div>` : ""}${extra ? `<div class="empty-acts">${extra}</div>` : ""}</div>`;
}

/** Выпуск ведёт робот (проект с роботом, выпуск не ручной). Зеркало robotManaged на сервере. */
export function isManaged(e) {
  const p = e && projectOf(e.project_id);
  return !!(p && p.runner_enabled && !e.robot_manual);
}

/** G13: этап ведомого выпуска до выкладки вручную закрывает только владелец. Выкладку закрывают как раньше. */
export function closeLocked(e, stage) {
  return stage !== "upload" && !S.me.is_owner && isManaged(e);
}
export const LOCK_TEXT = "Этап закроют файлы на Диске или владелец: этот выпуск ведёт робот.";
