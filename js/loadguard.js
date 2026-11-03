// Classic (non-module) script: if the game code fails to load, for example because
// js/config.js has a mistake, show a message instead of "Loading…" forever.
setTimeout(() => {
  const app = document.getElementById('app');
  if (app && app.textContent.trim() === 'Loading…') {
    app.innerHTML = '<div class="card"><h2>The game could not start</h2>'
      + '<p>Open the browser console (F12) for details. The usual cause is a mistake in <code>js/config.js</code>: '
      + 'it must contain only the <code>firebaseConfig</code> object, without <code>import</code> lines.</p></div>';
  }
}, 8000);
