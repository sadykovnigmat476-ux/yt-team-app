// Всё про Telegram: объект WebApp, тема, нативные кнопки. В браузере и на моке tg может не быть — проверки на месте.
import { themeTokens } from "./logic.js?v=27fff957";

export const qs = new URLSearchParams(location.search);
export const MOCK = qs.has("mock");
export const FAKE_NATIVE = MOCK && qs.has("native");
// версия Telegram для макета ?native=1 (например &tgver=7.0 — проверить старый клиент без SecondaryButton)
const FAKE_VER = Number(qs.get("tgver")) || 9;
// палитры Telegram для проверки темы на моке: &tgtheme=light|dark
const MOCK_THEMES = {
  light: { bg_color: "#ffffff", secondary_bg_color: "#efeff4", text_color: "#000000", hint_color: "#999999", link_color: "#2481cc", button_color: "#40a7e3", button_text_color: "#ffffff" },
  dark: { bg_color: "#17212b", secondary_bg_color: "#232e3c", text_color: "#f5f5f5", hint_color: "#708499", link_color: "#6ab3f3", button_color: "#5288c1", button_text_color: "#ffffff" },
};

/**
 * Скрипт Telegram подключается отсюда, а не из html: в обычном браузере недоступный telegram.org не держит запуск.
 * Внутри Telegram без него нет initData, поэтому там ждём до конца; вне его — не дольше 4 секунд.
 */
function loadTelegram() {
  return new Promise((res) => {
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = s.onerror = res;
    document.head.appendChild(s);
    if (!/tgWebApp/.test(location.hash) && !window.TelegramWebviewProxy) setTimeout(res, 4000);
  });
}
if (!MOCK) await loadTelegram();

export let tg = window.Telegram && window.Telegram.WebApp;
const root = document.documentElement;
/** Открыто внутри Telegram (есть подпись), а не в обычном браузере. */
export const inTelegram = () => !!(tg && tg.initData);

export function haptic(t) {
  try {
    if (tg && tg.HapticFeedback) {
      if (t === "light") tg.HapticFeedback.impactOccurred("light");
      else tg.HapticFeedback.notificationOccurred(t);
    }
  } catch (_) { /* старый клиент */ }
}

export function openUrl(url) {
  if (inTelegram() && tg.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

// ---------- тема ----------
function setTokens(tokens) {
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
}
function applyTheme() {
  // вне Telegram библиотека всегда отвечает «light» — тогда тема идёт по prefers-color-scheme
  if (inTelegram()) {
    if (tg.colorScheme) root.dataset.scheme = tg.colorScheme;
    setTokens(themeTokens(tg.themeParams || {}));
  } else if (MOCK && MOCK_THEMES[qs.get("tgtheme")]) {
    root.dataset.scheme = qs.get("tgtheme");
    setTokens(themeTokens(MOCK_THEMES[qs.get("tgtheme")]));
  }
}

// ---------- нижние кнопки ----------
let nativeNow = { main: null, second: null };
export const hasMain = () => !!(tg && tg.MainButton && (tg.initData || FAKE_NATIVE));
// SecondaryButton есть в объекте WebApp и на старых клиентах, но Telegram < 7.10 его не рисует: тогда «Папка» остаётся на странице
export const hasSecond = () => !!(tg && tg.SecondaryButton && (tg.initData || FAKE_NATIVE) && tg.isVersionAtLeast && tg.isVersionAtLeast("7.10"));

/** Кнопки внизу экрана: {text, run, kind}; kind "second" — кнопка заменяет дубль .dup-second на странице, иначе .dup-main. */
export function setNative(main, second) {
  nativeNow = { main: main || null, second: second || null };
  try {
    if (hasMain()) { if (main) tg.MainButton.setParams({ text: main.text, is_visible: true, is_active: true }); else tg.MainButton.hide(); }
    if (hasSecond()) { if (second) tg.SecondaryButton.setParams({ text: second.text, is_visible: true, position: "left" }); else tg.SecondaryButton.hide(); }
  } catch (_) { /* старый клиент */ }
  const shown = [hasMain() && main, hasSecond() && second].filter(Boolean);
  root.classList.toggle("native-main", shown.some((b) => (b.kind || "main") === "main"));
  root.classList.toggle("native-second", shown.some((b) => b.kind === "second"));
  root.classList.toggle("native-bar", FAKE_NATIVE && shown.length > 0);
}
export function nativeProgress(on) {
  try {
    if (hasMain()) { if (on) tg.MainButton.showProgress(false); else tg.MainButton.hideProgress(); }
  } catch (_) { /* старый клиент */ }
}

/** Telegram Back: показать, когда есть куда вернуться; нажатие — обратный вызов из initTelegram. */
export function setBackVisible(on) {
  if (!inTelegram() || !tg.BackButton) return;
  try { if (on) tg.BackButton.show(); else tg.BackButton.hide(); } catch (_) { /* старый клиент */ }
}

// ---------- окно на весь экран (Telegram Desktop и macOS открывают Mini App узким окном) ----------
const DESKTOP = ["tdesktop", "macos", "web", "weba", "webk", "unigram"];
export const canFullscreen = () => !!(inTelegram() && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") && tg.requestFullscreen && DESKTOP.includes(tg.platform));

/** Подключить Telegram к приложению. h: back, settings, fullscreenChanged, fullscreenFailed, wantFullscreen. */
export function initTelegram(h) {
  if (tg) {
    tg.ready();
    tg.expand();
    if (inTelegram()) root.classList.add("tg");
    if (tg.onEvent) tg.onEvent("themeChanged", applyTheme);
    if (inTelegram() && tg.BackButton) tg.BackButton.onClick(h.back);
    // кнопки внизу экрана Telegram: один обработчик, действие — по текущему экрану
    if (hasMain()) tg.MainButton.onClick(() => { haptic("light"); if (nativeNow.main) nativeNow.main.run(); });
    if (hasSecond()) tg.SecondaryButton.onClick(() => { if (nativeNow.second) nativeNow.second.run(); });
    // «Настройки» в меню Mini App
    if (tg.SettingsButton && inTelegram()) { try { tg.SettingsButton.show(); tg.SettingsButton.onClick(h.settings); } catch (_) { /* старый клиент */ } }
    const since = (v) => tg.isVersionAtLeast && tg.isVersionAtLeast(v);
    try {
      // iOS/Android: свайп вниз по списку не должен сворачивать приложение
      if (since("7.7")) tg.disableVerticalSwipes();
      // шапка и низ окна Telegram — в цвет фона приложения, без белых полос
      if (since("6.1")) { tg.setHeaderColor("secondary_bg_color"); tg.setBackgroundColor("secondary_bg_color"); }
      if (since("7.10")) tg.setBottomBarColor("secondary_bg_color");
      if (canFullscreen()) {
        tg.onEvent("fullscreenChanged", h.fullscreenChanged);
        tg.onEvent("fullscreenFailed", h.fullscreenFailed);
        if (h.wantFullscreen() && !tg.isFullscreen) tg.requestFullscreen();
      }
    } catch (_) { /* старый клиент */ }
  }
  applyTheme();
}

if (FAKE_NATIVE) {
  // макет нижней панели Telegram: Main справа, Secondary слева
  const bar = document.createElement("div");
  bar.className = "fake-native";
  document.body.appendChild(bar);
  const mk = (id) => {
    const b = document.createElement("button");
    b.id = id; b.className = "btn"; b.hidden = true; bar.appendChild(b);
    let cb = null, params = {}, progress = false;
    return {
      setParams(p) { Object.assign(params, p); b.textContent = params.text || ""; b.hidden = !params.is_visible; if (id === "fake-second") b.classList.add("ghost"); b.disabled = !!progress; },
      hide() { params.is_visible = false; b.hidden = true; },
      // как у настоящей кнопки: во время запроса — индикатор и нажатия не проходят
      showProgress() { progress = true; b.disabled = true; b.dataset.progress = "1"; },
      hideProgress() { progress = false; b.disabled = false; delete b.dataset.progress; },
      onClick(fn) { cb = fn; b.onclick = () => { if (cb) cb(); }; },
    };
  };
  const second = mk("fake-second"), main = mk("fake-main");
  // у настоящего Telegram.WebApp эти свойства только для чтения — объявляем свои поверх
  const fake = Object.create(tg || {});
  const noop = () => {};
  // &tgver=7.0 — клиент старше 7.10: SecondaryButton не рисуется, «Папка» должна остаться на странице
  for (const [k, v] of Object.entries({
    MainButton: main, SecondaryButton: second, initData: "", isVersionAtLeast: (x) => FAKE_VER >= Number(x),
    disableVerticalSwipes: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, ready: noop, expand: noop, onEvent: noop,
  })) {
    Object.defineProperty(fake, k, { value: v });
  }
  tg = fake;
}
