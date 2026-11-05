// Чистая логика Mini App: без DOM, сети и глобальных переменных. Тесты — tests/miniapp_test.ts (Deno).
// Состояние S (ответ action=state) передаётся аргументом; привязанные к текущему S обёртки — в core/store.js.

export const STAGES = ["script", "voice", "edit", "upload"];
/** i — имя иконки спрайта, n — подпись. */
export const META = {
  script: { i: "script", n: "Сценарий" }, voice: { i: "mic", n: "Озвучка" },
  edit: { i: "film", n: "Монтаж" }, upload: { i: "upload", n: "Выкладка" },
};
export const PREV = { script: null, voice: "script", edit: "voice", upload: "edit" };
export const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const KINDS = [{ id: "script", i: "script", n: "Сценарий" }, { id: "voice", i: "mic", n: "Озвучка" }, { id: "video", i: "film", n: "Готовое видео" }];
// Цвета проектов: свой (выбирается в настройках проекта) или из палитры по порядку
export const PALETTE = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

export const POLL_MS = 60000; // автообновление открытого экрана

// ---------- разделы и адреса ----------
export const TABS = {
  now: { i: "bolt", n: "Сейчас" },
  episodes: { i: "board", n: "Выпуски" },
  calendar: { i: "calendar", n: "Календарь" },
  stats: { i: "chart", n: "Статистика" },
  settings: { i: "gear", n: "Настройки" },
  robot: { i: "robot", n: "Робот" },
};
/** Экраны глубины: открываются по адресу, в меню их нет. parent — куда ведёт «Назад», owner — только владельцу. */
export const SCREENS = {
  review: { n: "Проверка", parent: "robot", owner: true },
  robot_settings: { n: "Настройки робота", parent: "robot", owner: true },
  setup: { n: "Настройка робота", parent: "robot", owner: true },
  login: { n: "Вход" },
};
const OWNER_TABS = ["robot"];
const ROUTE_KEYS = ["tab", "ep", "run"];

const knownTab = (t) => (t === "my" ? "now" : TABS[t] || SCREENS[t] ? t : null);
const intOrNull = (v) => (/^\d+$/.test(v || "") ? Number(v) : null);
// Telegram дописывает к хэшу свои параметры: #robot?tgWebAppData=… (так их разбирает telegram-web-app.js) или #robot&tgWebAppData=…
const hashIsRobot = (hash) => /^#?(?:[^?&=]*[?&])*robot(?:$|[?&])/.test(hash || "");

/**
 * Адрес → экран. Старые ссылки бота: ?tab=robot#robot, startapp=robot, startapp=ep_N.
 * stored — последняя вкладка из localStorage: открытие без адреса возвращает туда, где человек был.
 */
export function parseRoute(search, hash, startParam, stored) {
  const q = new URLSearchParams(search || "");
  const sp = startParam || q.get("startapp") || "";
  const explicit = knownTab(q.get("tab"));
  const tab = explicit || (sp === "robot" || hashIsRobot(hash) ? "robot" : null) || knownTab(stored) || "now";
  const m = sp.match(/^ep_(\d+)$/);
  return { tab, ep: intOrNull(q.get("ep")) ?? (m ? Number(m[1]) : null), run: intOrNull(q.get("run")) };
}

/** Экран → адрес. Параметры мока (&native, &viewer, …) и хвост Telegram в хэше сохраняются; одноразовый startapp снимается. */
export function buildUrl(route, search, hash) {
  const q = new URLSearchParams(search || "");
  q.delete("startapp");
  for (const k of ROUTE_KEYS) q.delete(k);
  for (const k of ROUTE_KEYS) if (route[k] != null && route[k] !== "") q.set(k, String(route[k]));
  return `?${q}${/^#robot$/.test(hash || "") ? "" : hash || ""}`;
}

/** Чужому владельческий экран не открывается — уходим на «Сейчас». */
export function guardTab(tab, isOwner) {
  if (isOwner) return tab;
  return OWNER_TABS.includes(tab) || (SCREENS[tab] && SCREENS[tab].owner) ? "now" : tab;
}

export const sideTabs = (isOwner) => ["now", "episodes", "calendar", "stats", "settings", ...(isOwner ? ["robot"] : [])];

/** Нижняя панель телефона — ровно 5 пунктов: «+» посередине, у владельца рядом «Робот», остальное в «Ещё». */
export function phoneNav(isOwner, hasProjects) {
  const middle = hasProjects ? "add" : isOwner ? "calendar" : "stats";
  return ["now", "episodes", middle, isOwner ? "robot" : "calendar", "more"];
}
export function moreTabs(isOwner, hasProjects) {
  const shown = phoneNav(isOwner, hasProjects);
  return sideTabs(isOwner).filter((t) => !shown.includes(t));
}

// ---------- тексты ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
// язык — всегда кодом (RU), без флагов: флаг — это страна, а не язык, и на Windows он не рисуется
export const langTag = (l) => String(l || "?").toUpperCase();

export const dParse = (d) => new Date(d + "T00:00:00Z");
export const addDays = (d, n) => { const x = dParse(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const weekday = (d) => (dParse(d).getUTCDay() + 6) % 7;
export const daysBetween = (a, b) => Math.round((dParse(b) - dParse(a)) / 86400000);
export function fmt(d, wd) {
  if (!d) return "";
  const [, m, day] = d.split("-").map(Number);
  return (wd ? WD[weekday(d)] + ", " : "") + day + " " + MON[m - 1];
}
export function relDay(today, d) {
  const n = daysBetween(today, d);
  if (n === 0) return "сегодня";
  if (n === 1) return "завтра";
  if (n === -1) return "вчера";
  return n < 0 ? `${-n} дн. назад` : `через ${n} дн.`;
}
/** Строка про срок: t — текст, cls — тон, i — иконка. */
export function dueInfo(today, due) {
  if (!due) return { t: "без срока", cls: "", i: "clock" };
  const n = daysBetween(today, due);
  if (n < 0) return { t: `просрочено на ${-n} дн.`, cls: "late", i: "alert" };
  if (n === 0) return { t: "срок сегодня", cls: "today", i: "flame" };
  if (n === 1) return { t: "срок завтра", cls: "", i: "clock" };
  return { t: `до ${fmt(due, true)}`, cls: "", i: "calendar" };
}
/** «2 мин назад» / «3 ч назад» по разнице в миллисекундах. */
export function agoText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} ч назад` : `${Math.floor(h / 24)} дн. назад`;
}
export function fmtNum(n) {
  if (n == null) return "—";
  const a = Math.abs(n), r = (x) => Math.round(x * 10) / 10;
  if (a < 1000) return String(Math.round(n));
  return a < 1e6 ? (r(n / 1000) + "k").replace(".0k", "k") : (r(n / 1e6) + "M").replace(".0M", "M");
}
export const signed = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + fmtNum(n));
/** 2D или 3D (Blender) из заметок выпуска — зеркало formatTag на сервере. */
export function formatTag(notes) {
  const m = (notes || "").match(/(?:^|[^a-z0-9])([23])d(?![a-z0-9])/i);
  return m ? `${m[1]}D` : null;
}
export const voiceHint = (p) => {
  if (p.voice_days == null) return `озвучка за ${p.voice_offset} дн. до выхода`;
  if (p.voice_days === 0) return "озвучка в день, когда придёт сценарий";
  return `озвучка через ${p.voice_days} дн. после сценария`;
};
export const folderLink = (id) => `https://drive.google.com/drive/folders/${id}`;

// ---------- пакет языка ----------
/** Материалы пакета языка: ключ строки матрицы → подпись. Нет ключа в строке — проекту этот материал не нужен. */
export const MATERIALS = [["script", "Текст"], ["voice", "Голос"], ["video", "Видео"], ["cover", "Обложка"], ["meta", "Метаданные"], ["srt", "Субтитры"]];

/** Ячейка матрицы: текстом считается и сценарий, и текст для диктора (S04_ru_tts.txt). */
export const materialCell = (row, key) => (key === "script" ? row.tts || row.script || null : row[key]);

/** Язык готов: на месте всё, что проекту нужно. */
export const langReady = (row) => MATERIALS.every(([k]) => materialCell(row, k) === undefined || !!materialCell(row, k));

/** Тело robot.answer: свой текст важнее варианта; нечего отправлять — null. */
export function answerBody(id, { option, text } = {}) {
  const own = String(text ?? "").trim();
  if (own) return { question_id: id, text: own };
  return Number.isInteger(option) && option >= 0 ? { question_id: id, option } : null;
}

/** Что можно сделать обязательным в пакете языка (REQUIRED_MATERIALS на сервере): ключ → подпись. */
export const REQUIRED_MATERIALS = [["cover", "Обложка"], ["meta", "Метаданные"], ["srt", "Субтитры"], ["chapters", "Главы"]];

/** Значение projects.required_materials из отмеченного в форме: все отмечены — null, порядок как на сервере. */
export function requiredValue(checked) {
  const keys = REQUIRED_MATERIALS.map(([k]) => k);
  return keys.every((k) => checked.includes(k)) ? null : keys.filter((k) => checked.includes(k));
}

/**
 * Кнопки выхода из тупика в пульте: alert из robot.state, те же правила, что во входящих и в личке: потолок финала —
 * «Ещё N заходов», остальное — «Повторить» (без прогонки повторять нечего), упавшая прогонка — «Повторить». Стоп владельца важнее.
 */
export function robotRescue(e) {
  const a = e.alert;
  if (e.hold) return { retry: false, again: false };
  if (a && a.kind === "final_cap") return { retry: false, again: true };
  return { retry: a ? !!a.run_id : !!(e.run && e.run.status === "failed"), again: false };
}

// ---------- выпуски и задачи ----------
export const epTasks = (S, id) => S.tasks.filter((t) => t.episode_id === id);
const chanOf = (S, id) => S.channels.find((c) => c.id === id);
const projOf = (S, id) => S.projects.find((p) => p.id === id);
const epOf = (S, id) => S.episodes.find((e) => e.id === id);
const memOf = (S, id) => S.members.find((m) => m.tg_id === id);

/** Голова подписи выпуска «🔭 Скрытая Физика · S04» — зеркало episodeLabel на сервере (обычный текст, esc делает вызывающий). */
export function epHead(S, e) {
  const p = projOf(S, e.project_id) || { emoji: "", name: "" };
  return `${p.emoji} ${p.name} · ${e.code}`;
}
/** full добавляет «название»; short — для тесных мест: «🔭 S04». */
export function epLabel(S, e, mode = "full") {
  const p = projOf(S, e.project_id) || { emoji: "", name: "" };
  if (mode === "short") return `${p.emoji} ${e.code}`;
  const tag = formatTag(e.notes);
  return epHead(S, e) + (e.title ? ` «${e.title}»` : "") + (tag ? ` · ${tag}` : "");
}
/** Для нижней кнопки Telegram: проект и код без названия — иначе кнопка не помещается. */
export function epBtn(S, e) {
  const p = projOf(S, e.project_id) || { emoji: "", name: "" };
  return `${p.emoji} ${p.name} ${e.code}`;
}
/** Сжатый график: срок сценария уже в прошлом (зеркало isCompressed на сервере). */
export const isCompressedFor = (S, p, publishDate) => !!publishDate && addDays(publishDate, -(p.script_offset || 0)) < S.today;
/** Дата годится под дни выхода проекта (зеркало publishDayFits на сервере). */
export function publishDayFits(p, date) {
  if (!p || !p.publish_days) return true;
  return (Number(date.slice(8, 10)) % 2 === 0) === (p.publish_days === "even");
}
export function nextPublishDay(p, from) {
  let d = from;
  while (!publishDayFits(p, d)) d = addDays(d, 1);
  return d;
}
/** Напоминание о днях выхода (зеркало publishDaysNote на сервере). */
export function publishDaysNote(p, date) {
  if (!p || !p.publish_days) return null;
  const days = p.publish_days === "even" ? "чётные" : "нечётные";
  if (!date || publishDayFits(p, date)) return { fits: true, text: `Дни выхода «${p.name}» — ${days} числа.` };
  const other = p.publish_days === "even" ? "нечётное" : "чётное";
  return { fits: false, text: `${fmt(date)} — ${other} число. Дни выхода «${p.name}» — ${days}, ближайшая подходящая дата: ${fmt(nextPublishDay(p, date))}.` };
}
export const projChannels = (S, pid) => S.channels.filter((c) => c.project_id === pid).sort((a, b) => a.sort - b.sort);
const chSort = (S, t) => (chanOf(S, t.channel_id) || { sort: -1 }).sort;

export function blocker(S, t) {
  const prev = PREV[t.stage];
  if (!prev) return null;
  // свой язык, если этап шёл по языкам; иначе общая задача на все языки (как на сервере)
  const same = S.tasks.filter((x) => x.episode_id === t.episode_id && x.stage === prev);
  return same.find((x) => x.channel_id === t.channel_id) || same.find((x) => x.channel_id == null) || null;
}
export function isActive(S, t) {
  if (t.done_at) return false;
  const b = blocker(S, t);
  return !b || !!b.done_at;
}
export const pcolor = (S, p) => (p && p.color) || PALETTE[Math.max(0, S.projects.indexOf(p)) % PALETTE.length];
export const topicBound = (S, pid, kind) => (S.topics || []).some((t) => t.project_id === pid && t.kind === kind) || !!(projOf(S, pid) || {}).thread_id;

export function stageInfo(S, eid, stage) {
  const ts = epTasks(S, eid).filter((t) => t.stage === stage).sort((a, b) => chSort(S, a) - chSort(S, b));
  const done = ts.filter((t) => t.done_at).length;
  const active = ts.filter((t) => isActive(S, t)).length;
  // срок этапа — по открытым задачам: перенос закрытые не трогает, их старая дата не в счёт; всё закрыто — последняя показанная
  const due = ts.filter((t) => t.due_date && (done === ts.length || !t.done_at)).map((t) => t.due_date).sort()[0] || null;
  const late = done < ts.length && active > 0 && due && due < S.today;
  return { ts, done, total: ts.length, active, due, late };
}
export function episodeDone(S, eid) {
  const ts = epTasks(S, eid);
  return ts.length > 0 && ts.every((t) => t.done_at);
}
/** На каком этапе выпуск: первый незакрытый; всё закрыто — «Вышло». */
export function epColumn(S, eid) {
  for (const st of STAGES) {
    const i = stageInfo(S, eid, st);
    if (i.total && i.done < i.total) return st;
  }
  return "done";
}

export function nextCode(S, pid) {
  let max = 0;
  for (const e of S.episodes.filter((x) => x.project_id === pid)) {
    const m = String(e.code).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, +m[1]);
  }
  return "S" + String(max + 1).padStart(2, "0");
}

/** «Сегодня» для задач этапа: выкладку сервер считает по поясу исполнителя (upload_today), остальное — день команды. */
export const stageDay = (S, stage) => (stage === "upload" && S.upload_today) || S.today;

/** Зеркало uploadHidden: своя выкладка со сроком позже сегодняшнего дня не видна на экране дел; владелец видит всё. */
export function uploadHiddenFromMe(S, t) {
  return !S.me.is_owner && t.assignee_id === S.me.tg_id && t.stage === "upload" && !t.done_at && !!t.due_date && t.due_date > stageDay(S, "upload");
}

/** Этапы с открытыми задачами человека (all — всей команды), самые срочные первыми. */
export function nowGroups(S, all) {
  const me = S.me.tg_id;
  const shown = (t) => !t.done_at && (all || t.assignee_id === me) && !uploadHiddenFromMe(S, t);
  const open = S.tasks.filter(shown);
  const map = new Map();
  for (const t of open) {
    const k = t.episode_id + ":" + t.stage;
    if (!map.has(k)) map.set(k, { eid: t.episode_id, stage: t.stage });
  }
  return [...map.values()].map((g) => {
    const info = stageInfo(S, g.eid, g.stage);
    const mine = info.ts.filter(shown);
    const activeMine = mine.filter((t) => isActive(S, t));
    const due = activeMine.map((t) => t.due_date).filter(Boolean).sort()[0] || info.due;
    return { ...g, info, activeMine, due, waiting: activeMine.length === 0, who: [...new Set(mine.map((t) => t.assignee_id))].map((id) => memOf(S, id)).filter(Boolean) };
  }).filter((g) => epOf(S, g.eid)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
}

/** Разложить по корзинам: горит (срок ≤ сегодня), дальше (до 7 дней или без срока), позже, ждёт. */
export function nowBuckets(S, groups, skip) {
  const rest = groups.filter((g) => g !== skip);
  const active = rest.filter((g) => !g.waiting);
  const day = (g) => stageDay(S, g.stage);
  const hot = active.filter((g) => g.due && g.due <= day(g));
  const later = active.filter((g) => g.due && g.due > day(g) && daysBetween(day(g), g.due) > 7);
  const next = active.filter((g) => !hot.includes(g) && !later.includes(g));
  return { hot, next, later, waiting: rest.filter((g) => g.waiting) };
}

/** События дня в календаре: выходы и сроки этапов (кроме выкладки); project — "all" или id строкой. */
export function dayEvents(S, d, project) {
  const pubs = S.episodes.filter((e) => e.publish_date === d && (project === "all" || String(e.project_id) === project));
  const map = new Map();
  for (const t of S.tasks) {
    if (t.due_date !== d || t.stage === "upload") continue;
    const e = epOf(S, t.episode_id);
    if (!e || (project !== "all" && String(e.project_id) !== project)) continue;
    const k = t.episode_id + ":" + t.stage;
    const g = map.get(k) || { eid: t.episode_id, stage: t.stage, open: 0, total: 0, active: 0 };
    g.total++;
    if (!t.done_at) g.open++;
    if (isActive(S, t)) g.active++;
    map.set(k, g);
  }
  // этап ещё нельзя начать: открыт, но ни одна его задача не активна (ждёт предыдущий этап)
  const dls = [...map.values()].map((g) => ({ ...g, waiting: g.open > 0 && g.active === 0 }));
  return { pubs, dls };
}

/** Проверка формы проекта до отправки: пустое «каждые N дней» не должно стать нулём. */
export function projectFormError(d) {
  const int = (v, min) => typeof v === "number" && Number.isInteger(v) && v >= min;
  if (!int(d.cadence_days, 1)) return "Выпуск каждые N дней — целое число от 1";
  for (const s of STAGES) if (!int(d[s + "_offset"], 0)) return `${META[s].n}: за сколько дней до выхода — целое число от 0`;
  if (d.voice_days != null && !int(d.voice_days, 0)) return "Озвучка: дни после сценария — целое число от 0 или пусто";
  return "";
}

// ---------- обновление экрана ----------
/** Автообновление: только когда экран виден, ничего не идёт и прошла минута. */
export const shouldPoll = ({ visible, busy, loading, lastAt, now }) => !!visible && !busy && !loading && now - lastAt >= POLL_MS;

export function updatedLabel(at, now) {
  if (!at) return "";
  if (now - at < 60000) return "Обновлено только что";
  const d = new Date(at), p = (n) => String(n).padStart(2, "0");
  return `Обновлено в ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- разметка ----------
/** Нажимаемое не-кнопка (карточка, заголовок) получает роль и фокус: мышь и клавиатура работают одинаково. */
export function markTappable(html) {
  return html.replace(/<(div|span|h[1-6]|li|tr|section)\b([^<>]*\bdata-act="[^"]*"[^<>]*)>/g, (all, tag, attrs) => {
    if (/\b(role|tabindex)=/.test(attrs)) return all;
    return `<${tag}${attrs} role="button" tabindex="0">`;
  });
}

// ---------- тема ----------
const toRgb = (hex) => {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Контраст по WCAG 2.1, от 1 до 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** Сдвигает цвет к чёрному или белому (что дальше от фона), пока контраст не дойдёт до min. */
function ensureContrast(fg, bg, min = 4.5) {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.18 ? "#000000" : "#ffffff";
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}
const isHex = (v) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v || "");

/**
 * Цвета темы Telegram → токены интерфейса. Цвет Telegram берётся как есть, если проходит AA;
 * иначе доводится (серая подсказка и белое на голубой кнопке у него ниже 4,5:1). Нет цветов — {}, остаётся своя палитра.
 */
export function themeTokens(p) {
  if (!isHex(p.text_color) || !isHex(p.bg_color)) return {};
  const surface = isHex(p.section_bg_color) ? p.section_bg_color : p.bg_color;
  const bg = isHex(p.secondary_bg_color) ? p.secondary_bg_color : p.bg_color;
  const text = p.text_color;
  const accentText = isHex(p.button_text_color) ? p.button_text_color : "#ffffff";
  const accent = ensureContrast(isHex(p.button_color) ? p.button_color : "#2563eb", accentText);
  const accentBg = mix(surface, accent, 0.14);
  return {
    "--bg": bg, "--surface": surface, "--surface-2": mix(surface, text, 0.06), "--text": text,
    "--text-2": ensureContrast(mix(text, surface, 0.3), surface), "--text-3": ensureContrast(mix(text, surface, 0.42), surface),
    "--line": mix(surface, text, 0.13), "--line-strong": mix(surface, text, 0.26),
    "--accent": accent, "--accent-text": accentText, "--accent-bg": accentBg,
    // ссылка стоит и на поверхности, и на подложке акцента (выбранный пункт меню)
    "--link": ensureContrast(ensureContrast(isHex(p.link_color) ? p.link_color : accent, surface), accentBg),
  };
}
