// Настройка робота по проектам (владелец): зелёное и красное из отчёта ytbot doctor, у красного — что сделать.
import { api } from "../core/api.js?v=19a8d20a";
import { agoText, esc } from "../core/logic.js?v=470b6fea";
import { pc, render, S } from "../core/store.js?v=1246c5bb";
import { icon } from "../ui/icons.js?v=2008de79";
import { emptyBlock } from "../ui/parts.js?v=4f5be782";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { toast } from "../ui/toast.js?v=c026fd86";

const su = { data: null, error: null, loading: false };
const STALE_H = 24; // отчёт старше суток — просим прогнать заново

async function load() {
  su.loading = true;
  su.error = null;
  try {
    su.data = await api("robot.hosts");
  } catch (e) {
    su.error = e.message;
  } finally {
    su.loading = false;
    render();
  }
}

export function enter() { su.data = null; load(); }
export function refresh() { if (!su.loading) return load(); }

/** Подсказки к инструментам на ПК: отчёт говорит «нет», а что делать — здесь. */
const TOOL_FIX = {
  ffmpeg: ["ffmpeg", "Поставь ffmpeg и проверь командой ffmpeg -version"],
  ffprobe: ["ffprobe", "ffprobe ставится вместе с ffmpeg: проверь командой ffprobe -version"],
  whisper: ["Whisper (сверка голоса с текстом)", "Поставь faster_whisper: pip install faster-whisper"],
};

function pcChecks(host) {
  const r = host.report;
  if (!r) return "";
  const rows = [];
  rows.push({ ok: !!(r.claude && r.claude.ok), text: r.claude && r.claude.ok ? `Claude найден${r.claude.version ? ", версия " + r.claude.version : ""}` : "Claude не найден на ПК", fix: "Поставь Claude Code и запусти claude один раз в терминале" });
  rows.push({ ok: !!(r.claude && r.claude.logged_in), text: r.claude && r.claude.logged_in ? "Вход в Claude выполнен" : "В Claude нет входа", fix: "Запусти claude в терминале и войди в аккаунт" });
  for (const [k, [name, fix]] of Object.entries(TOOL_FIX)) {
    const ok = !!(r.tools && r.tools[k]);
    rows.push({ ok, text: ok ? `${name} на месте` : `${name}: не найден`, fix });
  }
  return rows;
}

function itemRow(it) {
  if (it.ok) return `<div class="su-item ok">${icon("check-circle")}<span>${esc(it.text)}</span></div>`;
  const fix = it.fix || "ytbot doctor";
  const cmd = /^(node|ytbot|tools|python|pip|npm|claude)\b|\.sh\b/.test(fix);
  return `<div class="su-item bad">${icon("alert-circle")}<div class="grow"><b>${esc(it.text)}</b>
    <div class="su-fix"><span class="su-fix-h">Что сделать:</span> ${cmd ? `<code class="su-cmd">${esc(fix)}</code><button class="btn sm ghost" data-key="su-copy-${esc(fix)}" data-act="su-copy" data-cmd="${esc(fix)}">${icon("link")}Скопировать</button>` : esc(fix)}</div></div></div>`;
}

/** Последний отчёт по проекту: из всех ПК берётся самый свежий. */
function reportFor(hosts, pid) {
  let best = null;
  for (const h of hosts) {
    const p = h.report && (h.report.projects || []).find((x) => x.id === pid);
    const at = p && (p.at || h.report.at); // у проекта своё время: папки шлют отчёты порознь
    if (p && (!best || Date.parse(at) > Date.parse(best.at))) best = { ...p, at, host: h.host, busy: (h.busy || []).find((b) => b.project_ids.includes(pid)) || null };
  }
  return best;
}

function projectCard(p, hosts, nowMs) {
  const rep = reportFor(hosts, p.id);
  const items = rep ? rep.items.slice() : [];
  if (!p.linked && p.runner_enabled) items.unshift({ id: "link", ok: false, text: "Папка проекта на ПК не связана", fix: `ytbot link ${p.id}` });
  const bad = items.filter((i) => !i.ok).length;
  const state = !p.runner_enabled && !rep ? "off" : bad ? "bad" : rep ? "ok" : "none";
  const head = { off: `<span class="badge">робот выключен</span>`, bad: `<span class="badge late">сделать: ${bad}</span>`, ok: `<span class="badge ok">${icon("check")}готово</span>`, none: `<span class="badge today">ПК не проверял</span>` }[state];
  const stale = rep && nowMs - Date.parse(rep.at) > STALE_H * 3600000;
  return `<div class="card pc-stripe su-proj ${state}" data-key="su-p-${p.id}" style="${pc(p)}">
    <div class="row"><b class="grow break">${esc(p.emoji)} ${esc(p.name)}</b>${head}</div>
    ${rep ? `<div class="muted small">${esc(rep.dir || "")} · проверка с ПК ${esc(rep.host)}, ${esc(agoText(nowMs - Date.parse(rep.at)))}</div>` : ""}
    ${stale ? `<div class="note warn">Отчёт старше суток. Запусти на ПК <code>ytbot doctor</code>, чтобы обновить.</div>` : ""}
    ${rep && rep.busy ? `<div class="note">${icon("folder")} Папка занята: ты работал в ней ${esc(agoText(nowMs - Date.parse(rep.busy.since)))}. Робот не берёт новую работу.</div>` : ""}
    ${items.length ? `<div class="su-items">${items.sort((a, b) => Number(a.ok) - Number(b.ok)).map(itemRow).join("")}</div>`
      : state === "off" ? `<div class="muted small mt-2">Робот в проекте выключен: настраивать нечего. Включить можно в пульте.</div>`
        : `<div class="muted small mt-2">ПК ещё не присылал проверку этой папки. Запусти на ПК <code>ytbot doctor</code>.</div>`}</div>`;
}

export function view() {
  if (!su.data) {
    if (su.error) return `<div class="empty">${esc(su.error)}<br><br><button class="btn sm" data-act="su-reload">Повторить</button></div>`;
    return skeleton("list", 3);
  }
  const hosts = su.data.hosts || [];
  const nowMs = Date.now();
  const projects = S.projects.slice();
  const rank = (p) => { const r = reportFor(hosts, p.id); const bad = (r ? r.items.filter((i) => !i.ok).length : 0) + (p.linked || !p.runner_enabled ? 0 : 1); return !p.runner_enabled && !r ? 3 : bad ? 0 : r ? 2 : 1; };
  projects.sort((a, b) => rank(a) - rank(b));
  const pending = projects.reduce((n, p) => (p.runner_enabled || reportFor(hosts, p.id) ? n + (reportFor(hosts, p.id) ? reportFor(hosts, p.id).items.filter((i) => !i.ok).length : 0) + (p.linked || !p.runner_enabled ? 0 : 1) : n), 0);

  let html = `<p class="muted small note-line su-top">Здесь видно, чего не хватает роботу на ПК и на сервере. Красное — со своей подсказкой, что сделать. После исправления запусти на ПК <code>ytbot doctor</code>: отчёт обновится.</p>`;
  if (!hosts.length) {
    return html + emptyBlock("monitor", "ПК ещё не присылал отчёт", "Запусти на ПК робота команду ytbot doctor: она проверит Claude, ffmpeg, Whisper и папки проектов и пришлёт результат сюда.",
      `<code class="su-cmd">ytbot doctor</code><button class="btn ghost sm" data-act="su-copy" data-cmd="ytbot doctor">${icon("link")}Скопировать</button>`);
  }
  html += `<div class="card su-sum ${pending ? "bad" : "ok"}">${icon(pending ? "alert-circle" : "check-circle")}<b>${pending ? `Нужно сделать: ${pending}` : "Всё готово"}</b><span class="muted small">${pending ? "красные пункты ниже" : "робот может работать"}</span></div>`;
  html += `<div class="su-cols"><div>`;
  for (const h of hosts) {
    const rows = pcChecks(h);
    html += `<h2>${icon("monitor")}ПК ${esc(h.host)}</h2><div class="card">
      <div class="muted small mb-2">${h.seen_at ? "Заходил " + esc(agoText(nowMs - Date.parse(h.seen_at))) : "Ещё не заходил"}${h.report ? ` · ytbot ${esc(h.report.ytbot)} · проверка ${esc(agoText(nowMs - Date.parse(h.report.at)))}` : ""}</div>
      ${rows ? rows.sort((a, b) => Number(a.ok) - Number(b.ok)).map(itemRow).join("") : `<div class="muted small">Отчёта нет. Запусти <code>ytbot doctor</code>.</div>`}</div>`;
  }
  html += `</div><div><h2>Проекты</h2>${projects.map((p) => projectCard(p, hosts, nowMs)).join("") || emptyBlock("folder", "Проектов нет", "Проект заводит админ в «Настройках».")}</div></div>`;
  return html;
}

export const actions = {
  "su-reload": () => { su.error = null; load(); },
  "su-copy": async (el) => {
    const cmd = el.dataset.cmd;
    try {
      await navigator.clipboard.writeText(cmd);
      toast("Команда скопирована");
    } catch (_) {
      toast("Не получилось скопировать: выдели команду рядом и скопируй вручную");
    }
  },
};
