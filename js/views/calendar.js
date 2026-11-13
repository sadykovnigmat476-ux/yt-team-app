// «Календарь»: выходы и сроки этапов по дням.
import { api } from "../core/api.js?v=f1e8780b";
import { byId } from "../core/dom.js?v=3f6425ae";
import { addDays, dayEvents as dayEventsOf, esc, fmt, formatTag, META, MONTHS, nextPublishDay, PREV, publishDaysNote, WD, weekday } from "../core/logic.js?v=27fff957";
import { currentRoute } from "../core/router.js?v=27d33f38";
import { act, ep, epHead, episodeDone, epTasks, mem, pc, pcolor, proj, projChannels, render, S, store, ui } from "../core/store.js?v=fd36140d";
import { haptic } from "../core/tg.js?v=f1d7ce1d";
import { confirmBox } from "../ui/confirm.js?v=24d167ee";
import { icon } from "../ui/icons.js?v=2008de79";
import { emptyBlock, projectChips, sheetHead } from "../ui/parts.js?v=91b94c25";
import { closeSheet, openSheet } from "../ui/sheet.js?v=8e391c5d";
import { toast } from "../ui/toast.js?v=c026fd86";

const dayEvents = (d) => dayEventsOf(S, d, ui.project);

function deadlinesView() {
  const [y, m] = ui.month.split("-").map(Number);
  const first = `${ui.month}-01`;
  const start = addDays(first, -weekday(first));
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.slice(0, 7) !== ui.month) break;
    const { pubs, dls } = dayEvents(d);
    const cls = ["day", d.slice(0, 7) !== ui.month && "out", d === S.today && "today", d === ui.day && "sel"].filter(Boolean).join(" ");
    const ev = pubs.slice(0, 4).map((e) => (episodeDone(e.id) ? icon("check") : esc(proj(e.project_id).emoji))).join("") + (pubs.length > 4 ? "…" : "");
    const dots = dls.slice(0, 8).map((g) => `<i class="${g.open === 0 ? "ok" : g.waiting ? "wait" : d < S.today ? "late" : ""}" style="${g.open === 0 || g.waiting || d < S.today ? "" : "background:" + pcolor(proj(ep(g.eid).project_id))}"></i>`).join("");
    const label = `${fmt(d, true)}${pubs.length ? `, выходов: ${pubs.length}` : ""}${dls.length ? `, сроков: ${dls.length}` : ""}`;
    cells += `<div class="${cls}" data-act="day" data-d="${d}" aria-label="${esc(label)}"><span class="n">${Number(d.slice(8))}</span><span class="ev">${ev}</span><span class="dl">${dots}</span></div>`;
  }
  let html = projectChips() + `<div class="cal-wrap"><div>`;
  html += `<div class="cal-head"><button class="btn ghost sm" data-act="month" data-dir="-1" aria-label="Предыдущий месяц">${icon("chevron-left")}</button><b>${MONTHS[m - 1]} ${y}</b><button class="btn ghost sm" data-act="month" data-dir="1" aria-label="Следующий месяц">${icon("chevron-right")}</button></div>`;
  html += `<div class="cal">${WD.map((w) => `<div class="wd">${w}</div>`).join("")}${cells}</div>`;
  html += `<div class="muted small note-line">Значок проекта — день выхода, точки — сроки этапов (красные — просрочены, зелёные — сделаны, пустые — ждут предыдущий этап).</div></div><div class="side-col">`;
  const d = ui.day || S.today;
  const { pubs, dls } = dayEvents(d);
  html += `<h2>${fmt(d, true)}${d === S.today ? " · сегодня" : ""}</h2>`;
  if (!pubs.length && !dls.length) html += `<div class="card muted">Ничего не запланировано</div>`;
  for (const e of pubs) {
    const p = proj(e.project_id);
    html += `<div class="card clickable row pc-stripe" style="${pc(p)}" data-key="pub-${e.id}" data-act="open-episode" data-id="${e.id}"><div class="grow"><b class="with-ic">${icon("upload")}Выход</b> · ${esc(epHead(e))}<div class="muted ellipsis">«${esc(e.title)}» · ${projChannels(p.id).length} каналов</div></div>${episodeDone(e.id) ? `<span class="badge ok">готово</span>` : ""}</div>`;
  }
  for (const g of dls) {
    const e = ep(g.eid), p = proj(e.project_id);
    const who = [...new Set(epTasks(e.id).filter((t) => t.stage === g.stage).map((t) => (mem(t.assignee_id) || { name: "—" }).name))].join(", ");
    const prev = PREV[g.stage] ? META[PREV[g.stage]].n.toLowerCase() : "";
    html += `<div class="card clickable row pc-stripe" style="${pc(p)}" data-key="dl-${e.id}-${g.stage}" data-act="open-episode" data-id="${e.id}"><div class="grow"><b class="with-ic">${icon(META[g.stage].i)}${META[g.stage].n}</b> · ${esc(epHead(e))}<div class="muted ellipsis">${esc(who)} · «${esc(e.title)}»</div></div><span class="badge ${g.open === 0 ? "ok" : g.waiting ? "" : d < S.today ? "late" : ""}">${g.open === 0 ? icon("check") : g.waiting ? `ждёт ${esc(prev)}` : g.total > 1 ? `${g.total - g.open}/${g.total}` : "срок"}</span></div>`;
  }
  return html + `</div></div>`;
}

// ---------- календарь тем (необязательный) ----------
const plan = { rows: null, error: null, loading: false };
let mode = store("calMode") === "plan" ? "plan" : "dates";
const planOn = () => S.me.is_admin && mode === "plan";

async function loadPlan() {
  if (!S || !S.me.is_admin || plan.loading) return;
  plan.loading = true;
  try {
    plan.rows = (await api("plan.list", {})).rows;
    plan.error = null;
  } catch (e) {
    plan.error = e.message;
  } finally {
    plan.loading = false;
    if (currentRoute().tab === "calendar") render();
  }
}

/** За сколько дней до выхода бот заводит выпуск из темы: у проекта с роботом — за 4, иначе за 2. */
const leadDays = (p) => (p && p.runner_enabled ? 4 : 2);

function planRow(r) {
  const p = proj(r.project_id) || { emoji: "", name: "?" };
  const e = r.episode_id ? ep(r.episode_id) : null;
  const tag = formatTag(r.notes);
  const state = r.status === "created"
    ? `<span class="badge ok">${icon("check")}выпуск заведён</span>`
    : `<span class="badge" title="Бот сам заведёт выпуск">заведу за ${leadDays(p)} дн.</span>`;
  const acts = r.status === "planned"
    ? `<button class="icon-btn" data-act="plan-edit" data-id="${r.id}" aria-label="Изменить тему" title="Изменить">${icon("pencil")}</button>
       <button class="icon-btn" data-act="plan-del" data-id="${r.id}" aria-label="Снять тему" title="Снять с календаря">${icon("trash")}</button>`
    : e ? `<button class="btn ghost sm" data-act="open-episode" data-id="${e.id}">Открыть выпуск</button>` : "";
  return `<div class="card plan-row pc-stripe" style="${pc(proj(r.project_id))}" data-key="plan-${r.id}">
    <div class="plan-date"><b>${fmt(r.publish_date, true)}</b><span class="muted small">${esc(p.emoji)} ${esc(p.name)}</span></div>
    <div class="grow"><div class="plan-title">${esc(r.title)}${tag ? ` <span class="badge">${tag}</span>` : ""}</div>
      ${r.notes && !tag ? `<div class="muted small ellipsis">${esc(r.notes)}</div>` : ""}<div class="mt-1">${state}</div></div>
    <div class="plan-acts">${acts}</div></div>`;
}

function planView() {
  let html = projectChips();
  if (plan.error && !plan.rows) {
    return html + `<div class="banner"><span class="grow">Календарь тем не загрузился · ${esc(plan.error)}</span><button class="btn sm" data-act="plan-retry">Повторить</button></div>`;
  }
  if (!plan.rows) return html + `<div class="card sk-card" aria-busy="true"><span class="sk sk-line" style="width:50%"></span><span class="sk sk-line" style="width:80%"></span></div>`;
  const rows = plan.rows.filter((r) => ui.project === "all" || String(r.project_id) === ui.project).sort((a, b) => a.publish_date.localeCompare(b.publish_date));
  html += `<div class="row plan-head"><div class="grow muted small">Темы наперёд. Бот сам заведёт выпуск за 2 дня до выхода, у проектов с роботом — за 4.</div>
    <button class="btn" data-act="plan-add">${icon("plus")}Тема</button></div>`;
  if (!rows.length) {
    const one = ui.project !== "all" ? proj(Number(ui.project)) : null;
    return html + emptyBlock("calendar", one ? `У проекта «${esc(one.name)}» нет запланированных тем` : "Запланированных тем нет",
      "Календарь тем необязателен. Без него выпуски заводят кнопкой «+ Выпуск» или командой <code>ytbot new</code> в папке проекта, и робот работает с ними так же. Если темы известны заранее — добавь их сюда, и выпуск появится сам.",
      `<button class="btn" data-act="plan-add">${icon("plus")}Добавить тему</button>`);
  }
  const next = rows.filter((r) => r.status === "planned"), made = rows.filter((r) => r.status !== "planned");
  html += `<div class="plan-list">${next.map(planRow).join("") || `<div class="muted small">Новых тем нет: все уже стали выпусками.</div>`}</div>`;
  if (made.length) html += `<h2>Уже стали выпусками · ${made.length}</h2><div class="plan-list">${made.slice().reverse().map(planRow).join("")}</div>`;
  return html;
}

/** Напоминание о днях выхода в форме темы. */
function planDaysNote(p, date) {
  const n = publishDaysNote(p, date);
  return n ? `<div class="note${n.fits ? "" : " warn"}">${esc(n.text)}</div>` : "";
}

function planSheet(draft) {
  return () => {
    const p = proj(draft.project_id) || S.projects[0];
    return `${sheetHead(draft.id ? "Тема" : "Новая тема")}
    <div class="card">
      <label class="f"><span>Проект</span><select class="inp" id="pl-project" data-act-change="pl-days">${S.projects.map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${esc(x.emoji)} ${esc(x.name)}</option>`).join("")}</select></label>
      <label class="f"><span>Тема выпуска</span><input class="inp" id="pl-title" data-enter="plan-save" value="${esc(draft.title)}" placeholder="Переход Ганнибала через Альпы"></label>
      <div class="grid2"><label class="f"><span>Дата выхода</span><input class="inp" type="date" id="pl-date" data-act-input="pl-days" value="${draft.publish_date}"></label>
      <label class="f"><span>Заметка (2D, 3D…)</span><input class="inp" id="pl-notes" value="${esc(draft.notes || "")}" placeholder="3D"></label></div>
      <div id="pl-days">${planDaysNote(p, draft.publish_date)}</div>
      <div class="muted small">Выпуск появится сам за ${leadDays(p)} дн. до выхода. Заведёшь его раньше руками — тема привяжется к нему.</div>
    </div>
    <button class="btn block dup-main" data-act="plan-save">Сохранить</button>`;
  };
}

let planDraft = null;
function openPlanForm(row) {
  const pid = row ? row.project_id : ui.project !== "all" ? Number(ui.project) : S.projects[0].id;
  const draft = row ? { ...row } : { id: 0, project_id: pid, title: "", publish_date: nextPublishDay(proj(pid), addDays(S.today, 7)), notes: "" };
  planDraft = draft;
  openSheet(planSheet(draft), () => ({ main: { text: "Сохранить тему", run: () => actions["plan-save"](null) } }));
}

function paintPlanDays() {
  const box = byId("pl-days");
  if (box) box.innerHTML = planDaysNote(proj(Number(byId("pl-project").value)), byId("pl-date").value);
}

export function view() {
  const tabs = S.me.is_admin
    ? `<div class="seg cal-mode"><button class="${planOn() ? "" : "on"}" data-act="cal-mode" data-v="dates">${icon("calendar")}Выходы и сроки</button><button class="${planOn() ? "on" : ""}" data-act="cal-mode" data-v="plan">${icon("list")}План тем</button></div>` : "";
  return tabs + (planOn() ? planView() : deadlinesView());
}

export function enter() { if (planOn()) loadPlan(); }
export const refresh = enter;

export const actions = {
  "cal-mode": (el) => { mode = el.dataset.v === "plan" ? "plan" : "dates"; store("calMode", mode); if (planOn()) loadPlan(); render(); },
  "input:pl-days": () => paintPlanDays(),
  "change:pl-days": () => paintPlanDays(),
  "plan-retry": () => { plan.error = null; loadPlan(); },
  "plan-add": () => openPlanForm(null),
  "plan-edit": (el) => { const r = plan.rows && plan.rows.find((x) => x.id === Number(el.dataset.id)); if (r) openPlanForm(r); },
  "plan-save": async (el) => {
    const title = byId("pl-title").value.trim(), date = byId("pl-date").value;
    if (!title) return toast("Напиши тему");
    if (!date) return toast("Выбери дату выхода");
    const body = { project_id: Number(byId("pl-project").value), publish_date: date, title, notes: byId("pl-notes").value.trim() || null };
    if (planDraft && planDraft.id) body.id = planDraft.id;
    const r = await act("plan.save", body, "Тема сохранена", { el, retry: () => actions["plan-save"](null) });
    if (!r) return;
    closeSheet({ force: true });
    loadPlan();
  },
  "plan-del": async (el) => {
    const r = plan.rows && plan.rows.find((x) => x.id === Number(el.dataset.id));
    if (!r) return;
    if (!(await confirmBox(`Снять тему «${r.title}» с календаря? Выпуск из неё не создастся.`, { ok: "Снять" }))) return;
    if (await act("plan.delete", { id: r.id }, "Тема снята", { el })) loadPlan();
  },

  "month": (el) => {
    const [y, m] = ui.month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.dir), 1));
    ui.month = d.toISOString().slice(0, 7);
    render();
  },
  "day": (el) => { ui.day = el.dataset.d; haptic("light"); render(); },
};
