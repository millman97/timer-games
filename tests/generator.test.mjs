import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { generatePwa } from '../scripts/generate-pwa.mjs';

// In-memory export fixture. This never runs Expo or writes a production export.
function fixture() {
  const root = path.resolve('virtual-export');
  const files = new Map(
    Object.entries({
      'index.html': '<html>shell</html>',
      'manifest.webmanifest': '{}',
      'icons/icon-192.png': '192',
      'icons/icon-512.png': '512',
      'icons/apple-touch-icon.png': 'apple',
      'assets/digits.ttf': 'font',
      '_expo/static/chunk-hash.js': 'code',
      'style.css': 'style',
      'chunk.js.map': 'debug',
      _headers: 'headers',
      _redirects: 'routes',
    }),
  );
  const written = new Map();
  let worker = 'self.addEventListener("install", () => {});';
  const io = {
    readdir: async (folder) => {
      const relative = path.relative(root, folder).replaceAll('\\', '/');
      const prefix = relative ? `${relative}/` : '';
      const entries = new Map();
      for (const file of files.keys())
        if (file.startsWith(prefix)) {
          const remaining = file.slice(prefix.length),
            name = remaining.split('/')[0];
          entries.set(name, remaining.includes('/'));
        }
      return [...entries].map(([name, directory]) => ({ name, isDirectory: () => directory }));
    },
    readFile: async (file) => {
      if (file instanceof URL)
        return file.pathname.endsWith('service-worker.js') ? worker : 'generator source';
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (!files.has(relative)) throw Error('File absent');
      return files.get(relative);
    },
    writeFile: async (file, content) => written.set(file, content),
  };
  return {
    root,
    files,
    io,
    written,
    setWorker: (value) => {
      worker = value;
    },
  };
}

describe('PWA generator with fully mocked filesystem', () => {
  it('precaches complete shell including nested chunks and fonts, excluding hosting controls and maps', async () => {
    const f = fixture();
    const result = await generatePwa(f.root, f.io);
    const script = f.written.get(path.join(f.root, 'sw.js'));
    assert.equal(result.count, 8);
    assert.match(script, /INTEGRITY = /);
    assert.match(script, /\/assets\/digits.ttf/);
    assert.match(script, /\/_expo\/static\/chunk-hash.js/);
    assert.doesNotMatch(script, /chunk.js.map|_headers|_redirects/);
    assert.match(script, /\/roster/);
    assert.match(script, /\/play/);
  });
  it('changes the cache name for asset or worker changes, preserving coherent active builds', async () => {
    const f = fixture();
    const first = await generatePwa(f.root, f.io);
    f.files.set('index.html', '<html>new shell</html>');
    const second = await generatePwa(f.root, f.io);
    assert.notEqual(first.name, second.name);
    f.setWorker('self.addEventListener("install", () => { /* new worker */ });');
    const third = await generatePwa(f.root, f.io);
    assert.notEqual(second.name, third.name);
  });
  it('rejects incomplete output instead of generating false readiness', async () => {
    const f = fixture();
    f.files.delete('assets/digits.ttf');
    await assert.rejects(generatePwa(f.root, f.io), /digit font/);
    f.files.delete('icons/icon-512.png');
    await assert.rejects(generatePwa(f.root, f.io), /Missing export asset/);
    assert.equal(f.written.size, 0);
  });
});
