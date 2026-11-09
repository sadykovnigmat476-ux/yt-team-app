// Пульт робота (владелец): все выпуски робота от темы до выкладки, расход, управление выпуском и история прогонок.
import { api } from "../core/api.js?v=f1e8780b";
import { agoText, esc, fmt, fmtNum, robotRescue } from "../core/logic.js?v=27fff957";
import { currentRoute, go } from "../core/router.js?v=27d33f38";
import { act, isBusy, pc, proj, render, S, ui } from "../core/store.js?v=e0f3245a";
import { icon } from "../ui/icons.js?v=2008de79";
import { confirmBox } from "../ui/confirm.js?v=24d167ee";
import { sheetHead } from "../ui/parts.js?v=2e46b762";
import { questionBlock } from "../ui/question.js?v=38a2446a";
import { openSheet } from "../ui/sheet.js?v=53eb9974";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { toast } from "../ui/toast.js?v=c026fd86";

const ROBOT_POLL_MS = 30000;
const SRV_STOP_NOTE = "Работу на сервере рендера гасит ПК при следующем заходе. Пока ПК выключен, стоп до сервера не дойдёт: начатый рендер доработает.";
const RUN_STALE_MIN = 15; // зеркало RUN_STALE_MS: дольше без пульса — «нет пульса»
const PHASE_RU = { script: "сценарий", voice: "озвучка", montage: "монтаж", changes: "правки", final: "финал", accept: "приёмка" };
const RUN_RU = { running: "идёт", review: "ждёт тебя", done: "готово", failed: "упала", stopped: "остановлена" };
const FAIL_RU = {
  failed: "сбой", transient: "временный сбой Claude", timeout: "вышло время", no_checkpoint: "не отправил кадры на проверку", auth: "нет входа в Claude", limit: "кончился лимит Claude",
  no_claude: "на ПК не найден claude", stopped: "остановили", not_delivered: "не сдано", check_failed: "проверка не прошла", lost: "прогонка потерялась",
};
const ROLLBACK_PHASES = [["script", "Сценарий"], ["voice", "Озвучка"], ["montage", "Монтаж"], ["final", "Финал"]];
const NIGHT_PHASES = ["script"]; // зеркало domain.ts: монтаж круглосуточный с 08.11.2026
const WATCHED = ["robot", "robot_settings"];
const watching = () => WATCHED.includes(currentRoute().tab) && S && S.me.is_owner;
const onRobot = () => currentRoute().tab === "robot" && S && S.me.is_owner;
let robotSeq = 0;

// ---------- загрузка ----------
/** Читает robot.state. Ответ на устаревший запрос после более нового отбрасывается; при ошибке прежние данные остаются. */
export async function loadRobot() {
  const r = ui.robot, seq = ++robotSeq;
  r.loading = true;
  const btn = document.querySelector("[data-act='robot-refresh']");
  if (btn) btn.classList.add("is-busy");
  try {
    const data = await api("robot.state");
    if (seq !== robotSeq) return;
    Object.assign(r, { data, at: Date.now(), error: null, fresh: true });
  } catch (e) {
    if (seq !== robotSeq) return;
    r.error = e.message;
  } finally {
    if (seq === robotSeq) { r.loading = false; if (watching()) render(); }
  }
}

// автообновление: раз в 30 с, пока вкладка пульта открыта и страница видна (не в фоне)
setInterval(() => {
  if (onRobot() && document.visibilityState === "visible" && !isBusy() && !ui.sheet && !ui.robot.loading) loadRobot();
}, ROBOT_POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && onRobot() && !ui.robot.loading && Date.now() - ui.robot.at >= ROBOT_POLL_MS) loadRobot();
});
document.addEventListener("question-answered", () => { if (watching()) loadRobot(); });

/** Действие пульта: через act() (замок, тост, ошибка), затем пульт перечитывается. */
async function robotAct(action, body, msg, el) {
  const res = await act(action, body, msg, { el });
  if (res) {
    loadRobot();
    if (mg.id != null) loadHist(mg.id);
    document.dispatchEvent(new Event("inbox-stale"));
  }
  return res;
}

// ---------- тексты ----------
/** Время «ЧЧ:ММ» в поясе команды; с пометкой «завтра», если это уже другой день. */
function clockText(iso, nowMs) {
  const tz = (S.settings && S.settings.timezone) || undefined;
  const pick = (t, o) => { try { return new Date(t).toLocaleString("ru", { timeZone: tz, ...o }); } catch (_) { return new Date(t).toLocaleString("ru", o); } };
  const hm = pick(Date.parse(iso), { hour: "2-digit", minute: "2-digit" });
  const sameDay = pick(Date.parse(iso), { day: "numeric", month: "numeric" }) === pick(nowMs, { day: "numeric", month: "numeric" });
  return sameDay ? hm : `${hm} (завтра)`;
}

/** Строки `where`, `detail` приходят с сервера с эмодзи в начале (и в середине, у названий кнопок): на экране вместо них иконка по тону. */
export const noEmoji = (t) => String(t ?? "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/«\s+/g, "«").replace(/\s{2,}/g, " ").trim();
const WHERE_TONES = ["work", "wait", "owner", "fail", "stop", "done"];
const WHERE_ICON = { work: "robot", wait: "hourglass", owner: "eye", fail: "alert-circle", stop: "pause", done: "check-circle" };
/** Строка «где сейчас»: иконка по тону и текст без эмодзи. */
function whereLine(e) {
  const tone = WHERE_TONES.includes(e.tone) ? e.tone : "wait";
  return `<div class="rb-where ${tone}">${icon(WHERE_ICON[tone])}<span>${esc(noEmoji(e.where))}</span></div>`;
}

const decimal = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
export const hoursText = (h) => `${decimal(h || 0)} ч`;
export const costText = (c) => `≈ $${decimal(c || 0)}`;
/** «Уровень high»; если уровень не записан, так и пишем. */
export const effortText = (l) => (!l ? "уровень не указан" : /\s/.test(l) ? l : `уровень ${l}`);
/** Длительность прогонки по миллисекундам. */
function durText(ms) {
  if (!ms) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} с`;
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? m % 60 + " мин" : ""}`.trim();
}
const usageTokens = (u) => (u ? (u.input || 0) + (u.output || 0) + (u.cache_read || 0) + (u.cache_write || 0) : 0);

/** Строка расхода: «412k токенов · 7,4 ч · Lumean 4,8k». */
export function usageLine(u) {
  if (!u || (!u.tokens && !u.hours && !u.lumean_tokens)) return "Расхода пока нет";
  const out = [`${fmtNum(u.tokens || 0)} токенов`, hoursText(u.hours)];
  if (u.lumean_tokens) out.push(`Lumean ${fmtNum(u.lumean_tokens)}`);
  return out.join(" · ");
}

function usageTiles(d) {
  const u = d.usage7d || {}, n = u.night || {};
  const tile = (v, l, sub) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="l">${sub}</div>` : ""}</div>`;
  return `<div class="tiles">${tile(fmtNum(u.tokens || 0), "токенов Claude за 7 дней", `${u.runs || 0} прогонок · ${costText(u.cost_usd)}`)}
    ${tile(hoursText(u.hours), "часов робота за 7 дней")}
    ${tile(fmtNum(n.tokens || 0), "токенов за последнюю ночь", `${hoursText(n.hours)} · ${costText(n.cost_usd)}`)}
    ${tile(fmtNum(u.lumean_tokens || 0), "токенов Lumean за 7 дней", "озвучка")}</div>`;
}

// ---------- карточка выпуска ----------
function robotStep(s) {
  const st = ["done", "active", "wait", "fail", "todo", "skip"].includes(s.state) ? s.state : "todo";
  const mark = { done: icon("check"), active: icon("dot"), wait: icon("hourglass"), fail: icon("x"), todo: "", skip: "–" }[st];
  return `<div class="rb-step ${st}"><span class="mk">${mark}</span><span class="nm">${esc(s.title)}</span><span class="dt">${s.detail ? esc(noEmoji(s.detail)) : ""}</span></div>`;
}

/** Блок идущей (или последней) прогонки: фаза, часть, ПК, модель, уровень, пульс. */
function robotRun(run, nowMs, d) {
  const phase = PHASE_RU[run.phase] || run.phase;
  const finalMax = (d.limits && d.limits.final_max) || 12;
  const part = run.phase === "final" ? ` · заход ${Number(run.part) || 1} из ${finalMax}` : Number(run.part) > 1 || run.phase === "montage" ? ` · часть ${Number(run.part) || 1}` : "";
  let pulse = "";
  if (run.status === "running") {
    const at = Date.parse(run.heartbeat_at || run.started_at);
    const mins = Number.isFinite(at) ? (nowMs - at) / 60000 : 0;
    if (mins > RUN_STALE_MIN) pulse = ` · <span class="rb-bad">нет пульса${run.heartbeat_at ? " · " + agoText(nowMs - at) : ""}</span>`;
    else pulse = run.heartbeat_at ? ` · пульс ${esc(agoText(nowMs - at))}` : " · пульса ещё нет";
  }
  const tone = run.status === "running" ? "ok" : run.status === "failed" ? "late" : run.status === "review" ? "today" : "";
  return `<div class="rb-run"><div class="row"><b class="grow with-ic">${icon("robot")}${esc(phase)}${part}</b><span class="badge ${tone}">${esc(RUN_RU[run.status] || run.status)}</span></div>
    <div class="muted small">${run.host ? "ПК " + esc(run.host) : "ПК не указан"} · ${esc(run.model_label || "модель не указана")} · <b class="rb-level">${esc(effortText(run.effort_label))}</b>${pulse}</div></div>`;
}

/** «Робот ведёт до» (robot.until): у проекта — по умолчанию для новых выпусков, у выпуска — своё или «как у проекта». */
const UNTIL_RU = { script: "Сценарий", voice: "Озвучка", montage: "Монтаж", end: "Конец" };
const UNTIL_HINT = { script: "только сценарий", voice: "сценарий и озвучка", montage: "до проверки стоп-кадров и правок, финал твой", end: "все фазы, как раньше" };
function untilOptions(selected, inherit) {
  const own = Object.keys(UNTIL_RU).map((k) => `<option value="${k}" ${selected === k ? "selected" : ""} title="${esc(UNTIL_HINT[k])}">${UNTIL_RU[k]}</option>`).join("");
  return inherit ? `<option value="" ${selected ? "" : "selected"}>как у проекта · ${esc(UNTIL_RU[inherit] || "Конец")}</option>${own}` : own;
}
function robotUntilRow(e) {
  const pp = ((ui.robot.data && ui.robot.data.projects) || []).find((p) => p.id === e.project_id);
  const inherit = (pp && pp.robot_until) || "end";
  return `<label class="rb-until"><span>Робот ведёт до:</span><select class="rb-sel" data-act-change="robot-until" data-ep="${Number(e.id)}" aria-label="Робот ведёт выпуск до этапа">${untilOptions(e.robot_until_own || "", inherit)}</select></label>`;
}

const projectBusy = (d, pid) => ((d.projects || []).find((p) => p.id === pid) || {}).busy_since || null;

function robotEpisode(e, nowMs, withActs, d) {
  const p = proj(e.project_id);
  const allowed = e.now_until && Date.parse(e.now_until) > nowMs;
  const running = !!(e.run && e.run.status === "running");
  const busySince = projectBusy(d, e.project_id);
  const { retry, again } = robotRescue(e);
  const date = e.publish_date ? `<span class="badge">${e.tone === "done" ? "вышел" : "выход"} ${esc(fmt(e.publish_date))}</span>` : "";
  const badges = [e.hold ? `<span class="badge late">стоп</span>` : "", e.manual ? `<span class="badge today">веду сам</span>` : "",
    busySince ? `<span class="badge today" title="Ты работал в папке проекта: робот не берёт новую работу">папка занята</span>` : "", date].join("");

  let acts = "";
  if (withActs) {
    const main = [], b = [];
    const finalMax = (d.limits && d.limits.final_max) || 12;
    if (e.review) main.push(`<button class="btn" data-key="rb-review-${e.id}" data-act="rb-review" data-run="${Number(e.review.run_id)}">${icon("eye")}${e.review.kind === "accept" ? "Принять выпуск" : "Проверить кадры"}</button>`);
    if (retry) main.push(`<button class="btn" data-key="rb-retry-${e.id}" data-act="rb-run" data-op="retry" data-id="${e.id}">${icon("refresh")}Повторить сейчас</button>`);
    if (again) main.push(`<button class="btn" data-key="rb-again-${e.id}" data-act="rb-run" data-op="again" data-id="${e.id}">${icon("refresh")}Ещё ${finalMax} заходов</button>`);
    if (!e.manual) {
      if (e.hold) b.push(`<button class="btn sm" data-key="rb-release-${e.id}" data-act="robot-ep" data-op="release" data-id="${e.id}">${icon("play")}Вернуть</button>`);
      else b.push(`<button class="btn sm danger" data-key="rb-hold-${e.id}" data-act="robot-ep" data-op="hold" data-id="${e.id}" data-running="${running ? 1 : 0}">${icon("pause")}Остановить выпуск</button>`);
      if (allowed) b.push(`<button class="btn sm ghost" data-key="rb-night-${e.id}" data-act="robot-ep" data-op="night" data-id="${e.id}">${icon("moon")}Только ночью</button>`);
      // только когда ночная фаза уже ждёт, робот не на паузе и выпуск не у человека и не упал
      else if (e.next && NIGHT_PHASES.includes(e.next.phase) && !running && !d.night && !d.paused && !e.hold && !retry) {
        b.push(`<button class="btn sm ghost" data-key="rb-now-${e.id}" data-act="robot-ep" data-op="now" data-id="${e.id}" title="Сценарий идёт ночью; кнопка разрешает его днём на 12 часов">${icon("sun")}Запустить сейчас</button>`);
      }
      b.push(`<button class="btn sm ghost" data-key="rb-mine-${e.id}" data-act="rb-manual" data-id="${e.id}" data-manual="1" data-running="${running ? 1 : 0}">${icon("user")}Веду сам</button>`);
    } else {
      b.push(`<button class="btn sm" data-key="rb-give-${e.id}" data-act="rb-manual" data-id="${e.id}" data-manual="0">${icon("robot")}Отдать роботу</button>`);
    }
    b.push(`<button class="btn sm ghost" data-key="rb-more-${e.id}" data-act="rb-manage" data-id="${e.id}">${icon("list")}Подробнее</button>`);
    acts = `${e.manual ? "" : robotUntilRow(e)}${main.length ? `<div class="rb-acts main">${main.join("")}</div>` : ""}<div class="rb-acts">${b.join("")}</div>`
      + (allowed ? `<div class="note warn">Днём разрешено до ${esc(clockText(e.now_until, nowMs))}. Возьмёт при следующем заходе <code>ytbot run</code> (с <code>--watch</code> — раз в 10 минут).</div>` : "");
  } else {
    acts = `<div class="rb-acts"><button class="btn sm ghost" data-key="rb-more-${e.id}" data-act="rb-manage" data-id="${e.id}">${icon("list")}История</button></div>`;
  }
  const miss = retry && e.missing && e.missing.length
    ? `<div class="rb-miss">${e.missing.map((m) => `<span class="pill miss">${esc(m)}</span>`).join("")}</div>` : "";
  return `<div class="card pc-stripe rb-ep" data-key="rb-ep-${e.id}" style="${pc(p)}">
    <div class="row top"><div class="grow title break">${esc(e.label)}</div></div>
    ${badges ? `<div class="rb-badges">${badges}</div>` : ""}
    ${whereLine(e)}${e.fixing ? `<div class="rb-where wait">${icon(WHERE_ICON.wait)}<span>${esc(e.fixing)}</span></div>` : ""}${miss}${e.question ? questionBlock(e.question) : ""}
    <div class="rb-steps">${(e.track || []).map(robotStep).join("")}</div>
    ${e.run ? robotRun(e.run, nowMs, d) : ""}
    <div class="rb-spend muted small">${icon("chart")}${esc(usageLine(e.usage))}</div>${acts}
  </div>`;
}

// ---------- панель выпуска: управление и история ----------
const mg = { id: null, rollback: null };
/** История прогонок по выпускам: id → { data, error, loading, open:Set }. */
const hist = new Map();

function loadHist(id) {
  const c = hist.get(id) || { data: null, error: null, loading: false, open: new Set() };
  hist.set(id, c);
  if (c.loading) return;
  c.loading = true;
  api("robot.history", { episode_id: id })
    .then((data) => { c.data = data; c.error = null; })
    .catch((e) => { c.error = e.message; })
    .finally(() => { c.loading = false; if (mg.id === id) render(); });
}

const findEp = (id) => {
  const d = ui.robot.data;
  return d ? (d.episodes || []).concat(d.done || []).find((x) => x.id === id) : null;
};

function runRow(r, open) {
  const phase = `${PHASE_RU[r.phase] || r.phase}${Number(r.part) > 1 ? `, часть ${Number(r.part)}` : ""}`;
  const tone = r.status === "running" ? "ok" : r.status === "failed" ? "late" : r.status === "review" ? "today" : "";
  const facts = [r.host ? "ПК " + r.host : "", r.model_label || "", effortText(r.effort_label), durText(r.ms), r.usage ? fmtNum(usageTokens(r.usage)) + " токенов" : ""].filter(Boolean);
  const when = r.started_at ? agoText(Date.now() - Date.parse(r.started_at)) : "";
  const why = r.status === "failed" && r.fail_kind ? `<div class="rb-bad small">Причина: ${esc(FAIL_RU[r.fail_kind] || r.fail_kind)}${r.missing && r.missing.length ? " — " + esc(r.missing.join(", ")) : ""}</div>` : "";
  const review = r.review_note ? `<div class="small hr-note"><b>Правки владельца:</b> ${esc(r.review_note)}${r.langs && r.langs.length ? ` <span class="muted">· ${esc(r.langs.map((l) => l.toUpperCase()).join(", "))}</span>` : ""}</div>` : "";
  const override = r.override_by ? `<div class="small tone-bad">Принято несмотря на красные проверки</div>` : "";
  const text = [r.log_tail, r.note].filter(Boolean).join("\n\n");
  const toggle = text ? `<button class="btn sm ghost" data-key="hr-log-${r.id}" data-act="hist-log" data-run="${r.id}">${open ? "Скрыть журнал" : "Журнал"}</button>` : "";
  return `<div class="hr" data-key="hr-${r.id}"><div class="row"><b class="grow">${esc(phase)}</b><span class="badge ${tone}">${esc(RUN_RU[r.status] || r.status)}</span></div>
    <div class="muted small">${esc(when)}${facts.length ? " · " + esc(facts.join(" · ")) : ""}</div>${why}${override}${review}${toggle}${open && text ? `<pre class="rb-log">${esc(text)}</pre>` : ""}</div>`;
}

function rollbackBlock() {
  const rb = mg.rollback;
  if (!rb) return "";
  const name = (ROLLBACK_PHASES.find((x) => x[0] === rb.phase) || [])[1] || rb.phase;
  if (rb.loading) return `<div class="note">Считаю, что изменится…</div>`;
  if (rb.error) return `<div class="note warn" role="alert">${esc(rb.error)}</div>`;
  return `<div class="note warn rb-conseq"><b>Вернуть на фазу «${esc(name)}»? Вот что произойдёт:</b>
    <ul>${(rb.info.consequences || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    <div class="rb-acts"><button class="btn danger" data-key="rb-rb-go" data-act="rb-rollback-go">Вернуть на «${esc(name)}»</button><button class="btn ghost" data-key="rb-rb-no" data-act="rb-rollback-no">Не надо</button></div></div>`;
}

function manageView() {
  const id = mg.id, e = findEp(id);
  if (!e) return `${sheetHead("Выпуск")}<div class="empty">Выпуска нет в пульте. Закрой окно и обнови пульт.</div>`;
  const d = ui.robot.data, c = hist.get(id) || { data: null, error: null, loading: true, open: new Set() };
  const live = d.episodes.some((x) => x.id === id);
  const { retry, again } = robotRescue(e);
  const finalMax = (d.limits && d.limits.final_max) || 12;
  const u = (c.data && c.data.usage) || e.usage;
  let html = `${sheetHead(e.label, pc(proj(e.project_id)))}
    ${whereLine(e)}
    <h2>Расход выпуска</h2><div class="muted small mb-2">${esc(usageLine(u))}${u && u.cost_usd ? " · " + costText(u.cost_usd) : ""}</div>`;
  if (live) {
    html += `<h2>Управление</h2><div class="card rb-manage">`;
    if (e.review) html += `<button class="btn block" data-key="mg-review" data-act="rb-review" data-run="${Number(e.review.run_id)}">${icon("eye")}${e.review.kind === "accept" ? "Принять выпуск" : "Проверить кадры"}</button>`;
    if (retry) html += `<button class="btn block" data-key="mg-retry" data-act="rb-run" data-op="retry" data-id="${id}">${icon("refresh")}Повторить сейчас</button><div class="muted small">Снимает ожидание и счётчики: робот возьмётся за выпуск заново.</div>`;
    if (again) html += `<button class="btn block" data-key="mg-again" data-act="rb-run" data-op="again" data-id="${id}">${icon("refresh")}Ещё ${finalMax} заходов</button><div class="muted small">Ещё ${finalMax} заходов финала: это часы рендера на сервере.</div>`;
    html += e.manual
      ? `<button class="btn block ghost" data-key="mg-give" data-act="rb-manual" data-id="${id}" data-manual="0">${icon("robot")}Отдать роботу</button><div class="muted small">Сейчас выпуск твой: робот его не трогает.</div>`
      : `<button class="btn block ghost" data-key="mg-mine" data-act="rb-manual" data-id="${id}" data-manual="1" data-running="${e.run && e.run.status === "running" ? 1 : 0}">${icon("user")}Веду сам</button><div class="muted small">Робот перестанет брать выпуск, идущая прогонка остановится.</div>`;
    html += `<button class="btn block ghost" data-key="mg-accept" data-act="rb-accept" data-id="${id}">${icon("check-circle")}Проверить выпуск</button>
      <div class="muted small">Робот прогонит проверку всех языков по готовым файлам. На ручных выпусках она ничего не блокирует.</div></div>
      <h2>Вернуть на фазу</h2><div class="muted small mb-2">Робот начнёт заново с выбранного места. Перед этим покажу, что изменится.</div>
      <div class="chips wrap">${ROLLBACK_PHASES.map(([k, n]) => `<button class="chip ${mg.rollback && mg.rollback.phase === k ? "on" : ""}" data-key="rb-ph-${k}" data-act="rb-rollback" data-id="${id}" data-phase="${k}">${n}</button>`).join("")}</div>${rollbackBlock()}`;
  }
  html += `<h2 class="between"><span>История прогонок</span><button class="icon-btn" data-act="hist-refresh" data-id="${id}" aria-label="Обновить историю" title="Обновить">${icon("refresh")}</button></h2>`;
  if (c.error && !c.data) html += `<div class="banner"><span class="grow">История не загрузилась · ${esc(c.error)}</span><button class="btn sm" data-act="hist-refresh" data-id="${id}">Повторить</button></div>`;
  else if (!c.data) html += skeleton("list", 2);
  else if (!c.data.runs.length) html += `<div class="card empty">Прогонок пока не было. Робот возьмёт выпуск, когда придёт его время.</div>`;
  else html += `<div class="card">${c.data.runs.map((r) => runRow(r, c.open.has(r.id))).join("")}</div>`;
  return html;
}

function openManage(id) {
  mg.id = id;
  mg.rollback = null;
  loadHist(id);
  openSheet(manageView, null, { mode: "panel" });
}

// ---------- экран ----------
export function view() {
  const r = ui.robot;
  // при каждом заходе во вкладку — свежие данные (пока грузятся, видны прежние); после ошибки — только по «Повторить» или по таймеру
  if (!r.loading && !r.error && !r.fresh) loadRobot();
  const retry = `<button class="btn sm" data-act="robot-refresh">Повторить</button>`;
  if (!r.data) {
    if (r.error) return `<div class="empty">${esc(r.error)}<br><br>${retry}</div>`;
    return skeleton("list", 3);
  }
  const d = r.data;
  const nowMs = Date.parse(d.now) + (Date.now() - r.at);
  const eps = d.episodes || [], doneEps = d.done || [];
  const enabled = (d.projects || []).filter((p) => p.runner_enabled);
  const pcSeen = d.pc_seen_at ? `ПК заходил: ${esc(agoText(nowMs - Date.parse(d.pc_seen_at)))}` : "ПК ещё не заходил";
  const clock = new Date(r.at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const red = (d.hosts || []).reduce((n, h) => n + (((h.report || {}).projects || []).reduce((m, p) => m + p.items.filter((i) => !i.ok).length, 0)), 0);

  let html = "";
  if (r.error) html += `<div class="banner"><span class="grow">Не обновилось · ${esc(r.error)}</span>${retry}</div>`;
  if (d.owner_hint) html += `<div class="note warn" role="note">${icon("info")} ${esc(d.owner_hint)}</div>`;
  html += `<div class="rb-cols"><div class="rb-main">`;
  html += `<div class="card rb-head">
    <div class="row"><div class="grow state ${d.paused ? "off" : ""}">${icon(d.paused ? "pause" : "dot", d.paused ? "" : "tone-ok")}${d.paused ? "Робот остановлен" : "Робот работает"}</div>
      <button class="icon-btn ${r.loading ? "is-busy" : ""}" data-act="robot-refresh" title="Обновить" aria-label="Обновить">${icon("refresh")}</button></div>
    <div class="rb-meta muted small">
      <div>Модель: <b class="rb-level">Opus 5.5 · ${esc(effortText(d.effort_label))}</b></div>
      <div>Владелец: ${d.owner ? esc(d.owner.name) : "не назначен"}</div>
      <div>${pcSeen}</div>
      <div>${d.night ? "Сейчас ночь" : "Сейчас день"} · ночное окно ${esc(d.night_window)}: сценарий идёт только в нём, монтаж — в любое время</div>
      <div>Обновлено в ${esc(clock)} · дальше само раз в ${ROBOT_POLL_MS / 1000} с</div></div>
    <button class="btn block ${d.paused ? "" : "danger"}" data-act="robot-pause" data-paused="${d.paused ? 0 : 1}">${icon(d.paused ? "play" : "pause")}${d.paused ? "Запустить робота" : "Остановить робота"}</button>
    <div class="muted small rb-srv-note">${SRV_STOP_NOTE}</div>
    <div class="rb-links"><button class="btn ghost sm" data-act="rb-goto" data-to="robot_settings">${icon("gear")}Настройки робота</button>
      <button class="btn ghost sm" data-act="rb-goto" data-to="setup">${icon("check-circle")}Настройка по проектам${red ? ` <span class="badge late">${red}</span>` : ""}</button></div></div>`;

  html += `<h2>Выпуски</h2>`;
  if (!enabled.length) html += `<div class="card empty">Робот не включён ни в одном проекте.<br>Включи его переключателем в списке проектов.</div>`;
  else if (!eps.length) html += `<div class="card empty">Выпусков у робота нет — календарь заведёт за 4 дня до выхода.</div>`;
  else html += `<div class="rb-list">${eps.map((e) => robotEpisode(e, nowMs, true, d)).join("")}</div>`;

  if (doneEps.length) {
    html += `<div class="chips mt-2"><button class="chip ${r.showDone ? "on" : ""}" data-act="robot-done">${icon(r.showDone ? "chevron-down" : "chevron-right")}Готовые · ${doneEps.length}</button></div>`;
    if (r.showDone) html += `<div class="muted small note-line">Уже на YouTube (хотя бы на одном языке), за неделю. Старые — на вкладке «Выпуски», раздел «Готовые».</div><div class="rb-list">${doneEps.map((e) => robotEpisode(e, nowMs, false, d)).join("")}</div>`;
  } else if (enabled.length) html += `<div class="muted small note-line">Готовых за неделю пока нет.</div>`;
  html += `</div><aside class="rb-aside">`;

  html += `<h2>Расход</h2>${usageTiles(d)}`;
  html += `<h2>Робот по проектам</h2><div class="muted small note-line">«До» — до какого этапа робот ведёт новые выпуски проекта; у выпуска можно своё.</div><div class="card">${(d.projects || []).map((p) => {
    const sp = proj(p.id);
    const seen = p.seen_at ? ` · ПК заходил ${esc(agoText(nowMs - Date.parse(p.seen_at)))}` : "";
    const link = p.linked ? "папка на ПК связана" : `<span class="${p.runner_enabled ? "rb-bad" : ""}">папка на ПК не связана — <code>ytbot link ${Number(p.id)}</code></span>`;
    const busy = p.busy_since ? `<div class="small rb-busy">${icon("folder")}Папка занята: ты работал в ней ${esc(agoText(nowMs - Date.parse(p.busy_since)))}. Робот не берёт новую работу в этом проекте.</div>` : "";
    return `<div class="member" data-key="rb-pr-${Number(p.id)}"><span class="pdot" style="${sp ? pc(sp) : ""}"></span>
      <div class="grow"><div class="title ellipsis">${esc(p.name)}</div><div class="muted small">${link}${seen}</div>${busy}
        <label class="rb-until"><span>до:</span><select class="rb-sel" data-act-change="robot-until" data-pid="${Number(p.id)}" aria-label="Робот ведёт выпуски проекта ${esc(p.name)} до этапа">${untilOptions(p.robot_until || "end")}</select></label></div>
      <button class="sw ${p.runner_enabled ? "on" : ""}" role="switch" aria-checked="${p.runner_enabled ? "true" : "false"}" aria-label="Робот в проекте ${esc(p.name)}" data-act="robot-project" data-id="${Number(p.id)}" data-on="${p.runner_enabled ? 1 : 0}"></button></div>`;
  }).join("") || `<div class="muted small">Проектов нет.</div>`}</div>`;
  html += `</aside></div>`;
  return html;
}

/** При каждом заходе — свежие данные (пока грузятся, видны прежние). */
export function enter() { ui.robot.fresh = false; ui.robot.error = null; }
export function refresh() { ui.robot.error = null; return loadRobot(); }

export const actions = {
  "robot-refresh": () => refresh(),
  "robot-done": () => { ui.robot.showDone = !ui.robot.showDone; render(); },
  "rb-goto": (el) => go({ tab: el.dataset.to }),
  "rb-review": (el) => go({ tab: "review", run: Number(el.dataset.run) }, { closeSheets: true }),
  "rb-manage": (el) => openManage(Number(el.dataset.id)),
  "robot-pause": async (el) => {
    const pause = el.dataset.paused === "1";
    if (pause && !(await confirmBox(`Остановить робота? Идущие прогонки остановятся, новые не начнутся. ${SRV_STOP_NOTE}`))) return;
    const r = await robotAct("robot.pause", { paused: pause }, null, el);
    if (r) toast(pause ? `Робот остановлен${r.stopped ? ` · остановлено прогонок: ${r.stopped}` : ""}` : "Робот запущен");
  },
  "robot-project": async (el) => {
    const id = Number(el.dataset.id), enabled = el.dataset.on !== "1";
    const p = proj(id);
    if (!enabled && !(await confirmBox(`Выключить робота в проекте «${p ? p.name : id}»? Идущая прогонка проекта остановится.`))) return;
    const r = await robotAct("robot.project", { project_id: id, enabled }, null, el);
    if (r) toast(enabled ? "Робот включён в проекте" : "Робот в проекте выключен");
  },
  "robot-ep": async (el) => {
    const id = Number(el.dataset.id), op = el.dataset.op;
    if (op === "hold" && !(await confirmBox(`${el.dataset.running === "1" ? "Остановить выпуск? Идущая прогонка остановится." : "Остановить выпуск? Робот его не возьмёт, пока не вернёшь."} ${SRV_STOP_NOTE}`))) return;
    const msg = { hold: "Выпуск остановлен", release: "Выпуск возвращён роботу", now: "Днём разрешено на 12 часов", night: "Снова только ночью" }[op];
    await robotAct("robot.episode", { episode_id: id, op }, msg, el);
  },
  // «Веду сам» / «Отдать роботу»
  "rb-manual": async (el) => {
    const id = Number(el.dataset.id), mine = el.dataset.manual === "1";
    if (mine && el.dataset.running === "1" && !(await confirmBox("Взять выпуск себе? Идущая прогонка робота остановится."))) return;
    const r = await robotAct("robot.episode", { episode_id: id, op: mine ? "mine" : "give" }, null, el);
    if (r) toast(mine ? "Выпуск твой: робот его не трогает" : "Выпуск отдан роботу");
  },
  // «Повторить сейчас» и «Ещё N заходов»
  "rb-run": async (el) => {
    const id = Number(el.dataset.id), op = el.dataset.op;
    const n = (ui.robot.data && ui.robot.data.limits && ui.robot.data.limits.final_max) || 12;
    if (op === "again" && !(await confirmBox(`Разрешить ещё ${n} заходов финала? Это ещё часы рендера на сервере.`))) return;
    await robotAct("robot.run", { episode_id: id, op }, op === "retry" ? "Повтор поставлен: робот возьмётся за выпуск" : `Ещё ${n} заходов разрешено`, el);
  },
  "rb-accept": async (el) => {
    const r = await robotAct("robot.episode", { episode_id: Number(el.dataset.id), op: "accept" }, null, el);
    if (r) toast(r.text || "Проверка выпуска поставлена");
  },
  // откат: сначала сухой прогон — что изменится, потом решение
  "rb-rollback": async (el) => {
    const id = Number(el.dataset.id), phase = el.dataset.phase;
    mg.rollback = { phase, loading: true, info: null, error: null };
    render();
    try {
      const info = await api("robot.run", { episode_id: id, op: "rollback", phase, dry: true });
      if (mg.rollback && mg.rollback.phase === phase) mg.rollback = { phase, loading: false, info, error: null };
    } catch (e) {
      if (mg.rollback && mg.rollback.phase === phase) mg.rollback = { phase, loading: false, info: null, error: e.message };
    }
    render();
  },
  "rb-rollback-no": () => { mg.rollback = null; render(); },
  "rb-rollback-go": async (el) => {
    const rb = mg.rollback;
    if (!rb || !rb.info) return;
    const r = await robotAct("robot.run", { episode_id: mg.id, op: "rollback", phase: rb.phase }, "Выпуск возвращён на фазу: робот начнёт заново", el);
    if (r) mg.rollback = null;
    render();
  },
  "hist-log": (el) => {
    const c = hist.get(mg.id), id = Number(el.dataset.run);
    if (!c) return;
    if (!c.open.delete(id)) c.open.add(id);
    render();
  },
  "hist-refresh": (el) => loadHist(Number(el.dataset.id)),
  "change:robot-until": (el) => {
    const v = el.value || null;
    const body = el.dataset.ep ? { episode_id: Number(el.dataset.ep), until: v } : { project_id: Number(el.dataset.pid), until: v };
    const msg = el.dataset.ep
      ? (!v ? "Выпуск — как у проекта" : v === "end" ? "Робот ведёт выпуск до конца" : `Робот ведёт выпуск до: ${UNTIL_RU[v]}`)
      : `Новые выпуски проекта — до: ${UNTIL_RU[v || "end"]}`;
    robotAct("robot.until", body, msg, el);
  },
};
