// Вход из браузера: виджет Telegram. Весь экран — на запуске; поверх страницы — если сессия кончилась посреди работы,
// тогда под окном остаётся всё, что введено. Внутри Telegram экрана нет: там вход незаметен.
import { api } from "../core/api.js?v=1e81587e";
import { esc } from "../core/logic.js?v=37ec8712";
import { loginNote, onLost, onRestored, login } from "../core/session.js?v=1e81587e";
import { refresh, S } from "../core/store.js?v=0b379ff0";
import { clearError } from "../ui/toast.js?v=c026fd86";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
const WIDGET_ORIGIN = "https://oauth.telegram.org";
// «Bot domain invalid» — голый текст в окне виджета: скрипта там нет, значит нет и сообщения ready
const READY_WAIT_MS = 8000;

const noteHtml = (text) => (text ? `<p class="login-note" role="alert">${esc(text)}</p>` : "");

const card = (note) => `<div class="login">
  <h1>YouTube команда</h1>
  <p class="muted">Войди через Telegram: права будут те же, что в приложении в Telegram.</p>
  ${noteHtml(note)}
  <div class="login-widget"></div>
  <div class="login-state"></div>
</div>`;

const notReady = (bot) => `<div class="login-setup">
  <p><b>Вход из браузера ещё не настроен.</b></p>
  <p>Владельцу нужно один раз указать адрес этой страницы у @BotFather: команда /setdomain${bot ? `, бот @${esc(bot)}` : ""}, домен <code>${esc(location.hostname)}</code>.</p>
  <p class="muted">Пока открывай приложение из Telegram: кнопка «Открыть» в боте.</p>
  <button class="btn ghost sm" data-act="login-retry">Проверить снова</button>
</div>`;

const failed = (text) => `${noteHtml(text)}<button class="btn ghost sm" data-act="login-retry">Повторить</button>`;

const stateOf = (root) => root.querySelector(".login-state");
const widgetOf = (root) => root.querySelector(".login-widget");
const say = (root, html) => { stateOf(root).innerHTML = html; };

let overlay = null;
let waiting = null; // снимает ожидание виджета, когда экран перерисован

function finish(member) {
  if (!overlay) { location.reload(); return; } // запуск ещё не прошёл: начать его заново проще всего
  closeOverlay();
  // вошёл другой человек: чужой экран и черновики ему не нужны
  if (S && S.me.tg_id !== member.tg_id) location.reload();
  else refresh();
}

function closeOverlay() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  clearError();
}

async function submit(widget, root) {
  say(root, `<p class="muted">Вхожу…</p>`);
  try {
    finish(await login(widget));
  } catch (e) {
    say(root, noteHtml(e.message));
  }
}

function embedWidget(bot, root) {
  const slot = widgetOf(root);
  window.__ytLogin = (data) => submit(data, root);
  const script = document.createElement("script");
  script.async = true;
  script.src = WIDGET_SRC;
  for (const [k, v] of Object.entries({ "telegram-login": bot, size: "large", userpic: "false", lang: "ru", onauth: "__ytLogin(user)" })) {
    script.setAttribute(`data-${k}`, v);
  }
  const stop = () => { clearTimeout(timer); window.removeEventListener("message", onMessage); waiting = null; };
  const timer = setTimeout(() => { slot.hidden = true; say(root, notReady(bot)); }, READY_WAIT_MS);
  function onMessage(ev) {
    if (ev.origin !== WIDGET_ORIGIN) return;
    let event = null;
    try { event = JSON.parse(ev.data).event; } catch (_) { return; }
    if (event !== "ready") return;
    // успел после таймаута (медленная сеть) — кнопка всё равно появляется
    stop();
    slot.hidden = false;
    say(root, "");
  }
  window.addEventListener("message", onMessage);
  waiting = stop;
  script.onerror = () => { stop(); say(root, failed("Не открылся вход Telegram. Проверь связь")); };
  slot.append(script);
}

async function mount(root) {
  if (waiting) waiting();
  const slot = widgetOf(root);
  slot.textContent = "";
  slot.hidden = false;
  say(root, `<p class="muted">Загружаю вход…</p>`);
  let config;
  try {
    config = await api("auth.config");
  } catch (e) {
    say(root, failed(e.message));
    return;
  }
  if (!config.bot) { slot.hidden = true; say(root, notReady(null)); return; }
  if (config.fake) { // мок: Telegram нет, путь дальше тот же
    slot.innerHTML = `<button class="btn" data-act="login-fake">Войти через Telegram (макет)</button>`;
    say(root, "");
    return;
  }
  embedWidget(config.bot, root);
}

function openOverlay() {
  if (overlay || !S) return; // на запуске экран входа ставит main.js
  overlay = document.createElement("div");
  overlay.className = "login-layer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = card("Вход истёк. Войди снова: всё, что ты ввёл, останется на экране.");
  document.body.append(overlay);
  mount(overlay.firstElementChild);
}

onLost(openOverlay);
onRestored(() => { if (overlay) { if (waiting) waiting(); closeOverlay(); refresh(); } });

export function view(ctx) {
  // вошедшему по адресу ?tab=login здесь делать нечего, а роутер запомнил бы этот экран как последний
  if (S) { queueMicrotask(() => ctx.go({ tab: "now" }, { replace: true })); return ""; }
  // main.js вставляет разметку сразу после вызова, виджет встаёт уже в готовый экран
  queueMicrotask(() => { const root = document.querySelector("#view .login"); if (root) mount(root); });
  return card(loginNote());
}

export const actions = {
  "login-retry": (el) => mount(el.closest(".login")),
  "login-fake": (el) => submit({ mock: true }, el.closest(".login")),
};
