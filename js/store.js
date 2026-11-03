// Tiny storage abstraction with the same shape for Firebase and local mode:
//   get(path) -> Promise<value|null>
//   set(path, value), update(path, {relPath: value, ...})
//   subscribe(path, cb) -> unsubscribe()
import { firebaseConfig } from './config.js';

export const mode = firebaseConfig ? 'firebase' : 'local';

let storePromise = null;
export function getStore() {
  if (!storePromise) storePromise = mode === 'firebase' ? firebaseStore() : Promise.resolve(localStore());
  return storePromise;
}

async function firebaseStore() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const { initializeApp } = await import(base + 'firebase-app.js');
  const { getDatabase, ref, get, set, update, onValue } = await import(base + 'firebase-database.js');
  const db = getDatabase(initializeApp(firebaseConfig));
  return {
    get: async (p) => (await get(ref(db, p))).val(),
    set: (p, v) => set(ref(db, p), v),
    update: (p, obj) => update(ref(db, p), obj),
    subscribe: (p, cb) => onValue(ref(db, p), (snap) => cb(snap.val()), (err) => showFatal(err)),
  };
}

function localStore() {
  const KEY = 'meritOrderGameDB';
  const listeners = new Set();
  const parts = (p) => p.split('/').filter(Boolean);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const getAt = (db, p) => {
    let o = db;
    for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
    return o === undefined ? null : clone(o);
  };
  const setAt = (db, p, v) => {
    const ks = parts(p);
    let o = db;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    if (v === null || v === undefined) delete o[ks[ks.length - 1]];
    else o[ks[ks.length - 1]] = clone(v);
  };
  const notify = () => { const db = load(); listeners.forEach((l) => l.cb(getAt(db, l.path))); };
  const write = (fn) => { const db = load(); fn(db); localStorage.setItem(KEY, JSON.stringify(db)); setTimeout(notify, 0); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });
  return {
    get: async (p) => getAt(load(), p),
    set: async (p, v) => write((db) => setAt(db, p, v)),
    update: async (p, obj) => write((db) => Object.entries(obj).forEach(([k, v]) => setAt(db, `${p}/${k}`, v))),
    subscribe: (p, cb) => {
      const l = { path: p, cb };
      listeners.add(l);
      setTimeout(() => cb(getAt(load(), p)), 0);
      return () => listeners.delete(l);
    },
  };
}

/** Show an error on the page instead of leaving it on "Loading…". */
export function showFatal(err) {
  const msg = String(err?.message || err);
  const hint = /permission.denied/i.test(msg)
    ? 'Firebase refused access. Check that the rules from <code>database.rules.json</code> are published in the Realtime Database &rarr; Rules tab.'
    : 'Check <code>js/config.js</code> (it should contain only the <code>firebaseConfig</code> object) and the browser console (F12).';
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="neg">${msg.replace(/</g, '&lt;')}</p><p>${hint}</p></div>`;
}
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

export function randomId(len = 10) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
