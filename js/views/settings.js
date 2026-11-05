// «Настройки»: команда, проекты, Диск, напоминания; форма проекта.
import { api } from "../core/api.js?v=f1e8780b";
import { byId, kp } from "../core/dom.js?v=3f6425ae";
import { esc, KINDS, langTag, META, PALETTE, projectFormError, REQUIRED_MATERIALS, requiredValue, STAGES } from "../core/logic.js?v=27fff957";
import { act, mem, pc, pcolor, proj, projChannels, S, store, topicBound, ui } from "../core/store.js?v=e0f3245a";
import { go } from "../core/router.js?v=27d33f38";
import * as session from "../core/session.js?v=f1e8780b";
import { canFullscreen, haptic, inTelegram, tg } from "../core/tg.js?v=f1d7ce1d";
import { confirmBox } from "../ui/confirm.js?v=24d167ee";
import { icon } from "../ui/icons.js?v=2008de79";
import { emptyBlock, memberOptions, onboarding, sheetHead } from "../ui/parts.js?v=2e46b762";
import { closeSheet, openSheet } from "../ui/sheet.js?v=53eb9974";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { toast } from "../ui/toast.js?v=c026fd86";

const topicStatus = (p) => { const n = KINDS.filter((k) => topicBound(p.id, k.id)).length; return n === KINDS.length ? "привязаны" : `${n} из ${KINDS.length}`; };

/** Выход из браузерной сессии. В Telegram входа нет — блока нет; кнопки появляются, когда сессия умеет выходить (core/session.js). */
const accountBlock = () => {
  if (inTelegram() || typeof session.logout !== "function") return "";
  return `<h2>Аккаунт</h2><div class="card"><div class="small">Ты вошёл как <b>${esc(S.me.name)}</b>.</div>
    <div class="row mt-2"><button class="btn ghost" data-act="logout" data-all="0">${icon("logout")}Выйти</button>
    <button class="btn ghost" data-act="logout" data-all="1">Выйти на всех устройствах</button></div></div>`;
};

/** Кнопки управления участником: имя, права, удаление. Себя удалить и лишить прав нельзя. */
function memberActions(m) {
  const me = m.tg_id === S.me.tg_id, admin = S.me.is_admin;
  if (!admin && !me) return "";
  const rename = `<button class="icon-btn" data-act="rename" data-id="${m.tg_id}" title="Переименовать" aria-label="Переименовать: ${esc(m.name)}">${icon("pencil")}</button>`;
  if (!admin || me) return rename;
  return `${rename}<button class="btn ghost sm" data-act="member-admin" data-id="${m.tg_id}" data-on="${m.is_admin ? 0 : 1}">${m.is_admin ? "Снять права" : "Дать права админа"}</button>
    <button class="icon-btn" data-act="member-remove" data-id="${m.tg_id}" title="Удалить из команды" aria-label="Удалить из команды: ${esc(m.name)}">${icon("trash")}</button>`;
}

export function view() {
  const admin = S.me.is_admin;
  let html = onboarding("settings") + `<div class="set-cols"><div><h2>Команда</h2><div class="card">${S.members.map((m) => `<div class="member">
      <div class="ava">${esc(m.name.slice(0, 1).toUpperCase())}</div>
      <div class="grow"><div>${esc(m.name)}${m.tg_id === S.me.tg_id ? " <span class='muted'>(ты)</span>" : ""}</div>
      <div class="muted">${m.username ? "@" + esc(m.username) + " · " : ""}${m.is_admin ? "админ" : "участник"}${m.can_dm ? "" : " · не писал боту в личку"}${S.me.is_owner && m.timezone ? " · " + esc(m.timezone) : ""}</div></div>
      <div class="member-acts">${memberActions(m)}</div>
    </div>`).join("")}
    <div class="muted small mt-2">Новые люди появляются здесь сами, когда нажмут кнопку в группе или напишут боту /start.</div></div>`;

  html += `<h2>Проекты</h2>`;
  for (const p of S.projects) {
    const chs = projChannels(p.id);
    const roles = STAGES.map((st) => {
      const r = S.roles.find((x) => x.project_id === p.id && x.stage === st);
      return `${META[st].n}: ${esc((mem(r && r.member_id) || { name: "—" }).name)}`;
    }).join(" · ");
    html += `<div class="card pc-stripe ${admin ? "clickable" : ""}" style="${pc(p)}" ${admin ? `data-act="edit-project" data-id="${p.id}"` : ""}>
      <div class="row"><div class="grow"><b>${esc(p.emoji)} ${esc(p.name)}</b><div class="muted">${chs.map((c) => esc(langTag(c.lang))).join(" · ") || "нет каналов"}</div>
      <div class="muted">${roles}</div>
      <div class="muted">${p.drive_folder_id ? "Диск подключён" : "Диск: папка не задана"} · Темы: ${topicStatus(p)}</div>
      ${p.linked || p.runner_enabled ? `<div class="muted">${[p.linked ? "папка на ПК связана" : "", p.runner_enabled ? "робот на ПК включён" : ""].filter(Boolean).join(" · ")}</div>` : ""}</div>${admin ? icon("chevron-right") : ""}</div></div>`;
  }
  if (!S.projects.length) html += emptyBlock("folder", "Проектов пока нет", admin ? "Проект — это канал на нескольких языках со своими сроками и ответственными. Создай первый." : "Проекты заводит админ команды.");
  if (admin) html += `<button class="btn ghost block" data-act="edit-project" data-id="0">${icon("plus")}Новый проект</button>`;

  if (admin && (S.archived_projects || []).length) {
    html += `<h2>Архив проектов</h2><div class="card">${S.archived_projects.map((p) => `<div class="member"><span class="ava">${esc(p.emoji || "")}</span>
      <div class="grow ellipsis">${esc(p.name)}</div><button class="btn ghost sm" data-act="restore-project" data-id="${p.id}">${icon("refresh")}Вернуть</button></div>`).join("")}
      <div class="muted small mt-2">Архивные проекты не попадают в списки и напоминания. Вернуть можно в любой момент.</div></div>`;
  }
  html += `</div><div>`;
  if (S.me.is_owner) {
    html += `<h2>Робот</h2><div class="card"><div class="small">Ночное окно, число попыток, потолки расхода и проверка установки робота.</div>
      <div class="row wrap mt-2"><button class="btn ghost" data-act="go-screen" data-to="robot_settings">${icon("gear")}Настройки робота</button>
      <button class="btn ghost" data-act="go-screen" data-to="setup">${icon("rocket")}Установка</button></div></div>`;
  }
  const dr = S.drive || {};
  html += `<h2>Google Диск</h2><div class="card small">${dr.enabled
    ? `Подключён. Бот видит папки, открытые для<br><code style="user-select:all">${esc(dr.email || "")}</code><br><span class="muted">Новые файлы подхватываются в течение ~10 минут.</span>`
    : "Не подключён: нужен ключ сервисного аккаунта Google."}</div>`;

  const st = S.settings;
  if (canFullscreen()) {
    html += `<h2>Окно</h2><div class="card row"><div class="grow small">На компьютере Telegram открывает приложение узким окном. На весь экран — статистика и календарь в две колонки.${store("fullscreen") === "1" ? "<div class='muted'>Сейчас открывается сразу на весь экран.</div>" : ""}</div>
      <button class="btn sm" data-act="fullscreen">${tg.isFullscreen ? "Обычное окно" : "На весь экран"}</button></div>`;
  }
  html += `<h2>Напоминания</h2><div class="card">
    <label class="f"><span>Часовой пояс команды</span><input class="inp" id="set-tz"${kp("set-tz")} list="tz-list" value="${esc(st.timezone)}" ${admin ? "" : "disabled"}></label>
    <datalist id="tz-list">${["Europe/Moscow", "Asia/Tashkent", "Asia/Almaty", "Asia/Yekaterinburg", "Europe/Samara", "Europe/Kyiv", "Asia/Bishkek", "Asia/Dushanbe", "Asia/Baku", "Europe/Istanbul", "Europe/Berlin", Intl.DateTimeFormat().resolvedOptions().timeZone].filter((v, i, a) => a.indexOf(v) === i).map((z) => `<option value="${z}">`).join("")}</datalist>
    <div class="grid2"><label class="f"><span>Утренний план, час</span><input class="inp" id="set-morning"${kp("set-morning")} type="number" min="0" max="23" value="${st.morning_hour}" ${admin ? "" : "disabled"}></label>
    <label class="f"><span>Вечернее напоминание, час</span><input class="inp" id="set-evening"${kp("set-evening")} type="number" min="0" max="23" value="${st.evening_hour}" ${admin ? "" : "disabled"}></label></div>
    ${admin ? `<button class="btn block" data-act="save-settings">Сохранить</button>` : ""}
    <div class="muted small mt-2">${st.group_linked ? "Группа подключена." : "Группа не подключена: добавь бота в группу админом и напиши там /setup."} По понедельникам бот кладёт план недели в тему, привязанную командой /bind → «дайджесты».</div></div>${accountBlock()}</div></div>`;
  return html;
}

function projectSheet(draft) {
  return () => {
    const isNew = !draft.id;
    const folders = ui.driveFolders;
    const pick = !isNew ? "" : !(S.drive && S.drive.enabled) ? "" : `<h2>Папка проекта на Диске</h2><div class="card">${
      folders == null ? skeleton("text")
      : folders.length ? `<div class="chips wrap">${folders.map((f) => `<button class="chip ${draft.drive_folder.includes(f.id) ? "on" : ""}" data-act="pick-folder" data-id="${esc(f.id)}" data-name="${esc(f.name)}">${icon("folder")}${esc(f.name)}</button>`).join("")}</div><div class="muted small">Нажми на папку — название и связь с Диском заполнятся сами.</div>`
      : ui.driveError ? `<span class="small tone-bad">Папки не загрузились · ${esc(ui.driveError)}</span>` : `<span class="muted small">Новых папок не видно. Поделись папкой проекта с ботом (Читатель): <code style="user-select:all">${esc(S.drive.email || "")}</code></span>`}</div>`;
    return `${sheetHead(isNew ? "Новый проект" : "Проект")}
    ${pick}
    <div class="card">
      <div class="row"><label class="f w-icon"><span>Иконка</span><input class="inp" data-pf="emoji" value="${esc(draft.emoji)}" maxlength="4"></label>
      <label class="f grow"><span>Название</span><input class="inp" data-pf="name" value="${esc(draft.name)}" placeholder="Скрытая Физика"></label></div>
      <label class="f"><span>Цвет проекта — полоска на карточках и точки в календаре</span><div class="swatches">${PALETTE.map((c) => `<button class="swatch ${(draft.color || draft.autoColor) === c ? "on" : ""}" style="--pc:${c}" data-act="pick-color" data-c="${c}" aria-label="цвет ${c}"></button>`).join("")}</div></label>
      <label class="f"><span>Папка проекта на Google Диске (ссылка)</span><input class="inp" data-pf="drive_folder" value="${esc(draft.drive_folder)}" placeholder="https://drive.google.com/drive/folders/…"></label>
      <label class="f"><span>Дни выхода</span><select class="inp" data-pf="publish_days">${[["", "Любые — шаг «каждые N дней»"], ["even", "Чётные числа"], ["odd", "Нечётные числа"]].map(([v, n]) => `<option value="${v}" ${(draft.publish_days || "") === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="f"><span>Выпуск каждые N дней (дата выхода нового выпуска; при чётных или нечётных числах не считается)</span><input class="inp" type="number" min="1" data-pf="cadence_days" value="${draft.cadence_days}"></label>
      <label class="f"><span>Озвучка: через сколько дней после сценария (0 — в тот же день; пусто — по дате выхода)</span><input class="inp" type="number" min="0" data-pf="voice_days" value="${draft.voice_days ?? ""}"></label>
      <span class="muted small">За сколько дней до выхода должен быть готов этап:</span>
      <div class="grid4">${STAGES.map((s) => `<label class="f"><span>${META[s].n}</span><input class="inp" type="number" min="0" data-pf="${s}_offset" value="${draft[s + "_offset"]}"></label>`).join("")}</div>
    </div>
    ${isNew ? "" : topicsSection(draft.id)}
    ${isNew ? "" : pcSection(draft)}
    <h2 class="between">Ответственные<select class="sel-sm" data-act-change="roles-all" aria-label="Назначить всех ответственных одним человеком"><option value="">Всё одному…</option>${S.members.map((m) => `<option value="${m.tg_id}">${esc(m.name)}</option>`).join("")}</select></h2><div class="card">${STAGES.map((s) => `<label class="f"><span>${META[s].n}</span><select class="inp" data-role="${s}">${memberOptions(draft.roles[s])}</select></label>`).join("")}
      <div class="muted small">Незакрытые задачи прежнего ответственного перейдут новому.</div></div>
    <h2>Языковые каналы</h2><div class="card">
      ${draft.channels.map((c, i) => `<div class="chan-card">
        <div class="chan-top"><label class="f"><span>Язык</span><input class="inp" data-ch="${i}" data-k="lang" value="${esc(c.lang)}" placeholder="en" maxlength="5"></label>
        <label class="f grow"><span>Название канала (в статистике и постах)</span><input class="inp" data-ch="${i}" data-k="name" value="${esc(c.name || "")}" placeholder="${esc((draft.name || "Проект") + " " + String(c.lang || "").toUpperCase())}"></label>
        <button class="icon-btn" data-act="ch-del" data-i="${i}" aria-label="Удалить язык ${esc(String(c.lang || "").toUpperCase())}">${icon("x")}</button></div>
        <label class="f"><span>Ссылка на YouTube-канал (для автоотметки выкладки)</span><input class="inp" data-ch="${i}" data-k="youtube_url" value="${esc(c.youtube_url || "")}" placeholder="https://youtube.com/@канал"></label></div>`).join("")}
      <button class="btn ghost sm" data-act="ch-add">+ язык</button>
      ${isNew ? "" : `<div class="muted small mt-2">Удаление языка удалит его задачи во всех выпусках.</div>`}</div>
    <button class="btn block dup-main" data-act="save-project">Сохранить</button>
    ${isNew ? "" : `<button class="btn danger block mt-2" data-act="archive-project" data-id="${draft.id}">Архивировать проект</button>`}`;
  };
}

function openProject(id, opts = {}) {
  const p = proj(id);
  const draft = p
    ? {
      ...p, roles: {}, required_materials: p.required_materials ?? null,
      drive_folder: p.drive_folder_id ? `https://drive.google.com/drive/folders/${p.drive_folder_id}` : "",
      channels: projChannels(id).map((c) => ({ id: c.id, lang: c.lang, name: c.name || "", youtube_url: c.youtube_url || "" })),
    }
    : {
      id: 0, name: "", emoji: "🎬", cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, voice_days: 0,
      drive_folder: "", roles: {}, channels: ["ru", "en", "de", "pl", "es"].map((lang) => ({ lang, name: "", youtube_url: "" })),
    };
  for (const s of STAGES) {
    const r = S.roles.find((x) => x.project_id === id && x.stage === s);
    // для нового проекта подставляем роли из первого существующего
    const fallback = S.roles.find((x) => x.stage === s);
    draft.roles[s] = r ? r.member_id : !p && fallback ? fallback.member_id : null;
  }
  draft.autoColor = p ? pcolor(p) : PALETTE[S.projects.length % PALETTE.length];
  ui.draft = draft;
  const snapshot = JSON.stringify(draft);
  // форма правит черновик, а не поля: сравниваем его с тем, что было при открытии
  openSheet(projectSheet(draft), () => ({ main: { text: draft.id ? "Сохранить" : "Создать проект", run: () => actions["save-project"]() } }), {
    replace: !!opts.replace,
    dirty: () => { readProjectForm(); return JSON.stringify(draft) !== snapshot; },
  });
  if (!p && S.drive && S.drive.enabled) {
    ui.driveFolders = null; ui.driveError = null;
    api("drive.folders").then((r) => { ui.driveFolders = r.folders || []; if (ui.draft === draft && ui.sheet) ui.sheet.render(); })
      .catch((e) => { ui.driveFolders = []; ui.driveError = e.message; if (ui.draft === draft && ui.sheet) ui.sheet.render(); });
  }
}

/** Связь с папкой проекта на ПК (ytbot) и «робот», который сам делает готовые к монтажу выпуски. */
function pcSection(draft) {
  return `<h2>Папка на ПК</h2><div class="card">
    <div>${draft.linked ? "папка на ПК связана" : `<span class="muted">Папка на ПК не связана — в папке проекта: <code style="user-select:all">ytbot link ${draft.id}</code></span>`}</div>
    ${S.me.is_owner
    ? `<label class="note check-note"><input type="checkbox" data-pf="runner_enabled" ${draft.runner_enabled ? "checked" : ""}>
      <span>Робот на ПК<br><span class="muted small">Сам берёт выпуск, готовый к монтажу, скачивает сценарии и озвучку и запускает Claude в папке проекта (<code>ytbot run</code>). Озвучку не заказывает. По умолчанию выключен.</span></span></label>
      <h2>Что обязательно в пакете языка</h2>${REQUIRED_MATERIALS.map(([k, n]) => `<label class="note check-note"><input type="checkbox" data-req="${k}" ${!draft.required_materials || draft.required_materials.includes(k) ? "checked" : ""}><span>${n}</span></label>`).join("")}
      <div class="muted small">Видео обязательно всегда. Без галочки материал не требуют ни сдача финала, ни матрица языков.</div>`
    : `<div class="note">Робот на ПК: ${draft.runner_enabled ? "включён" : "выключен"}<br><span class="muted small">Переключает владелец.</span></div>`}</div>`;
}

function topicsSection(pid) {
  const gt = S.group_topics || [];
  const owner = (thread) => {
    const t = (S.topics || []).find((x) => Number(x.thread_id) === Number(thread));
    return t ? `${(proj(t.project_id) || { name: "?" }).name} · ${KINDS.find((k) => k.id === t.kind).n}` : null;
  };
  const missing = KINDS.filter((k) => !topicBound(pid, k.id)).length;
  return `<h2>Темы в группе</h2><div class="card">${KINDS.map((k) => {
    const cur = (S.topics || []).find((x) => x.project_id === pid && x.kind === k.id);
    return `<label class="f"><span>${k.n}</span><select class="inp" data-act-change="topic" data-pid="${pid}" data-kind="${k.id}">
      <option value="">— не привязана</option>
      ${gt.map((t) => {
        const o = owner(t.thread_id);
        const mine = cur && Number(cur.thread_id) === Number(t.thread_id);
        return `<option value="${t.thread_id}" ${mine ? "selected" : ""}>${esc(t.name)}${o && !mine ? ` (сейчас: ${esc(o)})` : ""}</option>`;
      }).join("")}
      <option value="new">Создать новую тему</option></select></label>`;
  }).join("")}
    ${missing ? `<button class="btn ghost block" data-act="topics-create" data-id="${pid}">${icon("plus")}Создать недостающие темы (${missing})</button>` : ""}
    <div class="muted small mt-2">Нет нужной темы в списке? Напиши в ней любое сообщение — бот её увидит. Темы с понятным названием («… Скрытая Физика (Озвучка)») привязываются сами.</div></div>`;
}

function readProjectForm() {
  const d = ui.draft;
  ui.sheet.el.querySelectorAll("[data-pf]").forEach((el) => {
    if (el.type === "checkbox") d[el.dataset.pf] = el.checked;
    else if (el.type !== "number") d[el.dataset.pf] = el.value;
    else d[el.dataset.pf] = el.value === "" ? (el.dataset.pf === "voice_days" ? null : "") : Number(el.value);
  });
  const req = [...ui.sheet.el.querySelectorAll("[data-req]")];
  if (req.length) d.required_materials = requiredValue(req.filter((el) => el.checked).map((el) => el.dataset.req));
  ui.sheet.el.querySelectorAll("[data-role]").forEach((el) => { d.roles[el.dataset.role] = el.value ? Number(el.value) : null; });
  ui.sheet.el.querySelectorAll("[data-ch]").forEach((el) => { d.channels[Number(el.dataset.ch)][el.dataset.k] = el.value.trim(); });
}

/** Текст подтверждения: «Удалить канал PL и N задач выкладки?» */
function delChannelText(chs) {
  const n = S.tasks.filter((t) => chs.some((c) => c.id === t.channel_id)).length;
  const names = chs.map((c) => langTag(c.lang)).join(", ");
  return `Удалить ${chs.length > 1 ? "каналы" : "канал"} ${names} и ${n} задач выкладки?`;
}


export const actions = {
  "go-screen": (el) => go({ tab: el.dataset.to }),
  "logout": async (el) => {
    const all = el.dataset.all === "1";
    if (all && !(await confirmBox("Выйти на всех устройствах? Войти придётся заново везде.", { ok: "Выйти" }))) return;
    if (typeof session.logout === "function") await session.logout(all);
  },
  "member-admin": async (el) => {
    const m = mem(Number(el.dataset.id)), on = el.dataset.on === "1";
    if (!m) return;
    const q = on ? `Дать участнику «${m.name}» права админа? Он сможет менять проекты, команду и настройки.` : `Снять права админа у участника «${m.name}»?`;
    if (await confirmBox(q, { ok: on ? "Дать права" : "Снять" })) act("member.update", { tg_id: m.tg_id, is_admin: on }, on ? "Права выданы" : "Права сняты", { el });
  },
  "member-remove": async (el) => {
    const m = mem(Number(el.dataset.id));
    if (!m) return;
    if (await confirmBox(`Удалить участника «${m.name}» из команды? Назначенные ему этапы лучше передать другому заранее. Если он снова напишет боту, появится заново.`, { ok: "Удалить" })) {
      act("member.remove", { tg_id: m.tg_id }, "Удалён из команды", { el });
    }
  },
  "restore-project": (el) => act("project.restore", { id: Number(el.dataset.id) }, "Проект вернулся из архива", { el }),
  // все четыре этапа одному человеку: правит только форму, сохраняется общей кнопкой
  "change:roles-all": (el) => {
    if (!el.value || !ui.draft) return;
    readProjectForm();
    for (const s of STAGES) ui.draft.roles[s] = Number(el.value);
    el.value = "";
    ui.sheet.render();
  },
  "pick-color": (el) => { readProjectForm(); ui.draft.color = el.dataset.c; haptic("light"); ui.sheet.render(); },
  "edit-project": (el) => openProject(Number(el.dataset.id)),
  "ch-add": () => { readProjectForm(); ui.draft.channels.push({ lang: "", name: "", youtube_url: "" }); ui.sheet.render(); },
  "ch-del": async (el) => {
    readProjectForm();
    const d = ui.draft, ch = d.channels[Number(el.dataset.i)];
    if (!ch) return;
    // удаление канала стирает его задачи выкладки во всех выпусках — без вопроса нельзя
    if (ch.id) {
      if (!(await confirmBox(delChannelText([ch])))) return;
      (d.confirmedDel = d.confirmedDel || new Set()).add(ch.id);
    }
    d.channels.splice(d.channels.indexOf(ch), 1);
    ui.sheet.render();
  },
  "save-project": async (el) => {
    readProjectForm();
    const d = ui.draft;
    if (!d.name.trim()) return toast("Нужно название");
    const bad = projectFormError(d);
    if (bad) return toast(bad);
    const channels = d.channels.filter((c) => c.lang).map((c) => ({ id: c.id, lang: c.lang, name: c.name || null, youtube_url: c.youtube_url || null }));
    // канал со стёртым названием языка тоже пропадёт — спрашиваем и про него
    const gone = projChannels(d.id).filter((c) => !channels.some((x) => x.id === c.id) && !(d.confirmedDel && d.confirmedDel.has(c.id)));
    if (gone.length && !(await confirmBox(delChannelText(gone)))) return;
    const { confirmedDel, autoColor, ...payload } = d;
    const r = await act("project.save", { ...payload, color: d.color || autoColor, channels }, d.id ? "Сохранено" : "Проект создан", { el, retry: () => actions["save-project"]() });
    if (!r) return;
    if (!d.id && r.id) openProject(r.id, { replace: true }); // сразу показать темы и каналы нового проекта
    else closeSheet({ force: true });
  },
  "pick-folder": (el) => {
    readProjectForm();
    const d = ui.draft;
    d.drive_folder = `https://drive.google.com/drive/folders/${el.dataset.id}`;
    const nm = el.dataset.name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    d.name = nm.charAt(0).toUpperCase() + nm.slice(1);
    haptic("light");
    ui.sheet.render();
  },
  "topics-create": async (el) => {
    readProjectForm();
    await act("topics.create_missing", { project_id: Number(el.dataset.id) }, "Темы созданы в группе", { el });
  },
  "archive-project": async (el) => {
    if (await confirmBox("Архивировать проект? Его выпуски пропадут из списков и напоминаний.")) {
      if (await act("project.archive", { id: Number(el.dataset.id) }, "Проект в архиве", { el })) closeSheet({ force: true });
    }
  },
  "save-settings": (el) => {
    const hour = (id) => { const v = byId(id).value.trim(); return /^[0-9]+$/.test(v) ? Number(v) : null; };
    const morning = hour("set-morning"), evening = hour("set-evening");
    if (morning == null || evening == null || morning > 23 || evening > 23) return toast("Час — число от 0 до 23");
    if (morning >= evening) return toast("Утро должно быть раньше вечера");
    return act("settings.save", { timezone: byId("set-tz").value.trim(), morning_hour: morning, evening_hour: evening }, "Сохранено", { el });
  },
  // своя шторка вместо window.prompt: prompt в Telegram на iOS и Android не показывается
  "rename": (el) => {
    const id = Number(el.dataset.id);
    openSheet(() => {
      const m = mem(id);
      if (!m) { closeSheet({ force: true }); return ""; }
      return `${sheetHead("Имя в боте")}
        <div class="card"><label class="f"><span>Как бот называет ${m.username ? "@" + esc(m.username) : "участника"} в постах и напоминаниях</span>
        <input class="inp" id="rn-name" data-enter="rename-save" value="${esc(m.name)}" maxlength="40" enterkeyhint="done"></label>
        ${S.me.is_owner ? `<label class="f"><span>Часовой пояс для выкладки, например Pacific/Auckland; пусто — как у команды</span>
        <input class="inp" id="rn-tz" data-enter="rename-save" value="${esc(m.timezone || "")}" maxlength="60" enterkeyhint="done" autocapitalize="off" spellcheck="false"></label>` : ""}</div>
        <button class="btn block dup-main" data-act="rename-save" data-id="${id}">Сохранить</button>`;
    }, () => ({ main: { text: "Сохранить", run: () => actions["rename-save"]({ dataset: { id } }) } }));
  },
  "rename-save": async (el) => {
    const name = byId("rn-name").value.trim();
    if (!name) return toast("Имя не может быть пустым");
    const tz = byId("rn-tz");
    if (await act("member.update", { tg_id: Number(el.dataset.id), name, ...(tz ? { timezone: tz.value.trim() } : {}) }, "Сохранено", { el })) closeSheet({ force: true });
  },
  "change:topic": (el) => {
    readProjectForm();
    const v = el.value;
    act("topics.set", { project_id: Number(el.dataset.pid), kind: el.dataset.kind, thread_id: v === "new" ? "new" : v ? Number(v) : null },
      v === "new" ? "Тема создана в группе" : v ? "Тема привязана" : "Тема отвязана");
  },
};
