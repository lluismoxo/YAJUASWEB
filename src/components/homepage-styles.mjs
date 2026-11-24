import { parse } from 'parse5';

const chunks = '/_yaju/static/immutable/chunks/';
const media = '/_yaju/static/immutable/media/';

export async function inlineHomepageStyles(html, readStylesheet) {
  const elements = parse(html, { sourceCodeLocationInfo: true }).childNodes;
  const head = elements.find(node => node.tagName === 'html').childNodes
    .find(node => node.tagName === 'head');
  const replacements = [];
  for (const link of head.childNodes) {
    if (link.tagName !== 'link') continue;
    const attributes = Object.fromEntries(link.attrs.map(({ name, value }) => [name, value]));
    if (attributes.rel !== 'stylesheet') continue;
    const { href } = attributes;
    if (!href?.startsWith(chunks) || !/^[\w-]+\.css$/.test(href.slice(chunks.length))
        || Object.keys(attributes).some(name => !['rel', 'href', 'data-precedence'].includes(name))) {
      throw new Error(`Unsupported homepage stylesheet: ${href}`);
    }

    // The exported bundles use root URLs or ../media paths. In an inline stylesheet,
    // a relative font path would resolve against the homepage or its locale prefix.
    const css = await readStylesheet(href);
    if (/<\/style|@\s*(?:import|charset)\b/i.test(css)) {
      throw new Error(`Stylesheet cannot be safely embedded: ${href}`);
    }
    const rebased = css.replace(/url\(\s*(['"]?)\.\.\/media\//gi, `url($1${media}`);
    const { startOffset, endOffset } = link.sourceCodeLocation;
    replacements.push({ startOffset, endOffset, html: `<style data-homepage-styles>${rebased}</style>` });
  }
  if (!replacements.length) throw new Error('No homepage stylesheets found');
  for (const { startOffset, endOffset, html: style } of replacements.reverse()) {
    html = html.slice(0, startOffset) + style + html.slice(endOffset);
  }
  return html;
}
