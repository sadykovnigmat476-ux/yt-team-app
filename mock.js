// Демо-режим для проверки интерфейса без Telegram и сервера: открыть index.html?mock=1
(function () {
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = iso(new Date());
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const STAGES = ["script", "voice", "edit", "upload"];
  const langs = ["ru", "en", "de", "pl", "es"];

  // ?viewer=admin — админ, но не владелец: вкладки «🤖» нет, robot.* отвечают 403, чекбокса «Робот на ПК» в проекте нет
  // ?noowner=1 — владелец не задан: пульт у первого админа с подсказкой (owner_hint)
  // ?viewer=pavel — выкладчик: будущей выкладки на экране дел нет
  const asAdmin = new URLSearchParams(location.search).get("viewer") === "admin";
  const asPavel = new URLSearchParams(location.search).get("viewer") === "pavel";
  const noOwner = new URLSearchParams(location.search).has("noowner");
  const st = {
    me: asAdmin
      ? { tg_id: 3, name: "Админ", username: "admin2", is_admin: true, can_dm: true, is_owner: false }
      : asPavel ? { tg_id: 2, name: "Павел", username: "pavel", is_admin: false, can_dm: false, is_owner: false }
      : { tg_id: 1, name: "Нигмат", username: "SNigmat", is_admin: true, can_dm: true, is_owner: true },
    members: [
      { tg_id: 1, name: "Нигмат", username: "SNigmat", is_admin: true, can_dm: true },
      { tg_id: 2, name: "Павел", username: "pavel", is_admin: false, can_dm: false },
      ...(asAdmin ? [{ tg_id: 3, name: "Админ", username: "admin2", is_admin: true, can_dm: true }] : []),
    ],
    projects: [
      { id: 1, name: "Скрытая Физика", emoji: "🔭", thread_id: null, drive_folder_id: "1_i-_n5wWFz_ZONW5ksUO7F08V3hQrXRq", voice_days: 0, cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, sort: 1, local_dir: "F:/Скрытая физика", runner_enabled: true },
      { id: 2, name: "Тактика Боя", emoji: "⚔️", thread_id: 12, cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, sort: 2, local_dir: "F:/Тактика Боя", runner_enabled: true },
      { id: 3, name: "Channel #1", emoji: "🪐", thread_id: null, cadence_days: 4, script_offset: 6, voice_offset: 4, edit_offset: 2, upload_offset: 0, sort: 3 },
    ],
    channels: [], episodes: [], tasks: [], links: [], roles: [],
    // как project.restore на сервере: архив виден админу и возвращается одной кнопкой
    archived_projects: [{ id: 9, name: "Твой день", emoji: "🌤", cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, thread_id: null, sort: 9 }],
    topics: [
      { project_id: 1, kind: "script", thread_id: 21 }, { project_id: 1, kind: "voice", thread_id: 22 }, { project_id: 1, kind: "video", thread_id: 23 },
      { project_id: 2, kind: "script", thread_id: 31 }, { project_id: 2, kind: "voice", thread_id: 32 }, { project_id: 2, kind: "video", thread_id: 33 },
      { project_id: 3, kind: "script", thread_id: 41 },
    ],
    drive: { enabled: true, email: "yt-bot@yt-bot-123.iam.gserviceaccount.com" },
    group_topics: [
      { thread_id: 21, name: "Channel Скрытая Физика ( Сценарий )" }, { thread_id: 22, name: "Channel Скрытая Физика ( Озвучка )" },
      { thread_id: 23, name: "Channel Скрытая Физика ( Готовое Видео )" }, { thread_id: 31, name: "Channel Тактика Боя ( Сценарий )" },
      { thread_id: 32, name: "Channel Тактика Боя (Озвучка)" }, { thread_id: 33, name: "Channel Тактика Боя (Готовое видео)" },
      { thread_id: 41, name: "Сценарий (Channel #1)" }, { thread_id: 42, name: "Озвучка (Channel #1)" },
    ],
    settings: { timezone: "Europe/Moscow", morning_hour: 9, evening_hour: 20, group_linked: true },
  };
  let cid = 1, eid = 1, tid = 1, lid = 1;
  for (const p of st.projects) langs.forEach((lang, i) => st.channels.push({ id: cid++, project_id: p.id, lang, name: null, sort: i }));
  for (const p of st.projects) {
    st.roles.push({ project_id: p.id, stage: "script", member_id: 1 }, { project_id: p.id, stage: "voice", member_id: 2 },
      { project_id: p.id, stage: "edit", member_id: 1 }, { project_id: p.id, stage: "upload", member_id: 2 });
  }

  // ---- зеркало серверных правил (domain.ts): сроки со сжатием, перенос, коды ----
  /** uploadDayOf: «сегодня» для выкладки по поясу вызвавшего; своего пояса нет — день команды. */
  const uploadToday = () => {
    const tz = (st.members.find((m) => m.tg_id === st.me.tg_id) || {}).timezone;
    return tz ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()) : today;
  };
  const proj = (id) => st.projects.find((x) => x.id === id);
  const dueFor = (p, s, pub) => add(pub, -p[s + "_offset"]);
  /** scheduleFor: срок = max(по оффсету, сегодня), но не позже даты выхода; порядок этапов сохраняется. */
  function scheduleFor(p, pub) {
    const out = {};
    let prev = null;
    for (const s of STAGES) {
      let d = dueFor(p, s, pub);
      if (d < today) d = today;
      if (d > pub) d = pub;
      if (prev && d < prev) d = prev;
      out[s] = d;
      prev = d;
    }
    return out;
  }
  const isCompressed = (p, pub) => dueFor(p, "script", pub) < today;
  const roleOf = (pid, s) => (st.roles.find((r) => r.project_id === pid && r.stage === s) || {}).member_id ?? null;
  // как normCode на сервере: «11», «s11», «S 11» → «S11» (подсказка номера у проекта без S приходит числом)
  const normCode = (c) => { const t = String(c).trim().toUpperCase(); const m = t.match(/^[SЅ]?\s*(\d{1,3})$/); return m ? "S" + m[1].padStart(2, "0") : t; };
  // как nextEpisodeCode на сервере: номера ничейных папок Диска заняты, кроме той, что возьмёт выпуск (exceptFolderId)
  const nextCode = (p, exceptFolderId) => {
    const codes = st.episodes.filter((e) => e.project_id === p.id).map((e) => +(e.code.match(/\d+/) || [0])[0]);
    for (const o of orphans) {
      if (o.project_id !== p.id || o.id === exceptFolderId) continue;
      const m = o.name.match(/^\s*[SЅsѕ]?\s*(\d{1,3})(?!\d)/);
      if (m) codes.push(+m[1]);
    }
    return "S" + String(Math.max(0, ...codes) + 1).padStart(2, "0");
  };
  function assertCodeFree(p, code, exceptId) {
    if (st.episodes.some((e) => e.project_id === p.id && e.code === code && e.id !== exceptId)) throw new Error("Код " + code + " уже занят");
  }
  // titleSimilarity: доля общих слов (без кода в начале названия папки)
  const words = (t) => new Set(String(t).toLowerCase().replace(/^s?\d+[\s_.-]+/i, "").split(/[^a-zа-яё0-9]+/i).filter(Boolean));
  const similarity = (a, b) => { const x = words(a), y = words(b); if (!x.size || !y.size) return 0; let n = 0; x.forEach((w) => y.has(w) && n++); return n / (x.size + y.size - n); };
  // ничейные папки на «Диске»: есть папка проекта, под неё ещё нет выпуска
  let orphans = [{ project_id: 1, id: "orphan-faraday", name: "Фарадей и первый электромотор" }];

  /** raw — как у выпусков, созданных давно: сроки по оффсетам без сжатия (демо-просрочка). */
  function createEpisode(b, raw) {
    // ключ запроса формы: повтор «Создать» после «Нет связи» — тот же выпуск, без новых задач
    const dup = b.request_id && st.episodes.find((x) => x.client_request_id === b.request_id);
    if (dup) return dup;
    if (b.drive_folder_id && !/^[\w-]+$/.test(b.drive_folder_id)) throw new Error("Неверный номер папки Диска");
    const p = proj(b.project_id);
    const code = b.code ? normCode(b.code) : nextCode(p, b.drive_folder_id);
    assertCodeFree(p, code);
    const orphan = b.drive_folder_id && orphans.find((o) => o.id === b.drive_folder_id);
    if (orphan) orphans = orphans.filter((o) => o !== orphan);
    const e = { id: eid++, project_id: p.id, drive_folder_id: b.drive_folder_id || "demo" + eid, code, title: b.title, publish_date: b.publish_date || add(today, 7), notes: null, client_request_id: b.request_id || null };
    st.episodes.push(e);
    const sc = raw ? Object.fromEntries(STAGES.map((s) => [s, dueFor(p, s, e.publish_date)])) : scheduleFor(p, e.publish_date);
    for (const s of STAGES) {
      const due = sc[s];
      const assignee_id = roleOf(p.id, s);
      if (s !== "upload") st.tasks.push({ id: tid++, episode_id: e.id, stage: s, channel_id: null, assignee_id, due_date: due, done_at: null });
      else for (const c of st.channels.filter((c) => c.project_id === p.id)) st.tasks.push({ id: tid++, episode_id: e.id, stage: s, channel_id: c.id, assignee_id, due_date: due, done_at: null });
    }
    return e;
  }
  /** rescheduleEpisode: единственный путь переноса; закрытые этапы не трогает, озвучку по voice_days после сценария — тоже. */
  function reschedule(e, pub) {
    const p = proj(e.project_id);
    e.publish_date = pub;
    const sc = scheduleFor(p, pub);
    const scriptClosed = st.tasks.filter((t) => t.episode_id === e.id && t.stage === "script").every((t) => t.done_at);
    for (const t of st.tasks.filter((t) => t.episode_id === e.id && !t.done_at)) {
      if (t.stage === "voice" && p.voice_days != null && scriptClosed) continue;
      t.due_date = sc[t.stage];
    }
  }
  /** onUnlocked: сценарий закрыт → срок озвучки = сегодня + voice_days. */
  function afterDone(eIds) {
    for (const id of eIds) {
      const e = st.episodes.find((x) => x.id === id), p = e && proj(e.project_id);
      if (!p || p.voice_days == null) continue;
      if (!st.tasks.filter((t) => t.episode_id === id && t.stage === "script").every((t) => t.done_at)) continue;
      st.tasks.filter((t) => t.episode_id === id && t.stage === "voice" && !t.done_at).forEach((t) => (t.due_date = add(today, p.voice_days)));
    }
  }
  const done = (eId, stage, n) => st.tasks.filter((t) => t.episode_id === eId && t.stage === stage).slice(0, n ?? 99).forEach((t) => (t.done_at = "x"));

  const e1 = createEpisode({ project_id: 1, title: "Как Эратосфен измерил Землю палкой и тенью", publish_date: add(today, 3) }, true);
  done(e1.id, "script");
  st.links.push({ id: lid++, episode_id: e1.id, stage: "script", url: "https://drive.google.com/drive/folders/demo", title: "Сценарий" });
  const e2 = createEpisode({ project_id: 2, title: "Почему римляне строили лагерь каждый вечер", publish_date: add(today, 6) }, true);
  const e3 = createEpisode({ project_id: 3, title: "Ровно 5 мест, где можно припарковаться в космосе", publish_date: add(today, 1) }, true);
  done(e3.id, "script"); done(e3.id, "voice"); done(e3.id, "edit"); done(e3.id, "upload", 2);
  const e4 = createEpisode({ project_id: 1, title: "Ньютон и яблоко: что было на самом деле", publish_date: add(today, -2) }, true);
  for (const s of STAGES) done(e4.id, s);
  createEpisode({ project_id: 2, title: "Фаланга против легиона", publish_date: add(today, 13) }, true);
  void e2;

  // ---- пульт робота: зеркало контракта robot.state / robot.pause / robot.project / robot.episode / robot.until ----
  // &nopulse=1 — у идущей прогонки пульс старше 15 минут (красное «нет пульса»); &emptyrobot=1 — пустое состояние без проектов и выпусков
  const MIN = 60000, HOUR = 60 * MIN;
  const qsm = new URLSearchParams(location.search);
  const isoAgo = (min) => new Date(Date.now() - min * MIN).toISOString();
  const hourIn = (tz) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const rb = { paused: false, seen: 4 };
  if (qsm.has("emptyrobot")) for (const p of st.projects) p.runner_enabled = false;
  const LOG = [
    "[14:02] фаза монтаж, часть 3: беру сцены 12–18",
    "[14:05] сцена 12: подпись «Лагерь на закате» — ок",
    "[14:11] сцена 13: ролик 4K, рендер превью…",
    "[14:19] сцена 14: правлю тайминг по озвучке (ru)",
    "[14:26] сцена 15: ошибка ffmpeg, повторяю",
    "[14:27] сцена 15: ок",
    "[14:34] сцена 16: добавляю карту похода",
  ].join("\n");
  const FAIL_NOTE = "Не сдано: видео DE, обложка PL\nПоследние строки журнала:\n[02:41] сцена 9: нет файла озвучки de\n[02:41] claude завершился с кодом 0";
  // выпуски робота: kind — running | review | waitnight | voicewait | failed | stopped | done
  const rbEps = [
    { id: 2, pid: 2, label: "⚔️ Тактика Боя · S06 «Почему римляне строили лагерь каждый вечер»", code: "S06", pub: add(today, 1), kind: "running", hold: false, until: null },
    { id: 1, pid: 1, label: "🔭 Скрытая Физика · S05 «Как Эратосфен измерил Землю палкой и тенью»", code: "S05", pub: add(today, 3), kind: "review", hold: false, until: null },
    { id: 5, pid: 2, label: "⚔️ Тактика Боя · S07 «Фаланга против легиона» · 3D", code: "S07", pub: add(today, 5), kind: "waitnight", hold: false, until: null },
    { id: 6, pid: 1, label: "🔭 Скрытая Физика · S06 «Почему небо синее»", code: "S06", pub: add(today, 8), kind: "voicewait", hold: true, until: null },
    { id: 7, pid: 2, label: "⚔️ Тактика Боя · S05 «Битва при Каннах»", code: "S05", pub: add(today, 2), kind: "failed", hold: false, until: null },
    // «Робот ведёт до: Озвучка» — сценарий и озвучку сделал робот, монтаж твой
    { id: 8, pid: 1, label: "🔭 Скрытая Физика · S07 «Почему лёд скользкий»", code: "S07", pub: add(today, 6), kind: "limit", hold: false, until: null, own: "voice" },
    // приёмка: у DE красная проверка, «Ок» закрыт до «Принять несмотря на»
    { id: 9, pid: 2, label: "⚔️ Тактика Боя · S04 «Осада Алезии»", code: "S04", pub: add(today, 1), kind: "accept", hold: false, until: null },
    // потолок сбоев: робот ждёт «Повторить»
    { id: 10, pid: 2, label: "⚔️ Тактика Боя · S08 «Греческий огонь»", code: "S08", pub: add(today, 9), kind: "cap", hold: false, until: null },
    // потолок заходов финала: робот ждёт «Ещё 12 заходов»
    { id: 11, pid: 2, label: "⚔️ Тактика Боя · S09 «Ассирийские осадные башни»", code: "S09", pub: add(today, 4), kind: "finalcap", hold: false, until: null },
  ];
  // «Робот ведёт до»: own — свой предел выпуска (null — как у проекта), rbUntil — предел проекта (null — «Конец»)
  const UNTILS = ["script", "voice", "montage", "end"];
  const PHASES = ["script", "voice", "montage", "changes", "final", "accept"];
  const UNTIL_LAST = { script: 0, voice: 1, montage: 3, end: 5 };
  const UNTIL_GEN = { script: "сценария", voice: "озвучки", montage: "монтажа", end: "конца" };
  const PHASE_NAME = { script: "сценарий", voice: "озвучка", montage: "монтаж", changes: "правки", final: "финал", accept: "приёмка" };
  // вопрос робота: держит выпуск, пока владелец не ответит (nextRobotPhase)
  const rbQuestions = [{
    id: 40, episode_id: 5, status: "open", answer: null, at: isoAgo(50), why: "В сценарии битва дана с двух сторон, а на сцену хватит одной карты.",
    text: "Какую сторону показывать на карте битвы при Киноскефалах первой?", options: ["Македонцы: фаланга идёт вверх по склону", "Римляне: манипулы на правом фланге"],
  }];
  const openQuestion = (id) => rbQuestions.find((q) => q.episode_id === id && q.status === "open") || null;
  const questionView = (q) => ({ id: q.id, text: q.text, why: q.why, options: q.options, at: q.at });
  function answerQuestion(b) {
    const q = rbQuestions.find((x) => x.id === Number(b.question_id));
    if (!q) throw new Error("Вопрос " + b.question_id + " не найден");
    if (q.status !== "open") throw new Error("На этот вопрос уже ответили: " + q.answer);
    const own = String(b.text ?? "").trim();
    const answer = own || q.options[Number(b.option)];
    if (!answer) throw new Error(b.option == null ? "Выбери вариант или напиши свой ответ" : "Такого варианта нет");
    Object.assign(q, { status: "answered", answer });
    return { ok: true, label: (rbEps.find((m) => m.id === q.episode_id) || {}).label, text: "Ответ записан: " + answer };
  }
  const rbUntil = {};
  const untilOf = (m) => m.own || rbUntil[m.pid] || "end";
  const allowedPhase = (ph, u) => PHASES.indexOf(ph) <= UNTIL_LAST[u];
  // следующая фаза, которую робот взял бы (null — идёт, ждёт проверки или ждёт файлов)
  const RB_ALERT = { cap: "fail_cap", finalcap: "final_cap" }; // как alert на сервере: вид определяет кнопку
  const NEXT_PHASE = { waitnight: "montage", failed: "montage", stopped: "montage", limit: "montage", final: "final", changes: "changes" };
  const STEP_PHASE = { script: "script", voice: "voice", montage: "montage", review: "montage", changes: "changes", final: "final", accept: "accept" };
  const rbDone = [{ id: 4, pid: 1, label: "🔭 Скрытая Физика · S04 «Ньютон и яблоко: что было на самом деле»", code: "S04", pub: add(today, -2) }];
  const MODEL = { model: "claude-opus-5-5", model_label: "Opus 5.5", effort: "high", effort_label: "high" };
  const heartbeat = () => (qsm.has("nopulse") ? isoAgo(23) : isoAgo(((Date.now() / 1000) % 150) / 60));

  function rbRun(m) {
    const base = { id: 30 + m.id, host: "NIGMAT-PC", ...MODEL, log_tail: null, log_at: null, note: null };
    switch (m.kind) {
      case "running": return { ...base, phase: "montage", part: 3, status: "running", started_at: isoAgo(47), heartbeat_at: heartbeat(), log_tail: LOG, log_at: isoAgo(1) };
      case "review": return { ...base, phase: "montage", part: 3, status: "review", started_at: isoAgo(380), heartbeat_at: isoAgo(330), note: "Монтаж готов, стоп-кадры отправлены в личку владельцу." };
      case "stopped": return { ...base, phase: "montage", part: 3, status: "stopped", started_at: isoAgo(70), heartbeat_at: isoAgo(3), note: "остановил владелец" };
      case "failed": return { ...base, phase: "final", part: 1, status: "failed", fail_kind: "not_delivered", started_at: isoAgo(420), heartbeat_at: isoAgo(400), note: FAIL_NOTE };
      case "cap": return { ...base, phase: "montage", part: 2, status: "failed", fail_kind: "timeout", started_at: isoAgo(900), heartbeat_at: isoAgo(700), note: "таймаут 240 мин" };
      case "finalcap": return { ...base, phase: "final", part: 12, status: "done", started_at: isoAgo(90), heartbeat_at: isoAgo(70), note: "Часть языков ещё рендерится на сервере." };
      case "accept": return { ...base, id: 60, phase: "accept", part: 1, status: "review", started_at: isoAgo(50), heartbeat_at: isoAgo(35), model: null, model_label: "модель не указана", effort: null, effort_label: "уровень не указан", note: null };
      case "accepted": return { ...base, id: 60, phase: "accept", part: 1, status: "done", started_at: isoAgo(50), heartbeat_at: isoAgo(35), note: "приёмка пройдена" };
      case "changes": return { ...base, phase: m.fixFrom || "montage", part: 3, status: "done", started_at: isoAgo(380), heartbeat_at: isoAgo(330), note: m.fixNote || null };
      case "final": return { ...base, phase: "montage", part: 3, status: "done", started_at: isoAgo(380), heartbeat_at: isoAgo(330), note: "Стоп-кадры приняты" };
      case "manual": return null;
      case "limit": return { ...base, phase: "voice", part: 1, status: "done", started_at: isoAgo(1500), heartbeat_at: isoAgo(1490), note: "Озвучка заказана и принята." };
      case "waitnight": return { ...base, phase: "voice", part: 1, status: "done", host: "NIGMAT-PC", model: null, model_label: "модель не указана", started_at: isoAgo(900), heartbeat_at: isoAgo(890), note: "Озвучка заказана и принята." };
      default: return null;
    }
  }
  function rbTrack(m, allowed, paused) {
    const S = (key, title, state, detail = null) => ({ key, title, state, detail });
    const steps = (v) => [
      S("topic", "Тема", "done", m.code), S("script", "Сценарий", ...v.script), S("voice", "Озвучка", ...v.voice), S("montage", "Монтаж", ...v.montage),
      S("review", "Проверка", ...v.review), S("changes", "Правки", ...v.changes), S("final", "Финал", ...v.final), S("accept", "Приёмка", ...(v.accept || ["todo"])), S("upload", "Выкладка", ...v.upload),
    ];
    const todo = ["todo"];
    const front = { script: ["done", "5 языков"], voice: ["done", "5 из 5"] };
    switch (m.kind) {
      case "running": return steps({ ...front, montage: paused ? ["wait", "остановлена"] : ["active", "часть 3"], review: todo, changes: todo, final: todo, upload: todo });
      case "stopped": return steps({ ...front, montage: ["wait", "остановлена · часть 3"], review: todo, changes: todo, final: todo, upload: todo });
      case "review": return steps({ ...front, montage: ["done", "3 части"], review: ["wait", "ждёт тебя 5 ч"], changes: todo, final: todo, upload: todo });
      case "waitnight": return steps({ ...front, montage: ["wait", allowed ? "днём разрешено" : "ждёт ночи 1:00–8:00"], review: todo, changes: todo, final: todo, upload: todo });
      case "voicewait": return steps({ script: ["done", "5 языков"], voice: ["wait", "ждёт озвучку: 2 из 5"], montage: todo, review: todo, changes: todo, final: todo, upload: todo });
      case "failed": return steps({ ...front, montage: ["done", "2 части"], review: ["done", "Ок"], changes: ["skip"], final: ["fail", "не сдано: видео DE, обложка PL"], upload: todo });
      case "limit": return steps({ ...front, montage: ["wait"], review: todo, changes: todo, final: todo, upload: todo });
      case "cap": return steps({ ...front, montage: ["fail", "упал 3 раза подряд"], review: todo, changes: todo, final: todo, upload: todo });
      case "finalcap": return steps({ ...front, montage: ["done", "2 части"], review: ["done", "Ок"], changes: ["skip"], final: ["fail", "заход 12 из 12"], upload: todo });
      case "accept": return steps({ ...front, montage: ["done", "2 части"], review: ["done", "Ок"], changes: ["skip"], final: ["done", "заход 3 из 12"], accept: ["wait", "ждёт твоей приёмки"], upload: todo });
      case "accepted": return steps({ ...front, montage: ["done", "2 части"], review: ["done", "Ок"], changes: ["skip"], final: ["done", "заход 3 из 12"], accept: ["done", "Ок"], upload: ["wait", "выкладка за человеком"] });
      case "changes": return steps({ ...front, montage: ["done", "3 части"], review: ["done", "правки"], changes: ["wait", "возьмёт при следующем заходе"], final: todo, upload: todo });
      case "final": return steps({ ...front, montage: ["done", "3 части"], review: ["done", "Ок"], changes: ["skip"], final: ["wait", "возьмёт при следующем заходе"], upload: todo });
      case "manual": return steps({ ...front, montage: ["wait", "вручную"], review: todo, changes: todo, final: todo, upload: todo });
      default: return [];
    }
  }
  /** Следующая фаза за пределом — «дальше твоё» (как robotLimit на сервере); иначе null. */
  const limitOf = (m) => {
    const ph = NEXT_PHASE[m.kind];
    const u = untilOf(m);
    return ph && !allowedPhase(ph, u) ? { phase: ph, until: u } : null;
  };
  function rbWhere(m, allowed, nowIso) {
    if (m.hold) return { where: "⏸ остановлен тобой", tone: "stop" };
    if (m.manual) return { where: "⏳ ждёт: выпуск ведёт человек", tone: "wait" };
    const lim = limitOf(m);
    if (lim) return { where: `✋ дальше твоё: ${PHASE_NAME[lim.phase]} (робот ведёт до ${UNTIL_GEN[lim.until]})`, tone: "stop" };
    if (m.kind === "limit") return { where: "⏳ возьмёт при следующем заходе: монтаж", tone: "wait" };
    // как на сервере: проверка ждёт человека, а не робота — пауза её не останавливает
    if (m.kind === "review") return { where: "👀 ждёт твоей проверки 5 ч", tone: "owner" };
    if (m.kind === "accept") return { where: "👀 ждёт твоей приёмки 35 мин", tone: "owner" };
    if (openQuestion(m.id)) return { where: "❓ ждёт твоего ответа", tone: "owner" };
    if (rb.paused) return { where: "⏸ робот остановлен — выпуск ждёт запуска", tone: "stop" };
    switch (m.kind) {
      case "running": return { where: "🤖 делает: монтаж, часть 3 · ПК NIGMAT-PC", tone: "work" };
      case "cap": return { where: "⚠️ «монтаж, часть 2» упал 3 раза подряд — жду «Повторить»", tone: "fail" };
      case "finalcap": return { where: `⚠️ финал: ${rb.limits.final_max} заходов без видео всех языков — жду «🔁 Ещё ${rb.limits.final_max} заходов»`, tone: "fail" };
      case "accepted": return { where: "⏳ ждёт: приёмка пройдена — выкладка за человеком", tone: "wait" };
      case "changes": return { where: "⏳ возьмёт при следующем заходе: правки", tone: "wait" };
      case "final": return { where: "⏳ возьмёт при следующем заходе: финал", tone: "wait" };
      case "waitnight": return allowed ? { where: "☀️ днём разрешено — ждёт захода ytbot run", tone: "wait" } : { where: "⏳ ждёт ночи (1:00–8:00)", tone: "wait" };
      case "voicewait": return { where: "⏳ ждёт озвучку: 2 из 5 языков", tone: "wait" };
      case "failed": return { where: "❌ упал: Не сдано: видео DE, обложка PL, повтор через 1 ч", tone: "fail" };
      case "stopped": return { where: "⏹ остановлена: прогонку остановили", tone: "stop" };
      default: return { where: "", tone: "wait" };
    }
  }
  function rbPanelEp(m) {
    const allowed = !!m.until && Date.parse(m.until) > Date.now();
    const w = rbWhere(m, allowed);
    const run = rbRun(m);
    const u = untilOf(m);
    // шаги за пределом робота — «вручную» (как robotTrack на сервере)
    const asked = openQuestion(m.id);
    const track = rbTrack(m, allowed, rb.paused).map((x) => {
      const ph = STEP_PHASE[x.key];
      if (asked && x.key === "montage") return { ...x, state: "wait", detail: "ждёт твоего ответа" };
      return ph && !allowedPhase(ph, u) && !x.detail ? { ...x, detail: "вручную" } : x;
    });
    return {
      id: m.id, project_id: m.pid, label: m.label, publish_date: m.pub, hold: m.hold, now_until: allowed ? m.until : null,
      robot_until: u, robot_until_own: m.own || null,
      ...w, track, run,
      manual: !!m.manual,
      review: run && run.status === "review" ? { run_id: run.id, kind: run.phase === "accept" ? "accept" : "stills" } : null,
      question: asked ? questionView(asked) : null,
      fail_kind: run && run.status === "failed" ? run.fail_kind || null : null,
      missing: run && run.status === "failed" ? missingOf(run.note) : [],
      alert: !m.manual && !rb.paused && RB_ALERT[m.kind] ? { kind: RB_ALERT[m.kind], run_id: run.id } : null,
      next: NEXT_PHASE[m.kind] && !m.hold && !m.manual && !limitOf(m) && !asked ? { phase: NEXT_PHASE[m.kind], part: 1 } : null,
      usage: { ...sumUsage(rbRuns(m)), lumean_tokens: 4800 },
    };
  }
  function rbDoneEp(m) {
    const S = (key, title, state, detail = null) => ({ key, title, state, detail });
    return {
      id: m.id, project_id: m.pid, label: m.label, publish_date: m.pub, hold: false, now_until: null, robot_until: rbUntil[m.pid] || "end", robot_until_own: null,
      manual: false, review: null, question: null, fail_kind: null, missing: [], alert: null, next: null, usage: { tokens: 412000, cost_usd: 6.1, hours: 7.4, runs: 6, lumean_tokens: 4800 },
      where: "✅ выложен " + m.pub, tone: "done",
      track: [S("topic", "Тема", "done", m.code), S("script", "Сценарий", "done"), S("voice", "Озвучка", "done", "5 из 5"), S("montage", "Монтаж", "done", "2 части"),
        S("review", "Проверка", "done"), S("changes", "Правки", "skip", "правок не было"), S("final", "Финал", "done", "заход 1 из 12"), S("accept", "Приёмка", "done", "Ок"), S("upload", "Выкладка", "done", m.pub)],
      run: { id: 99, phase: "final", part: 1, status: "done", host: "NIGMAT-PC", ...MODEL, started_at: isoAgo(3000), heartbeat_at: isoAgo(2990), log_tail: null, log_at: null, note: "Финал собран, ролик залит на Диск." },
    };
  }
  function robotState() {
    const enabled = new Set(st.projects.filter((p) => p.runner_enabled).map((p) => p.id));
    const eps = qsm.has("emptyrobot") || !enabled.size ? [] : rbEps.filter((m) => enabled.has(m.pid)).map(rbPanelEp);
    const dn = qsm.has("emptyrobot") || !enabled.size ? [] : rbDone.filter((m) => enabled.has(m.pid)).map(rbDoneEp);
    const h = hourIn(st.settings.timezone);
    return {
      paused: rb.paused, owner: noOwner ? null : { tg_id: 1, name: "Нигмат" }, now: new Date().toISOString(), night: h >= rb.limits.night_from && h < rb.limits.night_to,
      owner_hint: noOwner ? "Владелец не задан: пульт открыт первому админу, сообщения робота идут всем админам. Задай settings.owner_id" : null,
      night_window: rb.limits.night_from + ":00–" + rb.limits.night_to + ":00", limits: { ...rb.limits }, effort_label: "high", hosts: rb.hosts,
      usage7d: { tokens: 3184000, cost_usd: 42.7, hours: 31.5, runs: 27, lumean_tokens: 18400, night: { tokens: 612000, cost_usd: 8.3, hours: 5.2, runs: 4 } },
      pc_seen_at: qsm.has("emptyrobot") ? null : isoAgo(rb.seen),
      projects: st.projects.map((p) => ({
        id: p.id, name: p.name, runner_enabled: !!p.runner_enabled, linked: !!p.local_dir, seen_at: p.local_dir && !qsm.has("emptyrobot") ? isoAgo(rb.seen + p.id) : null, robot_until: rbUntil[p.id] || null,
        busy_since: rb.hosts.flatMap((x) => x.busy || []).find((x) => x.project_ids.includes(p.id))?.since ?? null,
      })),
      episodes: eps, done: dn,
    };
  }
  // ---- полный контроль: зеркало api robot.review/decide/run/limits/history/inbox/hosts, episode.files, voice.order, plan.*, folder.* ----
  const adminOnly = () => { if (!st.me.is_admin) throw new Error("Только для админа команды"); };
  // как memberChangeRefusal на сервере: владелец в моке — tg_id 1
  const ownerGuard = (id, removesAdmin) => { if (removesAdmin && !noOwner && id === 1 && st.me.tg_id !== 1) throw new Error("Снять админа и удалить владельца может только сам владелец"); };
  const missingOf = (note) => { const l = String(note || "").split("\n")[0]; return l.startsWith("Не сдано: ") ? l.slice(10).split(", ").filter(Boolean) : []; };
  rb.limits = { night_from: 1, night_to: 8, retry_hours: 6, max_fails: 3, final_max: 12, script_max: 3, montage_parts_max: 8, accept_autofix: 2, busy_min: 30, horizon_days: 14 };
  const LIMIT_RULES = {
    night_from: [0, 23, "Начало ночи"], night_to: [0, 23, "Конец ночи"], retry_hours: [1, 72, "Повтор после сбоя, ч"], max_fails: [1, 10, "Сбоев подряд"], final_max: [1, 48, "Заходов финала"],
    script_max: [1, 10, "Заходов сценария"], montage_parts_max: [1, 30, "Частей монтажа"], accept_autofix: [0, 5, "Автоисправлений приёмки"], busy_min: [0, 240, "«Папка занята», мин"], horizon_days: [1, 90, "Горизонт, дней"],
  };
  function checkLimits(v) {
    if (!v || typeof v !== "object") throw new Error("Настройки робота: нужен набор значений");
    const out = { night_from: 1, night_to: 8, retry_hours: 6, max_fails: 3, final_max: 12, script_max: 3, montage_parts_max: 8, accept_autofix: 2, busy_min: 30, horizon_days: 14 };
    for (const [k, [min, max, name]] of Object.entries(LIMIT_RULES)) {
      if (v[k] === undefined || v[k] === null) continue;
      if (!Number.isInteger(v[k]) || v[k] < min || v[k] > max) throw new Error(name + ": целое число от " + min + " до " + max);
      out[k] = v[k];
    }
    if (out.night_from === out.night_to) throw new Error("Ночное окно: начало и конец не могут совпадать");
    return out;
  }
  // ПК робота: отчёт ytbot doctor (красный пункт с подсказкой) и «папка занята» у Тактики Боя
  rb.hosts = qsm.has("emptyrobot") ? [] : [{
    host: "NIGMAT-PC", seen_at: isoAgo(3), busy: [{ project_ids: [2], since: isoAgo(12), at: isoAgo(3) }],
    report: {
      at: isoAgo(40), host: "NIGMAT-PC", ytbot: "2026.11.04", claude: { ok: true, version: "2.5.1", logged_in: true }, tools: { ffmpeg: true, ffprobe: true, whisper: true },
      projects: [
        { id: 1, dir: "F:/Скрытая физика", items: [{ id: "folder", ok: true, text: "папка связана" }, { id: "robot", ok: false, text: "нет robot/check.py", fix: "node tools/robot-kit/install.mjs \"F:/Скрытая физика\"" }, { id: "settings", ok: true, text: "разрешения на месте" }] },
        { id: 2, dir: "F:/Тактика Боя", items: [{ id: "folder", ok: true, text: "папка связана" }, { id: "robot", ok: true, text: "комплект проверок на месте" }, { id: "srv", ok: false, text: "обёртка сервера не отвечает", fix: "tools/robot-srv/install.sh --dry-run" }] },
      ],
    },
  }];

  // кадры без сети: inline SVG
  const frame = (text, hue) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="hsl(' + hue + ',45%,28%)"/><circle cx="360" cy="90" r="46" fill="hsl(' + hue + ',60%,55%)"/>' +
    '<text x="24" y="240" font-family="sans-serif" font-size="26" fill="#fff">' + text + "</text></svg>",
  );
  const stillNames = ["Заставка", "Карта похода", "Цитата", "Схема боя", "Финальная сцена", "Обложка"];
  const stills = (m) => stillNames.map((t, i) => ({ path: m.id + "/" + (30 + m.id) + "/still_" + (i + 1) + ".jpg", name: "still_" + (i + 1) + ".jpg", url: frame(t, (i * 50 + 200) % 360) }));
  const check = (id, text, ok = true, level = "red") => ({ id, ok, level, text });
  function acceptReport(m) {
    const lang = (l, i) => {
      // ES не попал в отчёт: так его достраивает normalizeAccept на сервере
      if (l === "es") return { lang: l, checks: [check("report", "языка нет в отчёте", false)], duration_s: 0, lufs: 0, video: { id: "", name: "" }, chapters: [], media: [], frames: [] };
      const bad = l === "de";
      const checks = [
        check("video", "видео читается, 2560×1440"), check("audio", "есть аудио"),
        check("duration", "длительность ±3 с от mp3"), check("lufs", bad ? "громкость −9,8 LUFS, нужно −16…−13" : "громкость −14,2 LUFS", !bad),
        check("silence", "тишины дольше 5 с нет"), check("cover", "обложка 1280×720, 1,2 МБ"), check("meta", "название, описание, теги"),
        check("chapters", "главы: 7, первая 0:00"), check("srt", "субтитры разобраны"),
      ];
      if (l === "pl") checks.push(check("drift", "длительность отличается от RU на 27 %", false, "warn"));
      const media = [m.id + "/60/sheet_" + l + ".jpg", m.id + "/60/cover_" + l + ".jpg"];
      return {
        lang: l, checks, duration_s: 742 + i * 11, lufs: bad ? -9.8 : -14.2, video: { id: "v_" + l, name: "S04_" + l + "_v1.mp4" }, cover: { id: "c_" + l, name: "S04_" + l + "_thumb.png" }, srt: { id: "s_" + l, name: "S04_" + l + ".srt" },
        meta: { title: "Осада Алезии: как Цезарь окружил окружающих (" + l.toUpperCase() + ")", description: "0:00 Вступление\n1:12 Две стены\n4:40 Вылазка Верцингеторикса", tags: "цезарь, галлия, осада" },
        chapters: [{ t: "0:00", title: "Вступление" }, { t: "1:12", title: "Две стены" }, { t: "4:40", title: "Вылазка" }], media,
        frames: [{ path: media[0], url: frame("Контактный лист " + l.toUpperCase(), 210 + i * 20) }, { path: media[1], url: frame("Обложка " + l.toUpperCase(), 20 + i * 15) }],
      };
    };
    const ls = langs.map(lang);
    const count = (level) => ls.reduce((n, l) => n + l.checks.filter((c) => !c.ok && c.level === level).length, 0);
    return { langs: ls, red: count("red"), warn: count("warn"), at: isoAgo(35) };
  }
  const reviewRunOf = (id) => rbEps.find((m) => { const r = rbRun(m); return r && r.id === id; });
  function reviewOf(id) {
    const m = reviewRunOf(id);
    if (!m) throw new Error("Прогонка " + id + " не найдена");
    const run = rbRun(m), accept = run.phase === "accept", report = accept ? acceptReport(m) : null;
    return {
      run: { id: run.id, episode_id: m.id, phase: run.phase, part: run.part, status: run.status, verdict: null, note: run.note, review_note: null, langs: null, override_by: null, finished_at: isoAgo(35) },
      kind: accept ? "accept" : "stills", label: m.label, project_langs: langs,
      frames: accept ? report.langs.flatMap((l) => l.frames.map((f) => ({ ...f, name: f.path.split("/").pop() }))) : stills(m),
      report, red: report ? report.red : 0, warn: report ? report.warn : 0, can_ok: run.status === "review" && !(report && report.red),
    };
  }
  function decide(id, b) {
    const m = reviewRunOf(id);
    if (!m) throw new Error("Уже решено");
    const run = rbRun(m);
    if (run.status !== "review") throw new Error("Уже решено");
    const accept = run.phase === "accept", red = accept ? acceptReport(m).red : 0, note = String(b.note || "").trim();
    if (b.verdict === "fix") {
      if (!note) throw new Error("Напиши, что поменять");
      const asked = (b.langs || []).map((l) => String(l).toLowerCase());
      if (asked.length && !accept) throw new Error("Вернуть отдельный язык можно только с приёмки");
      const stranger = asked.filter((l) => !langs.includes(l));
      if (stranger.length) throw new Error("Языка нет в проекте: " + stranger.join(", "));
      m.fixNote = note; m.fixFrom = run.phase; m.kind = "changes";
      return { ok: true, label: m.label, kind: accept ? "accept" : "stills", verdict: "fix" };
    }
    if (b.verdict === "override") {
      if (!accept) throw new Error("«Принять несмотря на» — только на приёмке");
      if (!red) throw new Error("Красных проверок нет — жми «Ок»");
    } else if (b.verdict !== "ok") throw new Error("Решение: ok, fix или override");
    else if (red) throw new Error("Красных проверок: " + red + " — исправить или «Принять несмотря на»");
    m.kind = accept ? "accepted" : "final";
    if (accept) { // как на сервере: «Ок» приёмки закрывает монтаж, только тогда Павлу можно выкладывать
      st.tasks.filter((t) => t.episode_id === m.id && t.stage !== "upload" && !t.done_at).forEach((t) => { t.done_at = new Date().toISOString(); t.done_by = st.me.tg_id; });
    }
    return { ok: true, label: m.label, kind: accept ? "accept" : "stills", verdict: b.verdict };
  }
  const ROLLBACK = { script: ["script", "voice", "edit"], voice: ["voice", "edit"], montage: ["edit"], final: ["edit"] };
  function rollbackInfo(m, phase) {
    const taskDone = (s) => { const ts = st.tasks.filter((t) => t.episode_id === m.id && t.stage === s); return !ts.length || ts.every((t) => t.done_at); };
    const reopen = ROLLBACK[phase].filter(taskDone);
    const redoVoice = phase === "script" || phase === "voice";
    const names = { script: "Сценарий", voice: "Озвучка", edit: "Монтаж" };
    return {
      reopen, redoVoice,
      consequences: [
        "Робот начнёт с фазы «" + PHASE_NAME[phase] + "»; идущая прогонка и ждущая проверка закрываются",
        ...(reopen.length ? ["Откроются этапы: " + reopen.map((s) => names[s]).join(", ")] : []),
        ...(phase === "script" ? ["Прежние тексты перестанут считаться: этап закроется, когда робот сдаст их заново"] : []),
        ...(redoVoice ? ["mp3 на Диске перестанут считаться, озвучка закажется заново: это токены Lumean"] : []),
        "Прежние прогонки останутся в истории, но робот на них больше не смотрит", "Павлу сообщений не будет",
      ],
    };
  }
  function runOp(b) {
    const m = rbEps.find((x) => x.id === Number(b.episode_id));
    if (!m) throw new Error("Выпуск " + b.episode_id + " не найден");
    if (b.op === "retry") {
      if (m.kind !== "failed" && m.kind !== "cap") throw new Error("Повторять нечего: робот не упал и не упёрся в потолок");
      m.kind = "waitnight";
      return { ok: true, label: m.label, run_id: 30 + m.id };
    }
    if (b.op === "again") {
      if (m.kind !== "finalcap") throw new Error("Ещё заходов добавлять не к чему: финал не упёрся в потолок");
      m.kind = "final";
      return { ok: true, label: m.label };
    }
    if (b.op !== "rollback") throw new Error("op: retry, again, rollback");
    if (!ROLLBACK[b.phase]) throw new Error("phase: script, voice, montage, final");
    const info = rollbackInfo(m, b.phase);
    // откат снимает открытые вопросы, как на сервере
    if (!b.dry) for (const q of rbQuestions) if (q.episode_id === m.id && q.status === "open") q.status = "cancelled";
    if (b.dry) return { ok: true, ...info };
    for (const t of st.tasks.filter((x) => x.episode_id === m.id && info.reopen.includes(x.stage))) { t.done_at = null; t.done_by = null; }
    rb.markers[m.id] = (rb.markers[m.id] || []).concat({ phase: b.phase, at: new Date().toISOString() });
    m.kind = b.phase === "final" ? "final" : "waitnight";
    return { ok: true, label: m.label, run_id: 900 + m.id, consequences: info.consequences };
  }
  rb.markers = {};
  const u = (input, output, cache, ms) => ({ usage: { input, output, cache_read: cache, cache_write: 0, cost_usd: Math.round((input + output) / 1000) / 100 }, ms });
  /** Прогонки выпуска в истории, старые первыми. */
  function rbRuns(m) {
    const row = (id, phase, part, status, min, extra) => ({
      id, phase, part, status, more: false, verdict: null, review_note: null, started_at: isoAgo(min), finished_at: isoAgo(min - 40), fail_kind: null, reviewed_at: null, reviewed_by: null, langs: null,
      retry_cleared: false, override_by: null, host: "NIGMAT-PC", heartbeat_at: isoAgo(min - 39), note: null, ...MODEL, usage: null, ms: null, log_tail: null, log_at: null, missing: [], ...extra,
    });
    if (m.kind === "voicewait") return [row(1000 + m.id, "script", 1, "done", 2600, u(120000, 48000, 310000, 3400000))];
    const out = [row(1000 + m.id, "script", 1, "done", 2600, u(120000, 48000, 310000, 3400000)), row(2000 + m.id, "voice", 1, "done", 2500, { ...u(3000, 900, 4000, 120000), note: "заказал озвучку 5 языков" })];
    const last = rbRun(m);
    if (last && last.phase !== "script" && last.phase !== "voice") out.push(row(3000 + m.id, "montage", 1, "done", 1500, { ...u(240000, 90000, 800000, 9800000), more: true }));
    if (last) out.push({ ...row(last.id, last.phase, last.part, last.status, 60, u(180000, 60000, 500000, 7100000)), note: last.note, fail_kind: last.fail_kind || null, log_tail: last.log_tail || null, finished_at: last.status === "running" ? null : isoAgo(20), missing: missingOf(last.note) });
    (rb.markers[m.id] || []).forEach((x, i) => out.push(row(900 + m.id + i, x.phase, 1, "stopped", 1, { note: "откат на фазу «" + PHASE_NAME[x.phase] + "»", model: null, model_label: "модель не указана", effort: null, effort_label: "уровень не указан" })));
    return out;
  }
  function sumUsage(runs) {
    let tokens = 0, cost = 0, ms = 0;
    for (const r of runs) { const x = r.usage || {}; tokens += (x.input || 0) + (x.output || 0) + (x.cache_read || 0) + (x.cache_write || 0); cost += x.cost_usd || 0; ms += r.ms || 0; }
    return { tokens, cost_usd: Math.round(cost * 100) / 100, hours: Math.round(ms / 360000) / 10, runs: runs.length };
  }
  function historyOf(id) {
    const m = rbEps.find((x) => x.id === id);
    const runs = m ? rbRuns(m) : [];
    return { episode_id: id, label: m ? m.label : "выпуск " + id, usage: { ...sumUsage(runs), lumean_tokens: 4800 }, runs: runs.reverse() };
  }
  function inbox() {
    const blank = { episode_id: null, run_id: null, question_id: null, at: null };
    const items = [];
    for (const m of rbEps) {
      const run = rbRun(m), base = { ...blank, label: m.label, episode_id: m.id, run_id: run && run.id };
      if (m.kind === "review") items.push({ ...base, id: "review:" + run.id, kind: "stills", action: "review", text: "Стоп-кадры ждут проверки", at: isoAgo(330) });
      if (m.kind === "accept") items.push({ ...base, id: "review:" + run.id, kind: "accept", action: "review", text: "Приёмка: красных проверок " + acceptReport(m).red, at: isoAgo(35) });
    }
    for (const q of rbQuestions.filter((x) => x.status === "open")) {
      const m = rbEps.find((x) => x.id === q.episode_id);
      items.push({ ...blank, ...questionView(q), id: "question:" + q.id, kind: "question", action: "answer", label: m ? m.label : "", episode_id: q.episode_id, question_id: q.id });
    }
    for (const m of rbEps) {
      if (m.hold || m.manual) continue;
      const run = rbRun(m), base = { ...blank, label: m.label, episode_id: m.id, run_id: run && run.id };
      if (m.kind === "failed") items.push({ ...base, id: "failed:" + run.id, kind: "failed", action: "retry", text: "«финал» упал: не сдано: " + missingOf(run.note).join(", "), at: isoAgo(20) });
      if (m.kind === "cap") items.push({ ...base, id: "fail_cap:" + m.id, kind: "fail_cap", action: "retry", text: "«монтаж, часть 2» упал 3 раза подряд — жду «Повторить»" });
      if (m.kind === "finalcap") items.push({ ...base, id: "final_cap:" + m.id, kind: "final_cap", action: "again", text: `финал: ${rb.limits.final_max} заходов без видео всех языков — жду «🔁 Ещё ${rb.limits.final_max} заходов»` });
    }
    for (const q of questions) items.push({ ...blank, id: "folder:" + q.id, kind: "folder", action: "folder", label: q.folder_name, text: "Папка на Диске: к какому выпуску?", question_id: q.id, at: q.created_at });
    items.push({ ...blank, id: "tokens:6", kind: "tokens", action: "episode", label: "🔭 Скрытая Физика · S06 «Почему небо синее»", text: "ждёт токенов Lumean: нужно 5200, осталось 340, подписка обновится 12.11", episode_id: 6 });
    return { items, count: items.length };
  }

  // файлы выпуска: у первого выпуска пакет собран почти целиком, DE без видео, PL без обложки
  function filesOf(id) {
    const e = st.episodes.find((x) => x.id === id), m = rbEps.find((x) => x.id === id);
    const pid = e ? e.project_id : m ? m.pid : 1;
    const required = (proj(pid) || {}).required_materials || ["cover", "meta", "srt", "chapters"];
    const code = e ? e.code : m ? m.code : "S01";
    const cell = (name, min) => ({ name, id: "f_" + name, modified: isoAgo(min) });
    const matrix = {};
    for (const l of langs) {
      const row = {
        script: null, tts: cell(code + "_" + l + "_tts.txt", 3900), voice: cell(code + "_" + l + "_tts.mp3", 3000), zip: cell(code + "_" + l + "_tts.zip", 3000),
        video: l === "de" ? null : cell(code + "_" + l + "_v1.mp4", 300), cover: l === "pl" ? null : cell(code + "_" + l + "_thumb.png", 320), srt: cell(code + "_" + l + ".srt", 300), meta: cell("metadata_" + code + ".md", 310),
      };
      for (const k of ["cover", "meta", "srt"]) if (!required.includes(k) && !row[k]) delete row[k]; // как materialsMatrix
      if (!required.includes("srt") && l === "ru") delete row.srt;
      matrix[l] = row;
    }
    return {
      episode_id: id, langs, required, drive: true, drive_error: null, matrix,
      unknown: [{ id: "u1", name: "монтаж старый.prproj", folder: "3_Готовое видео", modified: isoAgo(5000) }],
      drafts: [{ id: "d1", name: code + "_ru_черновик.mp4", folder: "3_Готовое видео", modified: isoAgo(900) }],
      orders: langs.map((l, i) => ({ id: 70 + i, lang: l, status: "uploaded", note: null, tokens: 960, redo: false, created_at: isoAgo(3100), updated_at: isoAgo(3000) })),
      progress: [
        { step: "render", lang: "ru", state: "done", note: null, updated_at: isoAgo(320) }, { step: "render", lang: "en", state: "done", note: null, updated_at: isoAgo(300) },
        { step: "render", lang: "de", state: "running", note: "кадр 8120 из 21000", updated_at: isoAgo(4) }, { step: "render", lang: "pl", state: "failed", note: "нет места на сервере", updated_at: isoAgo(90) },
        { step: "upload", lang: "ru", state: "done", note: null, updated_at: isoAgo(280) },
      ],
      steps: ["assets", "markup", "animation", "align", "render", "thumbnail", "metadata", "upload"].map((s, i) => ({ id: s, name: ["Материалы", "Разметка", "Анимация", "Тайминг", "Рендер", "Обложка", "Метаданные", "Заливка"][i] })),
      voice: { enabled: true, conflict: id === 6 ? ["dp_ru_tts.txt", "im_ru_tts.txt"] : null, stage: "done", langs },
    };
  }
  function voiceOrder(b) {
    adminOnly();
    if (b.lang && b.redo) return { text: "🔁 Переозвучиваю " + String(b.lang).toUpperCase() + ": mp3 появится на Диске минут через 10–20", queued: 1 };
    if (b.episode_id === 6) return { text: "В папке тексты двух роликов — оставь один: dp_ru_tts.txt, im_ru_tts.txt", queued: 0, refused: true };
    if (b.lang) return { text: "🤖 Озвучиваю " + String(b.lang).toUpperCase() + ": mp3 появятся на Диске минут через 10–20", queued: 1 };
    return { text: "🤖 Озвучиваю RU, EN, DE, PL, ES: mp3 появятся на Диске минут через 10–20", queued: 5 };
  }

  // календарь тем: у проекта 2 — темы, у остальных пусто (экран объясняет, что без календаря робот работает с «+ Выпуск»)
  let planId = 1;
  const plan = [
    { id: planId++, project_id: 2, publish_date: add(today, 12), title: "Переход Ганнибала через Альпы", notes: "3D", episode_id: null, status: "planned", created_at: isoAgo(5000) },
    { id: planId++, project_id: 2, publish_date: add(today, 16), title: "Битва при Гавгамелах", notes: null, episode_id: null, status: "planned", created_at: isoAgo(5000) },
    { id: planId++, project_id: 2, publish_date: add(today, 6), title: "Почему римляне строили лагерь каждый вечер", notes: null, episode_id: 2, status: "created", created_at: isoAgo(9000) },
  ];
  function planSave(b) {
    const title = String(b.title || "").trim();
    if (!title) throw new Error("Напиши тему");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.publish_date || "")) throw new Error("Неверная дата");
    if (plan.some((r) => r.id !== b.id && r.project_id === b.project_id && r.publish_date === b.publish_date && r.title === title)) throw new Error("Такая тема на эту дату уже есть");
    if (b.id) {
      const r = plan.find((x) => x.id === b.id && x.status === "planned");
      if (!r) throw new Error("Тема уже стала выпуском — меняй выпуск");
      Object.assign(r, { project_id: b.project_id, publish_date: b.publish_date, title, notes: b.notes || null });
      return { id: r.id };
    }
    const r = { id: planId++, project_id: b.project_id, publish_date: b.publish_date, title, notes: b.notes || null, episode_id: null, status: "planned", created_at: new Date().toISOString() };
    plan.push(r);
    return { id: r.id };
  }

  // вопросы по папкам и файлы, которые бот не привязал к выпуску
  let questions = [{
    id: 5, project_id: 1, folder_id: "qf1", folder_name: "Фарадей черновая", item_kind: "folder", candidate_ids: [1], created_at: isoAgo(140), project: "Скрытая Физика",
    candidates: [{ id: 1, label: "🔭 Скрытая Физика · S05 «Как Эратосфен измерил Землю палкой и тенью»" }],
  }];
  const unmatched = [{ file_id: "um1", project_id: 2, name: "финал_новый.mp4", kind: "video", created_at: isoAgo(600) }];

  function robotAction(action, b) {
    if (!st.me.is_owner) throw new Error("Пульт робота — только у владельца");
    switch (action) {
      case "robot.state": return robotState();
      case "robot.review": return reviewOf(Number(b.run_id));
      case "robot.decide": return decide(Number(b.run_id), b);
      case "robot.run": return runOp(b);
      case "robot.limits": rb.limits = checkLimits(b.value); return { ok: true, value: { ...rb.limits } };
      case "robot.history": return historyOf(Number(b.episode_id));
      case "robot.inbox": return inbox();
      case "robot.questions": return { questions: rbQuestions.filter((q) => q.status === "open" && (b.episode_id == null || q.episode_id === Number(b.episode_id))).map((q) => ({ ...questionView(q), episode_id: q.episode_id })) };
      case "robot.answer": return answerQuestion(b);
      case "robot.hosts": return { hosts: rb.hosts };
      case "robot.pause": {
        rb.paused = !!b.paused;
        let stopped = 0;
        if (rb.paused) for (const m of rbEps) { if (m.kind === "running") { m.kind = "stopped"; stopped++; } }
        else for (const m of rbEps) if (m.kind === "stopped" && !m.hold) m.kind = "waitnight";
        return { ok: true, stopped };
      }
      case "robot.project": {
        const p = proj(b.project_id);
        if (!p) throw new Error("Проект не найден");
        // включение: старые выпуски остаются людям (keepOldEpisodesManual) — в моке это выпуски без прогонок
        if (b.enabled && !p.runner_enabled) for (const m of rbEps) if (m.pid === p.id && !rbRuns(m).length) m.manual = true;
        p.runner_enabled = !!b.enabled;
        if (!p.runner_enabled) for (const m of rbEps) if (m.pid === p.id && m.kind === "running") m.kind = "stopped";
        return { ok: true };
      }
      case "robot.episode": {
        const m = rbEps.find((x) => x.id === b.episode_id);
        if (!m) throw new Error("Выпуск не найден");
        // «Веду сам» снимает открытые вопросы, как на сервере: выпуск не должен висеть
        if (b.op === "mine") { const stopped = m.kind === "running" ? 1 : 0; m.manual = true; if (stopped) m.kind = "stopped"; for (const q of rbQuestions) if (q.episode_id === m.id && q.status === "open") q.status = "cancelled"; return { ok: true, stopped }; }
        if (b.op === "give") { m.manual = false; return { ok: true, stopped: 0 }; }
        if (b.op === "accept") return { ok: true, text: "Приёмку прогонит ПК при следующем заходе" };
        if (b.op === "hold") { m.hold = true; if (m.kind === "running") m.kind = "stopped"; }
        else if (b.op === "release") { m.hold = false; if (m.kind === "stopped") m.kind = "waitnight"; }
        else if (b.op === "now") { m.until = new Date(Date.now() + 12 * HOUR).toISOString(); m.hold = false; if (m.kind === "stopped") m.kind = "waitnight"; }
        else if (b.op === "night") m.until = null;
        else throw new Error("Неизвестная операция");
        return { ok: true };
      }
      case "robot.until": {
        const v = b.until ?? null;
        if (v !== null && !UNTILS.includes(v)) throw new Error("until: " + UNTILS.join(", ") + " или null");
        if (b.episode_id != null) {
          const m = rbEps.find((x) => x.id === Number(b.episode_id));
          if (!m) throw new Error("Выпуск " + b.episode_id + " не найден");
          m.own = v;
          return { ok: true };
        }
        const p = proj(Number(b.project_id));
        if (!p) throw new Error("Проект " + b.project_id + " не найден");
        const prev = rbUntil[p.id] || "end";
        // живые выпуски без своего предела сохраняют прежний предел проекта своим; новый — только для новых
        if (prev !== (v || "end")) for (const m of rbEps) if (m.pid === p.id && !m.own) m.own = prev;
        rbUntil[p.id] = v;
        return { ok: true };
      }
    }
  }

  // ---- вход из браузера (&browser=1): зеркало auth.* и отказа 401 ----
  // &nodomain=1 — вход не настроен; &stranger=1 — не участник; &ttl=N — сессия на N секунд; &realwidget=1 — настоящий виджет Telegram
  // токен: mock.<срок>.<tg_id>.<эпоха>; эпохи — как settings.session_epochs: «Выйти везде» поднимает только свою
  const AUTH_KEY = "yt.session", EPOCHS_KEY = "yt.mock_epochs";
  const authError = (status, message) => Object.assign(new Error(message), { status });
  const mockEpochs = () => { try { return JSON.parse(localStorage.getItem(EPOCHS_KEY)) || {}; } catch (_) { return {}; } };
  const mockSession = () => {
    try {
      const [tag, exp, id, epoch] = (localStorage.getItem(AUTH_KEY) || "").split(".");
      return tag === "mock" && Number(exp) > Date.now() && Number(epoch) === (mockEpochs()[id] || 0) ? id : null;
    } catch (_) { return null; }
  };
  function authAction(action, b) {
    if (action === "auth.config") {
      if (qsm.has("nodomain")) return { bot: null };
      return qsm.has("realwidget") ? { bot: "BotFather" } : { bot: "mock_team_bot", fake: true };
    }
    if (action === "auth.logout") {
      if (!b.everywhere) return { ok: true };
      const id = mockSession();
      if (!id) throw authError(401, "Вход истёк, войди снова");
      const epochs = mockEpochs();
      localStorage.setItem(EPOCHS_KEY, JSON.stringify({ ...epochs, [id]: (epochs[id] || 0) + 1 }));
      return { ok: true };
    }
    if (qsm.has("stranger")) throw authError(403, "Ты не в группе команды: вступи в неё или попроси админа, потом войди снова");
    const exp = Date.now() + (Number(qsm.get("ttl")) || 7 * 86400) * 1000;
    return { session: `mock.${exp}.${st.me.tg_id}.${mockEpochs()[st.me.tg_id] || 0}`, member: { tg_id: st.me.tg_id, name: st.me.name } };
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  window.MOCK_API = async function (action, b) {
    await new Promise((r) => setTimeout(r, 120));
    if (action.startsWith("auth.")) return authAction(action, b);
    if (qsm.has("browser") && !mockSession()) {
      window.dispatchEvent(new Event("yt:unauthorized"));
      throw authError(401, "Вход истёк, войди снова");
    }
    if (action.startsWith("robot.")) return clone(robotAction(action, b));
    switch (action) {
      // как на сервере: путь папки на ПК участникам не отдаётся — только признак linked
      case "state": return clone({ ...st, today, upload_today: uploadToday(), archived_projects: st.archived_projects.map(({ id, name, emoji }) => ({ id, name, emoji })), projects: st.projects.map(({ local_dir, ...p }) => ({ ...p, linked: !!local_dir })) });
      case "episode.files": return clone(filesOf(Number(b.episode_id)));
      case "voice.order": return voiceOrder(b);
      case "plan.list": adminOnly(); return clone({ rows: plan.filter((r) => r.status !== "skipped" && (!b.project_id || r.project_id === b.project_id)) });
      case "plan.save": adminOnly(); return planSave(b);
      case "plan.delete": {
        adminOnly();
        const r = plan.find((x) => x.id === b.id);
        if (!r || r.status !== "planned") throw new Error("Тема уже стала выпуском — удали выпуск");
        r.status = "skipped";
        return {};
      }
      case "folder.list": adminOnly(); return clone({ questions, unmatched });
      case "folder.answer": {
        adminOnly();
        const q = questions.find((x) => x.id === b.id);
        if (!q) throw new Error("Вопрос не найден");
        questions = questions.filter((x) => x !== q);
        const name = "Папка «" + q.folder_name + "»";
        return { text: b.choice === "x" ? name + " — игнорирую" : b.choice === "n" ? name + " → новый выпуск" : name + " → выпуск " + b.choice };
      }
      case "project.restore": {
        adminOnly();
        const p = st.archived_projects.find((x) => x.id === b.id);
        if (p) { st.archived_projects = st.archived_projects.filter((x) => x !== p); st.projects.push(p); }
        return {};
      }
      case "member.remove": adminOnly(); ownerGuard(b.tg_id, true); st.members = st.members.filter((m) => m.tg_id !== b.tg_id); return {};
      case "episode.suggest": {
        const p = proj(b.project_id);
        const last = st.episodes.filter((e) => e.project_id === p.id).map((e) => e.publish_date).sort().pop();
        const early = add(today, p.script_offset);
        const date = last ? [add(last, p.cadence_days), early].sort().pop() : early;
        const pub = b.publish_date || date;
        // ничейная папка с похожим названием: её номер не занят, выпуск возьмёт её, а не создаст новую
        const folder = b.title && orphans.find((o) => o.project_id === p.id && similarity(b.title, o.name) >= 0.6);
        return {
          publish_date: date, code: p.id === 3 ? "11" : nextCode(p, folder && folder.id), drive: !!p.drive_folder_id,
          ...(folder ? { folder: { id: folder.id, name: folder.name } } : {}), compressed: isCompressed(p, pub),
        };
      }
      case "episode.create": return { id: createEpisode(b).id };
      case "episode.update": {
        const e = st.episodes.find((x) => x.id === b.id);
        if (b.code != null) { const code = normCode(b.code); assertCodeFree(proj(e.project_id), code, e.id); e.code = code; }
        if (b.title != null) e.title = b.title;
        if (b.notes != null) e.notes = b.notes;
        if (b.publish_date != null) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(b.publish_date)) throw new Error("Неверная дата");
          if (b.publish_date !== e.publish_date) reschedule(e, b.publish_date);
        }
        return {};
      }
      case "episode.delete": st.episodes = st.episodes.filter((e) => e.id !== b.id); st.tasks = st.tasks.filter((t) => t.episode_id !== b.id); return { folder: "trashed" };
      case "tasks.done": {
        // как на сервере: меняются только задачи не в нужном состоянии — уже отмеченные другим не считаются
        // G13: этапы ведомого выпуска до выкладки вручную отмечает только владелец
        for (const t of st.tasks.filter((x) => b.ids.includes(x.id))) {
          const e = st.episodes.find((x) => x.id === t.episode_id), p = e && proj(e.project_id);
          if (t.stage !== "upload" && p && p.runner_enabled && !e.robot_manual && !st.me.is_owner) throw new Error("Этап «" + ({ script: "Сценарий", voice: "Озвучка", edit: "Монтаж" })[t.stage] + "» у выпуска робота закрывают файлы или владелец");
        }
        const ts = st.tasks.filter((t) => b.ids.includes(t.id) && !!t.done_at !== !!b.done);
        ts.forEach((t) => { t.done_at = b.done ? new Date().toISOString() : null; t.done_by = b.done ? st.me.tg_id : null; });
        if (b.done && ts.length) afterDone([...new Set(ts.map((t) => t.episode_id))]);
        return { changed: ts.length, ids: ts.map((t) => t.id) };
      }
      case "tasks.assign": {
        const ts = st.tasks.filter((t) => b.ids.includes(t.id));
        ts.forEach((t) => { if ("assignee_id" in b) t.assignee_id = b.assignee_id; if ("due_date" in b) t.due_date = b.due_date; });
        // срок «Выкладки» = дата выхода: двигаем выпуск общим путём, остальные открытые этапы пересчитываются
        if (b.due_date) {
          for (const id of [...new Set(ts.filter((t) => t.stage === "upload").map((t) => t.episode_id))]) {
            const e = st.episodes.find((x) => x.id === id);
            reschedule(e, add(b.due_date, proj(e.project_id).upload_offset));
          }
        }
        return {};
      }
      case "link.add": st.links.push({ id: lid++, episode_id: b.episode_id, stage: b.stage || null, url: b.url, title: b.title || null }); return {};
      case "link.delete": st.links = st.links.filter((l) => l.id !== b.id); return {};
      case "project.save": {
        // серверные проверки: пустое или дробное число — 400 с понятным полем
        const int = (v, min) => typeof v === "number" && Number.isInteger(v) && v >= min;
        if (!int(b.cadence_days, 1)) throw new Error("Выпуск каждые N дней — целое число от 1");
        for (const s of STAGES) if (!int(b[s + "_offset"], 0)) throw new Error("Срок этапа «" + ({ script: "Сценарий", voice: "Озвучка", edit: "Монтаж", upload: "Выкладка" })[s] + "» — целое число от 0");
        if (b.voice_days != null && !int(b.voice_days, 0)) throw new Error("Озвучка после сценария — целое число от 0 или пусто");
        let p = st.projects.find((x) => x.id === b.id);
        if (!p) { p = { id: Math.max(...st.projects.map((x) => x.id)) + 1, thread_id: null }; st.projects.push(p); }
        if (!st.me.is_admin) throw new Error("Только для админа команды");
        for (const k of ["name", "emoji", "cadence_days", "script_offset", "voice_offset", "edit_offset", "upload_offset", "voice_days", "color"]) p[k] = b[k];
        // как на сервере: переключатель робота — только владельцу, чужое значение игнорируется
        if (b.runner_enabled !== undefined && st.me.is_owner) {
          if (b.runner_enabled && !p.runner_enabled) for (const m of rbEps) if (m.pid === p.id && !rbRuns(m).length) m.manual = true;
          p.runner_enabled = !!b.runner_enabled;
        }
        // что обязательно в пакете языка: null — всё; только владелец
        if (b.required_materials !== undefined && st.me.is_owner) {
          const all = ["cover", "meta", "srt", "chapters"];
          if (b.required_materials !== null && (!Array.isArray(b.required_materials) || b.required_materials.some((x) => !all.includes(x)))) throw new Error("Обязательные материалы: " + all.join(", "));
          p.required_materials = b.required_materials;
        }
        p.drive_folder_id = (String(b.drive_folder || "").match(/folders\/([\w-]+)/) || [])[1] || null;
        const removed = st.channels.filter((c) => c.project_id === p.id && !b.channels.some((x) => x.id === c.id)).map((c) => c.id);
        st.channels = st.channels.filter((c) => !removed.includes(c.id));
        st.tasks = st.tasks.filter((t) => !removed.includes(t.channel_id)); // каскад: задачи удалённого канала уходят вместе с ним
        const fresh = [];
        b.channels.forEach((c, i) => { const ex = st.channels.find((x) => x.id === c.id); if (ex) Object.assign(ex, c, { sort: i }); else { const nc = { ...c, id: cid++, project_id: p.id, sort: i }; st.channels.push(nc); fresh.push(nc); } });
        // addChannelTasks: новый канал получает выкладку у всех выпусков, где она ещё не закрыта
        for (const nc of fresh) {
          for (const e of st.episodes.filter((x) => x.project_id === p.id)) {
            const ups = st.tasks.filter((t) => t.episode_id === e.id && t.stage === "upload");
            if (!ups.length || ups.every((t) => t.done_at)) continue;
            st.tasks.push({ id: tid++, episode_id: e.id, stage: "upload", channel_id: nc.id, assignee_id: roleOf(p.id, "upload"), due_date: scheduleFor(p, e.publish_date).upload, done_at: null });
          }
        }
        for (const s of STAGES) { st.roles = st.roles.filter((r) => !(r.project_id === p.id && r.stage === s)); st.roles.push({ project_id: p.id, stage: s, member_id: b.roles[s] }); }
        return { id: p.id };
      }
      case "stats": {
        const k = b.days / 30;
        const pids = b.project_id ? [b.project_id] : st.projects.map((p) => p.id);
        const base = { ru: 12000, en: 8100, de: 900, pl: 300, es: 4000 };
        const channels = st.channels.filter((c) => pids.includes(c.project_id)).map((c) => ({
          channel_id: c.id, project_id: c.project_id, lang: c.lang,
          subscribers: Math.round(base[c.lang] * 3 / c.project_id), totalViews: base[c.lang] * 40,
          // у третьего проекта истории ещё нет — видна медиана ролика вместо прироста
          subsDelta: c.project_id === 3 ? null : Math.round(base[c.lang] / 100 * k), viewsDelta: c.project_id === 3 ? null : Math.round(base[c.lang] * k / c.project_id),
          deltaDays: c.project_id === 3 ? 0 : Math.min(b.days, 21), videosInPeriod: Math.max(1, Math.round(4 * k)),
          median: Math.round(base[c.lang] / 4), medianKind: c.project_id === 1 ? "d7" : "total",
        }));
        const ep = (id, code, title, pid, d, mult) => ({
          episode_id: id, project_id: pid, code, title, published: add(today, -d) + "T10:00:00Z",
          langs: langs.map((l, i) => ({ lang: l, video_id: "dQw4w9WgXcQ", views: Math.round(base[l] * mult), d7: d >= 7 ? Math.round(base[l] * mult * 0.7) : null })),
          total: 0,
        });
        const episodes = [ep(4, "S04", "Ньютон и яблоко: что было на самом деле", 1, 2, 0.4), ep(90, "S03", "Почему небо синее, а закат красный", 1, 9, 1.1), ep(91, "11", "Every Weird Fractal", 3, 15, 0.8)]
          .filter((e) => pids.includes(e.project_id)).map((e) => ({ ...e, total: e.langs.reduce((n, l) => n + l.views, 0) }));
        const n = (x) => Math.max(0, Math.round(x * k));
        return {
          today, from: add(today, -(b.days - 1)), to: today, days: b.days,
          team: {
            released: n(3), uploads: n(15), overdueNow: 2, cycleDays: 6.5,
            stages: [
              { stage: "script", closed: n(4), onTime: n(4), avgLate: null },
              { stage: "voice", closed: n(4), onTime: n(3), avgLate: 1.5 },
              { stage: "edit", closed: n(3), onTime: n(2), avgLate: 2 },
              { stage: "upload", closed: n(3), onTime: n(3), avgLate: null },
            ],
            phases: [{ stage: "voice", days: 0.8 }, { stage: "edit", days: 3.1 }, { stage: "upload", days: 2.6 }],
            members: [{ id: 1, name: "Нигмат", closed: n(7), late: 1, overdueNow: 0 }, { id: 2, name: "Павел", closed: n(7), late: 1, overdueNow: 2 }],
          },
          channels, episodes,
          youtube: { enabled: true, last_day: today, videos: 412 },
          health: {
            drive: { fails: 0 }, stats: { fails: 0 }, morning: { fails: 0 },
            youtube: { fails: 4, error: "pl: лента 404", alerted: true },
          },
        };
      }
      case "drive.folders": return { folders: [{ id: "f1", name: "Youtube channel #2" }, { id: "f2", name: "Космос_за_5_минут" }] };
      case "topics.set": {
        st.topics = st.topics.filter((t) => !(t.project_id === b.project_id && t.kind === b.kind) && t.thread_id !== b.thread_id);
        let th = b.thread_id;
        if (th === "new") { th = 100 + st.group_topics.length; st.group_topics.push({ thread_id: th, name: "новая тема " + th }); }
        if (th) st.topics.push({ project_id: b.project_id, kind: b.kind, thread_id: th });
        return {};
      }
      case "topics.create_missing":
        for (const k of ["script", "voice", "video"]) {
          if (st.topics.some((t) => t.project_id === b.project_id && t.kind === k)) continue;
          const th = 100 + st.group_topics.length;
          st.group_topics.push({ thread_id: th, name: "новая тема " + th });
          st.topics.push({ project_id: b.project_id, kind: k, thread_id: th });
        }
        return {};
      case "project.archive": adminOnly(); st.archived_projects.push(...st.projects.filter((p) => p.id === b.id)); st.projects = st.projects.filter((p) => p.id !== b.id); return {};
      case "settings.save": {
        // пояс сдвигает ночь робота: при заданном владельце меняет только он
        if (b.timezone && b.timezone !== st.settings.timezone && !st.me.is_owner && !noOwner) throw new Error("Часовой пояс двигает робота — меняет владелец");
        const hour = (v) => Number.isInteger(v) && v >= 0 && v <= 23;
        if (!hour(b.morning_hour) || !hour(b.evening_hour)) throw new Error("Час — число от 0 до 23");
        if (b.morning_hour >= b.evening_hour) throw new Error("Утро должно быть раньше вечера");
        try { new Intl.DateTimeFormat("ru", { timeZone: b.timezone }); } catch (_) { throw new Error("Неизвестный часовой пояс"); }
        Object.assign(st.settings, { timezone: b.timezone, morning_hour: b.morning_hour, evening_hour: b.evening_hour });
        return {};
      }
      case "member.update": {
        const m = st.members.find((x) => x.tg_id === b.tg_id);
        if (b.is_admin !== undefined && st.me.is_admin) ownerGuard(b.tg_id, !b.is_admin);
        if (b.name) m.name = b.name;
        if (b.is_admin !== undefined && st.me.is_admin) m.is_admin = !!b.is_admin;
        if (b.timezone !== undefined) {
          if (!st.me.is_owner) throw new Error("Часовой пояс участника меняет владелец");
          const tz = String(b.timezone || "").trim();
          if (tz) try { new Intl.DateTimeFormat("ru", { timeZone: tz }); } catch (_) { throw new Error("Неизвестный часовой пояс"); }
          m.timezone = tz || null;
        }
        return {};
      }
      default: throw new Error("mock: " + action);
    }
  };
})();
