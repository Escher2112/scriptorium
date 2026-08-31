#!/usr/bin/env node
// page-snap — render a .md through Scriptorium's Page view (headless Chromium via CDP) and
// screenshot EACH paginated sheet to a PNG. The pagination-QA loop: see where every page
// actually breaks + how big the footer is, tune margins / insert \newpage in the .md, re-run.
//
//   node tools/page-snap.mjs <file.md> [outDir]     (default outDir: ./.snapshots)
//
// Reuses the harness CDP client so it never touches your real browser (own headless profile).
import { launchChrome, connectPage } from '../test/cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const mdPath = process.argv[2];
const outDir = resolve(process.argv[3] || join(root, '.snapshots'));
if (!mdPath) { console.error('usage: node tools/page-snap.mjs <file.md> [outDir]'); process.exit(2); }

const md = readFileSync(resolve(mdPath), 'utf8');
mkdirSync(outDir, { recursive: true });

const proc = await launchChrome();
try {
  const cdp = await connectPage();
  await cdp.init();
  await cdp.navigate('file://' + join(root, 'scriptorium.html'));

  // wait for the app + build stamp
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await cdp.eval(`(typeof src!=='undefined' && typeof setView==='function' && typeof render==='function' && !!window.SCRIPTORIUM_BUILD)`)) { ready = true; break; }
    await new Promise(s => setTimeout(s, 150));
  }
  if (!ready) throw new Error('Scriptorium did not become ready');

  // inject the document at zoom 1, flip to Page view
  await cdp.eval(`(function(md){
    document.documentElement.style.setProperty('--zoom','1');
    if(typeof paper!=='undefined'&&paper) paper.style.zoom='1';
    src.value = md;
    if(typeof tabs!=='undefined'&&tabs[activeTab]) tabs[activeTab].content = src.value;
    setView('render');
    return 'ok';
  })(${JSON.stringify(md)})`);
  if (process.env.SNAP_BREAK_H1) await cdp.eval(`localStorage.setItem('scr_pgbreak_h1','1')`);   // chapter-per-page
  await new Promise(s => setTimeout(s, 800));   // let mermaid 2nd-pass + layout settle
  await cdp.eval(`render()`);                    // re-paginate with final metrics
  await new Promise(s => setTimeout(s, 250));
  // capture what PRINTS: print media flows the .page sheets into the document (fixed 8.5x11in,
  // app chrome hidden, no inner-pane scroll) so per-page clip coords are exact.
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
  await new Promise(s => setTimeout(s, 200));

  const n = await cdp.eval(`document.querySelectorAll('#paper .page').length`);
  const build = await cdp.eval(`String(window.SCRIPTORIUM_BUILD||'?')`);
  const pad = await cdp.eval(`(function(){var s=getComputedStyle(document.querySelector('#paper .page')); return s.paddingTop+' / '+s.paddingBottom+' / '+s.paddingLeft;})()`);
  console.log(`build ${build} · ${n} page(s) · padding T/B/side = ${pad}`);

  let ok = 0;
  for (let i = 0; i < n; i++) {
    try {
      const rect = await cdp.eval(`(function(i){
        var p=document.querySelectorAll('#paper .page')[i]; p.scrollIntoView();
        var r=p.getBoundingClientRect();
        return {x:r.left+window.scrollX, y:r.top+window.scrollY, w:r.width, h:r.height};
      })(${i})`);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
        captureBeyondViewport: true,
      });
      const f = join(outDir, `page-${String(i + 1).padStart(2, '0')}.png`);
      writeFileSync(f, Buffer.from(shot.data, 'base64'));
      ok++;
    } catch (e) {
      console.log(`  page ${i + 1}: capture failed — ${e.message}`);
    }
  }
  console.log(`done → ${outDir}  (${ok}/${n} pages captured)`);
} finally {
  proc.kill();
}
process.exit(0);
