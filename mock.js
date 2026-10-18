// Демо-режим для проверки интерфейса без Telegram и сервера: открыть index.html?mock=1
(function () {
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = iso(new Date());
  const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const STAGES = ["script", "voice", "edit", "upload"];
  const langs = ["ru", "en", "de", "pl", "es"];

  const st = {
    me: { tg_id: 1, name: "Нигмат", username: "SNigmat", is_admin: true, can_dm: true },
    members: [
      { tg_id: 1, name: "Нигмат", username: "SNigmat", is_admin: true, can_dm: true },
      { tg_id: 2, name: "Павел", username: "pavel", is_admin: false, can_dm: false },
    ],
    projects: [
      { id: 1, name: "Скрытая Физика", emoji: "🔭", thread_id: null, drive_folder_id: "1_i-_n5wWFz_ZONW5ksUO7F08V3hQrXRq", voice_days: 0, cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, sort: 1 },
      { id: 2, name: "Тактика Боя", emoji: "⚔️", thread_id: 12, cadence_days: 7, script_offset: 7, voice_offset: 5, edit_offset: 3, upload_offset: 0, sort: 2 },
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

  function createEpisode(b) {
    const p = st.projects.find((x) => x.id === b.project_id);
    const codes = st.episodes.filter((e) => e.project_id === p.id).map((e) => +(e.code.match(/\d+/) || [0])[0]);
    const e = { id: eid++, project_id: p.id, drive_folder_id: "demo" + eid, code: b.code || "S" + String(Math.max(0, ...codes) + 1).padStart(2, "0"), title: b.title, publish_date: b.publish_date || add(today, 7), notes: null };
    st.episodes.push(e);
    for (const s of STAGES) {
      const due = add(e.publish_date, -p[s + "_offset"]);
      const assignee_id = (st.roles.find((r) => r.project_id === p.id && r.stage === s) || {}).member_id ?? null;
      if (s !== "upload") st.tasks.push({ id: tid++, episode_id: e.id, stage: s, channel_id: null, assignee_id, due_date: due, done_at: null });
      else for (const c of st.channels.filter((c) => c.project_id === p.id)) st.tasks.push({ id: tid++, episode_id: e.id, stage: s, channel_id: c.id, assignee_id, due_date: due, done_at: null });
    }
    return e;
  }
  const done = (eId, stage, n) => st.tasks.filter((t) => t.episode_id === eId && t.stage === stage).slice(0, n ?? 99).forEach((t) => (t.done_at = "x"));

  const e1 = createEpisode({ project_id: 1, title: "Как Эратосфен измерил Землю палкой и тенью", publish_date: add(today, 3) });
  done(e1.id, "script");
  st.links.push({ id: lid++, episode_id: e1.id, stage: "script", url: "https://drive.google.com/drive/folders/demo", title: "Сценарий" });
  const e2 = createEpisode({ project_id: 2, title: "Почему римляне строили лагерь каждый вечер", publish_date: add(today, 6) });
  const e3 = createEpisode({ project_id: 3, title: "Ровно 5 мест, где можно припарковаться в космосе", publish_date: add(today, 1) });
  done(e3.id, "script"); done(e3.id, "voice"); done(e3.id, "edit"); done(e3.id, "upload", 2);
  const e4 = createEpisode({ project_id: 1, title: "Ньютон и яблоко: что было на самом деле", publish_date: add(today, -2) });
  for (const s of STAGES) done(e4.id, s);
  createEpisode({ project_id: 2, title: "Фаланга против легиона", publish_date: add(today, 13) });
  void e2;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  window.MOCK_API = async function (action, b) {
    await new Promise((r) => setTimeout(r, 120));
    switch (action) {
      case "state": return clone({ ...st, today });
      case "episode.suggest": return { publish_date: add(today, 7), code: b.project_id === 3 ? "11" : "S0" + (st.episodes.filter((e) => e.project_id === b.project_id).length + 1), drive: true };
      case "episode.create": return { id: createEpisode(b).id };
      case "episode.update": Object.assign(st.episodes.find((e) => e.id === b.id), Object.fromEntries(Object.entries(b).filter(([k]) => k !== "action" && k !== "id"))); return {};
      case "episode.delete": st.episodes = st.episodes.filter((e) => e.id !== b.id); st.tasks = st.tasks.filter((t) => t.episode_id !== b.id); return { folder: "trashed" };
      case "tasks.done": st.tasks.filter((t) => b.ids.includes(t.id)).forEach((t) => (t.done_at = b.done ? "x" : null)); return { changed: b.ids.length };
      case "tasks.assign": st.tasks.filter((t) => b.ids.includes(t.id)).forEach((t) => { if ("assignee_id" in b) t.assignee_id = b.assignee_id; if ("due_date" in b) t.due_date = b.due_date; }); return {};
      case "link.add": st.links.push({ id: lid++, episode_id: b.episode_id, stage: b.stage || null, url: b.url, title: b.title || null }); return {};
      case "link.delete": st.links = st.links.filter((l) => l.id !== b.id); return {};
      case "project.save": {
        let p = st.projects.find((x) => x.id === b.id);
        if (!p) { p = { id: Math.max(...st.projects.map((x) => x.id)) + 1, thread_id: null }; st.projects.push(p); }
        for (const k of ["name", "emoji", "cadence_days", "script_offset", "voice_offset", "edit_offset", "upload_offset", "voice_days", "color"]) p[k] = b[k];
        p.drive_folder_id = (String(b.drive_folder || "").match(/folders\/([\w-]+)/) || [])[1] || null;
        st.channels = st.channels.filter((c) => c.project_id !== p.id || b.channels.some((x) => x.id === c.id));
        b.channels.forEach((c, i) => { const ex = st.channels.find((x) => x.id === c.id); if (ex) Object.assign(ex, c, { sort: i }); else st.channels.push({ ...c, id: cid++, project_id: p.id, sort: i }); });
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
      case "settings.save": Object.assign(st.settings, { timezone: b.timezone, morning_hour: b.morning_hour, evening_hour: b.evening_hour }); return {};
      case "member.update": Object.assign(st.members.find((m) => m.tg_id === b.tg_id), { name: b.name }); return {};
      default: throw new Error("mock: " + action);
    }
  };
})();
