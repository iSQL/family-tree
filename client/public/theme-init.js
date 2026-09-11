// Rana primena teme — bez bljeska pogrešne pozadine. Spoljni fajl (ne inline), jer CSP
// dozvoljava samo skripte sa istog porekla (script-src 'self').
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
