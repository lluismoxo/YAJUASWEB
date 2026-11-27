const articlePath = /^(?:https:\/\/(?:www\.)?yajuas\.com)?(\/blog\/[a-z0-9-]+)\/?(?:[?#].*)?$/;
const coverPath = /^\/assets\/blog-covers\/yaju-blog-cover-\d{2}\.webp$/;
const newCoverPath = /^\/assets\/optimized\/[a-z\d][\w.-]*\.webp$/i;
const logoShadow = { blanco: '#1119', negro: '#fff8' };

function rewriteCards(source, callback) {
  if (!source.includes('data-yaju-blog-cover=')) return source;

  function rewriteHtml(html) {
    return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, card => {
      if (!card.includes('data-yaju-blog-cover="true"')) return card;
      const link = card.slice(0, card.indexOf('>'));
      const path = link.match(/\shref="([^"]+)"/)?.[1].match(articlePath)?.[1];
      const cover = card.match(/<img\b[^>]*\sdata-yaju-blog-cover="true"[^>]*>/)?.[0];
      const logo = card.match(/<img\b[^>]*\sdata-yaju-blog-logo="true"[^>]*>/)?.[0];
      return path && cover && logo ? callback(card, path, cover, logo) : card;
    });
  }

  function rewriteStates(value) {
    if (Array.isArray(value)) return value.map(rewriteStates);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        key === 'html' && typeof item === 'string' ? rewriteHtml(item) : rewriteStates(item),
      ]));
    }
    return value;
  }

  return rewriteHtml(source).replace(
    /(<script\b[^>]*\bid="native-page-data"[^>]*>)([^<]*)(<\/script>)/,
    (script, start, json, end) => json.includes('data-yaju-blog-cover=')
      ? start + JSON.stringify(rewriteStates(JSON.parse(json))).replaceAll('<', '\\u003c') + end
      : script,
  );
}

export function createBlogCovers(entries) {
  const files = new Set();
  const ids = new Set();
  const additions = entries.map(({ id, src, width, height, logo }) => {
    if (!/^BLOG-\d{3}$/.test(id) || ids.has(id) || !newCoverPath.test(src) || files.has(src) ||
        !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
        !Object.hasOwn(logoShadow, logo)) {
      throw new Error('Invalid blog cover addition: ' + id);
    }
    ids.add(id);
    files.add(src);
    return { src, width, logo: '/assets/blog-covers/yaju-logo-' + logo + '.png', shadow: logoShadow[logo] };
  });

  function assign(sources) {
    if (!additions.length) return html => html;
    const articles = new Map();
    const existing = new Map();
    function inspect(html) {
      rewriteCards(html, (card, path, cover, logo) => {
        const src = cover.match(/\ssrc="([^"]+)"/)?.[1];
        const logoSrc = logo.match(/\ssrc="([^"]+)"/)?.[1];
        if (coverPath.test(src) && logoSrc) {
          if (!existing.has(src)) existing.set(src, { src, logo: logoSrc });
          if (!articles.has(path)) articles.set(path, src);
        }
        return card;
      });
    }

    // Keep the first use of each original cover on the blog when possible.
    // Every pass through the pool uses each background once before any repeats.
    inspect(sources.get('blog/index.html') || '');
    for (const [page, html] of sources) {
      if (page !== 'blog/index.html') inspect(html);
    }
    const pool = new Map([...additions, ...existing.values()].map(cover => [cover.src, cover]));
    let available = new Map(pool);
    let previous;
    const assigned = new Map();
    for (const [path, original] of articles) {
      if (!available.size) available = new Map(pool);
      const preferred = original !== previous && available.get(original);
      const selected = preferred || [...available.values()].find(cover => cover.src !== previous) ||
        available.values().next().value;
      assigned.set(path, selected);
      available.delete(selected.src);
      previous = selected.src;
    }

    return html => rewriteCards(html, (card, path, cover, logo) => {
      const asset = assigned.get(path);
      if (!asset) return card;
      const srcset = asset.width ? asset.src + ' ' + asset.width + 'w' : asset.src;
      const coverTag = cover.replace(/\ssrc="[^"]*"/, ' src="' + asset.src + '"')
        .replace(/\ssrcset="[^"]*"/, ' srcset="' + srcset + '"')
        .replace(/\salt="[^"]*"/, ' alt=""');
      let logoTag = logo.replace(/\ssrc="[^"]*"/, ' src="' + asset.logo + '"');
      if (asset.shadow) {
        logoTag = logoTag.replace(/filter:\s*[^;"]+/, 'filter: drop-shadow(0 1px 2px ' + asset.shadow + ')');
      }
      return card.replace(cover, coverTag).replace(logo, logoTag)
        .replace(/(<source\b[^>]*\ssrcset=")[^"]*"/g, '$1' + srcset + '"');
    });
  }

  return { files: [...files], assign };
}
