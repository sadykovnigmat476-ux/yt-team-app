// Вопрос робота владельцу: блок с вариантами и своим ответом. Один на «Ждёт тебя», пульт и карточку выпуска.
import { answerBody, esc } from "../core/logic.js?v=c38baec6";
import { act } from "../core/store.js?v=5b428fdb";
import { toast } from "./toast.js?v=c026fd86";

/** q — { id, text, why, options }. Поле своего ответа переживает перерисовку: morph не трогает набранное. */
export function questionBlock(q) {
  const id = Number(q.id);
  const options = (q.options || []).map((o, i) => `<button class="btn ghost q-opt" data-key="q-opt-${id}-${i}" data-act="q-answer" data-q="${id}" data-i="${i}">${esc(o)}</button>`).join("");
  return `<div class="q-block" data-key="q-${id}">
    <div class="q-text">${esc(q.text)}</div>
    ${q.why ? `<div class="muted small q-why">Почему спрашивает: ${esc(q.why)}</div>` : ""}
    ${options ? `<div class="q-opts">${options}</div>` : ""}
    <div class="q-own"><textarea class="inp" rows="2" data-key="q-own-${id}" aria-label="Свой ответ" placeholder="Свой ответ"></textarea>
      <button class="btn sm" data-key="q-send-${id}" data-act="q-own" data-q="${id}">Ответить</button></div>
  </div>`;
}

/** Экраны перечитывают вопросы и после отказа: закрытый вопрос не должен оставаться с кнопками. */
async function send(body, el) {
  const r = await act("robot.answer", body, null, { el });
  document.dispatchEvent(new Event("question-answered"));
  if (r) toast("Ответ записан: робот возьмёт выпуск при следующем заходе");
}

export const actions = {
  "q-answer": (el) => send(answerBody(Number(el.dataset.q), { option: Number(el.dataset.i) }), el),
  "q-own": (el) => {
    const body = answerBody(Number(el.dataset.q), { text: el.closest(".q-block").querySelector("textarea").value });
    return body ? send(body, el) : toast("Напиши ответ");
  },
};
