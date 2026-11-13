// Запуск: связывает ядро, экраны и оболочку (меню, шапка, подсказки вида). Логики экранов здесь нет.
import { api } from "./core/api.js?v=f1e8780b";
import { bindEvents } from "./core/dom.js?v=3f6425ae";
import { buildUrl, esc, guardTab, markTappable, moreTabs, phoneNav, shouldPoll, sideTabs, TABS, updatedLabel } from "./core/logic.js?v=27fff957";
import { morph } from "./core/morph.js?v=b4de8c1c";
import { currentRoute, go, initRouter, parentOf, titleOf, writeHistory } from "./core/router.js?v=27d33f38";
import { needsLogin } from "./core/session.js?v=f1e8780b";
import { act, ep, isBusy, load, refresh, render as requestRender, S, setRenderer, store, ui } from "./core/store.js?v=fd36140d";
import { initTelegram, MOCK, setBackVisible, setNative, tg } from "./core/tg.js?v=f1d7ce1d";
import { icon, spriteMarkup } from "./ui/icons.js?v=2008de79";
import { actions as partsActions, initial, sheetHead } from "./ui/parts.js?v=91b94c25";
import { actions as questionActions } from "./ui/question.js?v=622acfdf";
import { closeAllSheets, closeSheet, onSheetsChanged, openSheet, refitSheets, repaintSheets, sheetDepth, syncToDepth } from "./ui/sheet.js?v=8e391c5d";
import { skeleton } from "./ui/skeleton.js?v=72d04fb7";
import { toast } from "./ui/toast.js?v=c026fd86";
import * as calendar from "./views/calendar.js?v=230f52d4";
import * as episode from "./views/episode.js?v=80a4c520";
import * as episodes from "./views/episodes.js?v=f75dda96";
import * as login from "./views/login.js?v=12d02ccb";
import * as now from "./views/now.js?v=1941b42a";
import * as review from "./views/review.js?v=61cec314";
import * as robot from "./views/robot.js?v=1bf5e6af";
import * as robot_settings from "./views/robot_settings.js?v=14f141ee";
import * as settings from "./views/settings.js?v=246038e6";
import * as setup from "./views/setup.js?v=98e24d97";
import * as stats from "./views/stats.js?v=e4d9277f";

const VIEWS = { now, episodes, calendar, stats, settings, robot, review, robot_settings, setup, login };
const ctx = { get S() { return S; }, ui, go, act, api };
const $ = (id) => document.getElementById(id);
const hrefOf = (tab) => buildUrl({ tab }, location.search, "");

// ---------- оболочка ----------
function navLink(tab, tag = "a") {
  const t = TABS[tab], on = currentRoute().tab === tab || parentOf(currentRoute().tab) === tab;
  const attrs = tag === "a" ? `href="${esc(hrefOf(tab))}"` : "";
  return `<${tag} class="nav-item ${on ? "on" : ""}" ${attrs} data-key="nav-${tab}" data-act="tab" data-tab="${tab}" ${on ? `aria-current="page"` : ""}>${icon(t.i)}<span>${t.n}</span></${tag}>`;
}

function renderNav() {
  const owner = !!S.me.is_owner, has = S.projects.length > 0;
  const add = has ? `<button class="btn side-add" data-act="new-episode" aria-label="Новый выпуск">${icon("plus")}<span>Выпуск</span></button>` : "";
  morph($("side"), `<div class="brand">${icon("film")}<span>YouTube команда</span></div>${add}
    <nav class="side-nav" aria-label="Разделы">${sideTabs(owner).map((t) => navLink(t)).join("")}</nav>
    <div class="side-foot"><span class="mini-ava">${initial(S.me)}</span><span class="ellipsis">${esc(S.me.name)}</span></div>`);
  const items = phoneNav(owner, has).map((id) => {
    if (id === "add") return `<button class="nav-item add" data-key="nav-add" data-act="new-episode">${icon("plus")}<span>Выпуск</span></button>`;
    if (id === "more") {
      const on = moreTabs(owner, has).includes(currentRoute().tab);
      return `<button class="nav-item ${on ? "on" : ""}" data-key="nav-more" data-act="more">${icon("more")}<span>Ещё</span></button>`;
    }
    return navLink(id);
  });
  morph($("tabbar"), items.join(""));
}

function renderTopbar() {
  const tab = currentRoute().tab, parent = parentOf(tab);
  const back = parent ? `<button class="icon-btn" data-act="tab" data-tab="${parent}" aria-label="Назад">${icon("chevron-left")}</button>` : "";
  morph($("topbar"), `${back}<h1>${esc(titleOf(tab))}</h1>
    <span class="updated" data-key="updated">${esc(updatedLabel(ui.at, Date.now()))}</span>
    <button class="icon-btn ${ui.loading ? "is-busy" : ""}" data-act="refresh" aria-label="Обновить" title="Обновить">${icon("refresh")}</button>`);
  document.title = `${titleOf(tab)} · YouTube команда`;
}

/** Кнопки внизу экрана: у открытой шторки — свои, иначе у экрана, если они ему нужны. */
function syncNative() {
  const view = VIEWS[currentRoute().tab];
  const n = ui.sheet ? (ui.sheet.native ? ui.sheet.native() : null) : view && view.native ? view.native(ctx) : null;
  setNative(n && n.main, n && n.second);
  setBackVisible(sheetDepth() > 0 || !!parentOf(currentRoute().tab));
}

function render(opts) {
  if (!S) return;
  const r = currentRoute();
  const tab = guardTab(r.tab, !!S.me.is_owner);
  // экран владельца по старой ссылке или из памяти: чужому его нет
  if (tab !== r.tab) writeHistory({ tab }, sheetDepth(), true);
  renderNav();
  renderTopbar();
  const banner = ui.loadError
    ? `<div class="banner" data-key="load-error" role="alert"><span class="grow">Не обновилось · ${esc(ui.loadError)}</span><button class="btn sm" data-act="refresh">Повторить</button></div>` : "";
  morph($("view"), markTappable(banner + VIEWS[tab].view(ctx)), opts);
  repaintSheets(opts);
  syncNative();
}

function showFatal(e) {
  const noAccess = needsLogin(e);
  // без данных меню показывать нечего
  document.documentElement.classList.toggle("bare", noAccess);
  $("view").innerHTML = noAccess ? login.view(ctx)
    : `<div class="empty">${esc(e.message)}<br><br><button class="btn" data-act="start-retry">Повторить</button></div>`;
}

// ---------- действия оболочки ----------
const shellActions = {
  "tab": (el, ev) => {
    // ссылка из меню: Ctrl+клик открывает вкладку браузера как обычная ссылка
    if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) return;
    if (ev) ev.preventDefault();
    if (el.dataset.tab === currentRoute().tab) { window.scrollTo({ top: 0 }); return closeAllSheets(); }
    return go({ tab: el.dataset.tab });
  },
  "more": () => {
    const owner = !!S.me.is_owner;
    openSheet(() => `${sheetHead("Ещё")}<div class="more-list">${moreTabs(owner, S.projects.length > 0).map((t) => navLink(t)).join("")}</div>`);
  },
  "refresh": () => refreshScreen(),
  "start-retry": () => start(),
};

/** «Обновить» и таймер: общие данные плюс то, что экран загружает сам. */
function refreshScreen() {
  const view = VIEWS[currentRoute().tab];
  if (view && view.refresh) view.refresh(ctx);
  return refresh();
}

const handlers = Object.assign({}, partsActions, questionActions, episode.actions, ...Object.values(VIEWS).map((v) => v.actions || {}), shellActions);

// ---------- запуск ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(`Не загрузился ${src}`));
    document.head.appendChild(s);
  });
}

/** Адрес с выпуском: запись под шторкой — тот же экран без него, чтобы «Назад» закрывал выпуск, а не приложение. */
function openRouteEpisode() {
  const id = currentRoute().ep;
  if (id == null) return;
  writeHistory({ ep: null }, 0, true);
  if (ep(id)) episode.openEpisode(id);
}

/** Ход по истории: шторки по глубине записи; вперёд на запись с выпуском — выпуск открывается снова. */
async function onPop(depth, r) {
  await syncToDepth(depth);
  if (r.ep != null && sheetDepth() === 0 && S && ep(r.ep)) await episode.openEpisode(r.ep, { silent: true });
  // запись от шторки, которую не восстановить (форма): остаёмся на экране
  if (((history.state && history.state.depth) || 0) !== sheetDepth()) history.replaceState({ depth: sheetDepth() }, "", location.href);
}

function bindShell() {
  setRenderer(render);
  onSheetsChanged(() => { if (S) syncNative(); });
  bindEvents(handlers, ctx);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && ui.sheet) closeSheet();
    const enter = ev.key === "Enter" && ev.target.dataset && ev.target.dataset.enter;
    if (enter) handlers[enter](document.querySelector(`[data-act="${enter}"]`));
  });
  matchMedia("(min-width: 600px)").addEventListener("change", () => { if (S) syncNative(); });
  matchMedia("(min-width: 1024px)").addEventListener("change", refitSheets);
  // автообновление: открытый экран раз в минуту; подпись «обновлено» живёт вместе с ним
  setInterval(() => {
    if (!S) return;
    if (shouldPoll({ visible: document.visibilityState === "visible", busy: isBusy(), loading: ui.loading, lastAt: ui.at, now: Date.now() })) refreshScreen();
    else renderTopbar();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (S && shouldPoll({ visible: document.visibilityState === "visible", busy: isBusy(), loading: ui.loading, lastAt: ui.at, now: Date.now() })) refreshScreen();
  });
}

async function start() {
  $("view").innerHTML = skeleton("list");
  try {
    await load();
  } catch (e) {
    showFatal(e);
    return;
  }
  document.documentElement.classList.remove("bare");
  // в адресе или в памяти мог остаться экран владельца
  const r = currentRoute(), tab = guardTab(r.tab, !!S.me.is_owner);
  writeHistory({ tab, ep: r.ep }, 0, true);
  store("tab", tab);
  if (VIEWS[tab].enter) VIEWS[tab].enter(ctx);
  requestRender();
  openRouteEpisode();
}

async function boot() {
  $("sprite").innerHTML = spriteMarkup();
  initTelegram({
    back: () => (sheetDepth() > 0 ? closeSheet() : go({ tab: parentOf(currentRoute().tab) || "now" })),
    settings: () => go({ tab: "settings" }),
    fullscreenChanged: () => requestRender(),
    fullscreenFailed: (e) => toast(e && e.error === "UNSUPPORTED" ? "Этот Telegram не умеет полноэкранный режим" : "Не получилось развернуть окно"),
    wantFullscreen: () => store("fullscreen") === "1",
  });
  initRouter({
    depth: sheetDepth,
    closeAll: closeAllSheets,
    onPop,
    render: requestRender,
    enter: (tab) => { if (VIEWS[tab] && VIEWS[tab].enter) VIEWS[tab].enter(ctx); },
    remember: (tab) => { if (TABS[tab]) store("tab", tab); },
    stored: () => store("tab"),
    owner: () => !!(S && S.me.is_owner),
  }, (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "");
  bindShell();
  if (MOCK) await loadScript("mock.js");
  await start();
}

boot().catch((e) => { document.body.textContent = e.message; });
