#!/usr/bin/env node
// print-pdf — render a Markdown file through Scriptorium's Page view and print it to PDF, headlessly.
//   node tools/print-pdf.mjs input.md output.pdf [--headers]   (--headers = simulate the browser's header/footer ON)
// Exactly what the user gets from Ctrl+P, without a browser dialog. Pure Node (>=22) + installed Chrome.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, connectPage } from '../test/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [inMd, outPdf] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const HEADERS = process.argv.includes('--headers');
if (!inMd || !outPdf) { console.log('usage: node tools/print-pdf.mjs input.md output.pdf [--headers]'); process.exit(1); }
const md = readFileSync(resolve(inMd), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const PORT = 9193;
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]); const f = join(ROOT, p === '/' ? 'scriptorium.html' : p);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(f));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const chrome = await launchChrome();
try {
  const cdp = await connectPage(); await cdp.init();
  await cdp.navigate(`http://127.0.0.1:${PORT}/scriptorium.html`); await new Promise(r => setTimeout(r, 1500));
  await cdp.send('Runtime.evaluate', { expression: `window.__md=${JSON.stringify(md)}` });
  const n = await cdp.eval(`(function(){ src.value=window.__md; setView('render'); return document.querySelectorAll('#paper .page').length; })()`);
  await new Promise(r => setTimeout(r, 600));
  const r = await cdp.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: HEADERS });
  writeFileSync(resolve(outPdf), Buffer.from(r.data, 'base64'));
  console.log(`${n} sheet(s) → ${resolve(outPdf)} (${Math.round(Buffer.from(r.data, 'base64').length / 1024)} KB)${HEADERS ? ' [browser headers ON]' : ''}`);
} finally { chrome.kill(); server.close(); }
