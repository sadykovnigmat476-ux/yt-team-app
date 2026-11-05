// Поля форм и проверка «есть несохранённое».
import { esc } from "../core/logic.js?v=f81f1930";

/** Подпись + поле. control — готовая разметка поля. */
export const field = (label, control, hint) =>
  `<label class="f"><span>${esc(label)}</span>${control}${hint ? `<small class="hint">${esc(hint)}</small>` : ""}</label>`;

/** Есть ли в блоке правки, которых нет на сервере. Поля data-act-change сохраняются сами при изменении. */
export function domDirty(root) {
  return Array.from(root.querySelectorAll("input,textarea,select")).some((el) => {
    if (el.dataset.actChange || el.disabled) return false;
    if (el.tagName === "SELECT") {
      const d = Array.from(el.options).findIndex((o) => o.defaultSelected);
      return el.selectedIndex !== Math.max(0, d);
    }
    return el.type === "checkbox" || el.type === "radio" ? el.checked !== el.defaultChecked : el.value !== el.defaultValue;
  });
}
