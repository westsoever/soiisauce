// app/client/lib/scrollbars.ts
// Overlay-style scrollbars app-wide. base.css keeps every thumb transparent and
// draws it only on elements marked data-scrolling, which this sets while an
// element scrolls and clears shortly after it stops.
const HIDE_AFTER_MS = 1000
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

export function installScrollbars(): void {
  document.addEventListener(
    'scroll',
    event => {
      // Element scrolls don't bubble, so listen in the capture phase; page scrolls target the document.
      const el = event.target instanceof Element ? event.target : document.documentElement
      clearTimeout(timers.get(el))
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '')
      timers.set(
        el,
        setTimeout(() => el.removeAttribute('data-scrolling'), HIDE_AFTER_MS)
      )
    },
    { capture: true, passive: true }
  )
}
