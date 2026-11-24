import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRedirectRules } from '../scripts/sync-vercel-redirects.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('checked-in Vercel redirects match the route manifests', async () => {
  const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.redirects, await buildRedirectRules(root), 'Run node scripts/sync-vercel-redirects.mjs');
});

test('Vercel redirects include English and localized legacy and canonical aliases', async () => {
  const redirects = await buildRedirectRules(root);
  for (const destination of ['/', '/:locale/', '/labs', '/:locale/labs', '/:page']) {
    assert.ok(redirects.some(rule => rule.destination === destination), `Missing redirect to ${destination}`);
  }
  assert.ok(redirects.every(rule => rule.permanent && rule.destination.startsWith('/')));
  assert.ok(redirects.every(rule => !rule.source.includes('register')));
});

test('legacy redirects cannot shadow native routes or locale roots', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'yaju-redirects-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, 'config'));
  const writeJson = (path, data) => writeFile(join(fixture, path), JSON.stringify(data));
  await writeJson('config/native-pages.json', [{ output: 'labs/index.html' }]);
  await writeJson('target.json', { destination: '/labs' });

  for (const slug of ['labs', 'es', 'fr/labs']) {
    await writeJson('config/site-inputs.json', [{ output: `${slug}/index.html`, source: 'target.json', render: 'redirect' }]);
    await assert.rejects(buildRedirectRules(fixture), /Invalid compatibility redirect/);
  }
});
