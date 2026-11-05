// Чем приложение подписывает запросы. Внутри Telegram — initData, как и раньше; в браузере — сессия (x-session).
// Токен лежит только в localStorage (его видят все вкладки) и уходит только заголовком: в адрес он не попадает.
import { api } from "./api.js?v=d723e8c5";
import { inTelegram, MOCK, qs, tg } from "./tg.js?v=fe0abf91";
import { showError } from "../ui/toast.js?v=c026fd86";

const KEY = "yt.session";
const LOST_EVENT = "yt:unauthorized"; // шлёт и мок: у него нет настоящего ответа 401
const AUTH_ACTION = /"action":"auth\./;

let memory = null; // приватное окно без localStorage: сессия живёт, пока открыта вкладка
let note = "";     // что сказать на экране входа

function readToken() {
  try { return localStorage.getItem(KEY) || memory; } catch (_) { return memory; }
}
function writeToken(token) {
  memory = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch (_) { /* остаётся memory */ }
}

export function authHeaders() {
  if (tg && tg.initData) return { "x-init-data": tg.initData };
  const token = readToken();
  return token ? { "x-session": token } : { "x-init-data": "" };
}

/**
 * Нужен экран входа: сервер не принял запрос, и мы не внутри Telegram. Вызывается на запуске, поэтому 403 здесь —
 * «участника больше нет»: токен бесполезен, а его текст показывает экран входа.
 */
export function needsLogin(error) {
  if (!error || inTelegram()) return false;
  if (error.status === 403 && readToken()) {
    note = error.message;
    writeToken(null);
    return true;
  }
  return error.status === 401;
}

/** Текст для экрана входа: почему снова просим войти. */
export const loginNote = () => note;

/** Сессия умерла посреди работы: fn поверх экрана просит войти, не трогая то, что на нём. */
export function onLost(fn) {
  window.addEventListener(LOST_EVENT, fn);
}
/** Вошли в соседней вкладке: токен в localStorage уже общий. */
export function onRestored(fn) {
  window.addEventListener("storage", (ev) => { if (ev.key === KEY && ev.newValue) fn(); });
}

window.addEventListener(LOST_EVENT, () => {
  if (readToken()) note = "Вход истёк, войди снова";
  writeToken(null);
});

// Запрос сессии внутри api.js один, и ответ видно только здесь. В Telegram этого пути нет вовсе.
if (!MOCK && !inTelegram()) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const res = await nativeFetch(url, init);
    const apiUrl = window.APP_CONFIG && window.APP_CONFIG.apiUrl;
    if (res.status === 401 && url === apiUrl && !AUTH_ACTION.test(String(init && init.body))) window.dispatchEvent(new Event(LOST_EVENT));
    return res;
  };
}

/** Данные виджета → сессия. Ошибку (не в команде, подпись не сошлась) показывает экран входа. */
export async function login(widget) {
  const r = await api("auth.login", { widget });
  writeToken(r.session);
  note = "";
  return r.member;
}

async function logoutBrowser(all) {
  try {
    await api("auth.logout", { everywhere: !!all });
  } catch (e) {
    // «Выйти» не зависит от сервера, а «Выйти везде» без него не случилось: молчать о таком нельзя
    if (all && e.status !== 401) {
      showError(e.message, e.retryable ? { retry: () => logoutBrowser(all) } : {});
      return;
    }
  }
  writeToken(null);
  location.reload();
}

/** «Выйти» / «Выйти везде». На простом моке входа нет — блока в настройках тоже. */
export const logout = MOCK && !qs.has("browser") ? undefined : logoutBrowser;
