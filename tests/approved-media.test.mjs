import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedMedia } from '../src/components/approved-media.mjs';

const original = '/assets/img/original.webp';
const wideOriginal = 'https://cdn.sanity.io/images/site/prod/approved-original.png';
const full = '/assets/optimized/img-001-a23a21-1200x900.webp';
const small = '/assets/optimized/img-001-a23a21-480x360.webp';
const wide = '/assets/optimized/img-002-b12f43-1920x1080.webp';
const entries = [
  {
    id: 'IMG-001',
    originals: [original, 'https://yajuas.com' + original],
    src: full,
    width: 1200,
    variants: [{ src: small, width: 480 }],
  },
  { id: 'IMG-002', originals: [wideOriginal], src: wide, variants: [] },
];
const approved = createApprovedMedia(entries);

test('replace exact approved URL tokens in media, posters and social metadata', () => {
  const unrelated = [
    '<img src="/assets/img/original.webp.backup">',
    '<img src="/assets/img/original.webp/transformed">',
    '<img src="https://unrelated.example/assets/img/original.webp">',
    '<img src="https://different.example/images/site/prod/approved-original.png">',
    '<video src="/assets/video/unchanged.mp4">',
  ].join('\n');
  const html = '<head><meta property="og:image" content="https://www.yajuas.com' + original + '"></head>' +
    '<img src="' + original + '?auto=compress&amp;w=800" width="640" alt="Example">' +
    '<video poster="' + wideOriginal + '?w=960&fit=crop" preload="none">' +
    '<source src="/assets/video/unchanged.mp4"></video>' +
    '<div style="background-image:url(\'' + original + '\')"></div>' + unrelated;
  const expected = '<head><meta property="og:image" content="' + full + '"></head>' +
    '<img src="' + full + '" width="640" alt="Example">' +
    '<video poster="' + wide + '" preload="none">' +
    '<source src="/assets/video/unchanged.mp4"></video>' +
    '<div style="background-image:url(\'' + full + '\')"></div>' + unrelated;
  assert.equal(approved.rewrite(html), expected);
  assert.deepEqual(approved.files, [full, small, wide]);
});

test('publish real width variants for single-asset srcsets while retaining sizes', () => {
  const input = '<picture><source media="(min-width: 700px)" srcset="' + original + '?w=500 500w, ' +
    original + '?w=1440 1440w" sizes="90vw"><img src="' + original + '" srcset="' + original + '"></picture>';
  const expected = '<picture><source media="(min-width: 700px)" srcset="' + small + ' 480w, ' +
    full + ' 1200w" sizes="90vw"><img src="' + full + '" srcset="' + small + ' 480w, ' + full + ' 1200w"></picture>';
  assert.equal(approved.rewrite(input), expected);
});

test('preserve unapproved srcset candidates and mixed descriptors', () => {
  const input = '<img srcset="' + original + '?w=500 500w, /assets/img/retain.webp 900w">';
  assert.equal(approved.rewrite(input), '<img srcset="' + full + ' 500w, /assets/img/retain.webp 900w">');
  assert.equal(
    approved.rewrite('<img srcset="' + original + ' 1x, ' + original + ' 2x">'),
    '<img srcset="' + full + ' 1x, ' + full + ' 2x">',
  );
});

test('keep accordion JSON valid with the same responsive behavior', () => {
  const encode = media => JSON.stringify({ accordion: [{ media, title: 'Untouched' }] }).replaceAll('<', '\\u003c');
  const input = '<script id="native-page-data" type="application/json">' +
    encode('<img src="' + original + '?w=360&amp;q=70" srcset="' + original + '?w=360 360w, ' +
      original + '?w=1200 1200w">') + '</script>';
  const expected = '<script id="native-page-data" type="application/json">' +
    encode('<img src="' + full + '" srcset="' + small + ' 480w, ' + full + ' 1200w">') + '</script>';
  assert.equal(approved.rewrite(input), expected);
});

test('remove inherited alt text for selected decorative illustrations only', () => {
  const change = createApprovedMedia([{ ...entries[0], decorative: true }]);
  const image = '<img src="' + original + '" alt="Outdated screen description">';
  const unchanged = '<img src="/assets/img/retain.webp" alt="Keep this label">';
  const expected = '<img src="' + full + '" alt="">';
  const serialized = value => JSON.stringify(value).replaceAll('<', '\u003c');
  assert.equal(change.rewrite(image + unchanged), expected + unchanged);
  assert.equal(change.rewrite(serialized(image)), serialized(expected));
});

test('improve approved cover contrast without replacing or restyling other logos', () => {
  const change = createApprovedMedia([{ ...entries[0], logoContrast: 'light' }]);
  const logo = '<img data-yaju-blog-logo="true" src="/assets/blog-covers/yaju-logo-negro.png">';
  const html = '<head></head><img src="' + original + '">' + logo;
  const rewritten = change.rewrite(html);
  assert.ok(rewritten.endsWith('<img src="' + full + '">' + logo));
  assert.match(rewritten, /img:is\(\[data-yaju-blog-logo\],\[data-yaju-nav-logo\]\)/);
  assert.equal(change.rewrite('<head></head>' + logo), '<head></head>' + logo);
});
