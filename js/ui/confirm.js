// Вопрос перед необратимым: в Telegram — его окно, в браузере — своё (window.confirm в webview не всегда показывается).
import { inTelegram, tg } from "../core/tg.js?v=d0923368";

export function confirmBox(text, opt = {}) {
  if (inTelegram() && tg.showConfirm) return new Promise((res) => tg.showConfirm(text, (ok) => res(ok)));
  return new Promise((res) => {
    const before = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "confirm";
    wrap.innerHTML = `<div class="confirm-box" role="alertdialog" aria-modal="true"><p></p><div class="confirm-acts">
      <button class="btn ghost" data-confirm="0"></button><button class="btn" data-confirm="1"></button></div></div>`;
    wrap.querySelector("p").textContent = text;
    wrap.querySelector('[data-confirm="0"]').textContent = opt.cancel || "Отмена";
    wrap.querySelector('[data-confirm="1"]').textContent = opt.ok || "Да";
    const done = (ok) => {
      wrap.remove();
      if (before && before.focus) before.focus({ preventScroll: true });
      res(ok);
    };
    wrap.addEventListener("click", (ev) => {
      if (ev.target === wrap) return done(false);
      const b = ev.target.closest("[data-confirm]");
      if (b) done(b.dataset.confirm === "1");
    });
    wrap.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") { ev.stopPropagation(); done(false); }
      if (ev.key === "Tab") {
        // фокус ходит только между двумя кнопками
        ev.preventDefault();
        const [no, yes] = wrap.querySelectorAll("button");
        (document.activeElement === yes ? no : yes).focus();
      }
    });
    document.body.append(wrap);
    wrap.querySelector('[data-confirm="1"]').focus();
  });
}
