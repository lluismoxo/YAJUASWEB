import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { parse } from 'parse5';
import { languages } from '../src/i18n/translate.mjs';

test('each homepage renders with its styles in the document and local fonts resolve', async () => {
  for (const language of languages) {
    const html = await readFile('public' + language.prefix + '/index.html', 'utf8');
    const head = parse(html).childNodes.find(node => node.tagName === 'html')
      .childNodes.find(node => node.tagName === 'head');
    const styles = head.childNodes.filter(node => node.tagName === 'style'
      && node.attrs.some(attribute => attribute.name === 'data-homepage-styles'));
    assert.ok(styles.length > 0, language.code);
    const externalStyles = head.childNodes.filter(node => node.tagName === 'link'
      && node.attrs.some(attribute => attribute.name === 'rel' && attribute.value === 'stylesheet'));
    assert.deepEqual(externalStyles, [], language.code);
    const css = styles.map(style => style.childNodes[0].value).join('\n');
    assert.match(css, /@font-face/, language.code);
    assert.doesNotMatch(css, /url\(\s*['"]?\.\.\//, language.code);
    const fontPaths = new Set([...css.matchAll(/url\(\s*['"]?(\/_yaju\/static\/immutable\/media\/[^'")\s]+)/g)]
      .map(([, path]) => path)
      // The base stylesheet contains KaTeX font declarations without shipped assets.
      // The homepage has no mathematical content that uses them.
      .filter(path => !path.includes('/KaTeX_')));
    assert.ok(fontPaths.size > 0, language.code);
    await Promise.all([...fontPaths].map(path => access('public' + path)));
  }
});

test('native pages do not ship the obsolete general header overrides', async () => {
  await assert.rejects(access('public/assets/yaju-hydration-safe.css'), { code: 'ENOENT' });
  const html = await readFile('public/agent-academy/index.html', 'utf8');
  assert.doesNotMatch(html, /The legacy module styles/);
  const links = html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g);
  for (const [, path] of links) {
    const content = await readFile('public' + path, 'utf8');
    assert.doesNotMatch(content, /body:has\(main \[id\^="module-"\]\)/);
  }
});
