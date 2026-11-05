// Адреса экранов: ?tab=…&ep=… через history.pushState. Каждая открытая шторка — запись в истории
// ({depth}), поэтому «Назад» браузера, телефона и Telegram закрывает верхнюю, а не уводит из приложения.
import { buildUrl, guardTab, parseRoute, SCREENS, TABS } from "./logic.js?v=f81f1930";

let route = { tab: "now", ep: null, run: null };
let hooks = { depth: () => 0, closeAll: () => Promise.resolve(true), onPop: () => Promise.resolve(), render: () => {}, enter: () => {}, remember: () => {}, stored: () => null, owner: () => false };

export const currentRoute = () => route;

/** Записать адрес, не трогая экран: depth — сколько шторок открыто на этой записи. */
export function writeHistory(next, depth, replace) {
  route = { ...route, ...next };
  history[replace ? "replaceState" : "pushState"]({ depth }, "", buildUrl(route, location.search, location.hash));
}

/** Перейти на экран: смена вкладки закрывает шторки (форма с изменениями спросит); false — человек остался. */
export async function go(next, opts = {}) {
  const tab = next.tab ? guardTab(next.tab, hooks.owner()) : route.tab;
  const changed = tab !== route.tab;
  if (changed || opts.closeSheets) {
    if (!(await hooks.closeAll())) return false;
  }
  writeHistory({ ...(changed ? { ep: null, run: null } : {}), ...next, tab }, hooks.depth(), !!opts.replace);
  hooks.remember(tab);
  if (changed) { hooks.enter(tab); window.scrollTo(0, 0); }
  hooks.render();
  return true;
}

/** «Назад» для экрана глубины: всегда к родителю, даже если на него пришли прямой ссылкой. */
export const parentOf = (tab) => (SCREENS[tab] && SCREENS[tab].parent) || null;
export const titleOf = (tab) => (TABS[tab] || SCREENS[tab] || TABS.now).n;

export function initRouter(h, startParam) {
  hooks = { ...hooks, ...h };
  route = parseRoute(location.search, location.hash, startParam, hooks.stored());
  addEventListener("popstate", async (ev) => {
    const prev = route.tab;
    route = parseRoute(location.search, location.hash, "", prev);
    await hooks.onPop((ev.state && ev.state.depth) || 0, route);
    if (route.tab !== prev) { hooks.remember(route.tab); hooks.enter(route.tab); }
    hooks.render();
  });
}
