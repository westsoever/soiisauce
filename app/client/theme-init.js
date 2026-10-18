// Follows the system colour scheme by toggling `.dark` on <html>. It is an external script (the page's
// Content-Security-Policy, app/server/security-headers.ts, allows scripts from soii's own files only) that
// index.html loads synchronously in <head>, so the class is set before first paint. The listener keeps the
// page in sync if the system switches while soii is open.
;(function () {
  var query = matchMedia('(prefers-color-scheme: dark)')
  function apply() {
    document.documentElement.classList.toggle('dark', query.matches)
  }
  apply()
  if (query.addEventListener) query.addEventListener('change', apply)
  else if (query.addListener) query.addListener(apply)
})()
