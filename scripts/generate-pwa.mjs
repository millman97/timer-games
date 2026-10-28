import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency-free full-export precaching. Run only after Expo has finished.
export async function generatePwa(directory, io = { readdir, readFile, writeFile }) {
  const files = [];
  async function walk(folder) {
    for (const entry of await io.readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (
        !entry.name.endsWith('.map') &&
        !['sw.js', '_headers', '_redirects'].includes(entry.name)
      )
        files.push(path.relative(directory, absolute).replaceAll('\\', '/'));
    }
  }
  await walk(directory);
  for (const required of [
    'index.html',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/apple-touch-icon.png',
  ]) {
    if (!files.includes(required)) throw new Error(`Missing export asset: ${required}`);
  }
  if (!files.some((f) => f.endsWith('.ttf')) || !files.some((f) => f.endsWith('.js')))
    throw new Error('Export must contain bundled JavaScript and the digit font.');
  const hash = createHash('sha256');
  const integrity = {};
  for (const file of files.sort()) {
    const content = await io.readFile(path.join(directory, file));
    hash.update(file);
    hash.update(content);
    integrity[`/${file}`] = createHash('sha256').update(content).digest('hex');
  }
  const template = await io.readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
  hash.update(template);
  hash.update(await io.readFile(new URL(import.meta.url)));
  const name = `timer-games-${hash.digest('hex').slice(0, 20)}`;
  const shell = files.map((file) => `/${file}`);
  const prelude = `const CACHE_NAME = ${JSON.stringify(name)};\nconst SHELL = ${JSON.stringify(shell)};\nconst INTEGRITY = ${JSON.stringify(integrity)};\nconst ROUTES = ['/', '/index.html', '/setup', '/roster', '/play', '/setup/', '/roster/', '/play/'];\n`;
  await io.writeFile(path.join(directory, 'sw.js'), prelude + template);
  return { name, count: files.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generatePwa(path.resolve('dist'));
  console.log(`Precached ${result.count} resources in ${result.name}`);
}
