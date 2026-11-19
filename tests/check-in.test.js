const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const locationSetupHtml = fs.readFileSync(require('node:path').join(__dirname, '../location-setup.html'), 'utf8');

function createApp(options = {}) {
  const elements = new Map();
  function element(id = '') {
    const node = {
      id, hidden: false, disabled: false, textContent: '', value: '', dataset: {}, attributes: {}, children: [], events: {},
      classList: { toggle() {} },
      addEventListener(name, callback) { this.events[name] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      appendChild(child) {
        if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
        this.children.push(child);
        child.parentNode = this;
      },
      replaceChildren() { this.children = []; },
      focus() {},
      showModal() { this.open = true; },
      close() { this.open = false; if (this.events.close) this.events.close(); },
      click() { if (!this.disabled) return this.events.click(); }
    };
    if (id) elements.set(id, node);
    return node;
  }
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const node = element(match[1]);
    node.hidden = /\shidden(?:\s|>)/.test(match[0]);
  }
  const feeling = element();
  feeling.lastChild = { textContent: 'Happy' };
  feeling.querySelector = () => ({ textContent: '😊' });
  const sadFeeling = element();
  sadFeeling.lastChild = { textContent: 'Sad' };
  sadFeeling.querySelector = () => ({ textContent: '😢' });
  const madFeeling = element();
  madFeeling.lastChild = { textContent: 'Mad' };
  madFeeling.querySelector = () => ({ textContent: '😠' });
  const feelings = element();
  const feelingChoices = [feeling, sadFeeling, madFeeling];
  if (options.allFeelings) {
    for (const match of html.matchAll(/<button class="feeling-choice"[^>]*><span class="feeling-emoji"[^>]*>([^<]+)<\/span>([^<]+)<\/button>/g)) {
      if (['Happy', 'Sad', 'Mad'].includes(match[2])) continue;
      const choice = element();
      choice.lastChild = { textContent: match[2] };
      choice.querySelector = () => ({ textContent: match[1] });
      feelingChoices.push(choice);
    }
  }
  feelingChoices.forEach(choice => feelings.appendChild(choice));
  const color = element();
  color.attributes['aria-label'] = 'Blue';
  color.dataset.color = 'blue';
  const redColor = element();
  redColor.attributes['aria-label'] = 'Red';
  redColor.dataset.color = 'red';
  const yellowColor = element();
  yellowColor.attributes['aria-label'] = 'Yellow';
  yellowColor.dataset.color = 'yellow';
  const colorChoices = [color, redColor, yellowColor];
  const colors = element();
  colorChoices.forEach(choice => colors.appendChild(choice));
  const sound = element();
  const handlers = {};
  const storage = options.storageValues || new Map();
  const records = options.records || [];
  const metadata = options.metadata || new Map();
  if (options.legacy) storage.set('toddle-cation-check-ins', JSON.stringify(options.legacy));
  const localStorage = {
    getItem(key) { if (options.storageError) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (options.storageError) throw new Error('Storage unavailable'); storage.set(key, value); },
    removeItem(key) { if (options.storageError) throw new Error('Storage unavailable'); storage.delete(key); }
  };
  let request;
  const navigator = { userAgent: options.userAgent || '', platform: options.platform || '', standalone: options.standalone || false, onLine: options.online !== false };
  if (options.serviceWorker) navigator.serviceWorker = options.serviceWorker;
  if (!options.noGeolocation) navigator.geolocation = {
    getCurrentPosition(success, failure, settings) { request = { success, failure, settings }; }
  };
  const window = {
    isSecureContext: options.secure !== false,
    matchMedia() { return { matches: !!options.standalone }; },
    addEventListener(name, callback) { handlers[name] = callback; },
    location: { reload() { if (options.onReload) options.onReload(); } },
    open(url, target) {
      openedPages.push({ url, target });
      return options.popupBlocked ? null : {};
    },
    scrollTo() {}, close() {}, confirm() { return true; }
  };
  if (options.onPrint) window.print = options.onPrint;
  if (options.showDirectoryPicker) window.showDirectoryPicker = options.showDirectoryPicker;
  const spoken = [];
  const utterances = [];
  const speechEvents = {};
  function SpeechSynthesisUtterance(text) { this.text = text; }
  if (options.speech) {
    window.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
    window.speechSynthesis = {
      cancel() {}, getVoices() { return options.voices || []; },
      addEventListener(name, callback) { speechEvents[name] = callback; },
      speak(utterance) { spoken.push(utterance.text); utterances.push(utterance); }
    };
  }
  function makeDatabase(records, metadata) {
    return {
    createObjectStore() {},
    close() {},
    transaction() {
      const transaction = { pending: 0 };
      transaction.objectStore = name => {
        function execute(action) {
          const request = {};
          transaction.pending++;
          queueMicrotask(() => {
            if (options.databaseError) {
              transaction.error = new Error('Database unavailable');
              transaction.onerror();
              return;
            }
            request.result = action();
            if (request.onsuccess) request.onsuccess();
            transaction.pending--;
            if (!transaction.pending) queueMicrotask(() => {
              if (!transaction.pending) transaction.oncomplete();
            });
          });
          return request;
        }
        return {
          add(value, key) { return execute(() => {
            if (key !== undefined) { records[key - 1] = value; return key; }
            records.push(value);
            return records.length;
          }); },
          getAll() { return execute(() => records.slice()); },
          getAllKeys() { return execute(() => records.map((_, index) => index + 1)); },
          get(key) { return execute(() => name === 'metadata' ? metadata.get(key) : records[key - 1]); },
          put(value, key) { return execute(() => name === 'metadata' ? metadata.set(key, value) : (records[key - 1] = value, key)); },
          delete(key) { return execute(() => { records.splice(key - 1, 1); }); },
          clear() { return execute(() => { records.length = 0; }); }
        };
      };
      return transaction;
    }
    };
  }
  const database = makeDatabase(records, metadata);
  const oldDatabase = options.oldRecords ? makeDatabase(options.oldRecords, new Map(options.oldMetadata)) : null;
  let created = false;
  const indexedDB = {
    open(name) {
      if (name === 'toddle-cation') {
        const request = { result: oldDatabase, transaction: { abort() { queueMicrotask(() => request.onerror()); } } };
        queueMicrotask(() => oldDatabase ? request.onsuccess() : request.onupgradeneeded());
        return request;
      }
      if (options.onOpenDatabase) options.onOpenDatabase(name);
      const request = { result: database };
      queueMicrotask(() => {
        if (!created) { created = true; request.onupgradeneeded(); }
        request.onsuccess();
      });
      return request;
    }
  };
  const downloads = [];
  const downloadLinks = [];
  const openedPages = [];
  const sessionValues = options.sessionValues || new Map();
  const sessionStorage = {
    getItem(key) { return sessionValues.get(key) ?? null; },
    setItem(key, value) { sessionValues.set(key, value); },
    removeItem(key) { sessionValues.delete(key); }
  };
  const URL = { createObjectURL(blob) { if (options.downloadError) throw new Error('Download unavailable'); downloads.push(blob); return 'blob:download'; }, revokeObjectURL() {} };
  const Blob = globalThis.Blob;
  const document = {
    body: element(),
    documentElement: element(),
    getElementById(id) { assert(elements.has(id), `Missing ${id}`); return elements.get(id); },
    querySelector(selector) { return { '.feelings': feelings, '.colors': colors }[selector] || null; },
    querySelectorAll(selector) { return { '.feeling-choice': feelingChoices, '.color-choice': colorChoices, '.sound': [sound] }[selector]; },
    createElement(tag) {
      const node = element();
      if (tag === 'a') node.click = () => { downloadLinks.push(node.download); };
      return node;
    }
  };
  const testMath = Object.assign(Object.create(Math), { random: () => 0 });
  vm.runInNewContext(script, { document, window, navigator, localStorage, sessionStorage, indexedDB, URL, Blob, SpeechSynthesisUtterance, Math: testMath, setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout, console: { error() {} } });
  return {
    elements, feeling, sadFeeling, madFeeling, feelingChoices, color, redColor, storage, records, downloads, downloadLinks, openedPages, handlers, spoken, utterances, speechEvents, navigator,
    feelingOrder: feelings.children.map(choice => choice.lastChild.textContent),
    colorOrder: colors.children.map(choice => choice.getAttribute('aria-label')),
    getRequest: () => request
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function select(app) {
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
}

function chooseFeeling(app) {
  app.feeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-no').click();
}

function chooseColor(app) {
  app.color.click();
  app.elements.get('confirm-color').click();
}

function position() {
  return { coords: { latitude: 42.12, longitude: -71.34, accuracy: 10 } };
}

test('offers the demo on first installed launch and not on later launches or browser visits', () => {
  const storageValues = new Map();
  const browser = createApp({ storageValues });
  browser.handlers.load();
  assert.equal(browser.elements.get('demo-invitation').open, undefined);
  const installed = createApp({ storageValues, standalone: true });
  installed.handlers.load();
  assert.equal(installed.elements.get('demo-invitation').open, true);
  assert.equal(installed.elements.get('install-invitation').open, undefined);
  installed.elements.get('dismiss-demo').click();
  assert.equal(installed.elements.get('demo-invitation').open, false);
  const reopened = createApp({ storageValues, standalone: true });
  reopened.handlers.load();
  assert.equal(reopened.elements.get('demo-invitation').open, undefined);
});

test('first-launch demo returns to the check-in without reopening help', () => {
  const app = createApp({ standalone: true });
  app.handlers.load();
  app.elements.get('invite-demo').click();
  assert.equal(app.elements.get('demo-invitation').open, false);
  assert.equal(app.elements.get('demo-dialog').open, true);
  assert.equal(app.getRequest(), undefined);
  app.elements.get('demo-close').click();
  assert.equal(app.elements.get('help-dialog').open, undefined);
  assert.equal(app.elements.get('feelings-screen').hidden, false);
  app.elements.get('open-help').click();
  assert.equal(app.elements.get('help-dialog').open, true);
});

test('demo navigation leaves an unfinished check-in intact and does not request location', async () => {
  const app = createApp();
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('owner-notes').value = 'A note in progress';
  app.elements.get('open-help').click();
  app.elements.get('start-demo').click();
  assert.equal(app.elements.get('help-dialog').open, false);
  assert.equal(app.elements.get('demo-dialog').open, true);
  assert.equal(app.elements.get('demo-back').disabled, true);
  for (let step = 2; step <= 5; step++) {
    app.elements.get('demo-next').click();
    assert.equal(app.elements.get(`demo-step-${step}`).hidden, false);
    assert.equal(app.elements.get(`demo-step-${step - 1}`).hidden, true);
  }
  assert.equal(app.elements.get('demo-next').hidden, true);
  app.elements.get('demo-back').click();
  assert.equal(app.elements.get('demo-step-4').hidden, false);
  assert.equal(app.getRequest(), undefined);
  assert.equal(app.records.length, 0);
  app.elements.get('demo-close').click();
  assert.equal(app.elements.get('help-dialog').open, true);
  app.elements.get('close-help').click();
  assert.equal(app.elements.get('notes-screen').hidden, false);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].feeling, 'Happy');
  assert.equal(app.records[0].color, 'Blue');
  assert.equal(app.records[0].notes, 'A note in progress');
});

test('help and demo offer printing and report when printing is unavailable', () => {
  let printCalls = 0;
  const app = createApp({ onPrint: () => { printCalls++; } });
  app.elements.get('open-help').click();
  app.elements.get('help-print').click();
  assert.equal(app.elements.get('demo-dialog').open, true);
  assert.equal(printCalls, 1);
  app.elements.get('demo-print').click();
  assert.equal(printCalls, 2);
  assert.equal(app.getRequest(), undefined);

  const unavailable = createApp();
  unavailable.elements.get('open-help').click();
  unavailable.elements.get('help-print').click();
  assert.match(unavailable.elements.get('demo-print-status').textContent, /printing is unavailable/i);
});

test('help and printable demo include the installation website link', () => {
  const url = 'https://tmpark12.github.io/Bearly-Chat/';
  for (const id of ['help-dialog', 'demo-dialog']) {
    const dialog = html.match(new RegExp(`<dialog\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</dialog>`))[1];
    assert.match(dialog, /having trouble installing\?.*in a browser.*install app/i);
    assert.ok(dialog.includes(`<a href="${url}">${url}</a>`));
  }
});

test('keeps the feeling choices in their original order on load', () => {
  const app = createApp();
  assert.deepEqual(app.feelingOrder, ['Happy', 'Sad', 'Mad']);
});

test('keeps the color choices in their original order on load', () => {
  const app = createApp();
  assert.deepEqual(app.colorOrder, ['Blue', 'Red', 'Yellow']);
});

test('uses a female device voice even when a male preference was previously saved', async () => {
  const storageValues = new Map([['toddle-cation-voice-preference', 'male']]);
  const female = { name: 'Samantha', lang: 'en-US' };
  const male = { name: 'Daniel', lang: 'en-GB' };
  const voices = [female, male];
  const app = createApp({ speech: true, voices, storageValues });
  assert.equal(app.elements.has('voice-preference'), false);
  app.feeling.click();
  assert.equal(app.utterances.at(-1).voice, female);
  voices.unshift({ name: 'Samantha Enhanced', lang: 'en-US' });
  app.speechEvents.voiceschanged();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-no').click();
  app.color.click();
  assert.ok(app.utterances.every(utterance => utterance.voice === female));
  app.elements.get('decline-color').click();
  app.elements.get('back').click();
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.utterances.at(-1).text, 'Thank you!');
  assert.ok(app.utterances.every(utterance => utterance.voice === female));

  const reopened = createApp({ speech: true, voices, storageValues });
  reopened.feeling.click();
  assert.equal(reopened.utterances.at(-1).voice.name, 'Samantha Enhanced');
});

test('voice selection reports fallbacks and can retry when device voices load', () => {
  const voices = [];
  const app = createApp({ speech: true, voices });
  app.feeling.click();
  assert.equal(app.utterances.at(-1).voice, null);
  assert.match(app.elements.get('voice-status').textContent, /default voice/i);
  app.elements.get('decline-feeling').click();
  voices.push({ name: 'Unknown voice', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' });
  app.speechEvents.voiceschanged();
  app.elements.get('preview-voice').click();
  assert.match(app.elements.get('voice-status').textContent, /no matching female.*unknown voice/i);
  voices.push({ name: 'Samantha', lang: 'en-US' });
  app.elements.get('preview-voice').click();
  assert.equal(app.utterances.at(-1).voice.name, 'Samantha');

  const unsupported = createApp();
  assert.equal(unsupported.elements.get('preview-voice').disabled, true);
  assert.match(unsupported.elements.get('voice-status').textContent, /speech is unavailable/i);
});

test('Bearly Chat retains the existing installed identity and saved check-ins', async () => {
  const manifest = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Bearly Chat');
  assert.equal(manifest.short_name, 'Bearly Chat');
  assert.equal(manifest.id, './');
  assert.match(html, /class="brand"[^>]*>.*Bearly Chat/);
  let databaseName;
  const records = [{ feeling: 'Happy', color: 'Blue', localDateTime: 'Today', latitude: 42, longitude: -71, accuracyMeters: 10 }];
  const app = createApp({ records, onOpenDatabase(name) { databaseName = name; } });
  app.elements.get('open-history').click();
  await flush();
  assert.equal(databaseName, 'bearly-chat');
  assert.equal(app.records.length, 1);
  assert.match(app.elements.get('history-list').children[0].textContent, /Happy, Blue/);
});

test('migrates existing database records once and preserves the old backup', async () => {
  const oldRecords = [{ feeling: 'Happy', color: 'Blue', localDateTime: 'Today', latitude: 42, longitude: -71, accuracyMeters: 10, pendingDownload: true }];
  const records = [];
  const metadata = new Map();
  const storageValues = new Map([['toddle-cation-check-ins', JSON.stringify(oldRecords)]]);
  const options = { oldRecords, oldMetadata: [['legacy-imported', true]], records, metadata, storageValues };
  const app = createApp(options);
  app.elements.get('open-history').click();
  await flush();
  assert.equal(records.length, 1);
  assert.equal(records[0].pendingDownload, true);
  assert.equal(oldRecords.length, 1);
  assert.equal(storageValues.has('toddle-cation-check-ins'), false);

  const reopened = createApp(options);
  reopened.elements.get('open-history').click();
  await flush();
  assert.equal(records.length, 1);
  assert.match(reopened.elements.get('history-list').children[0].textContent, /Happy, Blue/);
});

test('migrates old settings and invitation flags without overwriting newer values', () => {
  const storageValues = new Map([
    ['toddle-cation-settings', JSON.stringify({ voice: false })],
    ['toddle-cation-demo-invited', 'yes']
  ]);
  const app = createApp({ storageValues, standalone: true });
  app.handlers.load();
  assert.equal(app.elements.get('setting-voice').checked, false);
  assert.equal(storageValues.has('toddle-cation-settings'), false);
  assert.equal(storageValues.get('bearly-chat-demo-invited'), 'yes');
  assert.notEqual(app.elements.get('demo-invitation').open, true);

  storageValues.set('toddle-cation-settings', JSON.stringify({ voice: true }));
  const reopened = createApp({ storageValues });
  assert.equal(reopened.elements.get('setting-voice').checked, false);
});

test('connection indicator follows the browser online and offline events', () => {
  const app = createApp({ online: false });
  const status = app.elements.get('connection-status');
  assert.equal(status.textContent, 'Offline');
  assert.equal(status.dataset.connection, 'offline');
  app.navigator.onLine = true;
  app.handlers.online();
  assert.equal(status.textContent, 'Online');
  assert.equal(status.dataset.connection, 'online');
  app.navigator.onLine = false;
  app.handlers.offline();
  assert.equal(status.textContent, 'Offline');
});

test('feeling confirmation shows and speaks the chosen emoji before continuing', async () => {
  const app = createApp({ speech: true });
  app.feeling.click();
  assert.equal(app.elements.get('feeling-dialog').open, true);
  assert.equal(app.elements.get('feeling-confirm-emoji').textContent, '😊');
  assert.equal(app.elements.get('feeling-confirm-heading').textContent, 'Happy');
  assert.deepEqual(app.spoken, ['Happy']);
  assert.equal(app.elements.get('feelings-screen').hidden, false);
  assert.equal(app.elements.get('colors-screen').hidden, true);

  app.elements.get('decline-feeling').click();
  assert.equal(app.elements.get('feeling-dialog').open, false);
  assert.equal(app.elements.get('feelings-screen').hidden, false);
  app.sadFeeling.click();
  assert.equal(app.elements.get('feeling-confirm-emoji').textContent, '😢');
  assert.equal(app.elements.get('feeling-confirm-heading').textContent, 'Sad');
  assert.deepEqual(app.spoken, ['Happy', 'Sad']);
  app.elements.get('confirm-feeling').click();
  assert.equal(app.elements.get('feeling-dialog').open, false);
  assert.equal(app.elements.get('add-feeling-dialog').open, true);
  assert.equal(app.elements.get('colors-screen').hidden, true);
  app.elements.get('add-feeling-no').click();
  assert.equal(app.elements.get('colors-screen').hidden, false);
  assert.equal(app.sadFeeling.getAttribute('aria-pressed'), 'true');
  assert.equal(app.feeling.getAttribute('aria-pressed'), 'false');
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].feeling, 'Sad');
});

test('dismissing the feeling popup leaves the previous selection unchanged', () => {
  const app = createApp();
  chooseFeeling(app);
  app.elements.get('back').click();
  app.sadFeeling.click();
  app.elements.get('feeling-dialog').events.cancel();
  app.elements.get('feeling-dialog').close();
  assert.equal(app.elements.get('feelings-screen').hidden, false);
  assert.equal(app.feeling.getAttribute('aria-pressed'), 'true');
  assert.equal(app.sadFeeling.getAttribute('aria-pressed'), 'false');
  app.feeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-no').click();
  assert.equal(app.elements.get('colors-screen').hidden, false);
});

test('up to three distinct confirmed feelings are saved and exported together', async () => {
  const app = createApp();
  app.feeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-yes').click();
  assert.equal(app.feeling.disabled, true);
  app.sadFeeling.click();
  app.elements.get('decline-feeling').click();
  assert.equal(app.feeling.getAttribute('aria-pressed'), 'true');
  app.sadFeeling.click();
  app.elements.get('confirm-feeling').click();
  assert.match(app.elements.get('selected-feelings').textContent, /Happy, Sad/);
  app.elements.get('add-feeling-yes').click();
  app.madFeeling.click();
  app.elements.get('confirm-feeling').click();
  assert.equal(app.elements.get('add-feeling-dialog').open, false);
  assert.equal(app.elements.get('colors-screen').hidden, false);
  assert.equal(app.madFeeling.getAttribute('aria-pressed'), 'true');
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].feeling, 'Happy, Sad, Mad');
  await app.elements.get('download-check-in').click();
  assert.match(await app.downloads[0].text(), /"Happy, Sad, Mad"/);
  app.elements.get('open-history').click();
  await flush();
  assert.match(app.elements.get('history-list').children[0].textContent, /Happy, Sad, Mad/);
});

test('every emoji requires confirmation before asking to add another feeling', () => {
  const app = createApp({ allFeelings: true });
  assert.equal(app.feelingChoices.length, 12);
  for (const choice of app.feelingChoices) {
    choice.click();
    assert.equal(app.elements.get('feeling-dialog').open, true);
    assert.equal(app.elements.get('feeling-confirm-heading').textContent, choice.lastChild.textContent);
    assert.equal(app.elements.get('feeling-confirm-emoji').textContent, choice.querySelector('.feeling-emoji').textContent);
    assert.notEqual(app.elements.get('add-feeling-dialog').open, true);
    app.elements.get('decline-feeling').click();
    assert.notEqual(app.elements.get('add-feeling-dialog').open, true);
    assert.equal(choice.getAttribute('aria-pressed'), undefined);
  }
  for (const [index, choice] of app.feelingChoices.slice(0, 3).entries()) {
    choice.click();
    assert.equal(app.elements.get('feeling-dialog').open, true);
    assert.notEqual(app.elements.get('add-feeling-dialog').open, true);
    assert.equal(app.elements.get('feeling-confirm-heading').textContent, choice.lastChild.textContent);
    app.elements.get('confirm-feeling').click();
    assert.equal(choice.getAttribute('aria-pressed'), 'true');
    if (index < 2) {
      assert.equal(app.elements.get('add-feeling-dialog').open, true);
      app.elements.get('add-feeling-yes').click();
    } else {
      assert.notEqual(app.elements.get('add-feeling-dialog').open, true);
      assert.equal(app.elements.get('colors-screen').hidden, false);
    }
  }
});

test('choosing no after the second feeling continues and saves both', async () => {
  const app = createApp();
  app.feeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-yes').click();
  app.sadFeeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-no').click();
  assert.equal(app.elements.get('colors-screen').hidden, false);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].feeling, 'Happy, Sad');
});

test('can stop adding feelings and replace selections when returning from colors', async () => {
  const app = createApp();
  app.feeling.click();
  app.elements.get('confirm-feeling').click();
  app.elements.get('add-feeling-yes').click();
  app.elements.get('feelings-done').click();
  app.elements.get('back').click();
  app.sadFeeling.click();
  app.elements.get('decline-feeling').click();
  assert.equal(app.feeling.getAttribute('aria-pressed'), 'true');
  app.sadFeeling.click();
  app.elements.get('confirm-feeling').click();
  assert.equal(app.feeling.getAttribute('aria-pressed'), 'false');
  let prevented = false;
  app.elements.get('add-feeling-dialog').events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.elements.get('colors-screen').hidden, false);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].feeling, 'Sad');
});

test('color confirmation shows and speaks the color, then saves only the confirmed choice', async () => {
  const app = createApp({ speech: true });
  chooseFeeling(app);
  app.color.click();
  assert.equal(app.elements.get('color-dialog').open, true);
  assert.equal(app.elements.get('color-confirm-swatch').dataset.color, 'blue');
  assert.equal(app.elements.get('color-confirm-heading').textContent, 'Blue');
  assert.equal(app.spoken.at(-1), 'Blue');
  assert.equal(app.elements.get('colors-screen').hidden, false);
  assert.equal(app.elements.get('notes-screen').hidden, true);
  app.elements.get('decline-color').click();
  assert.equal(app.elements.get('color-dialog').open, false);
  assert.equal(app.elements.get('colors-screen').hidden, false);

  app.redColor.click();
  assert.equal(app.elements.get('color-confirm-swatch').dataset.color, 'red');
  assert.equal(app.elements.get('color-confirm-heading').textContent, 'Red');
  assert.equal(app.spoken.at(-1), 'Red');
  app.elements.get('confirm-color').click();
  assert.equal(app.elements.get('color-dialog').open, false);
  assert.equal(app.elements.get('notes-screen').hidden, false);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].color, 'Red');
});

test('dismissing a new color choice stays on colors and allows another selection', async () => {
  const app = createApp();
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('back-to-colors').click();
  app.redColor.click();
  app.elements.get('color-dialog').events.cancel();
  app.elements.get('color-dialog').close();
  assert.equal(app.elements.get('colors-screen').hidden, false);
  app.elements.get('confirm-color').click();
  assert.equal(app.elements.get('colors-screen').hidden, false);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].color, 'Blue');
});

test('collects optional device owner notes on a third step before requesting location', () => {
  const app = createApp();
  chooseFeeling(app);
  assert.equal(app.elements.get('step-text').textContent, '2 of 3');
  chooseColor(app);
  assert.equal(app.elements.get('step-text').textContent, '3 of 3');
  assert.equal(app.elements.get('notes-screen').hidden, false);
  assert.equal(app.elements.get('location-dialog').open, undefined);
  app.elements.get('back-to-colors').click();
  assert.equal(app.elements.get('colors-screen').hidden, false);
  chooseColor(app);
  app.elements.get('continue-to-save').click();
  assert.equal(app.elements.get('location-dialog').open, true);
  assert.equal(app.elements.get('owner-notes').value, '');
});

test('Enter on the notes page continues to the save confirmation with the notes', async () => {
  const app = createApp();
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('owner-notes').value = 'Keyboard note';
  let prevented = false;
  app.elements.get('notes-screen').events.keydown({
    key: 'Enter', target: { closest() { return null; } },
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(app.elements.get('location-dialog').open, true);
  assert.equal(app.records.length, 0);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].notes, 'Keyboard note');
});

test('notes keyboard shortcut does not interfere with new lines, composing, or buttons', () => {
  const app = createApp();
  chooseFeeling(app);
  chooseColor(app);
  const handleKey = app.elements.get('notes-screen').events.keydown;
  for (const props of [{ shiftKey: true }, { isComposing: true }, { target: { closest() { return {}; } } }, { key: 'Escape' }]) {
    let prevented = false;
    handleKey({ key: 'Enter', target: { closest() { return null; } }, ...props, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(app.elements.get('location-dialog').open, undefined);
  }
});

test('skipping notes continues to save with an empty notes field', async () => {
  const app = createApp();
  chooseFeeling(app);
  chooseColor(app);
  app.elements.get('owner-notes').value = 'Do not include this note.';
  app.elements.get('skip-notes').click();
  assert.equal(app.elements.get('location-dialog').open, true);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records[0].notes, '');
});

test('single check-in download contains all saved data and keeps it until explicitly cleared', async () => {
  const app = createApp({ userAgent: 'Example Device Browser' });
  app.records.push({ feeling: 'Earlier', color: 'Red' });
  app.elements.get('owner-notes').value = '="quoted", note';
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  await app.elements.get('download-check-in').click();
  const csv = await app.downloads[0].text();
  assert.deepEqual(app.downloadLinks, ['check-in.csv']);
  const saved = app.records[1];
  assert.equal(csv, `"Local date","Local time","Mood","Color","Notes","Approximate location (Google Maps link)","Local date and time","Device / browser","Latitude","Longitude","Accuracy meters","UTC timestamp","UTC minus local offset minutes"\r\n"${saved.localDate.replace(/"/g, '""')}","${saved.localTime.replace(/"/g, '""')}","Happy","Blue","'=""quoted"", note","https://www.google.com/maps/search/?api=1&query=42.12%2C-71.34","${saved.localDateTime.replace(/"/g, '""')}","Example Device Browser","42.12","-71.34","10","${saved.timestamp}","${saved.timeZoneOffsetMinutes}"`);
  assert.equal(app.records.length, 2);
  assert.equal(app.records[1].pendingDownload, true);
  assert.match(app.elements.get('download-check-in-status').textContent, /download started/i);
  assert.equal(app.elements.get('download-choice-dialog').open, true);
  assert.match(html, /<h2 id="download-choice-heading">You are appreciated<\/h2>/);
  await app.elements.get('save-downloaded-data').click();
  assert.equal(app.records.length, 2);
  assert.equal(app.records[1].pendingDownload, undefined);
  app.elements.get('close-thanks').click();
  assert.equal(app.records.length, 2);
  assert.equal(app.elements.get('closed').hidden, false);
});

test('check-in download leaves the location link blank when coordinates are unavailable', async () => {
  const app = createApp();
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success({ coords: { latitude: NaN, longitude: undefined, accuracy: 10 } });
  await flush();
  await app.elements.get('download-check-in').click();
  const csv = await app.downloads[0].text();
  assert.match(csv, /"Happy","Blue","","","[^"]+","Not available","","","10"/);
});

test('an unverified download remains queued and saved across app launches until explicitly cleared', async () => {
  const records = [];
  const app = createApp({ records });
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  await app.elements.get('download-check-in').click();
  assert.equal(records[0].pendingDownload, true);
  app.elements.get('keep-pending-data').click();
  assert.equal(records[0].pendingDownload, true);
  assert.equal(records.length, 1);
  assert.equal(app.elements.has('clear-history'), false);

  const reopened = createApp({ records });
  reopened.elements.get('open-history').click();
  await flush();
  assert.match(reopened.elements.get('history-status').textContent, /waiting to be downloaded/i);
  await reopened.elements.get('download-history').click();
  assert.equal(records.length, 1);
  assert.equal(records[0].pendingDownload, true);
  await reopened.elements.get('clear-downloaded-data').click();
  assert.equal(records.length, 0);
});

test('download failure leaves the check-in saved and reports an error', async () => {
  const app = createApp({ downloadError: true });
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  await app.elements.get('download-check-in').click();
  assert.equal(app.records.length, 1);
  assert.equal(app.records[0].pendingDownload, true);
  assert.equal(app.elements.get('thanks').open, true);
  assert.match(app.elements.get('download-check-in-status').textContent, /could not download.*still saved/i);
});

test('clearing downloaded data removes only the downloaded check-in', async () => {
  const app = createApp();
  app.records.push({ feeling: 'Earlier', color: 'Red' });
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  await app.elements.get('download-check-in').click();
  app.elements.get('clear-downloaded-data').click();
  await flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.records[0].feeling, 'Earlier');
  assert.equal(app.elements.get('download-choice-dialog').open, false);
});

test('clearing an export does not delete check-ins created after its snapshot', async () => {
  const app = createApp();
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  await app.elements.get('download-history').click();
  app.records.push({ feeling: 'New', pendingDownload: true });
  await app.elements.get('clear-downloaded-data').click();
  assert.equal(app.records.length, 1);
  assert.equal(app.records[0].feeling, 'New');
  assert.equal(app.records[0].pendingDownload, true);
});

test('saves feeling, color, local time and location only after permission succeeds', async () => {
  const app = createApp({ userAgent: 'Example Device Browser' });
  app.elements.get('owner-notes').value = 'Talked about the playground.';
  select(app);
  assert.equal(app.elements.get('location-dialog').open, true);
  assert.equal(app.records.length, 0);
  app.elements.get('save-check-in').click();
  assert.equal(app.getRequest().settings.maximumAge, 0);
  app.getRequest().success(position());
  await flush();
  const [entry] = app.records;
  assert.equal(entry.feeling, 'Happy');
  assert.equal(entry.color, 'Blue');
  assert.equal(entry.notes, 'Talked about the playground.');
  assert.ok(entry.localDate);
  assert.ok(entry.localTime);
  assert.equal(entry.device, 'Example Device Browser');
  assert.ok(entry.localDateTime);
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
  assert.equal(typeof entry.timeZoneOffsetMinutes, 'number');
  assert.equal(entry.latitude, 42.12);
  assert.equal(entry.longitude, -71.34);
  assert.equal(entry.accuracyMeters, 10);
  assert.equal(app.elements.get('thanks').open, true);
  app.elements.get('open-history').click();
  await flush();
  assert.match(app.elements.get('history-list').children[0].textContent, /Happy, Blue\. Notes: Talked about the playground\..*42\.12, -71\.34/);
  app.elements.get('download-history').click();
  await flush();
  const csv = await app.downloads[0].text();
  assert.match(csv, /Local date","Local time","Mood","Color","Device \/ browser/);
  assert.match(csv, /"UTC minus local offset minutes","Notes"/);
  assert.match(csv, /"Notes","Local date and time"/);
  assert.ok(csv.includes(`"${entry.localDateTime}"`));
  assert.match(csv, /"Happy","Blue","Example Device Browser","42\.12","-71\.34","10".*"Talked about the playground\."/);
  assert.match(csv, /"Happy","Blue","Example Device Browser","42\.12","-71\.34","10"/);
  assert.deepEqual(app.downloadLinks, ['checkins.csv']);
  await flush();
  assert.equal(app.records[0].pendingDownload, true);
  await app.elements.get('clear-downloaded-data').click();
  assert.equal(app.records.length, 0);
});

test('exports all entries to a checkins folder in the selected directory', async () => {
  let written;
  const calls = [];
  const handle = {
    async createWritable() {
      return {
        async write(file) { written = await file.text(); },
        async close() { calls.push('closed'); }
      };
    }
  };
  const folder = { async getFileHandle(name, options) { calls.push([name, options.create]); return handle; } };
  const parent = { async getDirectoryHandle(name, options) { calls.push([name, options.create]); return folder; } };
  const app = createApp({ userAgent: 'Device "A", browser', showDirectoryPicker(options) {
    calls.push(['picker', options.mode]);
    return Promise.resolve(parent);
  } });
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  app.records.push({ feeling: 'Sad', color: 'Red', timestamp: '2026-01-02T03:04:05.000Z', timeZoneOffsetMinutes: 300, latitude: 1, longitude: 2, accuracyMeters: 3 });
  await app.elements.get('download-history').click();
  assert.deepEqual(calls, [['picker', 'readwrite'], ['checkins', true], ['checkins.csv', true], 'closed']);
  assert.match(written, /"Device ""A"", browser"/);
  assert.match(written, /"2026-01-01","22:04:05","Sad","Red","Not recorded","1","2","3"/);
  assert.match(app.elements.get('history-status').textContent, /saved checkins\/checkins\.csv/i);
  assert.equal(app.downloads.length, 0);
  assert.equal(app.elements.get('download-choice-dialog').open, true);
  app.elements.get('clear-downloaded-data').click();
  await flush();
  assert.equal(app.records.length, 0);
});

test('folder selection cancellation and permission errors are reported without deleting check-ins', async () => {
  for (const [error, expected] of [[Object.assign(new Error('cancelled'), { name: 'AbortError' }), /cancelled/i], [new Error('denied'), /could not export/i]]) {
    const app = createApp({ showDirectoryPicker() { return Promise.reject(error); } });
    app.records.push({ feeling: 'Happy' });
    await app.elements.get('download-history').click();
    assert.match(app.elements.get('history-status').textContent, expected);
    assert.equal(app.records.length, 1);
  }
});

test('a failed file write reports an error and keeps the local database', async () => {
  const app = createApp({ showDirectoryPicker() {
    return Promise.resolve({
      async getDirectoryHandle() {
        return { async getFileHandle() { throw new Error('Permission denied'); } };
      }
    });
  } });
  app.records.push({ feeling: 'Happy', color: 'Red' });
  await app.elements.get('download-history').click();
  assert.match(app.elements.get('history-status').textContent, /could not export/i);
  assert.equal(app.records.length, 1);
});

test('denied or unavailable location cannot save and allows retry', async () => {
  const app = createApp();
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().failure({ code: 1 });
  assert.match(app.elements.get('location-status').textContent, /denied/i);
  assert.equal(app.records.length, 0);
  assert.equal(app.elements.get('thanks').open, undefined);
  app.elements.get('save-check-in').click();
  app.getRequest().failure({ code: 3 });
  assert.match(app.elements.get('location-status').textContent, /could not get/i);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records.length, 1);
});

test('cancelling while locating prevents a late result from saving', async () => {
  const app = createApp();
  select(app);
  app.elements.get('save-check-in').click();
  const oldRequest = app.getRequest();
  app.elements.get('cancel-save').click();
  select(app);
  app.elements.get('save-check-in').click();
  oldRequest.success(position());
  assert.equal(app.records.length, 0);
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records.length, 1);
});

test('storage failure keeps the check-in unsaved and reports the error', async () => {
  for (const options of [{ storageError: true }, { databaseError: true }]) {
    const app = createApp(options);
    select(app);
    app.elements.get('save-check-in').click();
    app.getRequest().success(position());
    await flush();
    assert.match(app.elements.get('location-status').textContent, /could not save/i);
    assert.equal(app.elements.get('thanks').open, undefined);
    assert.equal(app.elements.get('save-check-in').disabled, false);
  }
});

test('unsupported or insecure location does not save', () => {
  for (const options of [{ noGeolocation: true }, { secure: false }]) {
    const app = createApp(options);
    select(app);
    app.elements.get('save-check-in').click();
    assert.match(app.elements.get('location-status').textContent, /location is unavailable/i);
    assert.equal(app.getRequest(), undefined);
    assert.equal(app.records.length, 0);
  }
});

test('migrates earlier check-ins and clears them only after export', async () => {
  const entry = { feeling: 'Happy', color: 'Blue', localDateTime: 'Today', latitude: 42, longitude: -71, accuracyMeters: 10 };
  const app = createApp({ legacy: [entry] });
  app.elements.get('open-history').click();
  await flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.storage.size, 0);
  await app.elements.get('download-history').click();
  assert.equal(app.records.length, 1);
  await app.elements.get('clear-downloaded-data').click();
  assert.equal(app.records.length, 0);
});

test('old location setup page directs users back to install without asking for location', () => {
  assert.match(locationSetupHtml, /location setup is no longer needed/i);
  assert.match(locationSetupHtml, /href="\.\/"/);
  assert.doesNotMatch(locationSetupHtml, /getCurrentPosition|allow-location/);
});

test('install invitation appears once per session and not in standalone mode', () => {
  const sessionValues = new Map();
  const app = createApp({ sessionValues });
  app.handlers.load();
  assert.equal(app.elements.get('install-invitation').open, true);
  app.elements.get('invite-dismiss').click();
  assert.equal(app.elements.get('install-invitation').open, false);
  const reloaded = createApp({ sessionValues });
  reloaded.handlers.load();
  assert.equal(reloaded.elements.get('install-invitation').open, undefined);
  const installed = createApp({ standalone: true });
  installed.handlers.load();
  assert.equal(installed.elements.get('install-invitation').open, undefined);
  assert.equal(installed.elements.get('install-button').hidden, true);
});

test('native install prompt launches immediately without location setup', async () => {
  for (const entry of ['invite-install', 'install-button']) {
    const app = createApp({ noGeolocation: entry === 'install-button' });
    let prompted = 0;
    let prevented = false;
    app.handlers.beforeinstallprompt({
      preventDefault() { prevented = true; },
      prompt() { prompted++; return Promise.resolve({ outcome: 'accepted' }); }
    });
    if (entry === 'invite-install') app.handlers.load();
    assert.equal(app.elements.has('invite-location'), false);
    assert.equal(app.elements.has('install-location'), false);
    app.elements.get(entry).click();
    assert.equal(prevented, true);
    assert.equal(prompted, 1);
    assert.equal(app.getRequest(), undefined);
    assert.equal(app.openedPages.length, 0);
    await flush();
    assert.match(app.elements.get('install-instructions').textContent, /installation started/i);
    assert.equal(app.elements.get('install-dialog').open, true);
    app.elements.get('install-done').click();
    assert.notEqual(app.elements.get('install-invitation').open, true);
    app.handlers.appinstalled();
    assert.equal(app.elements.get('install-button').hidden, true);
  }
});

test('install help appears immediately when native prompt is unavailable', () => {
  const app = createApp({ userAgent: 'iPhone', platform: 'iPhone', noGeolocation: true });
  app.handlers.load();
  app.elements.get('invite-install').click();
  assert.equal(app.elements.get('install-dialog').open, true);
  assert.match(app.elements.get('install-instructions').textContent, /Share.*Add to Home Screen/);
  assert.equal(app.getRequest(), undefined);
  assert.equal(app.openedPages.length, 0);
  app.elements.get('install-done').click();
  assert.equal(app.elements.get('install-dialog').open, false);
  assert.equal(app.elements.get('install-invitation').open, false);
});

test('dismissed and failed native prompts do not claim installation succeeded', async () => {
  const dismissed = createApp();
  dismissed.handlers.beforeinstallprompt({ preventDefault() {}, prompt() { return Promise.resolve({ outcome: 'dismissed' }); } });
  await dismissed.elements.get('install-button').click();
  assert.notEqual(dismissed.elements.get('install-dialog').open, true);
  assert.equal(dismissed.elements.get('install-button').hidden, false);
  dismissed.elements.get('install-button').click();
  assert.match(dismissed.elements.get('install-instructions').textContent, /Open your browser menu/);
  const failed = createApp();
  failed.handlers.beforeinstallprompt({ preventDefault() {}, prompt() { return Promise.reject(new Error('unavailable')); } });
  await failed.elements.get('install-button').click();
  assert.match(failed.elements.get('install-instructions').textContent, /could not open.*install/i);
  assert.equal(failed.elements.get('install-dialog').open, true);
});

test('installed app applies a waiting update before showing the demo or check-in', async () => {
  const serviceEvents = {};
  const messages = [];
  let reloaded = false;
  const registration = {
    waiting: { postMessage(message) { messages.push(message.type); } },
    addEventListener() {}
  };
  const serviceWorker = {
    controller: {},
    addEventListener(name, callback) { serviceEvents[name] = callback; },
    register(url, options) {
      assert.equal(url, './service-worker.js');
      assert.equal(options.updateViaCache, 'none');
      return Promise.resolve(registration);
    }
  };
  const app = createApp({ standalone: true, serviceWorker, onReload() { reloaded = true; } });
  app.handlers.load();
  assert.equal(app.elements.get('startup-update-dialog').open, true);
  assert.equal(app.elements.get('demo-invitation').open, undefined);
  await flush();
  assert.deepEqual(messages, ['SKIP_WAITING']);
  assert.match(app.elements.get('startup-update-status').textContent, /updating.*few moments/i);
  serviceEvents.controllerchange();
  assert.equal(reloaded, true);
});

test('installed app checks for updates and waits for a new worker to install', async () => {
  const registrationEvents = {};
  const workerEvents = {};
  const serviceEvents = {};
  const messages = [];
  let resolveCheck;
  let reloaded = false;
  const worker = {
    state: 'installing',
    addEventListener(name, callback) { workerEvents[name] = callback; },
    postMessage(message) { messages.push(message.type); }
  };
  const registration = {
    active: {}, waiting: null, installing: null,
    addEventListener(name, callback) { registrationEvents[name] = callback; },
    update() { return new Promise(resolve => { resolveCheck = resolve; }); }
  };
  const serviceWorker = {
    controller: {},
    addEventListener(name, callback) { serviceEvents[name] = callback; },
    register() { return Promise.resolve(registration); }
  };
  const app = createApp({ standalone: true, serviceWorker, onReload() { reloaded = true; } });
  app.handlers.load();
  await flush();
  registration.installing = worker;
  registrationEvents.updatefound();
  resolveCheck();
  await flush();
  assert.equal(app.elements.get('startup-update-dialog').open, true);
  assert.deepEqual(messages, []);
  registration.installing = null;
  registration.waiting = worker;
  worker.state = 'installed';
  workerEvents.statechange();
  assert.deepEqual(messages, ['SKIP_WAITING']);
  serviceEvents.controllerchange();
  assert.equal(reloaded, true);
});

test('installed app reloads after activating an update when the page has no controller', async () => {
  const workerEvents = {};
  const messages = [];
  let reloaded = false;
  const worker = {
    state: 'installed',
    addEventListener(name, callback) { workerEvents[name] = callback; },
    postMessage(message) { messages.push(message.type); }
  };
  const registration = { active: {}, waiting: worker, installing: null, addEventListener() {} };
  const serviceWorker = { controller: null, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ standalone: true, serviceWorker, onReload() { reloaded = true; } });
  app.handlers.load();
  await flush();
  assert.deepEqual(messages, ['SKIP_WAITING']);
  worker.state = 'activated';
  workerEvents.statechange();
  assert.equal(reloaded, true);
});

test('installed app starts normally after a successful check with no update', async () => {
  let checks = 0;
  const registration = {
    active: {}, waiting: null, installing: null, addEventListener() {},
    update() { checks++; return Promise.resolve(); }
  };
  const serviceWorker = { controller: {}, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ standalone: true, serviceWorker });
  app.handlers.load();
  assert.equal(app.elements.get('demo-invitation').open, undefined);
  await flush();
  assert.equal(checks, 1);
  assert.equal(app.elements.get('startup-update-dialog').open, false);
  assert.equal(app.elements.get('demo-invitation').open, true);
});

test('installed app opens without waiting for an update when offline', async () => {
  let checks = 0;
  const registration = {
    active: {}, waiting: null, installing: null, addEventListener() {},
    update() { checks++; return Promise.resolve(); }
  };
  const serviceWorker = { controller: {}, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ standalone: true, online: false, serviceWorker });
  app.handlers.load();
  await flush();
  assert.equal(app.elements.get('connection-status').textContent, 'Offline');
  assert.equal(app.elements.get('startup-update-dialog').open, undefined);
  assert.equal(app.elements.get('demo-invitation').open, true);
  assert.equal(checks, 0);
});

test('failed startup check offers continuing without an update', async () => {
  const registration = {
    active: {}, waiting: null, installing: null, addEventListener() {},
    update() { return Promise.reject(new Error('offline')); }
  };
  const serviceWorker = { controller: {}, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ standalone: true, serviceWorker });
  app.handlers.load();
  await flush();
  assert.match(app.elements.get('startup-update-status').textContent, /could not check/i);
  assert.equal(app.elements.get('startup-continue').hidden, false);
  app.elements.get('startup-continue').click();
  assert.equal(app.elements.get('startup-update-dialog').open, false);
  assert.equal(app.elements.get('demo-invitation').open, true);
});

test('a failed worker installation is reported even if the update check resolves', async () => {
  const registrationEvents = {};
  const workerEvents = {};
  let resolveCheck;
  const worker = { state: 'installing', addEventListener(name, callback) { workerEvents[name] = callback; } };
  const registration = {
    active: {}, waiting: null, installing: null,
    addEventListener(name, callback) { registrationEvents[name] = callback; },
    update() { return new Promise(resolve => { resolveCheck = resolve; }); }
  };
  const serviceWorker = { controller: {}, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ standalone: true, serviceWorker });
  app.handlers.load();
  await flush();
  registration.installing = worker;
  registrationEvents.updatefound();
  registration.installing = null;
  worker.state = 'redundant';
  workerEvents.statechange();
  resolveCheck();
  await flush();
  assert.equal(app.elements.get('startup-update-dialog').open, true);
  assert.match(app.elements.get('startup-update-status').textContent, /could not be installed/i);
  app.elements.get('startup-continue').click();
  assert.equal(app.elements.get('demo-invitation').open, true);
});

test('continuing after a slow update prevents a late activation from interrupting a check-in', async () => {
  const timers = [];
  const serviceEvents = {};
  let reloaded = false;
  const registration = {
    waiting: { postMessage() {} },
    addEventListener() {}
  };
  const serviceWorker = {
    controller: {},
    addEventListener(name, callback) { serviceEvents[name] = callback; },
    register() { return Promise.resolve(registration); }
  };
  const app = createApp({
    standalone: true, serviceWorker, onReload() { reloaded = true; },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {}
  });
  app.handlers.load();
  await flush();
  timers[0]();
  assert.match(app.elements.get('startup-update-status').textContent, /taking longer/i);
  app.elements.get('startup-continue').click();
  serviceEvents.controllerchange();
  assert.equal(reloaded, false);
  assert.equal(app.elements.get('update-notice').hidden, false);
  assert.match(app.elements.get('update-status').textContent, /reload.*after finishing/i);
  app.elements.get('update-app').click();
  assert.equal(reloaded, true);
});

test('offers a waiting update, applies it on request, and keeps saved check-ins', async () => {
  const serviceEvents = {};
  const messages = [];
  let reloaded = false;
  const registration = {
    waiting: { postMessage(message) { messages.push(message.type); } },
    addEventListener() {}
  };
  const serviceWorker = {
    controller: {},
    addEventListener(name, callback) { serviceEvents[name] = callback; },
    register() { return Promise.resolve(registration); }
  };
  const app = createApp({ serviceWorker, onReload() { reloaded = true; } });
  select(app);
  app.elements.get('save-check-in').click();
  app.getRequest().success(position());
  await flush();
  assert.equal(app.records.length, 1);
  assert.equal(app.elements.get('update-notice').hidden, false);
  assert.equal(app.records[0].pendingDownload, true);
  app.elements.get('update-app').click();
  assert.deepEqual(messages, ['SKIP_WAITING']);
  assert.equal(reloaded, false);
  serviceEvents.controllerchange();
  assert.equal(reloaded, true);
  assert.equal(app.records.length, 1);
  app.elements.get('open-history').click();
  await flush();
  assert.match(app.elements.get('history-status').textContent, /waiting to be downloaded/i);
  await app.elements.get('download-history').click();
  assert.equal(app.records[0].pendingDownload, true);
  assert.equal(app.records.length, 1);
  await app.elements.get('save-downloaded-data').click();
  assert.equal(app.records[0].pendingDownload, undefined);
});

test('offers a newly installed update but not a first offline installation', async () => {
  for (const controlled of [true, false]) {
    const registrationEvents = {};
    const workerEvents = {};
    const worker = { state: 'installing', addEventListener(name, callback) { workerEvents[name] = callback; } };
    const registration = {
      waiting: null,
      installing: worker,
      addEventListener(name, callback) { registrationEvents[name] = callback; }
    };
    const serviceWorker = {
      controller: controlled ? {} : null,
      addEventListener() {},
      register() { return Promise.resolve(registration); }
    };
    const app = createApp({ serviceWorker });
    await flush();
    assert.equal(app.elements.get('update-notice').hidden, true);
    registrationEvents.updatefound();
    worker.state = 'installed';
    registration.waiting = worker;
    workerEvents.statechange();
    assert.equal(app.elements.get('update-notice').hidden, !controlled);
  }
});

test('reports when the update can no longer be started', async () => {
  const registration = { waiting: {}, addEventListener() {} };
  const serviceWorker = { controller: {}, addEventListener() {}, register() { return Promise.resolve(registration); } };
  const app = createApp({ serviceWorker });
  await flush();
  registration.waiting = null;
  app.elements.get('update-app').click();
  assert.match(app.elements.get('update-status').textContent, /no longer available/i);
});

test('settings screen saves preferences, mutes speech and returns to the check-in', () => {
  const app = createApp();
  const { elements } = app;
  elements.get('setting-voice').checked = false;
  elements.get('setting-voice').events.change({ target: elements.get('setting-voice') });
  assert.equal(JSON.parse(app.storage.get('bearly-chat-settings')).voice, false);
  const spokenBefore = app.utterances.length;
  elements.get('thank-message').click();
  assert.equal(app.utterances.length, spokenBefore);
  elements.get('setting-rate').events.input({ target: { value: '1.2' } });
  assert.equal(JSON.parse(app.storage.get('bearly-chat-settings')).rate, 1.2);
  elements.get('open-settings').click();
  assert.equal(elements.get('settings-screen').hidden, false);
  assert.equal(elements.get('feelings-screen').hidden, true);
  elements.get('close-settings').click();
  assert.equal(elements.get('settings-screen').hidden, true);
  assert.equal(elements.get('feelings-screen').hidden, false);
});
