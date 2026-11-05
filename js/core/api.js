// Транспорт к серверу. На моке вместо сети — window.MOCK_API: тот же контракт action/body.
import { authHeaders } from "./session.js?v=1e81587e";
import { MOCK } from "./tg.js?v=3f1c2f7b";

const API_URL = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || "";
const FETCH_TIMEOUT_MS = 20000;
const NO_NET = "Нет связи с сервером, попробуй ещё раз";

/** Ошибка с русским текстом; retryable — повтор может помочь (сеть, сбой сервера), status — код ответа. */
const apiError = (message, status, retryable) => Object.assign(new Error(message), { status, retryable });

/** Один запрос к серверу: таймаут и русский текст вместо «Failed to fetch» / «AbortError». */
async function rawFetch(url, action, body, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action, ...body }),
      signal: ctl.signal,
    });
  } catch (_) {
    throw apiError(NO_NET, 0, true);
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(json.error || `Сервер ответил ошибкой ${res.status}, попробуй ещё раз`, res.status, res.status >= 500);
  return json;
}

export async function api(action, body = {}) {
  if (MOCK) return window.MOCK_API(action, body);
  if (!API_URL) throw new Error("Не задан адрес API (config.js)");
  return rawFetch(API_URL, action, body);
}
