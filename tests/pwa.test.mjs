import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8');
function harness({
  fail = false,
  safe = true,
  mismatch = false,
  activationFails = false,
  clientClosed = false,
} = {}) {
  const events = new Map(),
    stores = new Map([
      ['timer-games-previous', new Map([['/index.html', new Response('previous build')]])],
    ]);
  let claimed = false,
    skipped = false,
    handshakes = 0,
    aborts = 0;
  const shell = [
    '/index.html',
    '/chunk.js',
    '/font.ttf',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
  ];
  const cache = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        match: async (url) => map.get(url)?.clone(),
        put: async (url, response) => map.set(url, response.clone()),
      };
    },
    delete: async (name) => stores.delete(name),
    keys: async () => [...stores.keys()],
  };
  class Channel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { postMessage: (data) => this.port1.onmessage?.({ data }) };
    }
  }
  vm.runInNewContext(source, {
    CACHE_NAME: 'timer-games-current',
    SHELL: shell,
    ROUTES: ['/', '/play', '/setup', '/roster'],
    caches: cache,
    crypto: webcrypto,
    INTEGRITY: Object.fromEntries(
      shell.map((url) => [
        url,
        createHash('sha256')
          .update(url.endsWith('index.html') ? 'current build' : 'asset')
          .digest('hex'),
      ]),
    ),
    URL,
    Response,
    Request: class extends Request {
      constructor(url, options) {
        super(new URL(url, 'https://game.test'), options);
      }
    },
    fetch: async (req) => {
      if (fail && req.url.endsWith('font.ttf')) throw Error('Network interrupted');
      return new Response(
        mismatch ? 'different build' : req.url.endsWith('index.html') ? 'current build' : 'asset',
        {
          headers: {
            'Content-Type': req.url.endsWith('index.html')
              ? 'text/html'
              : 'application/octet-stream',
          },
        },
      );
    },
    MessageChannel: Channel,
    setTimeout,
    clearTimeout,
    self: {
      location: { origin: 'https://game.test' },
      addEventListener: (name, fn) => events.set(name, fn),
      clients: {
        claim: async () => {
          claimed = true;
        },
        matchAll: async () => {
          handshakes++;
          return [
            {
              postMessage: ({ type }, ports) => {
                if (clientClosed) throw Error('Tab closed');
                if (type === 'UPDATE_ABORT') aborts++;
                ports?.[0]?.postMessage({ safe });
              },
            },
          ];
        },
      },
      skipWaiting: async () => {
        if (activationFails) throw Error('Activation failed');
        skipped = true;
      },
    },
  });
  const trigger = (name, extra = {}) => {
    let pending;
    events.get(name)({
      waitUntil: (value) => {
        pending = value;
      },
      ...extra,
    });
    return pending;
  };
  return {
    stores,
    shell,
    trigger,
    claimed: () => claimed,
    skipped: () => skipped,
    handshakes: () => handshakes,
    aborts: () => aborts,
  };
}

describe('production worker with mocked browser APIs', () => {
  it('caches every shell resource before reporting offline readiness', async () => {
    const h = harness();
    await h.trigger('install');
    assert.deepEqual([...h.stores.get('timer-games-current').keys()], h.shell);
    let answer;
    await h.trigger('message', {
      data: { type: 'CHECK_CACHE' },
      ports: [
        {
          postMessage: (data) => {
            answer = data;
          },
        },
      ],
    });
    assert.equal(answer.ready, true);
    assert.equal(h.skipped(), false);
    await h.trigger('activate');
    assert.equal(h.claimed(), true);
  });
  it('failed installation leaves the previous working build intact', async () => {
    const h = harness({ fail: true });
    await assert.rejects(h.trigger('install'));
    assert.equal(h.stores.has('timer-games-current'), false);
    assert.equal(
      await h.stores.get('timer-games-previous').get('/index.html').text(),
      'previous build',
    );
  });
  it('rejects a mismatched build and repairs an evicted resource only with matching bytes', async () => {
    const bad = harness({ mismatch: true });
    await assert.rejects(bad.trigger('install'));
    const h = harness();
    await h.trigger('install');
    h.stores.get('timer-games-current').delete('/font.ttf');
    let answer;
    await h.trigger('message', {
      data: { type: 'CHECK_CACHE' },
      ports: [
        {
          postMessage: (data) => {
            answer = data;
          },
        },
      ],
    });
    assert.equal(answer.ready, false);
    await h.trigger('message', {
      data: { type: 'REPAIR_CACHE' },
      ports: [
        {
          postMessage: (data) => {
            answer = data;
          },
        },
      ],
    });
    assert.equal(answer.ready, true);
  });
  it('serves the cached shell for known navigation and never HTML for missing assets', async () => {
    const h = harness();
    await h.trigger('install');
    let response;
    h.trigger('fetch', {
      request: { url: 'https://game.test/play', method: 'GET', mode: 'navigate' },
      respondWith: (p) => {
        response = p;
      },
    });
    assert.equal(await (await response).text(), 'current build');
    response = null;
    h.trigger('fetch', {
      request: { url: 'https://game.test/missing.js', method: 'GET', mode: 'navigate' },
      respondWith: (p) => {
        response = p;
      },
    });
    assert.equal(response, null);
    response = null;
    h.trigger('fetch', {
      request: { url: 'https://external.test/chunk.js', method: 'GET', mode: 'cors' },
      respondWith: (p) => {
        response = p;
      },
    });
    assert.equal(response, null);
  });
  it('keeps earlier content-hashed chunks available to existing clients', async () => {
    const h = harness();
    await h.trigger('install');
    h.stores
      .get('timer-games-previous')
      .set(
        '/old-hash.js',
        new Response('old chunk', { headers: { 'Content-Type': 'application/javascript' } }),
      );
    let response;
    h.trigger('fetch', {
      request: { url: 'https://game.test/old-hash.js', method: 'GET', mode: 'cors' },
      respondWith: (p) => {
        response = p;
      },
    });
    assert.equal(await (await response).text(), 'old chunk');
  });
  for (const safe of [true, false])
    it(`${safe ? 'accepts' : 'rejects'} updates when clients report ${safe ? 'safe' : 'active matches'}`, async () => {
      const h = harness({ safe });
      await h.trigger('install');
      let answer;
      await h.trigger('message', {
        data: { type: 'APPLY_UPDATE' },
        ports: [
          {
            postMessage: (data) => {
              answer = data;
            },
          },
        ],
      });
      assert.equal(answer.accepted, safe);
      assert.equal(h.skipped(), safe);
      assert.equal(h.aborts(), safe ? 0 : 1);
    });

  it('shares one safety handshake between simultaneous automatic update requests', async () => {
    const h = harness();
    await h.trigger('install');
    const answers = [];
    const request = () =>
      h.trigger('message', {
        data: { type: 'APPLY_UPDATE' },
        ports: [{ postMessage: (data) => answers.push(data.accepted) }],
      });
    await Promise.all([request(), request()]);
    assert.deepEqual(answers, [true, true]);
    assert.equal(h.handshakes(), 1);
    assert.equal(h.aborts(), 0);
  });

  it('unlocks clients after a failed activation and permits a later retry', async () => {
    const h = harness({ activationFails: true });
    await h.trigger('install');
    const answers = [];
    for (let i = 0; i < 2; i++)
      await h.trigger('message', {
        data: { type: 'APPLY_UPDATE' },
        ports: [{ postMessage: (data) => answers.push(data.accepted) }],
      });
    assert.deepEqual(answers, [false, false]);
    assert.equal(h.handshakes(), 2);
    assert.equal(h.aborts(), 2);
    assert.equal(h.skipped(), false);
  });

  it('defers safely if a client closes during its safety check', async () => {
    const h = harness({ clientClosed: true });
    await h.trigger('install');
    let accepted;
    await h.trigger('message', {
      data: { type: 'APPLY_UPDATE' },
      ports: [
        {
          postMessage: (data) => {
            accepted = data.accepted;
          },
        },
      ],
    });
    assert.equal(accepted, false);
    assert.equal(h.skipped(), false);
  });
});
