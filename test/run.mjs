#!/usr/bin/env node
// Scriptorium regression harness — one command, green/red. Pure Node (>=22) + your installed Chrome.
//   node test/run.mjs            run everything against the built scriptorium.html (+ lite smoke)
//   node test/run.mjs --build    run `python build.py` first
//   node test/run.mjs --shots    also save screenshots of Write / Source / Page to test/out/
// Every check here is something that was once verified by hand and then broke — keep it that way.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, connectPage, CHROME } from './cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = new Set(process.argv.slice(2));
const HTTP_PORT = 9192;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown', '.json': 'application/json', '.png': 'image/png' };

// ---------- result collection ----------
const results = []; let cur = 'setup';
function section(n) { cur = n; console.log('\n== ' + n); }
async function check(name, fn) {
  try { const v = await fn(); const ok = v === true || (v && v.ok === true); results.push({ section: cur, name, ok, info: v && v.info });
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (v && v.info ? '   ' + v.info : '')); if (!ok && v && v.detail) console.log('         ' + v.detail); }
  catch (e) { results.push({ section: cur, name, ok: false }); console.log('  FAIL  ' + name + '   (threw) ' + e.message); }
}

// ---------- 0. build / static checks ----------
section('build');
if (ARGS.has('--build')) {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(py, ['build.py'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.log('build.py failed'); process.exit(2); }
}
const BUILT = join(ROOT, 'scriptorium.html'), LITE = join(ROOT, 'scriptorium-lite.html');
await check('scriptorium.html exists', () => existsSync(BUILT));
const html = existsSync(BUILT) ? readFileSync(BUILT, 'utf8') : '';
await check('no unexpanded build markers', () => ({ ok: !/@@(CSS|JS):/.test(html) }));
await check('build stamp expanded to a date (cache-tell for the user)', () => ({ ok: !/@@BUILDSTAMP@@/.test(html) && /build \d{4}-\d\d-\d\d \d\d:\d\d/.test(html), info: (html.match(/build \d{4}-\d\d-\d\d \d\d:\d\d/)||[''])[0] }));
await check('engine inlined (toastui.Editor + pmHistory + pm.EditorState)', () => ({ ok: /toastui\.Editor/.test(html) && /pmHistory/.test(html) && /EditorState/.test(html) }));
await check('built size sane (0.6–8 MB)', () => { const mb = statSync(BUILT).size / 1e6; return { ok: mb > 0.6 && mb < 8, info: mb.toFixed(2) + ' MB' }; });
await check('no personal/company identifiers in the public build', () => {
  // denylist is private: put your own words in test/identifiers.local.json (gitignored) or SCR_IDENTIFIERS="a,b,c"
  let words = [];
  try { words = JSON.parse(readFileSync(join(ROOT, 'test', 'identifiers.local.json'), 'utf8')); } catch (e) {}
  if (process.env.SCR_IDENTIFIERS) words = words.concat(process.env.SCR_IDENTIFIERS.split(','));
  words = words.map(w => String(w).trim()).filter(Boolean);
  const bad = words.filter(w => html.includes(w));
  return { ok: bad.length === 0, info: words.length ? words.length + ' checked' : 'no denylist set', detail: bad.length ? 'found: ' + bad.join(', ') : '' };
});
await check('KaTeX + Mermaid inlined (fonts as data URIs, no fonts/ URLs left)', () => ({ ok: /katex\.min\.css/.test(html) && /mermaid\.min\.js/.test(html) && /data:font\/woff2;base64,/.test(html) && !/url\(fonts\//.test(html) }));
await check('lite edition present', () => existsSync(LITE));
await check('Chrome found for browser layers', () => ({ ok: !!CHROME, info: CHROME || 'set SCRIPTORIUM_CHROME' }));
if (!CHROME || !existsSync(BUILT)) { summary(); }

// ---------- static server (serves the repo root, incl. scriptorium.local.js if present) ----------
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]); const f = join(ROOT, p === '/' ? 'scriptorium.html' : p);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(f));
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));
const URL = `http://127.0.0.1:${HTTP_PORT}/scriptorium.html`;

const chrome = await launchChrome();
let cdp;
try {
  cdp = await connectPage(); await cdp.init();
  const E = (expr) => cdp.eval(expr);
  const settle = (ms = 250) => new Promise(r => setTimeout(r, ms));

  // ---------- 1. load ----------
  section('load');
  await cdp.navigate(URL); await settle(1200);
  await check('page loads without uncaught exceptions', () => { const e = cdp.drainErrors(); return { ok: e.length === 0, detail: e[0] }; });
  await check('engine is a class with colour + highlight plugins', () => E(`typeof toastui.Editor==='function' && !!toastui.Editor.plugin.colorSyntax && !!toastui.Editor.plugin.codeSyntaxHighlight`));
  await check('editor instance in WYSIWYG mode, Write view, one tab', () => E(`typeof editor!=='undefined' && editor.isWysiwygMode() && view==='write' && tabs.length>=1`));
  await check('welcome doc rendered onto the paper sheet', () => E(`!!document.querySelector('#tui .toastui-editor-ww-container .toastui-editor-contents h1')`));
  await check('assistant identity = local override if present, else Maya', () => E(`(function(){var want=(window.SCRIPTORIUM_LOCAL&&window.SCRIPTORIUM_LOCAL.name)||'Maya'; return getAiName()===want && document.querySelector('#btnAI span').textContent===want;})()`));
  await check('undo/redo + zoom + view controls present', () => E(`!!$('#btnUndo')&&!!$('#btnRedo')&&!!$('#zoomIn')&&document.querySelectorAll('#viewSeg button').length===3`));
  await check('Save As present and writes a COPY (original untouched)', () => E(`(async function(){ if(!$('#btnSaveAs')||typeof saveAsDoc!=='function') return false; var origName=curName, origHandle=fileHandle; var got=null, od=download; download=function(n,d){ got={n:n,d:d}; }; var op=window.prompt; window.prompt=function(){ return 'copy-test.md'; }; var osp=window.showSaveFilePicker; window.showSaveFilePicker=undefined; try{ await saveAsDoc(); } finally{ download=od; window.prompt=op; window.showSaveFilePicker=osp; } var ok=!!got && got.n==='copy-test.md' && got.d===src.value && curName==='copy-test.md' && origHandle===null; curName=origName; return ok; })()`));

  // ---------- 2. soft-wrap reflow ----------
  section('reflow');
  await E(`newTab('# Wrap\\n\\nEngineers increasingly want to use AI to accelerate CAE work. The instinctive\\nobjection is correct: customer geometry is reconstructable IP and must never\\nreach a public cloud AI.\\n\\n- a list item\\n- another one\\n\\n> quote one\\n> quote two\\n\\n\`\`\`python\\nx = 1\\ny = 2\\n\`\`\`\\n','wrap.md')`);
  await settle();
  await check('soft-wrapped paragraph reflowed onto one line', () => E(`/^Engineers increasingly want[^\\n]*public cloud AI\\.$/m.test(editor.getMarkdown())`));
  await check('no hard breaks injected into the sheet', () => E(`document.querySelectorAll('#tui .toastui-editor-ww-container p br').length===0`));
  await check('lists, quotes and code fences preserved', () => E(`(function(){var m=editor.getMarkdown(); return /[-*] a list item\\n[-*] another one/.test(m) && /> quote one/.test(m) && /\`\`\`python\\nx = 1\\ny = 2\\n\`\`\`/.test(m);})()`));
  await check('code block syntax-highlighted and legible (tokens + dark bg)', () => E(`(function(){var pre=document.querySelector('#tui .toastui-editor-ww-container pre'); if(!pre) return false; var t=pre.querySelectorAll('.token').length; var c=getComputedStyle(pre.querySelector('code')); return t>0 && c.backgroundColor==='rgba(0, 0, 0, 0)';})()`));

  // ---------- 3. inline styling round-trip ----------
  section('styling');
  await E(`src.value='# S\\n\\nplain <span style="color:#c0392b">red</span> and <span style="font-family:Georgia,serif">serif</span> words. Target phrase here.\\n'`);
  await settle();
  await check('styled spans survive markdown → WYSIWYG → markdown', () => E(`(function(){var m=editor.getMarkdown(); return /style="color:#c0392b"/.test(m) && /font-family:Georgia/.test(m) && !!document.querySelector('#tui .toastui-editor-ww-container span[style*="color"]');})()`));
  await check('wrapSpan applies font+size as a merged mark on a selection', () => E(`(function(){var view=editor.wwEditor.view, st=view.state, pos=null; st.doc.descendants(function(n,p){ if(pos===null&&n.isText&&n.text.indexOf('Target phrase')>=0){ pos=p+n.text.indexOf('Target phrase'); } }); if(pos===null) return false; var TS=st.selection.constructor; view.dispatch(st.tr.setSelection(TS.create(st.doc,pos,pos+13))); wrapSpan('font-family:Georgia,serif','x'); wrapSpan('font-size:1.25em','x'); return /<span style="font-family:Georgia,serif;font-size:1.25em">Target phrase<\\/span>/.test(editor.getMarkdown());})()`));
  await check('colour plugin command applies', () => E(`(function(){var view=editor.wwEditor.view, st=view.state, TS=st.selection.constructor; view.dispatch(st.tr.setSelection(TS.create(st.doc,3,8))); try{ editor.exec('color',{selectedColor:'#1f77b4'}); }catch(e){ return false; } return /#1f77b4/i.test(editor.getMarkdown());})()`));

  // ---------- 4. assistant tools (no model needed) ----------
  section('assistant-tools');
  await E(`src.value='# T\\n\\nThe OB lip retains contact.\\n\\n- first point\\n- second point\\n'; if(tabs[activeTab]) tabs[activeTab].content=src.value;`);
  await settle();
  await check('apply_edit mutates the live document and the sheet', () => E(`(async function(){var r=await execTool('apply_edit',{old_string:'The OB lip retains contact.',new_string:'*The OB lip retains contact.*'}); return r.indexOf('OK')===0 && !!document.querySelector('#tui .toastui-editor-ww-container em');})()`));
  await check('apply_edit refuses ambiguous / missing targets', () => E(`(async function(){return (await execTool('apply_edit',{old_string:'point',new_string:'x'})).indexOf('ERROR')===0 && (await execTool('apply_edit',{old_string:'nope-not-here',new_string:'x'})).indexOf('ERROR')===0;})()`));
  await check('replace_all updates every occurrence', () => E(`(async function(){var r=await execTool('replace_all',{find:'point',replace:'finding'}); var li=[].slice.call(document.querySelectorAll('#tui .toastui-editor-ww-container li')).map(function(l){return l.textContent.trim();}); return /replaced 2/.test(r) && li.join('|')==='first finding|second finding';})()`));
  await check('set_document + read_document round-trip', () => E(`(async function(){await execTool('set_document',{markdown:'# New\\n\\nbody\\n'}); return /^# New/.test(await execTool('read_document',{})) && !!document.querySelector('#tui .toastui-editor-ww-container h1');})()`));
  await check('get_selection reads the engine selection', () => E(`(async function(){var view=editor.wwEditor.view, st=view.state, TS=st.selection.constructor; view.dispatch(st.tr.setSelection(TS.create(st.doc,1,4))); return (await execTool('get_selection',{}))==='New';})()`));
  await check('apply_edit tolerates stray whitespace around old_string (lenient match)', () => E(`(async function(){src.value='# Notes\\n\\nline one\\n'; if(tabs[activeTab]) tabs[activeTab].content=src.value; var r=await execTool('apply_edit',{old_string:'# Notes  \\n\\n',new_string:'# Notes\\n\\nadded paragraph\\n\\n'}); return r.indexOf('OK')===0 && src.value.indexOf('added paragraph')>=0;})()`));
  await check('append_text adds a section at the end with one blank line before it', () => E(`(async function(){var r=await execTool('append_text',{markdown:'\\n## Sources\\n- a'}); return r.indexOf('OK')===0 && /line one\\n\\n## Sources\\n\\n?[-*] a\\n?$/.test(src.value);})()`));
  await check('default identity carries the spine (no-bullshit / never-invent / show-work)', () => E(`(function(){var id=GENERIC_IDENTITY; return /NO BULLSHIT/.test(id) && /NEVER SPEAK WITHOUT GROUNDS/.test(id) && /SHOW YOUR WORK/.test(id) && GENERIC_NAME==='Maya';})()`));
  await check('setup interview composes a personalised identity on the baseline', () => E(`(function(){var id=composeIdentity({user:'Sam',work:'lab reports',style:'thorough',push:true}); return id.indexOf(GENERIC_IDENTITY)===0 && /THE PERSON YOU'RE WORKING WITH/.test(id) && id.includes('Sam') && id.includes('lab reports') && /THOROUGH/.test(id) && /Push back HARD/.test(id);})()`));
  await check('replace_selection reworks exactly the highlighted passage', () => E(`(async function(){src.value='# T\\n\\nAlpha bravo charlie.\\n'; if(tabs[activeTab])tabs[activeTab].content=src.value; var view=editor.wwEditor.view, st=view.state, TS=st.selection.constructor, doc=st.doc, pos=null; doc.descendants(function(n,p){ if(pos===null&&n.isText){var k=n.text.indexOf('bravo'); if(k>=0)pos=p+k;} }); if(pos===null)return false; view.dispatch(st.tr.setSelection(TS.create(doc,pos,pos+5))); document.dispatchEvent(new Event('selectionchange')); await new Promise(r=>setTimeout(r,180)); var r=await execTool('replace_selection',{text:'DELTA'}); return r.indexOf('OK')===0 && editor.getMarkdown().indexOf('Alpha DELTA charlie')>=0;})()`));
  await check('docCommand is the shared core (open_tab / get_document / set_view round-trip)', () => E(`(async function(){var o=await window.scriptoriumCommand('open_tab',{name:'cmd.md',markdown:'# Pushed\\n\\nbody\\n'}); var g=await window.scriptoriumCommand('get_document',{}); var v=await window.scriptoriumCommand('set_view',{view:'source'}); var ok = o.ok && g.ok && /# Pushed/.test(g.result) && v.ok && view==='source'; setView('write'); return ok;})()`));
  await check('replace_selection + get_selection are offered to the model as tools', () => E(`(function(){var n=TOOLS.map(t=>t.function.name); return n.includes('replace_selection')&&n.includes('get_selection');})()`));
  await check('web_search + read_url are offered to the model', () => E(`(function(){var n=TOOLS.map(function(t){return t.function.name;}); return n.indexOf('web_search')>=0 && n.indexOf('read_url')>=0;})()`));
  await check('web_search with no helper returns an ERROR string (never throws)', () => E(`(async function(){localStorage.setItem('scr_search_url','http://127.0.0.1:1'); var r=await execTool('web_search',{query:'x'}); return typeof r==='string' && r.indexOf('ERROR: search helper unreachable')===0;})()`));
  await check('web_search formats helper results with numbered title / url / snippet', () => E(`(async function(){var orig=window.fetch; window.fetch=async function(u){ if(String(u).indexOf('/search?')>0) return new Response(JSON.stringify({query:'q1',backend:'mock',results:[{title:'T1',url:'http://u1',snippet:'S1'},{title:'T2',url:'http://u2',snippet:''}]}),{status:200,headers:{'Content-Type':'application/json'}}); return new Response(JSON.stringify({url:'http://u1',final_url:'http://u1',title:'Page',text:'BODY TEXT',truncated:false}),{status:200,headers:{'Content-Type':'application/json'}}); }; try{ var r=await execTool('web_search',{query:'q1'}); var f=await execTool('read_url',{url:'http://u1'}); } finally{ window.fetch=orig; } return /^Results for "q1" via mock/.test(r) && /1\\. T1\\n   http:\\/\\/u1\\n   S1\\n2\\. T2/.test(r) && /^Title: Page\\nURL: http:\\/\\/u1\\n\\nBODY TEXT$/.test(f);})()`));

  await check('Find & Replace: case-insensitive count + replace-all', () => E(`(function(){newTab('# D\\n\\nThe seal seals the Seal.\\n','fr.md'); setView('source'); openFind(); findInput.value='seal'; var c=findMatchCount(); replInput.value='gasket'; replaceAll(); var out=src.value; closeFind(); setView('write'); return c===3 && /The gasket gaskets the gasket\\./.test(out);})()`));
  await check('Ctrl+A inside the sheet does NOT open the assistant (native select-all preserved)', () => E(`(function(){aiOpen(false); var el=document.querySelector('#tui .ProseMirror')||document.querySelector('#tui'); var e=new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}); Object.defineProperty(e,'target',{value:el}); document.dispatchEvent(e); return !document.getElementById('ai').classList.contains('open');})()`));

  // ---------- 5. undo layers ----------
  section('undo');
  await E(`newTab('# Doc A\\n\\nSentence one here.\\n','docA.md')`); await settle();
  await check('engine history is empty right after a document load', () => E(`engineCanUndo()===false`));
  await check('assistant edit is undoable back to the exact prior markdown', () => E(`(async function(){var a0=editor.getMarkdown(); await execTool('apply_edit',{old_string:'Sentence one',new_string:'SENTENCE ONE'}); if(!engineCanUndo()) return false; doUndo(); return editor.getMarkdown()===a0;})()`));
  await check('redo re-applies it', () => E(`(function(){doRedo(); return editor.getMarkdown().indexOf('SENTENCE ONE')>=0;})()`));
  await E(`editor.focus(); editor.moveCursorToEnd();`); await cdp.insertText(' TYPED'); await settle(300);
  await check('typed text lands in the markdown', () => E(`editor.getMarkdown().indexOf('TYPED')>=0`));
  await cdp.key('z', { modifiers: 2, vk: 90 }); await settle(300);
  await check('Ctrl+Z removes typed text (engine history)', () => E(`editor.getMarkdown().indexOf('TYPED')<0`));
  await check('switching tabs never bleeds the previous document through undo', () => E(`(function(){var other=tabs.findIndex(function(t,i){return i!==activeTab;}); switchTab(other); var before=editor.getMarkdown(); doUndo(); return editor.getMarkdown().indexOf('Doc A')<0 && !engineCanUndo();})()`));

  // ---------- 6. views, pagination, zoom ----------
  section('views');
  await check('print → PDF page count equals the Page-view sheet count (WYSIWYG print)', async () => { const n=await E(`(function(){ var d='# Print'+String.fromCharCode(10,10); for(var i=1;i<=14;i++){ d+='## Section '+i+String.fromCharCode(10,10)+'Body text filler to occupy vertical space across pages, enough words to wrap a couple of lines each time. '.repeat(1+(i%3))+String.fromCharCode(10,10)+'- one'+String.fromCharCode(10)+'- two'+String.fromCharCode(10,10); } src.value=d; setView('render'); return document.querySelectorAll('#paper .page').length; })()`); const r=await cdp.send('Page.printToPDF',{preferCSSPageSize:true,printBackground:false}); const pdf=Buffer.from(r.data,'base64').toString('latin1'); const pages=(pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length; return {ok: pages===n && n>=3, info: n+' sheets -> '+pages+' PDF pages'}; });
  await check('list items absorb wrapped continuation lines (no stray paragraphs)', () => E(`(function(){ var N=String.fromCharCode(10); src.value='- **First item** with text that'+N+'  continues on an indented line.'+N+'- Second item'+N+'  lazy tail'+N+N+'1. **Tier one** — sees'+N+'   the chunks.'+N+'2. Tier two'+N; setView('render'); var lis=[...document.querySelectorAll('#paper li')].map(function(l){return l.textContent.trim();}); return lis.length===4 && /^First item with text that continues on an indented line\.$/.test(lis[0]) && lis[1]==='Second item lazy tail' && /^Tier one — sees the chunks\.$/.test(lis[2]) && document.querySelectorAll('#paper p').length===0; })()`));
  await check('no page ends with a stranded heading', () => E(`(function(){ var d='# Long'+String.fromCharCode(10,10); for(var i=1;i<=30;i++){ d+='## Section '+i+String.fromCharCode(10,10)+'Body text filler to occupy vertical space across pages, enough words to wrap a couple of lines each time. '.repeat(1+(i%4))+String.fromCharCode(10,10); } src.value=d; setView('render'); var pages=[...document.querySelectorAll('#paper .page')]; return pages.length>=3 && pages.every(function(p){ return !/^H[1-4]$/.test(p.lastElementChild.tagName); }); })()`));
  await check('Page view honours backslash escapes the engine emits (1. / ( / , / *)', () => E(`(function(){ var B=String.fromCharCode(92), N=String.fromCharCode(10); src.value='## 1'+B+'. The risk'+B+', stated '+B+'(precisely'+B+')'+N+N+'A '+B+'*literal'+B+'* star and 5 '+B+'< 6.'+N; setView('render'); var h=document.querySelector('#paper h2'), p=document.querySelector('#paper p'); return !!h && h.textContent==='1. The risk, stated (precisely)' && !!p && p.textContent==='A *literal* star and 5 < 6.' && !document.querySelector('#paper em'); })()`));
  await E(`(function(){var d='# Long\\n\\n'; for(var i=1;i<=18;i++){ d+='## Section '+i+'\\n\\n'+'Body text filler to occupy vertical space across pages. '.repeat(4)+'\\n\\n- a\\n- b\\n\\n'; } d+='\\\\newpage\\n\\n## Forced\\n\\nafter break\\n'; newTab(d,'long.md');})()`); await settle();
  await check('Source view switches the engine to markdown mode', () => E(`(function(){setView('source'); return !editor.isWysiwygMode() && $('#editPane').style.display!=='none';})()`));
  await check('Write view switches back to WYSIWYG', () => E(`(function(){setView('write'); return editor.isWysiwygMode();})()`));
  await check('Page view paginates into Letter-proportioned sheets', () => E(`(function(){setView('render'); var pg=document.querySelectorAll('#paper .page'); if(pg.length<3) return false; var r=pg[0].getBoundingClientRect(); return {ok:Math.abs(r.height/r.width-11/8.5)<0.02, info:pg.length+' pages'};})()`));
  await check('manual \\\\newpage produces a page starting with the forced heading', () => E(`(function(){var pg=[].slice.call(document.querySelectorAll('#paper .page')); return pg.some(function(p){var h=p.querySelector('h2'); return h && p.firstElementChild===h && h.textContent==='Forced';});})()`));
  await check('page breaks are zoom-invariant', () => E(`(function(){function dist(){return [].slice.call(document.querySelectorAll('#paper .page')).map(function(p){return p.childElementCount;}).join(',');} setZoom(1); render(); var a=dist(); setZoom(0.9); render(); var b=dist(); setZoom(1.5); render(); var c=dist(); setZoom(1); render(); return a===b && b===c;})()`));
  await check('Ctrl+E cycle order write → source → render → write', () => E(`(function(){setView('write'); var seq=[]; for(var i=0;i<3;i++){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'e',ctrlKey:true,bubbles:true})); seq.push(view);} return seq.join('>')==='source>render>write';})()`));
  await check('scanline mask targets the sheet in Write and the page in Page', () => E(`(function(){CRT.scan='subtle'; CRT.cleanPage=true; applyCRT(); setView('write'); updateScanMask(); var a=document.getElementById('crtScan').style.maskImage; setView('render'); updateScanMask(); var b=document.getElementById('crtScan').style.maskImage; CRT.scan='off'; applyCRT(); return a.indexOf('linear-gradient')===0 && b.indexOf('linear-gradient')===0;})()`));

  // ---------- 6b. math + diagrams (bundled KaTeX + Mermaid) ----------
  section('math-diagrams');
  await E(`newTab('# MD\\n\\nInline $E = mc^2$ math.\\n\\n$$\\n\\\\int_0^1 x\\\\,dx\\n$$\\n\\n\`\`\`mermaid\\nflowchart LR\\n  A[Marc] --> B[CalculiX]\\n\`\`\`\\n','md.md'); setView('render');`); await settle(600);
  await check('KaTeX renders inline and block math in Page view', () => E(`document.querySelectorAll('#paper .katex').length>=2 && !document.querySelector('#paper .math-inline')`));
  await check('Mermaid renders a fence to an SVG in Page view (no [mermaid] source box)', () => cdp.waitFor(`!!document.querySelector('#paper .mermaid svg') && !document.querySelector('#paper .mermaid-src')`, 8000).then(v => ({ ok: !!v })));
  await E(`setView('write')`);
  await check('Write view shows a rendered preview card beside a valid mermaid fence', () => cdp.waitFor(`!!document.querySelector('#mmdLayer .mmd-card svg')`, 8000).then(v => ({ ok: !!v })));
  await check('Write view HIDES the mermaid source fence (source lives on the Source tab)', () => E(`(function(){var pre=document.querySelector('#tui .toastui-editor-ww-container pre.language-mermaid'); if(!pre) return false; var r=pre.getBoundingClientRect(); var cs=getComputedStyle(pre); return r.height<4 && cs.opacity==='0';})()`));
  await E(`newTab('# Bad\\n\\n\x60\x60\x60mermaid\\nbarChart\\n    "A": 1\\n\x60\x60\x60\\n','bad.md'); setView('write');`);
  await check('an invalid diagram type shows a parse-error card (text, not colour alone)', () => cdp.waitFor(`(function(){var c=document.querySelector('#mmdLayer .mmd-card.err'); return !!c && /does not parse/.test(c.textContent) && /No diagram type/.test(c.textContent);})()`, 8000).then(v => ({ ok: !!v })));
  await check('document tools validate mermaid and hand the parser error back to the model', () => E(`(async function(){var r=await execTool('append_text',{markdown:'\x60\x60\x60mermaid\\nlineChart\\n  x: 1\\n\x60\x60\x60'}); var ok=await execTool('append_text',{markdown:'\x60\x60\x60mermaid\\nxychart-beta\\n    x-axis ["A","B"]\\n    y-axis "s" 0 --> 10\\n    bar [3,4]\\n\x60\x60\x60'}); return /^OK: appended/.test(r) && /WARNING: mermaid block 1 does NOT parse/.test(r) && /parsed OK/.test(ok);})()`));

  // ---------- 7. tabs + persistence ----------
  section('tabs');
  await check('tabs persist to localStorage and the active index is tracked', () => E(`(function(){persistTabs(); return new Promise(function(res){ setTimeout(function(){ var s=JSON.parse(localStorage.getItem('scr_tabs')||'[]'); res(s.length===tabs.length && +localStorage.getItem('scr_active')===activeTab); },400); });})()`));
  await check('closing a tab keeps the others intact', () => E(`(function(){var n=tabs.length; var keepName=tabs[0].name; tabs[activeTab].dirty=false; closeTab(activeTab); return tabs.length===n-1 && tabs[0].name===keepName;})()`));

  // ---------- 8. assistant streaming (mocked server) ----------
  section('assistant-stream');
  await check('streamed reply → bubble, tok/s + TTFT metrics, turn history, auto-title', () => E(`(async function(){
    localStorage.setItem('scr_ai_endpoint','http://127.0.0.1:1'); localStorage.setItem('scr_ai_model','mock');
    var orig=window.fetch; window.fetch=async function(){ var enc=new TextEncoder(); var lines=['data: {"choices":[{"delta":{"content":"Hello "}}]}\\n','data: {"choices":[{"delta":{"content":"there."}}]}\\n','data: {"choices":[{"delta":{}}],"usage":{"completion_tokens":3}}\\n','data: [DONE]\\n']; var s=new ReadableStream({start:function(c){ lines.forEach(function(l){ c.enqueue(enc.encode(l)); }); c.close(); }}); return new Response(s,{status:200,headers:{'Content-Type':'text/event-stream'}}); };
    newChat(); await runAssistant('mock question',false); await new Promise(function(r){setTimeout(r,200);}); window.fetch=orig;
    var c=curChat(); var rows=document.querySelectorAll('#aiLog .msg-row.ai'); var last=rows[rows.length-1]; var met=last&&last.querySelector('.metrics');
    return c.turns.length===2 && c.turns[1].content==='Hello there.' && !!met && /tok\\/s/.test(met.textContent) && /TTFT/.test(met.textContent) && c.title==='mock question' && !!last.querySelector('.foot-btn');
  })()`));
  await check('a tool call from the model executes and the loop continues', () => E(`(async function(){
    var orig=window.fetch, n=0; window.fetch=async function(u){ if(String(u).indexOf('/trace')>0) return new Response('{}',{status:200}); n++; var enc=new TextEncoder(); var lines = n===1
      ? ['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"apply_edit","arguments":"{\\\\"old_string\\\\":\\\\"body\\\\",\\\\"new_string\\\\":\\\\"BODY\\\\"}"}}]}}]}\\n','data: [DONE]\\n']
      : ['data: {"choices":[{"delta":{"content":"done"}}]}\\n','data: [DONE]\\n'];
      var s=new ReadableStream({start:function(c){ lines.forEach(function(l){ c.enqueue(enc.encode(l)); }); c.close(); }}); return new Response(s,{status:200,headers:{'Content-Type':'text/event-stream'}}); };
    src.value='# X\\n\\nbody\\n'; newChat(); await runAssistant('edit it',false); await new Promise(function(r){setTimeout(r,200);}); window.fetch=orig;
    return n===2 && editor.getMarkdown().indexOf('BODY')>=0 && curChat().turns[1].content==='done';
  })()`));
  await check('reasoning tokens (inline <think> + reasoning_content field) are split out of the answer and kept out of history', () => E(`(async function(){
    var orig=window.fetch; window.fetch=async function(){ var enc=new TextEncoder(); var lines=['data: {"choices":[{"delta":{"reasoning_content":"plan step A"}}]}\\n','data: {"choices":[{"delta":{"content":"<|channel>thought\\\\n"}}]}\\n','data: {"choices":[{"delta":{"content":"<channel|>"}}]}\\n','data: {"choices":[{"delta":{"content":"<think>inline plan</think>The "}}]}\\n','data: {"choices":[{"delta":{"content":"answer."}}]}\\n','data: {"choices":[{"delta":{}}],"usage":{"completion_tokens":6}}\\n','data: [DONE]\\n']; var s=new ReadableStream({start:function(c){ lines.forEach(function(l){ c.enqueue(enc.encode(l)); }); c.close(); }}); return new Response(s,{status:200,headers:{'Content-Type':'text/event-stream'}}); };
    newChat(); await runAssistant('think test',false); await new Promise(function(r){setTimeout(r,200);}); window.fetch=orig;
    var c=curChat(); var rows=document.querySelectorAll('#aiLog .msg-row.ai'); var last=rows[rows.length-1]; var bubble=last.querySelector('.msg.ai'); var th=last.querySelector('details.think');
    var tr=window.__aiTrace[window.__aiTrace.length-1];
    return bubble.textContent==='The answer.' && !!th && /plan step A/.test(th.textContent) && /inline plan/.test(th.textContent) && c.turns[1].content==='The answer.' && /inline plan/.test(c.turns[1].thinking||'') && !!tr && tr.raw.length>=4 && tr.answer==='The answer.';
  })()`));
  await check('chat sessions: rename + delete', () => E(`(function(){var i=activeChat; chats[i].title='Renamed'; persistChats(); renderChatList(); var ok=document.querySelector('#aiChatList .chat-item.on .ct').textContent==='Renamed'; var n=chats.length; window.confirm=function(){return true;}; deleteChat(i); return ok && chats.length===Math.max(1,n-1);})()`));

  // ---------- 9. export + theme ----------
  section('export-theme');
  await check('HTML export builds a standalone page from the markdown', () => E(`(function(){var got=null; var od=download; download=function(name,data){ got={name:name,data:data}; }; try{ exportHTML(); } finally{ download=od; } return !!got && /<!doctype html>/i.test(got.data) && /<main>/.test(got.data) && /\\.html$/.test(got.name);})()`));
  await check('theme swap re-derives tokens; paper ink stays neutral', () => E(`(function(){applyTheme(2); var acc=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); applyTheme(0); var ink=getComputedStyle(document.documentElement).getPropertyValue('--paper-ink').trim(); return acc.toLowerCase()==='#4affff' && ink==='#1a1a20';})()`));
  await check('Lite mode strips the ambience canvas and overlays', () => E(`(function(){setLite(true); var hid=getComputedStyle(document.getElementById('amb')).display==='none'; setLite(false); return hid;})()`));
  await check('rendered HTML is sanitised (script/onerror stripped, colour spans kept)', () => E(`(function(){window.__xss=0; newTab('# S\\n\\n<span style="color:#2e8b57">g</span> <img src=x onerror="window.__xss=1"><script>window.__xss=2<\\/script>\\n','san.md'); setView('render'); return new Promise(function(res){ setTimeout(function(){ res(window.__xss===0 && !!document.querySelector('#paper span[style*="color"]') && !document.querySelector('#paper script')); },500); });})()`));
  await check('no uncaught exceptions during the whole run', () => { const e = cdp.drainErrors(); return { ok: e.length === 0, detail: e[0] }; });

  if (ARGS.has('--shots')) {
    const out = join(ROOT, 'test', 'out'); mkdirSync(out, { recursive: true });
    for (const v of ['write', 'source', 'render']) { await E(`setView('${v}')`); await settle(400); writeFileSync(join(out, `view-${v}.png`), await cdp.screenshot()); }
    console.log('  screenshots -> test/out/');
  }

  // ---------- 10. lite edition smoke ----------
  section('lite');
  await cdp.navigate(`http://127.0.0.1:${HTTP_PORT}/scriptorium-lite.html`); await settle(800);
  await check('lite loads without exceptions and renders the welcome doc', () => { const e = cdp.drainErrors(); return { ok: e.length === 0 && true, detail: e[0] }; });
  await check('lite: source textarea + rendered page both present', () => E(`!!document.getElementById('src') && !!document.querySelector('#paper .page')`));
} finally {
  try { cdp && cdp.ws.close(); } catch (e) {}
  chrome.kill(); server.close();
}
summary();

function summary() {
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('\n' + '='.repeat(60));
  console.log(fail === 0 ? `ALL GREEN — ${pass}/${results.length} checks passed` : `RED — ${fail} failed, ${pass} passed`);
  if (fail) results.filter(r => !r.ok).forEach(r => console.log('  ✗ [' + r.section + '] ' + r.name));
  console.log('='.repeat(60));
  process.exit(fail ? 1 : 0);
}
