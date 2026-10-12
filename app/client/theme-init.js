// Follows the system colour scheme by toggling `.dark` on <html>. It is an external script (the CSP
// forbids inline ones) that index.html loads synchronously in <head>, so the class is set before first
// paint. The listener keeps the page in sync if the system switches while soii is open.
;(function () {
  var query = matchMedia('(prefers-color-scheme: dark)')
  function apply() {
    document.documentElement.classList.toggle('dark', query.matches)
  }
  apply()
  if (query.addEventListener) query.addEventListener('change', apply)
  else if (query.addListener) query.addListener(apply)
})()
