const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('caches the app and serves its pages and styles when offline', async () => {
  const handlers = {};
  const files = new Map([
    ['./index.html', 'cached page'],
    ['./location-setup.html', 'cached location page'],
    ['./privacy.html', 'cached privacy page'],
    ['./terms.html', 'cached terms page'],
    ['./style.css', 'cached styles'],
    ['./translations.js', 'cached translations']
  ]);
  let precached;
  const cache = {
    addAll(paths) { precached = paths; return Promise.resolve(); },
    match(key) { return Promise.resolve(files.get(typeof key === 'string' ? key : key.path)); }
  };
  const context = {
    self: { location: { origin: 'https://example.test' }, addEventListener(name, callback) { handlers[name] = callback; } },
    caches: { open() { return Promise.resolve(cache); } },
    fetch() { return Promise.reject(new Error('offline')); },
    URL, Response
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), context);
  let pending;
  handlers.install({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.ok(precached.includes('./index.html'));
  assert.ok(precached.includes('./location-setup.html'));
  assert.ok(precached.includes('./privacy.html'));
  assert.ok(precached.includes('./terms.html'));
  assert.ok(precached.includes('./style.css'));
  assert.ok(precached.includes('./display-settings.js'));
  assert.ok(precached.includes('./translations.js'));
  assert.ok(precached.includes('./manifest.webmanifest'));
  assert.ok(precached.includes('./icons/icon-180.png'));
  assert.ok(precached.includes('./icons/icon-192.png'));
  assert.ok(precached.includes('./icons/icon-512.png'));
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/', mode: 'navigate', path: './' },
    respondWith(promise) { pending = promise; }
  });
  assert.equal(await pending, 'cached page');
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/location-setup.html', mode: 'navigate', path: './location-setup.html' },
    respondWith(promise) { pending = promise; }
  });
  assert.equal(await pending, 'cached location page');
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/privacy.html', mode: 'navigate', path: './privacy.html' },
    respondWith(promise) { pending = promise; }
  });
  assert.equal(await pending, 'cached privacy page');
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/terms.html', mode: 'navigate', path: './terms.html' },
    respondWith(promise) { pending = promise; }
  });
  assert.equal(await pending, 'cached terms page');
  handlers.fetch({
    request: { method: 'GET', url: 'https://example.test/style.css', mode: 'no-cors', path: './style.css' },
    respondWith(promise) { pending = promise; }
  });

  assert.equal(await pending, 'cached styles');
});

test('activates a waiting worker only when an update is requested', async () => {
  const handlers = {};
  let activations = 0;
  const context = {
    self: {
      addEventListener(name, callback) { handlers[name] = callback; },
      skipWaiting() { activations++; return Promise.resolve(); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), context);
  let pending;
  handlers.message({ data: { type: 'OTHER' }, waitUntil(promise) { pending = promise; } });
  assert.equal(activations, 0);
  handlers.message({ data: { type: 'SKIP_WAITING' }, waitUntil(promise) { pending = promise; } });
  await pending;
  assert.equal(activations, 1);
});

test('removes old app caches without touching unrelated caches', async () => {
  const handlers = {};
  const deleted = [];
  const context = {
    self: { addEventListener(name, callback) { handlers[name] = callback; } },
    caches: {
      keys() { return Promise.resolve(['toddle-cation-v29', 'bearly-chat-v29', 'bearly-chat-v30', 'bearly-chat-v31', 'bearly-chat-v32', 'bearly-chat-v33', 'bearly-chat-v34', 'bearly-chat-v35', 'bearly-chat-v36', 'bearly-chat-v37', 'bearly-chat-v38', 'bearly-chat-v39', 'bearly-chat-v40', 'bearly-chat-v41', 'bearly-chat-v42', 'another-app']); },
      delete(key) { deleted.push(key); return Promise.resolve(true); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), context);
  let pending;
  handlers.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['toddle-cation-v29', 'bearly-chat-v29', 'bearly-chat-v30', 'bearly-chat-v31', 'bearly-chat-v32', 'bearly-chat-v33', 'bearly-chat-v34', 'bearly-chat-v35', 'bearly-chat-v36', 'bearly-chat-v37', 'bearly-chat-v38', 'bearly-chat-v39', 'bearly-chat-v40', 'bearly-chat-v41', 'bearly-chat-v42']);
});
