// «Статистика»: команда, языки, выпуски, состояние бота.
import { esc, fmt, fmtNum, langTag, META, signed } from "../core/logic.js?v=27fff957";
import { currentRoute } from "../core/router.js?v=27d33f38";
import { api } from "../core/api.js?v=f1e8780b";
import { chan, proj, render, S, store, ui } from "../core/store.js?v=e0f3245a";
import { icon } from "../ui/icons.js?v=2008de79";
import { emptyBlock, fullscreenChip, projectChips } from "../ui/parts.js?v=2e46b762";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { table } from "../ui/table.js?v=46836274";

/** Подпись канала: своё имя, если задано, иначе «Аксиома RU» — проект и язык. */
function chName(channelId, lang) {
  const c = chan(channelId);
  if (c && c.name) return c.name;
  const p = c && proj(c.project_id);
  return `${p ? p.name : ""} ${String(lang || (c && c.lang) || "").toUpperCase()}`.trim();
}
const statsKey = () => `${ui.statsDays}:${ui.project}`;

function loadStats() {
  const key = statsKey();
  if (ui.statsLoading === key) return;
  ui.statsLoading = key;
  ui.statsError = null;
  api("stats", { days: ui.statsDays, project_id: ui.project === "all" ? null : Number(ui.project) })
    // ответ на старый фильтр, пришедший после смены фильтра, не затирает свежий
    .then((data) => { if (!ui.stats || key === statsKey()) { ui.stats = { key, data }; ui.statsError = null; } })
    .catch((e) => { ui.statsError = { key, msg: e.message }; })
    .finally(() => { if (ui.statsLoading === key) ui.statsLoading = null; if (currentRoute().tab === "stats") render(); });
}

export function view() {
  if (!S.projects.length) return emptyBlock("chart", "Статистики пока нет", "Сначала заведи проект в настройках — после первых выпусков здесь появятся цифры.", `<button class="btn" data-act="tab" data-tab="settings">Открыть настройки</button>`);
  const key = statsKey();
  const failed = ui.statsError && ui.statsError.key === key;
  // новые цифры грузятся поверх старых (приглушённых), без мигания пустым экраном; после ошибки — только по «Повторить»
  if ((!ui.stats || ui.stats.key !== key) && !failed) loadStats();
  let html = `<div class="chips">${[7, 30, 90].map((d) => `<button class="chip ${ui.statsDays === d ? "on" : ""}" data-act="stats-days" data-d="${d}">${d} дней</button>`).join("")}${fullscreenChip()}</div>` + projectChips();
  if (failed) html += `<div class="banner"><span class="grow">Не обновилось · ${esc(ui.statsError.msg)}</span><button class="btn sm" data-act="stats-retry">Повторить</button></div>`;
  if (!ui.stats) return html + (failed ? "" : `${skeleton("tiles")}${skeleton("list", 3)}`);
  const d = ui.stats.data;
  html += `<div class="${ui.stats.key !== key ? "stale" : ""}">`;
  html += `<div class="muted note-line">${fmt(d.from)} – ${fmt(d.to)}</div>`;
  html += focusNote(d);
  html += `<div class="stats-cols"><div>${statsTeam(d.team)}</div><div>${statsLangs(d)}${statsEpisodes(d)}</div></div>`;
  html += statsHealth(d);
  return html + `</div>`;
}

/** Пришли из панели выпуска: подсказать, где его цифры, или объяснить, почему их нет. Прокрутка — один раз. */
function focusNote(d) {
  const id = ui.statsEp;
  if (id == null) return "";
  const hit = d.episodes.find((x) => x.episode_id === id);
  ui.statsEp = null;
  if (hit) {
    setTimeout(() => { const el = document.querySelector(`[data-key="sev-${id}"]`); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60);
    return "";
  }
  return `<div class="note">${icon("info")}<span>Для этого выпуска цифр пока нет: они появляются после выхода ролика и утреннего сбора (6:00).</span></div>`;
}

function statsTeam(t) {
  const closed = t.stages.reduce((n, x) => n + x.closed, 0);
  const onTime = t.stages.reduce((n, x) => n + x.onTime, 0);
  const tile = (v, l, cls = "") => `<div class="tile ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  let html = `<h2>Команда</h2><div class="tiles">
    ${tile(t.released, "выпусков вышло")}
    ${tile(t.uploads, "выкладок на каналы")}
    ${tile(closed ? Math.round(onTime / closed * 100) + "%" : "—", closed ? `этапов в срок (${onTime} из ${closed})` : "этапов в срок")}
    ${tile(t.overdueNow || "0", "просрочено сейчас", t.overdueNow ? "bad" : "")}</div>`;
  const phase = (st) => (t.phases.find((p) => p.stage === st) || {}).days;
  html += `<div class="card">${t.stages.map((x) => {
    const pct = x.closed ? Math.round(x.onTime / x.closed * 100) : 0;
    const dur = phase(x.stage);
    const meta = [x.closed ? `${x.onTime} из ${x.closed} в срок` : "за период не было", x.avgLate ? `опоздание ≈ ${x.avgLate} дн.` : "", dur != null ? `длится ≈ ${dur} дн.` : ""].filter(Boolean).join(" · ");
    return `<div class="st-row"><b class="with-ic">${icon(META[x.stage].i)}${META[x.stage].n}</b><span class="num">${x.closed ? pct + "%" : ""}</span>
      <div class="muted full-row">${meta}</div>${x.closed ? `<div class="bar" title="${pct}% в срок"><b style="width:${pct}%"></b></div>` : ""}</div>`;
  }).join("")}
    ${t.cycleDays != null ? `<div class="small mt-2">От готового сценария до выхода — в среднем <b>${t.cycleDays} дн.</b></div>` : ""}</div>`;
  if (t.members.length) {
    html += `<h2>Люди</h2>` + table([
      { title: "Человек", cell: (m) => `<span class="with-ic"><span class="mini-ava">${esc(m.name.slice(0, 1).toUpperCase())}</span>${esc(m.name)}</span>` },
      { title: "Закрыто", align: "right", cell: (m) => String(m.closed) },
      { title: "С опозданием", align: "right", cell: (m) => String(m.late) },
      { title: "Просрочено сейчас", align: "right", cell: (m) => (m.overdueNow ? `<span class="badge late">${m.overdueNow}</span>` : "0") },
    ], t.members, { empty: "За период никто ничего не закрыл" });
  }
  return html;
}

function statsLangs(d) {
  let html = `<h2>Языки</h2>`;
  if (!d.youtube.enabled) {
    return html + `<div class="card small">Просмотры по языкам появятся, когда подключим ключ YouTube Data API: Google Cloud → включить <b>YouTube Data API v3</b> → создать API key → <code>YOUTUBE_API_KEY</code> в .env → деплой.</div>`;
  }
  if (!d.youtube.last_day) return html + `<div class="card muted small">Первый сбор цифр — завтра в 6 утра. Каналы со ссылкой на YouTube попадут в статистику сами.</div>`;
  const projects = S.projects.filter((p) => d.channels.some((c) => c.project_id === p.id && (c.subscribers != null || c.median != null)));
  if (!projects.length) {
    // ссылки есть, но канал подключили после утреннего сбора — цифр по нему ещё нет
    const linked = d.channels.some((c) => (chan(c.channel_id) || {}).youtube_url);
    return html + `<div class="card muted small">${linked
      ? "Цифр по каналам ещё нет — бот собирает их каждое утро в 6:00, новые каналы появятся после ближайшего сбора."
      : "У каналов нет ссылок на YouTube — добавь их в настройках проекта."}</div>`;
  }
  for (const p of projects) {
    const cs = d.channels.filter((c) => c.project_id === p.id).sort((a, b) => ((chan(a.channel_id) || {}).sort ?? 0) - ((chan(b.channel_id) || {}).sort ?? 0));
    const hasDelta = cs.some((c) => c.viewsDelta != null);
    // пока нет истории снимков — всего просмотров канала; потом — прирост за период
    const val = (c) => (hasDelta ? c.viewsDelta : c.totalViews);
    const max = Math.max(1, ...cs.map((c) => Math.max(0, val(c) || 0)));
    const span = Math.max(...cs.map((c) => c.deltaDays || 0));
    const caption = hasDelta
      ? `Прирост просмотров за ${span < d.days ? `${span} дн. — история копится` : `${d.days} дн.`}`
      : "Всего просмотров канала (прирост за период появится, когда накопится история)";
    const d7 = cs.some((c) => c.medianKind === "d7");
    const legend = `<div class="muted small mt-2">подписчики${hasDelta ? " · всего — просмотров канала" : ""} · ролик — типичные просмотры одного ролика${d7 ? " за первые 7 дней" : ""} · новых — роликов за период</div>`;
    html += `<div class="card"><b>${esc(p.emoji)} ${esc(p.name)}</b><div class="muted small">${caption}</div>
      ${cs.map((c) => {
        const v = val(c);
        const w = v == null ? 0 : Math.max(0, v) / max * 100;
        // общее число — точно, как в YouTube; прирост — коротко
        const txt = v == null ? "—" : hasDelta ? signed(v) : v.toLocaleString("ru-RU");
        const sub = [`подписчиков ${c.subscribers == null ? "—" : c.subscribers.toLocaleString("ru-RU")}${c.subsDelta ? ` (${signed(c.subsDelta)})` : ""}`,
          hasDelta && c.totalViews != null ? `всего ${fmtNum(c.totalViews)}` : "",
          c.median != null ? `<span title="${c.medianKind === "d7" ? "медиана просмотров на 7-й день" : "медиана просмотров роликов старше недели"}">ролик ≈ ${fmtNum(c.median)}</span>` : "",
          c.videosInPeriod ? `новых: ${c.videosInPeriod}` : ""].filter(Boolean).join(" · ");
        const name = chName(c.channel_id, c.lang);
        return `<div class="bar-row" title="${esc(name)}: ${txt}">
          <span class="ellipsis">${esc(name)}</span><span class="num">${txt}</span>
          <div class="bar">${v == null ? "" : `<b style="width:${w}%"></b>`}</div></div>
          <div class="bar-sub muted small">${sub}</div>`;
      }).join("")}${legend}</div>`;
  }
  return html;
}

function statsEpisodes(d) {
  if (!d.episodes.length) return `<h2>Выпуски на всех языках</h2>${emptyBlock("chart", "Просмотров по выпускам пока нет", "Цифры появятся после выхода роликов и утреннего сбора в 6:00. Выход отмечается в панели выпуска или сам, если у канала есть ссылка на YouTube.")}`;
  return `<h2>Выпуски на всех языках</h2><div class="card">${d.episodes.map((e) => {
    const p = proj(e.project_id) || { emoji: "" };
    return `<div class="ep-views" data-key="sev-${e.episode_id}"><div class="row"><div class="grow ellipsis"><b>${esc(e.code)}</b> ${esc(e.title)}</div><span class="num"><b>${fmtNum(e.total)}</b></span></div>
      <div class="muted small">${esc(p.emoji)} вышел ${e.published ? fmt(e.published.slice(0, 10)) : "—"}</div>
      <div class="chips">${e.langs.map((l) => `<a class="chip" href="https://youtu.be/${esc(l.video_id)}" data-act="open-link" title="${l.d7 != null ? `за 7 дней: ${fmtNum(l.d7)}` : ""}">${esc(langTag(l.lang))} <span class="num">${fmtNum(l.views)}</span>${l.d7 != null ? `<span class="muted small num">7 дн. ${fmtNum(l.d7)}</span>` : ""}</a>`).join("")}</div></div>`;
  }).join("")}</div>`;
}

const HEALTH = { drive: "Google Диск", youtube: "Отметка выкладки (YouTube)", stats: "Статистика YouTube", morning: "Утренняя рассылка", evening: "Вечернее напоминание", weekly: "План недели" };
function statsHealth(d) {
  if (!d.health) return "";
  const rows = Object.keys(HEALTH).filter((k) => d.health[k]).map((k) => {
    const h = d.health[k];
    return `<div class="row line-row">${icon(h.fails ? "alert-circle" : "check-circle", h.fails ? "tone-bad" : "tone-ok")}
      <div class="grow small">${HEALTH[k]}${h.fails ? `<div class="muted break">${esc(h.error || "")} · сбоев подряд: ${h.fails}${h.since ? ` · с ${fmt(String(h.since).slice(0, 10))}` : ""}</div>` : ""}</div></div>`;
  }).join("");
  const last = d.youtube.enabled ? `<div class="muted small mt-2">Цифры YouTube собраны: ${d.youtube.last_day ? fmt(d.youtube.last_day) : "ещё ни разу"} · роликов: ${d.youtube.videos}</div>` : "";
  return `<h2>Состояние бота</h2><div class="card">${rows || `<div class="muted small">Проверок ещё не было.</div>`}${last}
    <div class="muted small mt-2">Если что-то ломается, бот сам пишет админам в личку.</div></div>`;
}

/** Новые цифры при каждом заходе и обновлении: пока грузятся, видны прежние. */
export function enter() { if (ui.stats) ui.stats.key = ""; ui.statsError = null; }
export const refresh = enter;

export const actions = {
  "stats-days": (el) => { ui.statsDays = Number(el.dataset.d); store("statsDays", ui.statsDays); render(); },
  "stats-retry": () => { ui.statsError = null; if (ui.stats) ui.stats.key = ""; render(); },
};
