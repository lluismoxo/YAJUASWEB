const sitePrefix = /^https:\/\/(?:www\.)?yajuas\.com(?=\/)/;
const outputPath = /^\/assets\/optimized\/[a-z\d][a-z\d._-]*\.webp$/i;
const originalPath = /^(?:https:\/\/[a-z\d.-]+)?\/[a-z\d._~%/-]+$/i;
const srcsetAttribute = /(^|\s)(srcset\s*=\s*)(\\?["'])(.*?)\3/gs;
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const originalKey = value => value.replace(sitePrefix, '');

export function createApprovedMedia(entries) {
  const sources = new Map();
  const files = new Set();
  const decorativeFiles = new Set();
  const logoShadows = new Map();

  function register(path, width) {
    if (!outputPath.test(path) || !Number.isInteger(width) || width < 1) {
      throw new Error(`Invalid approved media variant: ${path}`);
    }
    files.add(path);
    return { src: path, width };
  }

  for (const { id, originals, src, width, variants = [], decorative = false, logoContrast } of entries) {
    if (typeof id !== 'string' || !originals.length) throw new Error('Invalid approved media entry');
    const fullWidth = width ?? Number(src.match(/-(\d+)x\d+\.webp$/)?.[1]);
    const responsive = [
      register(src, fullWidth),
      ...variants.map(variant => register(variant.src, variant.width)),
    ].sort((a, b) => a.width - b.width);
    if (new Set(responsive.map(candidate => candidate.width)).size !== responsive.length) {
      throw new Error(`Duplicate approved media width: ${id}`);
    }
    if (decorative) decorativeFiles.add(src);
    if (logoContrast) {
      const color = { light: '#fff', dark: '#111118' }[logoContrast];
      if (!color) throw new Error(`Invalid approved logo contrast: ${id}`);
      logoShadows.set(src, `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color})`);
    }
    const asset = {
      id,
      src,
      srcset: responsive.map(candidate => `${candidate.src} ${candidate.width}w`).join(', '),
    };
    for (const original of originals) {
      const key = originalKey(original);
      const registered = sources.get(key);
      if (!originalPath.test(key) || registered && registered !== asset) {
        throw new Error(`Invalid or duplicated approved media source: ${original}`);
      }
      sources.set(key, asset);
    }
  }

  if (!sources.size) return { files: [], rewrite: html => html };
  for (const file of files) {
    if (sources.has(file)) throw new Error(`Approved media output is also an original: ${file}`);
  }

  const paths = [...sources.keys()].map(path =>
    (path.startsWith('/') ? '(?:https://(?:www\\.)?yajuas\\.com)?' : '') + escapePattern(path)
  ).join('|');
  // Match complete URL tokens, including paths in HTML serialized as JSON. The
  // new files are local static images, so the former CDN query is obsolete.
  const mediaUrl = new RegExp(
    `(^|[\\s"'(<,=])(${paths})(?:\\?[^\\s"'\\\\<>()#,]*)?(?=$|[\\s"'\\\\<>)#,])`,
    'g',
  );
  const srcsetCandidate = /^(\S+)(?:\s+\d+w)?$/;

  function rewrite(html) {
    html = html.replace(srcsetAttribute, (attribute, prefix, name, quote, srcset) => {
      let selected;
      for (const candidate of srcset.split(',')) {
        const url = candidate.trim().match(srcsetCandidate)?.[1];
        const asset = url && sources.get(originalKey(url.split(/[?#]/, 1)[0]));
        if (!asset || selected && selected !== asset) return attribute;
        selected = asset;
      }
      return prefix + name + quote + selected.srcset + quote;
    });
    html = html.replace(mediaUrl, (_, prefix, url) => prefix + sources.get(originalKey(url)).src);
    // Keep the existing logo art and sizing. A narrow outline separates it
    // from the few approved covers with substantial changes to lightness.
    const logoStyles = [...logoShadows].filter(([src]) => html.includes(src))
      .map(([src, filter]) => `img[src="${src}"] + img:is([data-yaju-blog-logo],[data-yaju-nav-logo]){filter:${filter}!important}`);
    if (logoStyles.length) html = html.replace('</head>', `<style>${logoStyles.join('')}</style></head>`);
    if (!decorativeFiles.size) return html;
    return html.replace(/(?:<|\\u003c)img\b[^>]*>/g, tag => {
      const file = tag.match(/\ssrc\s*=\s*(\\?["'])([^"'\\]+)\1/)?.[2];
      if (!decorativeFiles.has(file)) return tag;
      return tag.replace(/(\salt\s*=\s*)(\\?["'])(.*?)\2/s, '$1$2$2');
    });
  }

  return { files: [...files], rewrite };
}
