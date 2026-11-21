import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve('dist');
const index = await readFile(resolve(directory, 'index.html'), 'utf8');
const scriptTag = index.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const styleTag = index.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);

if (!scriptTag || !styleTag) throw new Error('找不到构建后的脚本或样式');

const [script, style] = await Promise.all([
  readFile(resolve(directory, scriptTag[1]), 'utf8'),
  readFile(resolve(directory, styleTag[1]), 'utf8'),
]);

const standalone = index
  .replace(/^.*<link rel="(?:manifest|apple-touch-icon)".*\r?\n/gm, '')
  .replace(scriptTag[0], () => '<script type="module">' + script.replaceAll('</script', '<\\/script') + '</script>')
  .replace(styleTag[0], () => '<style>' + style + '</style>');

await writeFile(resolve(directory, '六爻排盘.html'), standalone, 'utf8');

const template = await readFile('scripts/service-worker.js', 'utf8');
const manifest = JSON.parse(await readFile(resolve(directory, 'app.webmanifest'), 'utf8'));
const iconFiles = await Promise.all(['./icon-180.png', ...manifest.icons.map(icon => icon.src)].map(async path => {
  const bytes = await readFile(resolve(directory, path));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const versionedPath = path.replace(/\.png$/, `-${hash}.png`);
  await writeFile(resolve(directory, versionedPath), bytes);
  return versionedPath;
}));
manifest.icons.forEach((icon, index) => { icon.src = iconFiles[index + 1]; });
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
const brandedIndex = index.replace('./icon-180.png', iconFiles[0]);
const version = createHash('sha256').update(brandedIndex).update(script).update(style)
  .update(manifestJson).update(template).digest('hex').slice(0, 16);
const shell = `app-shell-${version}.html`;
const html = brandedIndex.replace('</head>', `  <meta name="app-version" content="${version}" />\n  </head>`);
const files = [shell, scriptTag[1], styleTag[1], 'app.webmanifest', ...iconFiles];
await Promise.all([
  writeFile(resolve(directory, 'index.html'), html, 'utf8'),
  writeFile(resolve(directory, shell), html, 'utf8'),
  writeFile(resolve(directory, 'app.webmanifest'), manifestJson, 'utf8'),
]);
await writeFile(resolve(directory, 'sw.js'), template
  .replaceAll('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(files)), 'utf8');
