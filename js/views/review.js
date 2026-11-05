// Проверка стоп-кадров и приёмка выпуска (владелец): кадры, красное и жёлтое по языкам, «Ок», возврат языков, «Принять несмотря на».
import { api } from "../core/api.js?v=d723e8c5";
import { esc, langTag } from "../core/logic.js?v=f81f1930";
import { currentRoute, go } from "../core/router.js?v=5020c62a";
import { act, render, ui } from "../core/store.js?v=be556fd4";
import { confirmBox } from "../ui/confirm.js?v=1dd10cfc";
import { emptyBlock } from "../ui/parts.js?v=7166efce";
import { icon } from "../ui/icons.js?v=2008de79";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { toast } from "../ui/toast.js?v=c026fd86";

/** Состояние экрана: run — какую прогонку показываем; langs — языки на возврат; zoom — открытый кадр. */
const rv = { run: null, data: null, error: null, loading: false, note: "", langs: new Set(), langsTouched: false, tab: null, zoom: null, allOk: false, noteError: null };
let seq = 0;
const zoomSets = new Map();

const driveFile = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
const clock = (s) => {
  const t = Math.max(0, Math.round(s || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60, p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
};

async function load() {
  const run = currentRoute().run;
  const my = ++seq;
  rv.loading = true;
  rv.error = null;
  try {
    const data = await api("robot.review", { run_id: run });
    if (my !== seq) return;
    rv.data = data;
    // по умолчанию на возврат отмечены языки с красным: их и надо чинить
    if (!rv.langsTouched && data.report) rv.langs = new Set(data.report.langs.filter((l) => l.checks.some((c) => !c.ok && c.level === "red")).map((l) => l.lang));
    if (!rv.tab && data.report) rv.tab = (data.report.langs.find((l) => l.checks.some((c) => !c.ok && c.level === "red")) || data.report.langs[0] || {}).lang || null;
  } catch (e) {
    if (my !== seq) return;
    rv.error = e.message;
  } finally {
    if (my === seq) { rv.loading = false; if (currentRoute().tab === "review") render(); }
  }
}

function reset() {
  Object.assign(rv, { run: currentRoute().run, data: null, error: null, note: "", langs: new Set(), langsTouched: false, tab: null, zoom: null, allOk: false, noteError: null });
  zoomSets.clear();
}

export function enter() { reset(); if (rv.run != null) load(); }
export function refresh() { if (rv.run != null && !rv.loading) return load(); }

// ---------- кадры ----------
function thumb(set, i, f, caption) {
  return `<button class="rv-thumb" data-key="rv-t-${esc(set)}-${i}" data-act="rv-zoom" data-set="${esc(set)}" data-i="${i}" aria-label="Открыть крупно: ${esc(caption || f.name || "кадр")}">
    <img src="${esc(f.url)}" alt="${esc(caption || f.name || "кадр")}" loading="lazy"><span class="cap">${esc(caption || "")}</span></button>`;
}

function regSet(set, frames) {
  zoomSets.set(set, frames.map((f) => ({ url: f.url, caption: f.caption || f.name || "" })));
}

// ---------- проверки и факты по языкам ----------
const redOf = (l) => l.checks.filter((c) => !c.ok && c.level === "red");
const warnOf = (l) => l.checks.filter((c) => !c.ok && c.level === "warn");

function checksHtml(l) {
  const ok = l.checks.filter((c) => c.ok);
  const bad = redOf(l).map((c) => `<div class="rv-chk red">${icon("alert-circle")}<span>${esc(c.text)}</span></div>`);
  const warn = warnOf(l).map((c) => `<div class="rv-chk warn">${icon("alert")}<span>${esc(c.text)}</span></div>`);
  const good = rv.allOk ? ok.map((c) => `<div class="rv-chk ok">${icon("check")}<span>${esc(c.text)}</span></div>`) : [];
  const tail = !rv.allOk && ok.length ? `<div class="rv-chk ok">${icon("check")}<span>Прошло проверок: ${ok.length}</span></div>` : "";
  return bad.join("") + warn.join("") + good.join("") + tail || `<span class="muted">—</span>`;
}

function statusBadge(l) {
  const r = redOf(l).length, w = warnOf(l).length;
  if (r) return `<span class="badge late">${icon("alert-circle")}красное: ${r}</span>${w ? `<span class="badge today">жёлтое: ${w}</span>` : ""}`;
  if (w) return `<span class="badge today">${icon("alert")}жёлтое: ${w}</span>`;
  return `<span class="badge ok">${icon("check")}чисто</span>`;
}

/** Строки «что видит Павел» по одному языку: ключ, подпись и готовая разметка. Для таблицы и для карточки вкладки. */
function facts(l) {
  const f = l.frames || [];
  const cap = ["Кадры ролика", "Обложка"];
  const set = "lang-" + l.lang;
  regSet(set, f.map((x, i) => ({ ...x, caption: `${langTag(l.lang)} · ${cap[i] || "кадр"}` })));
  const frames = f.length ? `<div class="rv-thumbs">${f.map((x, i) => thumb(set, i, x, cap[i] || "Кадр")).join("")}</div>` : `<span class="muted">кадров нет</span>`;
  const m = l.meta;
  const title = m && m.title ? `${esc(m.title)} <span class="muted small">${m.title.length}/100</span>` : `<span class="rv-miss">нет названия</span>`;
  const desc = m && m.description ? `<div class="rv-text">${esc(m.description)}</div>` : `<span class="rv-miss">нет описания</span>`;
  const tags = m && m.tags ? esc(m.tags) : `<span class="rv-miss">нет тегов</span>`;
  const chapters = l.chapters && l.chapters.length
    ? `<div class="rv-chapters">${l.chapters.map((c) => `<div><b class="num">${esc(c.t)}</b> ${esc(c.title)}</div>`).join("")}</div>` : `<span class="rv-miss">глав нет</span>`;
  // язык без отчёта приходит с пустым видео (normalizeAccept)
  const video = l.video && l.video.id
    ? `<div class="num">${clock(l.duration_s)} · ${l.lufs != null ? esc(String(l.lufs).replace(".", ",")) + " LUFS" : "громкость не измерена"}</div>
       <a class="rv-link" href="${driveFile(l.video.id)}" data-act="open-link">${icon("link")}${esc(l.video.name)}</a>` : `<span class="rv-miss">видео нет</span>`;
  return [
    ["Проверки", checksHtml(l)],
    ["Кадры и обложка", frames],
    ["Видео на Диске", video],
    ["Название", title],
    ["Описание", desc],
    ["Теги", tags],
    ["Главы", chapters],
    ["Субтитры", l.srt ? `<span class="with-ic">${icon("check")}${esc(l.srt.name)}</span>` : `<span class="rv-miss">субтитров нет</span>`],
  ];
}

function matrix(report) {
  const langs = report.langs;
  const rows = langs.map((l) => ({ l, f: facts(l) }));
  const labels = rows[0] ? rows[0].f.map((x) => x[0]) : [];
  const table = `<div class="table-wrap rv-table"><table class="table acc-table"><thead><tr><th scope="col"></th>${rows.map(({ l }) => `<th scope="col"><div class="rv-lh">${esc(langTag(l.lang))}${rv.langs.has(l.lang) ? `<span class="badge">вернуть</span>` : ""}</div><div class="rv-badges">${statusBadge(l)}</div></th>`).join("")}</tr></thead>
    <tbody>${labels.map((lab, i) => `<tr><th scope="row">${esc(lab)}</th>${rows.map(({ f }) => `<td>${f[i][1]}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const cur = langs.find((l) => l.lang === rv.tab) || langs[0];
  const tabs = `<div class="rv-tabs"><div class="seg" role="tablist" aria-label="Язык">${langs.map((l) => {
    const r = redOf(l).length, w = warnOf(l).length;
    return `<button role="tab" aria-selected="${l.lang === cur.lang}" class="${l.lang === cur.lang ? "on" : ""} ${r ? "has-red" : w ? "has-warn" : ""}" data-key="rv-tab-${esc(l.lang)}" data-act="rv-tab" data-lang="${esc(l.lang)}">${esc(langTag(l.lang))}${r ? icon("alert-circle") : w ? icon("alert") : icon("check")}</button>`;
  }).join("")}</div>
    <div class="card rv-card" role="tabpanel"><div class="row"><b class="grow">${esc(langTag(cur.lang))}</b><div class="rv-badges">${statusBadge(cur)}</div></div>
    ${facts(cur).map(([lab, html]) => `<div class="rv-fact"><div class="rv-fl">${esc(lab)}</div><div>${html}</div></div>`).join("")}</div></div>`;
  return `${table}${tabs}`;
}

// ---------- решение ----------
function stillsGrid(d) {
  const frames = d.frames || [];
  if (!frames.length) return emptyBlock("eye", "Кадров нет", "Робот не приложил кадры к этой проверке. Открой ролик в папке выпуска.");
  const langs = d.project_langs || [];
  const groups = new Map();
  for (const f of frames) {
    const lang = langs.find((x) => new RegExp(`(?:^|[_.-])${x}(?:[_.-]|$)`, "i").test(f.name || ""));
    const key = lang || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  let html = "";
  for (const [key, list] of groups) {
    const set = "stills-" + (key || "all");
    regSet(set, list);
    html += `<h2>${key ? "Язык " + esc(langTag(key)) : "Кадры"}</h2><div class="rv-thumbs big">${list.map((f, i) => thumb(set, i, f, f.name)).join("")}</div>`;
  }
  return html;
}

function summary(d) {
  const r = d.report;
  if (!r) return "";
  const clean = r.langs.filter((l) => !redOf(l).length && !warnOf(l).length).length;
  const tile = (v, l, cls) => `<div class="tile ${cls || ""}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  return `<div class="tiles rv-sum">${tile(r.red, "красных проверок", r.red ? "bad" : "")}${tile(r.warn, "жёлтых предупреждений", r.warn ? "warnt" : "")}${tile(`${clean} из ${r.langs.length}`, "языков без замечаний")}</div>`;
}

function decision(d) {
  const accept = d.kind === "accept";
  const open = d.run.status === "review";
  if (!open) {
    return `<div class="card rv-decide"><div class="with-ic">${icon("check-circle", "tone-ok")}<b>Уже решено</b></div>
      <div class="muted small mt-2">Эту ${accept ? "приёмку" : "проверку"} уже закрыли: в Mini App или в личке. Повторно решить нельзя.</div>
      <button class="btn ghost mt-2" data-act="rv-back">К пульту</button></div>`;
  }
  const red = d.red || 0;
  const langs = accept && d.report ? d.report.langs : [];
  const redLangs = langs.filter((l) => redOf(l).length).map((l) => langTag(l.lang)).join(", ");
  const n = rv.langs.size;
  const lock = red
    ? `<div class="note rv-lock" role="alert">${icon("alert-circle")}<span><b>«Ок» закрыт: красных проверок ${red}${redLangs ? " (" + esc(redLangs) + ")" : ""}.</b> Верни эти языки роботу на правку. Или прими как есть кнопкой «Принять несмотря на»: выпуск уйдёт Павлу с браком, решение запишется.</span></div>` : "";
  const okText = accept ? "Ок — отдать Павлу" : "Ок — делать финал";
  const chips = langs.length
    ? `<div class="rv-ret-h">Вернуть на правку языки:</div><div class="chips wrap" role="group" aria-label="Языки на правку">${langs.map((l) => `<button class="chip lang ${rv.langs.has(l.lang) ? "on" : ""}" aria-pressed="${rv.langs.has(l.lang)}" data-key="rv-l-${esc(l.lang)}" data-act="rv-lang" data-lang="${esc(l.lang)}">${esc(langTag(l.lang))}${redOf(l).length ? icon("alert-circle") : ""}</button>`).join("")}</div>` : "";
  const fixText = accept ? (n ? `Вернуть языков: ${n}` : "Вернуть выбранные") : "Есть правки";
  return `<div class="card rv-decide"><b class="with-ic">${icon("eye")}Твоё решение</b>
    ${d.run.note ? `<div class="rv-robot-note"><b>Заметка робота:</b> ${esc(d.run.note)}</div>` : ""}${lock}
    <div class="rv-acts"><button class="btn ok-btn" data-key="rv-ok" data-act="rv-decide" data-verdict="ok" ${red || !d.can_ok ? "disabled" : ""}>${icon("check")}${okText}</button>
      ${red ? `<button class="btn ghost danger-ghost" data-key="rv-override" data-act="rv-decide" data-verdict="override">Принять несмотря на</button>` : ""}</div>
    <div class="rv-ret">${chips}
      <label class="f"><span>Что поправить</span><textarea class="inp" data-act-input="rv-note" data-key="rv-note" rows="3" placeholder="${accept ? "Например: в немецкой версии тише голос, обложка обрезана справа" : "Например: на кадре 3 опечатка в подписи"}">${esc(rv.note)}</textarea>
        ${rv.noteError ? `<small class="hint rv-err" role="alert">${esc(rv.noteError)}</small>` : accept ? `<small class="hint">Робот поправит и пересоберёт только отмеченные языки, потом приёмка повторится.</small>` : ""}</label>
      <button class="btn ghost" data-key="rv-fix" data-act="rv-decide" data-verdict="fix">${icon("pencil")}${fixText}</button></div></div>`;
}

export function view() {
  const route = currentRoute();
  if (route.run == null) {
    return emptyBlock("eye", "Не выбрана проверка", "Проверки и приёмки лежат в пульте и в списке «Ждёт тебя» на вкладке «Сейчас».", `<button class="btn" data-act="rv-back">${icon("robot")}К пульту</button>`);
  }
  if (rv.run !== route.run) { reset(); load(); }
  const retry = `<button class="btn sm" data-act="rv-reload">Повторить</button>`;
  if (!rv.data) {
    if (rv.error) return `<div class="empty">${esc(rv.error)}<br><br>${retry}<button class="btn ghost sm" data-act="rv-back">К пульту</button></div>`;
    return skeleton("list", 3);
  }
  const d = rv.data, accept = d.kind === "accept";
  let html = rv.error ? `<div class="banner"><span class="grow">Не обновилось · ${esc(rv.error)}</span>${retry}</div>` : "";
  html += `<div class="rv-head"><div class="grow"><div class="kicker">${accept ? "Приёмка выпуска" : "Проверка стоп-кадров"}</div><h2 class="rv-title">${esc(d.label)}</h2></div>
    <button class="icon-btn ${rv.loading ? "is-busy" : ""}" data-act="rv-reload" aria-label="Обновить" title="Обновить">${icon("refresh")}</button></div>`;
  html += summary(d) + decision(d);
  if (accept && d.report) {
    html += `<h2 class="between"><span>Что получит Павел — по языкам</span><button class="chip ${rv.allOk ? "on" : ""}" data-act="rv-allok">${rv.allOk ? "Скрыть прошедшие" : "Показать прошедшие проверки"}</button></h2>${matrix(d.report)}`;
  } else html += stillsGrid(d);
  html += lightbox();
  return html;
}

// ---------- крупный кадр ----------
function lightbox() {
  const z = rv.zoom;
  if (!z) return "";
  const list = zoomSets.get(z.set) || [];
  const f = list[z.i];
  if (!f) return "";
  return `<div class="lightbox" data-key="lightbox" role="dialog" aria-modal="true" aria-label="Кадр крупно">
    <div class="lb-scrim" data-act="rv-zoom-close"></div>
    <figure class="lb-fig"><img src="${esc(f.url)}" alt="${esc(f.caption)}"><figcaption>${esc(f.caption)} · ${z.i + 1} из ${list.length}</figcaption></figure>
    <button class="icon-btn lb-x" data-key="lb-x" data-act="rv-zoom-close" aria-label="Закрыть">${icon("x")}</button>
    ${list.length > 1 ? `<button class="icon-btn lb-prev" data-key="lb-prev" data-act="rv-zoom-step" data-d="-1" aria-label="Предыдущий кадр">${icon("chevron-left")}</button>
    <button class="icon-btn lb-next" data-key="lb-next" data-act="rv-zoom-step" data-d="1" aria-label="Следующий кадр">${icon("chevron-right")}</button>` : ""}</div>`;
}

function openZoom(set, i) {
  rv.zoom = { set, i, from: document.activeElement };
  render();
  setTimeout(() => { const b = document.querySelector("[data-key='lb-x']"); if (b) b.focus(); }, 0);
}
function closeZoom() {
  const from = rv.zoom && rv.zoom.from;
  rv.zoom = null;
  render();
  if (from && from.isConnected) from.focus({ preventScroll: true });
}
function stepZoom(delta) {
  if (!rv.zoom) return;
  const n = (zoomSets.get(rv.zoom.set) || []).length;
  if (n) { rv.zoom.i = (rv.zoom.i + delta + n) % n; render(); }
}
document.addEventListener("keydown", (ev) => {
  if (!rv.zoom || currentRoute().tab !== "review") return;
  if (ev.key === "Escape") { ev.stopPropagation(); closeZoom(); }
  else if (ev.key === "ArrowLeft") stepZoom(-1);
  else if (ev.key === "ArrowRight") stepZoom(1);
}, true);

// ---------- кнопки Telegram ----------
export function native() {
  const d = rv.data;
  if (!d || d.run.status !== "review" || !d.can_ok || !matchMedia("(min-width: 600px)").matches) return null;
  return { main: { text: d.kind === "accept" ? "Ок — отдать Павлу" : "Ок — делать финал", run: () => decide("ok", null) } };
}

// ---------- действия ----------
async function decide(verdict, el) {
  const d = rv.data;
  if (!d) return;
  const body = { run_id: d.run.id, verdict };
  const note = rv.note.trim();
  if (verdict === "fix") {
    if (!note) { rv.noteError = "Напиши, что поменять: робот не угадает."; render(); const t = document.querySelector("[data-key='rv-note']"); if (t) t.focus(); return; }
    if (d.kind === "accept" && !rv.langs.size) { rv.noteError = "Отметь хотя бы один язык."; render(); return; }
    body.note = note;
    if (d.kind === "accept") body.langs = [...rv.langs];
  } else if (note) body.note = note;
  if (verdict === "override") {
    const ok = await confirmBox(`Красных проверок: ${d.red}. Выпуск уйдёт Павлу с браком, решение запишется. Принять несмотря на?`, { ok: "Принять", cancel: "Не надо" });
    if (!ok) return;
  }
  rv.noteError = null;
  const msg = verdict === "fix" ? (d.kind === "accept" ? `Возвращено языков: ${body.langs.length}. Робот поправит и вернёт на приёмку` : "Правки переданы роботу")
    : verdict === "override" ? "Принято несмотря на красное" : d.kind === "accept" ? "Принято: выпуск можно выкладывать" : "Кадры приняты: робот делает финал";
  const r = await act("robot.decide", body, msg, { el });
  if (!r) return;
  ui.robot.fresh = false;
  document.dispatchEvent(new Event("inbox-stale"));
  go({ tab: "robot" });
}

export const actions = {
  "rv-reload": () => load(),
  "rv-back": () => go({ tab: "robot" }),
  "rv-tab": (el) => { rv.tab = el.dataset.lang; render(); },
  "rv-allok": () => { rv.allOk = !rv.allOk; render(); },
  "rv-lang": (el) => {
    const l = el.dataset.lang;
    rv.langsTouched = true;
    if (!rv.langs.delete(l)) rv.langs.add(l);
    rv.noteError = null;
    render();
  },
  "input:rv-note": (el) => { rv.note = el.value; if (rv.noteError) { rv.noteError = null; render(); } },
  "rv-decide": (el) => decide(el.dataset.verdict, el),
  "rv-zoom": (el) => openZoom(el.dataset.set, Number(el.dataset.i)),
  "rv-zoom-close": () => closeZoom(),
  "rv-zoom-step": (el) => stepZoom(Number(el.dataset.d)),
};
