// Перерисовка без потерь: вместо innerHTML — правка только того, что изменилось.
// Узлы остаются на месте, поэтому сами сохраняются прокрутка вбок, фокус, выделение и набранный текст.
//
// Ключ узла — data-key, id или data-act + data-id: карточки выпусков не путаются при сдвиге списка.
// Поле, которое человек правил (значение отличается от исходного), не перезаписывается. Исключения:
// opts.force — разметка собрана из черновика и верна целиком; opts.commit — набор data-keep,
// значения которых после сохранения берутся с сервера.

const KEEP_ATTRS = new Set(["data-pending"]); // служебное на живом узле: идёт нажатие

const keyOf = (n) => {
  if (n.nodeType !== 1) return null;
  const k = n.getAttribute("data-key") || n.id;
  if (k) return k;
  const a = n.getAttribute("data-act"), i = n.getAttribute("data-id");
  return a && i ? `${a}:${i}` : null;
};
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;
const isBox = (el) => el.type === "checkbox" || el.type === "radio";

function isDirty(el) {
  if (el.tagName === "SELECT") {
    const d = Array.from(el.options).findIndex((o) => o.defaultSelected);
    return el.selectedIndex !== Math.max(0, d);
  }
  return isBox(el) ? el.checked !== el.defaultChecked : el.value !== el.defaultValue;
}

function syncAttrs(from, to) {
  for (const a of Array.from(from.attributes)) {
    if (!to.hasAttribute(a.name) && !KEEP_ATTRS.has(a.name)) from.removeAttribute(a.name);
  }
  for (const a of Array.from(to.attributes)) {
    if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
}

function syncField(el, next, opts) {
  const dirty = isDirty(el);
  const value = el.tagName === "SELECT" ? el.value : null;
  syncAttrs(el, next);
  if (el.tagName === "SELECT") {
    morphChildren(el, next, opts);
    if (dirty && !opts.force) el.value = value;
    else el.selectedIndex = Math.max(0, Array.from(el.options).findIndex((o) => o.defaultSelected));
    return;
  }
  if (el.tagName === "TEXTAREA") morphChildren(el, next, opts);
  if (dirty && !opts.force && !(opts.commit && opts.commit.has(el.dataset.keep))) return;
  if (isBox(el)) el.checked = next.hasAttribute("checked");
  else {
    const v = el.tagName === "TEXTAREA" ? next.value : next.getAttribute("value") ?? "";
    if (el.value !== v) el.value = v;
  }
}

function morphNode(el, next, opts) {
  if (el.nodeType !== 1) {
    if (el.nodeValue !== next.nodeValue) el.nodeValue = next.nodeValue;
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return syncField(el, next, opts);
  syncAttrs(el, next);
  morphChildren(el, next, opts);
}

function morphChildren(parent, nextParent, opts) {
  const keyed = new Map();
  for (const c of Array.from(parent.childNodes)) { const k = keyOf(c); if (k) keyed.set(k, c); }
  let cur = parent.firstChild;
  for (const next of Array.from(nextParent.childNodes)) {
    const k = keyOf(next);
    let match = null;
    if (k) {
      const m = keyed.get(k);
      if (m && same(m, next)) match = m;
    } else {
      // без ключа — следующий подходящий узел без ключа на этом месте
      let c = cur;
      while (c && (keyOf(c) || !same(c, next))) c = c.nextSibling;
      match = c;
    }
    if (match) {
      if (k) keyed.delete(k);
      if (match === cur) cur = cur.nextSibling;
      else parent.insertBefore(match, cur);
      morphNode(match, next, opts);
    } else parent.insertBefore(next.cloneNode(true), cur);
  }
  while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
}

/** Привести содержимое root к html. */
export function morph(root, html, opts = {}) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphChildren(root, tpl.content, opts);
}
