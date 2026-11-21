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
const version = createHash('sha256').update(index).update(script).update(style).update(template).digest('hex').slice(0, 16);
const files = ['./', scriptTag[1], styleTag[1], 'app.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
await writeFile(resolve(directory, 'sw.js'), template
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(files)), 'utf8');
