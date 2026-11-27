import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlogCovers } from '../src/components/blog-covers.mjs';

const first = '/assets/blog-covers/yaju-blog-cover-01.webp';
const second = '/assets/blog-covers/yaju-blog-cover-02.webp';
const addition = '/assets/optimized/yaju-blog-001-abcd-1088x612.webp';
const logoFor = color => `/assets/blog-covers/yaju-logo-${color}.png`;
const additions = [{ id: 'BLOG-001', src: addition, width: 1088, height: 612, logo: 'negro' }];

function card(href, src = first, color = 'blanco') {
  return `<a href="${href}" aria-label="Read the article" data-yaju-blog-card="true">` +
    `<picture><source srcset="${src}"><img data-yaju-blog-cover="true" src="${src}" srcset="${src}" alt="Old graphic" width="440"></picture>` +
    `<img data-yaju-blog-logo="true" src="${logoFor(color)}" style="position: absolute; filter: drop-shadow(0 2px 8px #0001);"></a>`;
}

function pageData(html) {
  const json = JSON.stringify({ pagination: [{ states: [{ html }] }] }).replaceAll('<', '\\u003c');
  return `<script type="application/json" id="native-page-data">${json}</script>`;
}

test('use the full cover pool before repeating and preserve preferred covers when available', () => {
  const blog = card('/blog/first') + card('/blog/second') + card('/blog/third', second, 'negro') + card('/blog/fourth');
  const related = card('/blog/second', second, 'negro');
  const catalog = createBlogCovers(additions);
  const rewrite = catalog.assign(new Map([['index.html', related], ['blog/index.html', blog]]));
  assert.deepEqual(catalog.files, [addition]);
  const updated = rewrite(blog);
  const images = [...updated.matchAll(/data-yaju-blog-cover="true" src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(images, [first, addition, second, first]);
  assert.match(rewrite(related), /yaju-blog-001-abcd-1088x612\.webp/);
});

test('update embedded page states with the same cover, logo and accessible link label', () => {
  const blog = card('/blog/first') + card('/blog/second');
  const embedded = pageData(card('https://www.yajuas.com/blog/second/?ref=example'));
  const untouched = '<img data-yaju-nav-logo="true" src="' + logoFor('blanco') + '">';
  const rewrite = createBlogCovers(additions).assign(new Map([['blog/index.html', blog], ['index.html', embedded + untouched]]));
  const updated = rewrite(embedded + untouched);
  assert.ok(updated.endsWith(untouched));
  const data = JSON.parse(updated.match(/id="native-page-data">([^<]+)<\/script>/)[1]);
  const html = data.pagination[0].states[0].html;
  assert.ok(html.includes(`<source srcset="${addition} 1088w">`));
  assert.ok(html.includes(`src="${addition}" srcset="${addition} 1088w" alt="" width="440"`));
  assert.ok(html.includes(`src="${logoFor('negro')}" style="position: absolute; filter: drop-shadow(0 1px 2px #fff8);"`));
  assert.ok(html.includes('aria-label="Read the article"'));
});
