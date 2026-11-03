// Демо-режим для проверки интерфейса без Telegram и сервера: открыть index.html?mock=1
(function () {
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = iso(new Date());
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const STAGES = ["script", "voice", "edit", "upload"];
  const langs = ["ru", "en", "de", "pl", "es"];

  // ?viewer=admin — админ, но не владелец: вкладки «🤖» нет, robot.* отвечают 403, чекбокса «Робот на ПК» в проекте нет
  const asAdmin = new URLSearchParams(location.search).get("viewer") === "admin";
  const st = {
    me: asAdmin
      ? { tg_id: 3, name: "Админ", username: "admin2", is_admin: true, can_dm: true, is_owner: false }
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
  const FAIL_NOTE = "Прогонка закончилась без стоп-кадров (no_checkpoint).\nПоследние строки журнала:\n[02:41] сцена 9: нет файла озвучки de\n[02:41] claude завершился с кодом 0";
  // выпуски робота: kind — running | review | waitnight | voicewait | failed | stopped | done
  const rbEps = [
    { id: 2, pid: 2, label: "⚔️ Тактика Боя · S06 «Почему римляне строили лагерь каждый вечер»", code: "S06", pub: add(today, 1), kind: "running", hold: false, until: null },
    { id: 1, pid: 1, label: "🔭 Скрытая Физика · S05 «Как Эратосфен измерил Землю палкой и тенью»", code: "S05", pub: add(today, 3), kind: "review", hold: false, until: null },
    { id: 5, pid: 2, label: "⚔️ Тактика Боя · S07 «Фаланга против легиона» · 3D", code: "S07", pub: add(today, 5), kind: "waitnight", hold: false, until: null },
    { id: 6, pid: 1, label: "🔭 Скрытая Физика · S06 «Почему небо синее»", code: "S06", pub: add(today, 8), kind: "voicewait", hold: true, until: null },
    { id: 7, pid: 2, label: "⚔️ Тактика Боя · S05 «Битва при Каннах»", code: "S05", pub: add(today, 2), kind: "failed", hold: false, until: null },
    // «Робот ведёт до: Озвучка» — сценарий и озвучку сделал робот, монтаж твой
    { id: 8, pid: 1, label: "🔭 Скрытая Физика · S07 «Почему лёд скользкий»", code: "S07", pub: add(today, 6), kind: "limit", hold: false, until: null, own: "voice" },
  ];
  // «Робот ведёт до»: own — свой предел выпуска (null — как у проекта), rbUntil — предел проекта (null — «Конец»)
  const UNTILS = ["script", "voice", "montage", "end"];
  const PHASES = ["script", "voice", "montage", "changes", "final"];
  const UNTIL_LAST = { script: 0, voice: 1, montage: 3, end: 4 };
  const UNTIL_GEN = { script: "сценария", voice: "озвучки", montage: "монтажа", end: "конца" };
  const PHASE_NAME = { script: "сценарий", voice: "озвучка", montage: "монтаж", changes: "правки", final: "финал" };
  const rbUntil = {};
  const untilOf = (m) => m.own || rbUntil[m.pid] || "end";
  const allowedPhase = (ph, u) => PHASES.indexOf(ph) <= UNTIL_LAST[u];
  // следующая фаза, которую робот взял бы (null — идёт, ждёт проверки или ждёт файлов)
  const NEXT_PHASE = { waitnight: "montage", failed: "montage", stopped: "montage", limit: "montage" };
  const STEP_PHASE = { script: "script", voice: "voice", montage: "montage", review: "montage", changes: "changes", final: "final" };
  const rbDone = [{ id: 4, pid: 1, label: "🔭 Скрытая Физика · S04 «Ньютон и яблоко: что было на самом деле»", code: "S04", pub: add(today, -2) }];
  const MODEL = { model: "claude-opus-5-5", model_label: "Opus 5.5" };
  const heartbeat = () => (qsm.has("nopulse") ? isoAgo(23) : isoAgo(((Date.now() / 1000) % 150) / 60));

  function rbRun(m) {
    const base = { id: 30 + m.id, host: "NIGMAT-PC", ...MODEL, log_tail: null, log_at: null, note: null };
    switch (m.kind) {
      case "running": return { ...base, phase: "montage", part: 3, status: "running", started_at: isoAgo(47), heartbeat_at: heartbeat(), log_tail: LOG, log_at: isoAgo(1) };
      case "review": return { ...base, phase: "montage", part: 3, status: "review", started_at: isoAgo(380), heartbeat_at: isoAgo(330), note: "Монтаж готов, стоп-кадры отправлены в личку владельцу." };
      case "stopped": return { ...base, phase: "montage", part: 3, status: "stopped", started_at: isoAgo(70), heartbeat_at: isoAgo(3), note: "остановил владелец" };
      case "failed": return { ...base, phase: "montage", part: 1, status: "failed", started_at: isoAgo(420), heartbeat_at: isoAgo(400), note: FAIL_NOTE };
      case "limit": return { ...base, phase: "voice", part: 1, status: "done", started_at: isoAgo(1500), heartbeat_at: isoAgo(1490), note: "Озвучка заказана и принята." };
      case "waitnight": return { ...base, phase: "voice", part: 1, status: "done", host: "NIGMAT-PC", model: null, model_label: "модель не указана", started_at: isoAgo(900), heartbeat_at: isoAgo(890), note: "Озвучка заказана и принята." };
      default: return null;
    }
  }
  function rbTrack(m, allowed, paused) {
    const S = (key, title, state, detail = null) => ({ key, title, state, detail });
    const steps = (v) => [
      S("topic", "Тема", "done", m.code), S("script", "Сценарий", ...v.script), S("voice", "Озвучка", ...v.voice), S("montage", "Монтаж", ...v.montage),
      S("review", "Проверка", ...v.review), S("changes", "Правки", ...v.changes), S("final", "Финал", ...v.final), S("upload", "Выкладка", ...v.upload),
    ];
    const todo = ["todo"];
    const front = { script: ["done", "5 языков"], voice: ["done", "5 из 5"] };
    switch (m.kind) {
      case "running": return steps({ ...front, montage: paused ? ["wait", "остановлена"] : ["active", "часть 3"], review: todo, changes: todo, final: todo, upload: todo });
      case "stopped": return steps({ ...front, montage: ["wait", "остановлена · часть 3"], review: todo, changes: todo, final: todo, upload: todo });
      case "review": return steps({ ...front, montage: ["done", "3 части"], review: ["wait", "ждёт тебя 5 ч"], changes: todo, final: todo, upload: todo });
      case "waitnight": return steps({ ...front, montage: ["wait", allowed ? "днём разрешено" : "ждёт ночи 1:00–8:00"], review: todo, changes: todo, final: todo, upload: todo });
      case "voicewait": return steps({ script: ["done", "5 языков"], voice: ["wait", "ждёт озвучку: 2 из 5"], montage: todo, review: todo, changes: todo, final: todo, upload: todo });
      case "failed": return steps({ ...front, montage: ["fail", "нет стоп-кадров"], review: todo, changes: todo, final: todo, upload: todo });
      case "limit": return steps({ ...front, montage: ["wait"], review: todo, changes: todo, final: todo, upload: todo });
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
    const lim = limitOf(m);
    if (lim) return { where: `✋ дальше твоё: ${PHASE_NAME[lim.phase]} (робот ведёт до ${UNTIL_GEN[lim.until]})`, tone: "stop" };
    if (m.kind === "limit") return { where: "⏳ возьмёт при следующем заходе: монтаж", tone: "wait" };
    if (rb.paused) return { where: "⏸ робот остановлен — выпуск ждёт запуска", tone: "stop" };
    switch (m.kind) {
      case "running": return { where: "🤖 делает: монтаж, часть 3 · ПК NIGMAT-PC", tone: "work" };
      case "review": return { where: "👀 ждёт твоей проверки 5 ч", tone: "owner" };
      case "waitnight": return allowed ? { where: "☀️ днём разрешено — ждёт захода ytbot run", tone: "wait" } : { where: "⏳ ждёт ночи (1:00–8:00)", tone: "wait" };
      case "voicewait": return { where: "⏳ ждёт озвучку: 2 из 5 языков", tone: "wait" };
      case "failed": return { where: "❌ упал: нет стоп-кадров, повтор через 1 ч", tone: "fail" };
      case "stopped": return { where: "⏹ остановлена: прогонку остановили", tone: "stop" };
      default: return { where: "", tone: "wait" };
    }
  }
  function rbPanelEp(m) {
    const allowed = !!m.until && Date.parse(m.until) > Date.now();
    const w = rbWhere(m, allowed);
    const u = untilOf(m);
    // шаги за пределом робота — «вручную» (как robotTrack на сервере)
    const track = rbTrack(m, allowed, rb.paused).map((x) => {
      const ph = STEP_PHASE[x.key];
      return ph && !allowedPhase(ph, u) && !x.detail ? { ...x, detail: "вручную" } : x;
    });
    return {
      id: m.id, project_id: m.pid, label: m.label, publish_date: m.pub, hold: m.hold, now_until: allowed ? m.until : null,
      robot_until: u, robot_until_own: m.own || null,
      ...w, track, run: rbRun(m),
    };
  }
  function rbDoneEp(m) {
    const S = (key, title, state, detail = null) => ({ key, title, state, detail });
    return {
      id: m.id, project_id: m.pid, label: m.label, publish_date: m.pub, hold: false, now_until: null, robot_until: rbUntil[m.pid] || "end", robot_until_own: null,
      where: "✅ выложен " + m.pub, tone: "done",
      track: [S("topic", "Тема", "done", m.code), S("script", "Сценарий", "done"), S("voice", "Озвучка", "done", "5 из 5"), S("montage", "Монтаж", "done", "2 части"),
        S("review", "Проверка", "done"), S("changes", "Правки", "skip", "правок не было"), S("final", "Финал", "done", "заход 1 из 12"), S("upload", "Выкладка", "done", m.pub)],
      run: { id: 99, phase: "final", part: 1, status: "done", host: "NIGMAT-PC", ...MODEL, started_at: isoAgo(3000), heartbeat_at: isoAgo(2990), log_tail: null, log_at: null, note: "Финал собран, ролик залит на Диск." },
    };
  }
  function robotState() {
    const enabled = new Set(st.projects.filter((p) => p.runner_enabled).map((p) => p.id));
    const eps = qsm.has("emptyrobot") || !enabled.size ? [] : rbEps.filter((m) => enabled.has(m.pid)).map(rbPanelEp);
    const dn = qsm.has("emptyrobot") || !enabled.size ? [] : rbDone.filter((m) => enabled.has(m.pid)).map(rbDoneEp);
    const h = hourIn(st.settings.timezone);
    return {
      paused: rb.paused, owner: { tg_id: 1, name: "Нигмат" }, now: new Date().toISOString(), night: h >= 1 && h < 8, night_window: "1:00–8:00",
      pc_seen_at: qsm.has("emptyrobot") ? null : isoAgo(rb.seen),
      projects: st.projects.map((p) => ({ id: p.id, name: p.name, runner_enabled: !!p.runner_enabled, linked: !!p.local_dir, seen_at: p.local_dir && !qsm.has("emptyrobot") ? isoAgo(rb.seen + p.id) : null, robot_until: rbUntil[p.id] || null })),
      episodes: eps, done: dn,
    };
  }
  function robotAction(action, b) {
    if (!st.me.is_owner) throw new Error("Пульт робота — только у владельца");
    switch (action) {
      case "robot.state": return robotState();
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
        p.runner_enabled = !!b.enabled;
        if (!p.runner_enabled) for (const m of rbEps) if (m.pid === p.id && m.kind === "running") m.kind = "stopped";
        return { ok: true };
      }
      case "robot.episode": {
        const m = rbEps.find((x) => x.id === b.episode_id);
        if (!m) throw new Error("Выпуск не найден");
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

  const clone = (x) => JSON.parse(JSON.stringify(x));
  window.MOCK_API = async function (action, b) {
    await new Promise((r) => setTimeout(r, 120));
    if (action.startsWith("robot.")) return clone(robotAction(action, b));
    switch (action) {
      // как на сервере: путь папки на ПК участникам не отдаётся — только признак linked
      case "state": return clone({ ...st, today, projects: st.projects.map(({ local_dir, ...p }) => ({ ...p, linked: !!local_dir })) });
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
        const ts = st.tasks.filter((t) => b.ids.includes(t.id) && !!t.done_at !== !!b.done);
        ts.forEach((t) => (t.done_at = b.done ? "x" : null));
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
        if (b.runner_enabled !== undefined && st.me.is_owner) p.runner_enabled = !!b.runner_enabled;
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
      case "project.archive": st.projects = st.projects.filter((p) => p.id !== b.id); return {};
      case "settings.save": {
        const hour = (v) => Number.isInteger(v) && v >= 0 && v <= 23;
        if (!hour(b.morning_hour) || !hour(b.evening_hour)) throw new Error("Час — число от 0 до 23");
        if (b.morning_hour >= b.evening_hour) throw new Error("Утро должно быть раньше вечера");
        try { new Intl.DateTimeFormat("ru", { timeZone: b.timezone }); } catch (_) { throw new Error("Неизвестный часовой пояс"); }
        Object.assign(st.settings, { timezone: b.timezone, morning_hour: b.morning_hour, evening_hour: b.evening_hour });
        return {};
      }
      case "member.update": Object.assign(st.members.find((m) => m.tg_id === b.tg_id), { name: b.name }); return {};
      default: throw new Error("mock: " + action);
    }
  };
})();
