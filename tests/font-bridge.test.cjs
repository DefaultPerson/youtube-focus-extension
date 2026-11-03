const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../extension/font-main.js'), 'utf8');
function bridge() {
  const listeners = {}, links = [];
  const document = {
    addEventListener(name, listener) { listeners[name] = listener; },
    dispatchEvent() {},
    createElement() { const link = {isConnected: false, remove() { this.isConnected = false; }}; links.push(link); return link; },
    head: {append(link) { link.isConnected = true; }}
  };
  vm.runInNewContext(source, {document, URL, Event: class {}});
  return {links, send: detail => listeners['yfe:font-configure']({detail})};
}
test('font bridge allows only anonymous, referrer-free Google CSS and reuses its link', () => {
  const b = bridge(), url = 'https://fonts.googleapis.com/css2?family=Inter%3Awght%40400%3B500%3B600%3B700&display=swap';
  b.send(url); b.send(url);
  assert.equal(b.links.length, 1);
  assert.equal(b.links[0].crossOrigin, 'anonymous');
  assert.equal(b.links[0].referrerPolicy, 'no-referrer');
  assert.equal(b.links[0].href, url);
  b.send(''); assert.equal(b.links[0].isConnected, false);
});
test('page messages cannot redirect the bridge or attach page text/credentials', () => {
  const b = bridge();
  for (const value of [null, {}, 'javascript:alert(1)', 'https://example.com/font.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap&text=private',
    'https://user:pass@fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Other&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap#private']) b.send(value);
  assert.equal(b.links.length, 0);
});
