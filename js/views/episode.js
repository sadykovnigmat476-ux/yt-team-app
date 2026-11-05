// Выпуск: панель с этапами, матрицей языков, озвучкой, ходом монтажа, ссылками и заметками; форма нового выпуска.
import { api } from "../core/api.js?v=531be1d4";
import { byId, kp } from "../core/dom.js?v=3f6425ae";
import { agoText, esc, fmt, folderLink, langReady, langTag, materialCell, MATERIALS, META, STAGES, voiceHint } from "../core/logic.js?v=c38baec6";
import { go } from "../core/router.js?v=ac21beab";
import { act, ep, epBtn, epHead, epLabel, epTasks, isActive, isCompressedFor, markDone, mem, nextCode, pc, proj, render, S, stageInfo, ui, chan } from "../core/store.js?v=5b428fdb";
import { haptic, openUrl } from "../core/tg.js?v=d0923368";
import { confirmBox } from "../ui/confirm.js?v=f36b2440";
import { icon } from "../ui/icons.js?v=2008de79";
import { closeLocked, isManaged, LOCK_TEXT, memberOptions, progressBars, sheetHead } from "../ui/parts.js?v=f1715159";
import { questionBlock } from "../ui/question.js?v=582e8460";
import { canLeave, closeSheet, openEpisodeId, openSheet } from "../ui/sheet.js?v=1a030604";
import { toast } from "../ui/toast.js?v=c026fd86";

/** Для шторки выпуска: «готово» по моему открытому этапу и папка. */
function episodeNative(id) {
  return () => {
    const e = ep(id);
    if (!e) return null;
    const mine = epTasks(id).filter((t) => t.assignee_id === S.me.tg_id && isActive(t));
    const st = mine[0] && mine[0].stage;
    // ведомый выпуск: участнику кнопку «готово» не показываем (G13)
    const ids = st && closeLocked(e, st) ? [] : mine.filter((t) => t.stage === st).map((t) => t.id);
    const main = ids.length ? { text: ids.length > 1 ? `Все ${ids.length} ${META[st].n.toLowerCase()} · ${epBtn(e)}` : `${META[st].n} готово · ${epBtn(e)}`, run: () => markDone(ids) } : null;
    const second = e.drive_folder_id ? { text: "Папка", kind: "second", run: () => openUrl(folderLink(e.drive_folder_id)) } : null;
    return { main: main || second, second: main ? second : null };
  };
}

/** «Сжатый график» под датой выхода: при создании и при переносе. */
function compressNote(p, date) {
  return isCompressedFor(p, date) ? `<div class="note warn">Сжатый график: сценарий нужен сегодня, остальные этапы идут подряд до выхода.</div>` : "";
}

// ---------- файлы, озвучка, ход монтажа ----------
/** Ответ episode.files по выпускам: { data, error, loading, at }. Грузится при открытии панели и по «Обновить». */
const filesCache = new Map();

function loadFiles(id) {
  const c = filesCache.get(id) || { data: null, error: null, loading: false, at: 0 };
  filesCache.set(id, c);
  if (c.loading) return;
  c.loading = true;
  c.error = null;
  api("episode.files", { episode_id: id })
    .then((data) => { c.data = data; c.at = Date.now(); })
    .catch((e) => { c.error = e.message; })
    .finally(() => { c.loading = false; if (openEpisodeId() === id) render(); });
}

// ---------- вопросы робота ----------
/** Открытые вопросы выпуска для шторки владельца: id → список. */
const asked = new Map();

function loadQuestions(id) {
  if (!S.me.is_owner) return;
  api("robot.questions", { episode_id: id })
    .then((r) => { asked.set(id, r.questions); if (openEpisodeId() === id) render(); })
    .catch(() => {}); // шторка живёт и без них: вопрос виден в «Ждёт тебя» и в пульте
}

document.addEventListener("question-answered", () => { const id = openEpisodeId(); if (id) loadQuestions(id); });

const questionsSection = (id) => (asked.get(id) || []).map((q) => `<h2>${icon("info")}Вопрос робота</h2><div class="card">${questionBlock(q)}</div>`).join("");

const BUSY_ORDER = ["queued", "ordering", "ordered"];

const when = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : agoText(Date.now() - t);
};

function pill(key, label, cell) {
  if (cell === undefined) return `<span class="pill skip" title="${label}: проекту не нужны">${label} —</span>`;
  if (cell === null) return `<span class="pill miss">${icon("x")}${label}: нет</span>`;
  return `<span class="pill ok" title="${esc(cell.name)}${cell.modified ? " · " + esc(when(cell.modified)) : ""}">${icon("check")}${label}</span>`;
}

function ordersOf(data, lang) {
  return (data.orders || []).filter((o) => o.lang === lang);
}

/** Кнопка озвучки языка: «Озвучить» пока голоса нет, «Переозвучить» когда заказ уже был или mp3 лежит на Диске. */
function voiceButton(data, lang, row) {
  if (!S.me.is_admin || !data.voice || !data.voice.enabled || data.voice.conflict) return "";
  const mine = ordersOf(data, lang);
  if (mine.some((o) => BUSY_ORDER.includes(o.status))) return "";
  const had = mine.some((o) => o.status === "uploaded") || !!row.voice;
  if (!had && data.voice.stage === "done") return "";
  return `<button class="btn ghost sm" data-act="voice-order" data-id="${data.episode_id}" data-lang="${esc(lang)}" data-redo="${had ? 1 : 0}">${icon("mic")}${had ? "Переозвучить" : "Озвучить"}</button>`;
}

function langRows(data) {
  return data.langs.map((lang) => {
    const row = data.matrix[lang] || {};
    const mine = ordersOf(data, lang);
    const busy = mine.find((o) => BUSY_ORDER.includes(o.status));
    const waiting = busy && String(busy.note || "").startsWith("ждёт токенов");
    const failed = !busy && mine.length && mine[mine.length - 1].status === "failed";
    const state = busy ? (waiting ? `<div class="mx-note warn">${icon("hourglass")}Не хватает токенов Lumean: ${esc(String(busy.note).replace(/^ждёт токенов Lumean:?\s*/, "") || "озвучка ждёт")}</div>`
      : `<div class="mx-note">${icon("mic")}Озвучка идёт, ${esc(when(busy.created_at))}</div>`)
      : failed ? `<div class="mx-note bad">${icon("alert-circle")}Озвучка не получилась${mine[mine.length - 1].note ? ": " + esc(mine[mine.length - 1].note) : ""}</div>` : "";
    return `<div class="mx-row ${langReady(row) ? "full" : ""}" data-key="mx-${esc(lang)}">
      <div class="mx-lang">${esc(langTag(lang))}${langReady(row) ? icon("check-circle", "tone-ok") : ""}</div>
      <div class="mx-body"><div class="pills">${MATERIALS.map(([k, label]) => pill(k, label, materialCell(row, k))).join("")}</div>${state}</div>
      <div class="mx-act">${voiceButton(data, lang, row)}</div></div>`;
  }).join("");
}

const STEP_STATE = {
  done: ["check", "tone-ok", "готово"], running: ["refresh", "tone-link", "идёт"], failed: ["alert-circle", "tone-bad", "ошибка"],
};

/** Ход монтажа: шаги в строках, языки в столбцах. Показаны только шаги, по которым робот уже отчитался. */
function progressTable(data) {
  const rows = data.progress || [];
  if (!rows.length) return `<div class="muted small">Ход монтажа появится, когда робот начнёт работу и отчитается о шаге.</div>`;
  const names = Object.fromEntries((data.steps || []).map((s) => [s.id, s.name]));
  const order = (data.steps || []).map((s) => s.id);
  const seen = [...new Set(rows.map((r) => r.step))].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  const cellOf = (step, lang) => {
    const r = rows.find((x) => x.step === step && x.lang === lang) || rows.find((x) => x.step === step && !x.lang);
    if (!r) return `<span class="muted" title="не начат">·</span>`;
    const [ic, tone, label] = STEP_STATE[r.state] || ["dot", "tone-muted", r.state];
    return `<span class="${tone}" title="${esc(label)}${r.note ? ": " + esc(r.note) : ""}">${icon(ic)}<span class="sr">${esc(label)}</span></span>`;
  };
  const notes = rows.filter((r) => r.note && (r.state === "running" || r.state === "failed"))
    .map((r) => `<div class="small ${r.state === "failed" ? "tone-bad" : "muted"}">${esc(names[r.step] || r.step)}${r.lang ? " · " + esc(langTag(r.lang)) : ""}: ${esc(r.note)}</div>`).join("");
  const left = (data.steps || []).length - seen.length;
  return `<div class="table-wrap"><table class="table steps"><thead><tr><th scope="col">Шаг</th>${data.langs.map((l) => `<th scope="col" class="mid">${esc(langTag(l))}</th>`).join("")}</tr></thead>
    <tbody>${seen.map((s) => `<tr><td>${esc(names[s] || s)}</td>${data.langs.map((l) => `<td class="mid">${cellOf(s, l)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${notes ? `<div class="mt-2">${notes}</div>` : ""}${left > 0 ? `<div class="muted small mt-2">Ещё не начаты шагов: ${left}.</div>` : ""}`;
}

function fileList(title, items, hint) {
  if (!items || !items.length) return "";
  return `<h2>${title} · ${items.length}</h2><div class="card">${items.map((f) => `<div class="line-row row">${icon("script")}<div class="grow"><div class="ellipsis break">${esc(f.name)}</div>
    <div class="muted small ellipsis">${esc(f.folder || "")}${f.modified ? " · " + esc(when(f.modified)) : ""}</div></div></div>`).join("")}${hint ? `<div class="muted small mt-2">${hint}</div>` : ""}</div>`;
}

/** Блок «Языки и материалы»: матрица, озвучка, ход монтажа, черновики, нераспознанные файлы. */
function filesSection(id) {
  const c = filesCache.get(id);
  const head = `<h2 class="between"><span class="with-ic">${icon("folder")}Языки и материалы</span><button class="icon-btn" data-act="files-refresh" data-id="${id}" aria-label="Обновить файлы" title="Обновить">${icon("refresh")}</button></h2>`;
  if (!c || (c.loading && !c.data)) return `${head}<div class="card sk-card" aria-busy="true"><span class="sk sk-line" style="width:60%"></span><span class="sk sk-line" style="width:90%"></span><span class="sk sk-line" style="width:75%"></span></div>`;
  if (c.error && !c.data) return `${head}<div class="banner"><span class="grow">Файлы не загрузились · ${esc(c.error)}</span><button class="btn sm" data-act="files-refresh" data-id="${id}">Повторить</button></div>`;
  const d = c.data;
  if (!d.drive) return `${head}<div class="card muted small">${esc(d.drive_error || "Папка выпуска на Диске не подключена: файлы бот не видит.")}</div>`;
  const full = d.langs.filter((l) => langReady(d.matrix[l] || {})).length;
  let html = `${head}${c.error ? `<div class="banner"><span class="grow">Не обновилось · ${esc(c.error)}</span><button class="btn sm" data-act="files-refresh" data-id="${id}">Повторить</button></div>` : ""}
    <div class="card"><div class="muted small mb-2">Готово языков: <b>${full} из ${d.langs.length}</b>${c.at ? ` · обновлено ${esc(when(new Date(c.at).toISOString()))}` : ""}</div>${langRows(d)}`;
  const v = d.voice;
  if (v && v.conflict) {
    html += `<div class="note warn">${icon("alert")}<span>В папке тексты двух роликов: ${v.conflict.map(esc).join(", ")}. Оставь один — иначе озвучку не закажу.</span></div>`;
  }
  const canAll = S.me.is_admin && v && v.enabled && !v.conflict && v.stage !== "done" && !(d.orders || []).some((o) => BUSY_ORDER.includes(o.status));
  if (canAll) html += `<button class="btn block mt-2" data-act="voice-order" data-id="${id}" data-redo="0">${icon("mic")}Озвучить все языки</button>`;
  if (S.me.is_admin && v && !v.enabled) html += `<div class="muted small mt-2">Озвучка через Lumean не подключена.</div>`;
  html += `</div><h2>${icon("film")}Ход монтажа</h2><div class="card">${progressTable(d)}</div>`;
  html += fileList("Черновики", d.drafts, "Черновик не засчитывается как готовое видео.");
  html += fileList("Нераспознанные файлы", d.unknown, "Бот не понял, к какому языку относятся эти файлы. Добавь в название язык (ru, en, de…).");
  return html;
}

// ---------- этапы ----------
const shortWhen = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t), p = (n) => String(n).padStart(2, "0");
  return `${fmt(iso.slice(0, 10))}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** «Закрыл Нигмат · 3 ноя, 14:20»; закрыто ботом по файлам — «по файлам на Диске». По языкам: «RU EN — Павел …». */
function closedBy(ts) {
  const done = ts.filter((t) => t.done_at);
  if (!done.length) return "";
  const groups = new Map();
  for (const t of done) {
    const who = t.done_by == null ? "по файлам на Диске" : (mem(t.done_by) || { name: "кто-то" }).name;
    const key = `${who}|${shortWhen(t.done_at)}`;
    const c = chan(t.channel_id);
    (groups.get(key) || groups.set(key, { who, at: shortWhen(t.done_at), langs: [] }).get(key)).langs.push(c ? langTag(c.lang) : "");
  }
  const single = ts.length === 1 && !ts[0].channel_id;
  return [...groups.values()].map((g) => {
    const langs = g.langs.filter(Boolean).join(" ");
    return `${single ? (g.who.startsWith("по") ? "Закрыто " : "Закрыл ") : langs ? esc(langs) + " — " : ""}${esc(g.who)}${g.at ? " · " + esc(g.at) : ""}`;
  }).join("; ");
}

function stageChip(t, locked) {
  if (!locked) {
    const c = chan(t.channel_id);
    const st = t.done_at ? "done" : isActive(t) ? "active" : "blocked";
    return `<button class="chip lang ${st}" data-act="toggle" data-id="${t.id}" aria-label="${esc(langTag(c && c.lang))}: ${t.done_at ? "готово, снять отметку" : "отметить готовым"}">${esc(langTag(c && c.lang))}${t.done_at ? icon("check") : ""}</button>`;
  }
  const c = chan(t.channel_id);
  const st = t.done_at ? "done" : isActive(t) ? "active" : "blocked";
  return `<span class="chip lang ${st} static">${esc(langTag(c && c.lang))}${t.done_at ? icon("check") : ""}</span>`;
}

function stageBox(e, st, noteLock) {
  const i = stageInfo(e.id, st);
  if (!i.total) return "";
  const locked = closeLocked(e, st);
  const assignees = [...new Set(i.ts.map((t) => t.assignee_id))];
  const ids = i.ts.map((t) => t.id).join(",");
  const openActive = i.ts.filter(isActive);
  const single = i.total === 1 && !i.ts[0].channel_id;
  let body;
  if (single) {
    const t = i.ts[0];
    body = locked
      ? `<span class="chip lang static ${i.done ? "done" : openActive.length ? "active" : "blocked"}" title="${esc(LOCK_TEXT)}">${i.done ? "Готово" : openActive.length ? "Идёт" : "Ждёт предыдущий этап"}</span>`
      : `<button class="chip lang ${i.done ? "done" : openActive.length ? "active" : "blocked"}" data-act="toggle" data-id="${t.id}">${i.done ? "Готово" : openActive.length ? "Отметить готовым" : "Ждёт предыдущий этап"}</button>`;
  } else {
    body = `<div class="chips">${i.ts.map((t) => stageChip(t, locked)).join("")}</div>${!locked && openActive.length > 1 ? `<button class="btn sm mt-2" data-act="done" data-ids="${openActive.map((t) => t.id).join(",")}">Все ${openActive.length} готовы</button>` : ""}`;
  }
  const who = closedBy(i.ts);
  return `<div class="stage-box" data-key="stage-${st}"><div class="head"><b class="grow with-ic">${icon(META[st].i)}${META[st].n}</b>
    <select data-act-change="assign" data-ids="${ids}" aria-label="Ответственный: ${META[st].n}">${assignees.length > 1 ? `<option selected>разные</option>` : ""}${memberOptions(assignees.length === 1 ? assignees[0] : undefined)}</select>
    <input type="date" data-act-change="due" data-ids="${i.ts.filter((t) => !t.done_at).map((t) => t.id).join(",")}" value="${i.due || ""}" ${i.done === i.total ? "disabled" : ""} aria-label="Срок: ${META[st].n}"></div>
    ${body}${locked && !i.done && noteLock ? `<div class="note lock-note">${icon("robot")}<span>${LOCK_TEXT}</span></div>` : ""}
    ${who ? `<div class="muted small mt-2 closed-by">${icon("check-circle")}<span>${who}</span></div>` : ""}
    ${i.late ? `<div class="small tone-bad with-ic mt-2">${icon("alert")}срок был ${fmt(i.due)}</div>` : ""}</div>`;
}

function episodeSheet(id) {
  return () => {
    const e = ep(id);
    if (!e) { closeSheet({ force: true }); return ""; }
    const p = proj(e.project_id);
    const links = S.links.filter((l) => l.episode_id === id);
    const open = epTasks(id).filter((t) => !t.done_at);
    const managed = isManaged(e);
    const released = e.publish_date <= S.today;
    let html = `${sheetHead(epHead(e), pc(p))}
      ${progressBars(e.id)}
      ${questionsSection(id)}
      ${managed ? `<div class="note robot-note">${icon("robot")}<span>Выпуск ведёт робот: этапы до выкладки закрывают файлы на Диске${S.me.is_owner ? " или ты" : " или владелец"}. Выкладка — как раньше, у Павла.</span>${S.me.is_owner ? `<button class="btn ghost sm" data-act="to-robot">Пульт</button>` : ""}</div>` : ""}
      ${e.drive_folder_id ? `<a class="btn block dup-second folder-btn" href="${esc(folderLink(e.drive_folder_id))}" data-act="open-link">${icon("folder")}Открыть папку на Диске</a>
        <div class="muted small note-line">Внутри: 1_Сценарий · 2_Озвучка · 3_Готовое видео. Кладите файлы — этапы отметятся сами.</div>` : ""}
      <div class="card">
        <label class="f"><span>Название</span><input class="inp" data-act-change="ep-field" data-field="title"${kp("f-title")} value="${esc(e.title)}"></label>
        <div class="grid2"><label class="f"><span>Код</span><input class="inp" data-act-change="ep-field" data-field="code"${kp("f-code")} value="${esc(e.code)}"></label>
        <label class="f"><span>Дата выхода</span><input class="inp" type="date" data-act-change="ep-field" data-act-input="ep-date" data-field="publish_date"${kp("f-date")} value="${e.publish_date}"></label></div>
        <div id="ep-compress">${compressNote(p, e.publish_date)}</div>
        <div class="muted small">Сроки этапов пересчитаются от даты выхода. Срок выкладки и дата выхода — одно и то же: поменяешь одно, поменяется и другое.</div>
      </div>
      <h2 class="between">Этапы${S.me.is_admin && open.length ? `<select class="sel-sm" data-act-change="assign-all" data-ids="${open.map((t) => t.id).join(",")}" aria-label="Назначить все открытые этапы одному человеку"><option value="">Назначить всех…</option>${S.members.map((m) => `<option value="${m.tg_id}">${esc(m.name)}</option>`).join("")}<option value="none">— никого</option></select>` : ""}</h2>`;
    let noted = false;
    for (const st of STAGES) {
      // пояснение про робота — один раз, у первого закрытого для человека этапа
      const first = !noted && closeLocked(e, st) && !stageInfo(e.id, st).done;
      if (first) noted = true;
      html += stageBox(e, st, first);
    }
    html += filesSection(id);
    html += `${released || episodeStarted(e) ? `<button class="btn ghost block mt-2" data-act="to-stats" data-id="${id}">${icon("chart")}Просмотры выпуска в статистике</button>` : ""}
      <h2>Ссылки</h2><div class="card">${links.map((l) => `<div class="link-row">${icon(l.stage ? META[l.stage].i : "link")}<a class="grow ellipsis" href="${esc(l.url)}" data-act="open-link">${esc(l.title || (l.stage ? META[l.stage].n : l.url))}</a><button class="icon-btn" data-act="del-link" data-id="${l.id}" aria-label="Удалить ссылку">${icon("x")}</button></div>`).join("") || `<div class="muted">Пока нет. Можно кинуть ссылку ответом на карточку в группе.</div>`}</div>
      <div class="card"><div class="row"><input class="inp grow" id="link-url"${kp("link-url")} placeholder="https://drive.google.com/…"></div>
      <div class="row mt-2"><input class="inp grow" id="link-title"${kp("link-title")} placeholder="Подпись (необязательно)">
      <select class="inp" id="link-stage"${kp("link-stage")} style="width:auto">${STAGES.map((s) => `<option value="${s}">${META[s].n}</option>`).join("")}<option value="">Другое</option></select></div>
      <button class="btn block mt-2" data-act="add-link" data-id="${id}">Добавить ссылку</button></div>
      <h2>Заметки</h2><div class="card"><textarea class="inp" data-act-change="ep-field" data-field="notes"${kp("f-notes")} placeholder="Идеи, правки, тайм-коды…">${esc(e.notes || "")}</textarea></div>
      <button class="btn danger block" data-act="del-episode" data-id="${id}">Удалить выпуск</button>`;
    return html;
  };
}

/** Хотя бы один канал уже отмечен как выложенный — у выпуска есть что смотреть в статистике. */
const episodeStarted = (e) => epTasks(e.id).some((t) => t.stage === "upload" && t.done_at);

/** Подсказки формы нового выпуска: сжатый график, чужая папка, сроки. Обновляются на месте, без перерисовки полей. */
function newEpHints(st) {
  const p = proj(st.project_id) || S.projects[0];
  const compressed = st.compressed != null ? st.compressed : isCompressedFor(p, st.date);
  let html = "";
  if (compressed) html += `<div class="note warn">Сжатый график: сценарий нужен сегодня, остальные этапы идут подряд до выхода.</div>`;
  if (st.folder) {
    html += `<label class="note check-note"><input type="checkbox" id="ne-usefolder" data-act-change="ne-usefolder"${kp("ne-usefolder")} ${st.useFolder ? "checked" : ""}>
      <span>Возьму папку «${esc(st.folder.name)}» с Диска — новая не создастся, номер ей не нужен.</span></label>`;
  }
  const folderNote = st.folder && st.useFolder ? "" : p.drive_folder_id ? `На Диске появится папка «${esc(st.code || st.codeHint || "…")} ${esc(st.title || "Название")}» с подпапками 1_Сценарий, 2_Озвучка, 3_Готовое видео.<br>` : "";
  html += `<div class="muted small">${folderNote}Сроки — по настройкам проекта: сценарий за ${p.script_offset} дн. до выхода, ${esc(voiceHint(p))}, монтаж за ${p.edit_offset} дн.</div>`;
  return html;
}

function newEpisodeSheet(state) {
  return () => {
    const p = proj(state.project_id) || S.projects[0];
    return `${sheetHead("Новый выпуск")}
    <div class="card">
      <label class="f"><span>Проект</span><select class="inp" id="ne-project" data-act-change="ne-project">${S.projects.map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${esc(x.emoji)} ${esc(x.name)}</option>`).join("")}</select></label>
      <label class="f"><span>Название</span><input class="inp" id="ne-title" data-act-input="ne-title"${kp("ne-title")} placeholder="Как Эратосфен измерил Землю" value="${esc(state.title)}"></label>
      <div class="grid2"><label class="f"><span>Код (авто)</span><input class="inp" id="ne-code" data-act-input="ne-code"${kp("ne-code")} placeholder="${esc(state.codeHint || "S01")}" value="${esc(state.code)}"></label>
      <label class="f"><span>Дата выхода</span><input class="inp" type="date" id="ne-date" data-act-input="ne-date"${kp("ne-date")} value="${state.date || ""}"></label></div>
      <div id="ne-hints">${newEpHints(state)}</div>
    </div>
    <button class="btn block dup-main" data-act="create-episode">Создать</button>`;
  };
}

const newRequestId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

/** Форма хранит всё набранное в ui.newEp: ответ сервера и смена проекта её не затирают. */
async function openNewEpisode() {
  const pid = ui.project !== "all" ? Number(ui.project) : S.projects[0].id;
  // requestId — ключ этого запроса «Создать»: повтор после «Нет связи» сервер узнаёт и отдаёт уже созданный выпуск
  const state = { project_id: pid, title: "", code: "", date: "", dateTouched: false, codeHint: nextCode(pid), folder: null, useFolder: true, compressed: null, seq: 0, requestId: newRequestId() };
  ui.newEp = state;
  openSheet(newEpisodeSheet(state), () => ({ main: { text: "Создать выпуск", run: () => actions["create-episode"]() } }), { dirty: () => !!(state.title.trim() || state.code.trim()) });
  await suggestDate(state);
}

/** Подсказка с сервера: дата, номер, ничейная папка, сжатый график. Своя дата и код пользователя не перетираются. */
async function suggestDate(state) {
  const seq = ++state.seq;
  const body = { project_id: state.project_id };
  if (state.title.trim()) body.title = state.title.trim();
  if (state.dateTouched && state.date) body.publish_date = state.date;
  let r;
  try { r = await api("episode.suggest", body); } catch (_) { return; }
  // ответ на устаревший запрос (проект сменили, ещё что-то набрали) игнорируется
  if (!ui.sheet || ui.newEp !== state || seq !== state.seq) return;
  if (!state.dateTouched && r.publish_date) state.date = r.publish_date;
  if (r.code) state.codeHint = state.serverCode = r.code; // номер с учётом папок на Диске
  state.folder = r.folder || null;
  state.compressed = r.compressed == null ? null : !!r.compressed;
  paintNewEpisode(state);
}

/** Обновить подсказки и плейсхолдеры формы на месте: поля и фокус не трогаем. */
function paintNewEpisode(st) {
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set("ne-hints", (el) => { el.innerHTML = newEpHints(st); });
  set("ne-code", (el) => { el.placeholder = st.codeHint || "S01"; });
  set("ne-date", (el) => { if (!st.dateTouched) el.value = st.date || ""; });
}

let suggestTimer = null;
const suggestSoon = (st) => { clearTimeout(suggestTimer); suggestTimer = setTimeout(() => { if (ui.newEp === st && ui.sheet) suggestDate(st); }, 350); };

/** Открыть выпуск: панель рядом со списком уже открыта — меняется её содержимое, история не копится. */
export async function openEpisode(id, opts = {}) {
  const inPanel = !!ui.sheet && ui.sheet.ep != null;
  if (inPanel && !opts.replace && !(await canLeave())) return;
  openSheet(episodeSheet(id), episodeNative(id), { mode: "panel", ep: id, replace: inPanel || opts.replace, silent: opts.silent });
  loadFiles(id);
  loadQuestions(id);
}

const FIELD_KEYS = { title: "f-title", code: "f-code", publish_date: "f-date", notes: "f-notes" };

export const actions = {
  "open-episode": (el, ev) => { if (ev) ev.preventDefault(); return openEpisode(Number(el.dataset.id)); },
  "new-episode": () => openNewEpisode(),
  "close-sheet": () => closeSheet(),
  "done": (el) => markDone(el.dataset.ids.split(",").map(Number), el),
  "toggle": async (el) => {
    const t = S.tasks.find((x) => x.id === Number(el.dataset.id));
    if (!t) return;
    const e = ep(t.episode_id);
    if (e && closeLocked(e, t.stage)) {
      haptic("warning");
      return toast(LOCK_TEXT);
    }
    if (t.done_at) {
      if (await confirmBox("Снять отметку «готово»?")) act("tasks.done", { ids: [t.id], done: false });
    } else if (!isActive(t)) {
      haptic("warning");
      toast("Сначала нужно закончить предыдущий этап");
    } else markDone([t.id], el);
  },
  "files-refresh": (el) => loadFiles(Number(el.dataset.id)),
  "to-robot": () => go({ tab: "robot" }),
  "to-stats": (el) => {
    const e = ep(Number(el.dataset.id));
    if (!e) return;
    ui.project = String(e.project_id);
    ui.statsEp = e.id;
    go({ tab: "stats" });
  },
  "voice-order": async (el) => {
    const id = Number(el.dataset.id), lang = el.dataset.lang || undefined, redo = el.dataset.redo === "1";
    if (redo && !(await confirmBox(`Переозвучить ${langTag(lang)}? Новый заказ спишет токены Lumean.`, { ok: "Переозвучить" }))) return;
    const body = { episode_id: id };
    if (lang) body.lang = lang;
    if (redo) body.redo = true;
    const r = await act("voice.order", body, null, { el });
    if (!r) return;
    toast(r.text || (r.queued ? "Озвучка заказана" : "Заказ не создан"));
    loadFiles(id);
  },
  "add-link": async (el) => {
    const url = byId("link-url").value.trim();
    if (!url) return toast("Вставь ссылку");
    await act("link.add", { episode_id: Number(el.dataset.id), url, title: byId("link-title").value.trim(), stage: byId("link-stage").value }, "Ссылка добавлена",
      { el, commit: ["link-url", "link-title"] });
  },
  "del-link": async (el) => { if (await confirmBox("Удалить ссылку?")) act("link.delete", { id: Number(el.dataset.id) }, undefined, { el }); },
  "del-episode": async (el) => {
    if (await confirmBox("Удалить выпуск со всеми задачами? Посты в группе тоже удалятся. Пустую папку на Диске бот уберёт в корзину, папку с файлами — оставит.")) {
      const r = await act("episode.delete", { id: Number(el.dataset.id) }, undefined, { el });
      if (!r) return;
      toast(r.folder === "kept" ? "Удалено. Папка на Диске оставлена — в ней есть файлы" : r.folder === "trashed" ? "Удалено, пустая папка — в корзине Диска" : "Удалено");
      closeSheet({ force: true });
    }
  },
  "create-episode": async (el) => {
    const st = ui.newEp;
    const title = byId("ne-title").value.trim();
    if (!title) return toast("Напиши название");
    // пустой код — шлём подсказанный сервером: повтор после таймаута упрётся в «Код занят», а не создаст второй выпуск.
    // Исключение: папку нашли, но не берём — подсказка посчитана в расчёте, что выпуск займёт её номер; сервер назначит код сам, учтя папку как занятую
    const skipHint = !!(st && st.folder && !st.useFolder);
    const body = {
      project_id: Number(byId("ne-project").value), title,
      code: byId("ne-code").value.trim() || (!skipHint && st && st.serverCode) || undefined,
      publish_date: byId("ne-date").value || undefined,
    };
    if (st && st.folder && st.useFolder) body.drive_folder_id = st.folder.id;
    if (st && st.requestId) body.request_id = st.requestId;
    const r = await act("episode.create", body, null, { el, retry: () => actions["create-episode"]() });
    if (!r) return;
    const e = ep(r.id);
    toast(e ? "Выпуск создан: " + epLabel(e) : "Выпуск создан");
    openEpisode(r.id, { replace: true });
  },
  // Набранное в форме нового выпуска сразу уходит в ui.newEp: перерисовка и ответы сервера его не трогают
  "input:ne-title": (el) => { const st = ui.newEp; st.title = el.value; paintNewEpisode(st); suggestSoon(st); },
  "input:ne-code": (el) => { const st = ui.newEp; st.code = el.value; paintNewEpisode(st); },
  "input:ne-date": (el) => { const st = ui.newEp; st.date = el.value; st.dateTouched = true; st.compressed = null; paintNewEpisode(st); suggestSoon(st); },
  // перенос даты у существующего выпуска: предупреждение о сжатом графике сразу, до сохранения
  "input:ep-date": (el) => {
    const e = ep(openEpisodeId()), box = byId("ep-compress");
    if (e && box) box.innerHTML = compressNote(proj(e.project_id), el.value);
  },
  "change:ne-usefolder": (el) => { if (ui.newEp) { ui.newEp.useFolder = el.checked; paintNewEpisode(ui.newEp); } },
  "change:ne-project": (el) => {
    const pid = Number(el.value);
    const st = ui.newEp;
    st.project_id = pid;
    st.codeHint = nextCode(pid);
    st.serverCode = null; // номер другого проекта не годится — ждём новую подсказку
    st.folder = null; st.compressed = null; st.useFolder = true;
    ui.sheet.render({ force: false }); // название, код и дата живут в ui.newEp — смена проекта их не сбрасывает
    suggestDate(st);
  },
  "change:assign": (el) => {
    if (el.value === "разные") return;
    act("tasks.assign", { ids: el.dataset.ids.split(",").map(Number), assignee_id: el.value ? Number(el.value) : null }, "Назначено");
  },
  // все открытые этапы выпуска одному человеку за раз
  "change:assign-all": (el) => {
    const v = el.value;
    if (!v) return;
    el.value = ""; // подпись «Назначить всех…» возвращается: список — действие, а не поле
    act("tasks.assign", { ids: el.dataset.ids.split(",").map(Number), assignee_id: v === "none" ? null : Number(v) }, "Все открытые этапы назначены");
  },
  "change:due": (el) => {
    if (!el.dataset.ids) return;
    act("tasks.assign", { ids: el.dataset.ids.split(",").map(Number), due_date: el.value || null }, "Срок изменён");
  },
  "change:ep-field": (el) => {
    const id = openEpisodeId();
    if (!id) return;
    // после сохранения поле показывает то, что записал сервер (он может поправить код), а не набранное
    act("episode.update", { id, [el.dataset.field]: el.value }, "Сохранено", { commit: [FIELD_KEYS[el.dataset.field]] });
  },
};
