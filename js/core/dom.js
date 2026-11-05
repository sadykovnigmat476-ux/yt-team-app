// Делегирование событий: разметка говорит, что делать, обработчики лежат в actions экранов.
//   data-act="имя"          клик (и Enter/Пробел на карточке с role="button") → actions["имя"](el, ev, ctx)
//   data-act-change="имя"   событие change → actions["change:имя"](el, ev, ctx)
//   data-act-input="имя"    событие input → actions["input:имя"](el, ev, ctx)

export const byId = (id) => document.getElementById(id);
/** Метка поля: после сохранения его значение можно взять с сервера (opts.commit в act). */
export const kp = (key) => ` data-keep="${key}"`;

export function bindEvents(handlers, ctx) {
  const run = (el, ev) => {
    const h = handlers[el.dataset.act];
    if (!h) return;
    // асинхронный обработчик (подтверждение → запрос) не запускается второй раз, пока не закончил первый
    if (el.dataset.pending) return;
    const r = h(el, ev, ctx);
    if (r && r.then) { el.dataset.pending = "1"; const clear = () => { delete el.dataset.pending; }; r.then(clear, clear); }
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    run(el, ev);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = ev.target;
    if (el.matches && el.matches('[data-act][role="button"]')) { ev.preventDefault(); run(el, ev); }
  });
  for (const type of ["change", "input"]) {
    document.addEventListener(type, (ev) => {
      const el = ev.target, name = el.dataset && el.dataset[type === "change" ? "actChange" : "actInput"];
      if (!name) return;
      const h = handlers[`${type}:${name}`];
      if (h) h(el, ev, ctx);
    });
  }
}
