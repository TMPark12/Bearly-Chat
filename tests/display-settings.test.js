const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'display-settings.js'), 'utf8');

test('separate pages follow saved display preferences and changes from another tab', () => {
  for (const page of ['privacy.html', 'terms.html', 'location-setup.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /script-src 'self'/);
    assert.match(html, /src="display-settings\.js"/);
  }
  const storage = new Map([['bearly-chat-settings', JSON.stringify({ largeText: true, contrast: true, reduceMotion: false })]]);
  const classes = new Set();
  let onStorage;
  const context = {
    localStorage: { getItem(key) { return storage.get(key) ?? null; } },
    document: { documentElement: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } } },
    window: { addEventListener(name, callback) { if (name === 'storage') onStorage = callback; } },
    console
  };
  vm.runInNewContext(script, context);
  assert.deepEqual([...classes], ['large-text', 'high-contrast']);
  storage.set('bearly-chat-settings', JSON.stringify({ largeText: false, reduceMotion: true }));
  onStorage({ key: 'bearly-chat-settings' });
  assert.deepEqual([...classes], ['reduce-motion']);
  storage.delete('bearly-chat-settings');
  storage.set('toddle-cation-settings', JSON.stringify({ largeText: true }));
  onStorage({ key: null });
  assert.deepEqual([...classes], ['large-text']);
});
