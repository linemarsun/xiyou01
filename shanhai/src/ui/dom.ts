/** 极简 DOM 构建工具：h('div', {class: 'x', onclick: fn}, child, ...) */
export type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
    } else if (key === 'class') {
      if (val !== undefined) el.className = String(val);
    } else if (key === 'disabled') {
      (el as HTMLButtonElement).disabled = Boolean(val);
    } else if (val === undefined || val === false || val === null) {
      // 跳过空属性
    } else {
      el.setAttribute(key, String(val));
    }
  }
  for (const c of children) el.append(c);
  return el;
}
