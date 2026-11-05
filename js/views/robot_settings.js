// Настройки робота (владелец): ночное окно, повторы, потолки, «папка занята», горизонт. Неверное значение не сохраняется.
import { api } from "../core/api.js?v=1e81587e";
import { esc } from "../core/logic.js?v=37ec8712";
import { render, ui } from "../core/store.js?v=0b379ff0";
import { icon } from "../ui/icons.js?v=2008de79";
import { skeleton } from "../ui/skeleton.js?v=72d04fb7";
import { toast } from "../ui/toast.js?v=c026fd86";
import { loadRobot } from "./robot.js?v=5a688a44";

/** Зеркало пределов domain.ts (LIMIT_RULES): здесь — быстрая проверка до отправки, последнее слово за сервером. */
const FIELDS = [
  { group: "Ночное окно", hint: "Сценарий и монтаж идут только ночью, по времени команды.", items: [
    { k: "night_from", name: "Начало ночи", unit: "час", min: 0, max: 23, help: "С какого часа робот может брать сценарий и монтаж." },
    { k: "night_to", name: "Конец ночи", unit: "час", min: 0, max: 23, help: "До какого часа. Начало и конец не должны совпадать." },
  ] },
  { group: "Повторы и потолки", hint: "Потолки защищают подписку: упёрся — робот ждёт тебя.", items: [
    { k: "retry_hours", name: "Повтор после сбоя", unit: "часов", min: 1, max: 72, help: "Через сколько часов робот сам повторит упавшую фазу." },
    { k: "max_fails", name: "Сбоев подряд", unit: "раз", min: 1, max: 10, help: "Сколько раз подряд фаза может упасть, потом робот встанет и напишет тебе." },
    { k: "final_max", name: "Заходов финала", unit: "заходов", min: 1, max: 48, help: "Сколько заходов финала до кнопки «Ещё N заходов»." },
    { k: "script_max", name: "Заходов сценария", unit: "заходов", min: 1, max: 10, help: "Сколько частей на сценарий." },
    { k: "montage_parts_max", name: "Частей монтажа", unit: "частей", min: 1, max: 30, help: "Монтаж идёт частями по ночам: больше частей — выпуск остановится." },
    { k: "accept_autofix", name: "Автоисправлений приёмки", unit: "раз", min: 0, max: 5, help: "Сколько раз робот сам чинит красное на приёмке, прежде чем позвать тебя. 0 — сразу тебе." },
  ] },
  { group: "Папка и календарь", hint: "", items: [
    { k: "busy_min", name: "«Папка занята»", unit: "минут", min: 0, max: 240, help: "Если ты менял файлы в папке проекта меньше N минут назад, робот не берёт новую работу. 0 — не проверять." },
    { k: "horizon_days", name: "Горизонт", unit: "дней", min: 1, max: 90, help: "На сколько дней вперёд робот смотрит выпуски." },
  ] },
];
const ALL = FIELDS.flatMap((g) => g.items);
const DEFAULTS = { night_from: 1, night_to: 8, retry_hours: 6, max_fails: 3, final_max: 12, script_max: 3, montage_parts_max: 8, accept_autofix: 2, busy_min: 30, horizon_days: 14 };

/** draft — набранное строками; errors — по ключу поля; general — ошибка без поля. */
const rs = { draft: {}, errors: {}, general: null, saving: false };

const saved = () => (ui.robot.data && ui.robot.data.limits) || null;
const shown = (f) => (rs.draft[f.k] !== undefined ? rs.draft[f.k] : String(saved()[f.k]));
const changed = () => ALL.some((f) => rs.draft[f.k] !== undefined && rs.draft[f.k] !== String(saved()[f.k]));

export function enter() {
  rs.draft = {};
  rs.errors = {};
  rs.general = null;
  loadRobot();
}
export function refresh() { return loadRobot(); }

function fieldHtml(f) {
  const err = rs.errors[f.k];
  const cur = saved()[f.k];
  return `<label class="f rs-field ${err ? "bad" : ""}" data-key="rs-${f.k}"><span>${esc(f.name)}, ${esc(f.unit)}</span>
    <input class="inp" type="number" inputmode="numeric" step="1" min="${f.min}" max="${f.max}" value="${esc(shown(f))}" data-act-input="rs-field" data-k="${f.k}" aria-invalid="${err ? "true" : "false"}">
    ${err ? `<small class="hint rv-err" role="alert">${esc(err)}</small>` : ""}
    <small class="hint">${esc(f.help)} Сейчас в роботе: <b>${esc(cur)}</b>, по умолчанию ${DEFAULTS[f.k]}, допустимо ${f.min}–${f.max}.</small></label>`;
}

export function view() {
  const r = ui.robot;
  if (!saved()) {
    if (r.error) return `<div class="empty">${esc(r.error)}<br><br><button class="btn sm" data-act="rs-reload">Повторить</button></div>`;
    return skeleton("list", 3);
  }
  const dirty = changed();
  return `<div class="narrow"><p class="muted small note-line">Это настройки самого робота. Они сохраняются в боте и действуют сразу, менять код не нужно. Неверное значение не сохранится.</p>
    ${FIELDS.map((g) => `<h2>${esc(g.group)}</h2>${g.hint ? `<div class="muted small note-line">${esc(g.hint)}</div>` : ""}<div class="card">${g.items.map(fieldHtml).join("")}</div>`).join("")}
    ${rs.general ? `<div class="banner" role="alert">${icon("alert-circle")}<span class="grow">${esc(rs.general)}</span></div>` : ""}
    <div class="rs-bar"><span class="small ${dirty ? "tone-warn" : "muted"}">${dirty ? "Есть несохранённые изменения" : "Все значения сохранены"}</span>
      <button class="btn ghost" data-act="rs-defaults">Вернуть по умолчанию</button>
      <button class="btn ${rs.saving ? "is-busy" : ""}" data-act="rs-save" ${dirty ? "" : "disabled"}>${icon("check")}Сохранить</button></div></div>`;
}

/** Ошибка сервера «Имя поля: …» привязывается к своему полю; остальное — общей строкой. */
function place(message) {
  const f = ALL.find((x) => message.startsWith(x.name));
  if (f) rs.errors[f.k] = message;
  else if (/^Ночное окно/.test(message)) rs.errors.night_to = message;
  else rs.general = message;
}

function localCheck() {
  const out = {};
  for (const f of ALL) {
    const raw = shown(f);
    const n = Number(raw);
    if (String(raw).trim() === "" || !Number.isInteger(n) || n < f.min || n > f.max) out[f.k] = `${f.name}: целое число от ${f.min} до ${f.max}`;
  }
  return out;
}

export const actions = {
  "rs-reload": () => { ui.robot.error = null; loadRobot(); },
  "input:rs-field": (el) => {
    rs.draft[el.dataset.k] = el.value;
    delete rs.errors[el.dataset.k];
    rs.general = null;
    render();
  },
  "rs-defaults": () => {
    for (const f of ALL) rs.draft[f.k] = String(DEFAULTS[f.k]);
    rs.errors = {};
    rs.general = null;
    render();
  },
  "rs-save": async () => {
    if (rs.saving || !changed()) return;
    rs.errors = localCheck();
    rs.general = null;
    if (Object.keys(rs.errors).length) { render(); return; }
    const value = Object.fromEntries(ALL.map((f) => [f.k, Number(shown(f))]));
    rs.saving = true;
    render();
    try {
      const res = await api("robot.limits", { value });
      ui.robot.data.limits = res.value;
      rs.draft = {};
      toast("Настройки робота сохранены");
    } catch (e) {
      // значения в полях остаются, сохранённые в роботе не меняются
      place(e.message);
    } finally {
      rs.saving = false;
      render();
    }
  },
};
