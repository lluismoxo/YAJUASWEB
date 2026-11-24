import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languages } from '../src/i18n/translate.mjs';

const localeCodes = languages.filter(language => language.prefix).map(({ prefix }) => prefix.slice(1));
const safeRoute = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const rule = (source, destination) => ({ source, destination, permanent: true });
const directoryIndexSuffix = '{/index.html}?{/}?';

function pagePath(output) {
  if (output === 'index.html') return '/';
  const base = output.slice(0, -'/index.html'.length);
  if (!output.endsWith('/index.html') || !safeRoute.test(base)) {
    throw new Error(`Invalid page output: ${output}`);
  }
  return '/' + base;
}

export async function buildRedirectRules(root) {
  const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const [inputs, nativePages] = await Promise.all([
    readJson('config/site-inputs.json'),
    readJson('config/native-pages.json'),
  ]);
  const canonicalPaths = new Set([
    ...nativePages,
    ...inputs.filter(entry => entry.render === 'legal'),
  ].map(entry => pagePath(entry.output)));
  const localeMatch = localeCodes.join('|');
  const startsWithLocale = path => localeCodes.includes(path.split('/')[1]);

  for (const path of canonicalPaths) {
    if (startsWithLocale(path)) {
      throw new Error(`English page conflicts with a locale prefix: ${path}`);
    }
  }

  const legacy = [];
  const legacyPaths = new Set();
  for (const entry of inputs.filter(entry => entry.render === 'redirect')) {
    const source = pagePath(entry.output);
    const { destination } = await readJson(entry.source);
    if (source === '/' || startsWithLocale(source) || legacyPaths.has(source)
      || canonicalPaths.has(source) || !canonicalPaths.has(destination)) {
      throw new Error(`Invalid compatibility redirect: ${source} -> ${destination}`);
    }
    legacyPaths.add(source);
    legacy.push(
      rule(source + directoryIndexSuffix, destination),
      rule(`/:locale(${localeMatch})${source}${directoryIndexSuffix}`, '/:locale' + destination),
    );
  }

  const canonicalVariants = [
    rule('/index.html', '/'),
    rule(`/:locale(${localeMatch}){/index.html}?`, '/:locale/'),
  ];

  // Group only known pages. Unknown paths and static assets retain their existing behavior.
  // Localized home pages keep their canonical slash. Registration is outside this migration.
  const groups = new Map();
  for (const path of canonicalPaths) {
    if (path === '/' || path === '/register') continue;
    const slug = path.slice(1);
    const group = slug.includes('/') ? slug.split('/')[0] : '';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(slug);
  }
  for (const slugs of groups.values()) {
    const pattern = `/:page((?:(?:${localeMatch})/)?(?:${slugs.sort().join('|')}))/{index.html}?`;
    if (pattern.length > 4096) throw new Error('Vercel canonical route pattern exceeds 4096 characters');
    canonicalVariants.push(rule(pattern, '/:page'));
  }

  return [...legacy, ...canonicalVariants];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const configPath = resolve(root, 'vercel.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.redirects = await buildRedirectRules(root);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Generated ${config.redirects.length} Vercel redirect rules.`);
}
