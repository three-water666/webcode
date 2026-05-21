/**
 * 检测一个 HTML 元素在网页中是否是实际可见的
 * @param el 待测试的 HTMLElement
 * @returns 元素未被 display:none、未被隐藏并且它的实际大小宽/高等于大于 0 时返回 `true`
 */
export function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * 简单的异步等待函数
 * @param ms 毫秒
 * @returns 包装了一个 `setTimeout` 的 `Promise` 对象
 */
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
