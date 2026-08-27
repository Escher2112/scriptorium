#!/usr/bin/env node
// llm-probe — hands on the model. Sends one prompt to an OpenAI-compatible server exactly the way
// Scriptorium does (streaming, tools optional) and prints EVERY raw SSE delta, so you can see what a
// model really emits: reasoning fields, inline <think> tags, tool-call fragments, usage.
//   node test/llm-probe.mjs "say hi"                          # default http://localhost:1234, first loaded model
//   node test/llm-probe.mjs "..." --endpoint http://host:1234 --model NAME --tools --system "You are X"
//   node test/llm-probe.mjs "..." --raw                        # dump raw lines only (no summary)
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);
const prompt = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || ['--tools', '--raw'].includes(args[i - 1]))) || 'Say hello in one short sentence.';
let ep = (opt('--endpoint', 'http://localhost:1234')).replace(/\/+$/, '');
if (!/\/(chat\/completions|completions|responses)$/.test(ep)) ep += /\/v1$/.test(ep) ? '/chat/completions' : '/v1/chat/completions';
const base = ep.replace(/\/(chat\/completions|completions|responses)$/, '');
let model = opt('--model', '');
if (!model) { try { const j = await (await fetch(base + '/models')).json(); model = (j.data && j.data[0] && j.data[0].id) || 'local'; } catch (e) { model = 'local'; } }
const tools = has('--tools') ? [{ type: 'function', function: { name: 'apply_edit', description: 'Replace one unique substring of the document.', parameters: { type: 'object', properties: { old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['old_string', 'new_string'] } } }] : undefined;
const body = { model, messages: [{ role: 'system', content: opt('--system', 'You are a concise assistant.') }, { role: 'user', content: prompt }], stream: true, stream_options: { include_usage: true }, ...(tools ? { tools, tool_choice: 'auto' } : {}) };
console.log(`→ POST ${ep}   model=${model}   tools=${!!tools}\n`);
const t0 = performance.now(); let tFirst = null;
const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) { console.log('HTTP', res.status, await res.text()); process.exit(1); }
const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '', n = 0;
const acc = { content: '', reasoning: '', toolArgs: '', usage: null, keys: new Set(), finish: null };
outer: while (true) {
  const { value, done } = await rd.read(); if (done) break;
  buf += dec.decode(value, { stream: true }); let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    if (has('--raw')) { console.log(line); }
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim(); if (data === '[DONE]') break outer;
    let j; try { j = JSON.parse(data); } catch (e) { console.log('  (unparseable)', line.slice(0, 120)); continue; }
    n++; if (tFirst == null) tFirst = performance.now();
    if (j.usage) acc.usage = j.usage;
    const ch = j.choices && j.choices[0]; if (!ch) continue;
    const d = ch.delta || {}; Object.keys(d).forEach(k => acc.keys.add(k));
    if (ch.finish_reason) acc.finish = ch.finish_reason;
    if (d.content) acc.content += d.content;
    if (d.reasoning_content) acc.reasoning += d.reasoning_content;
    if (d.reasoning) acc.reasoning += d.reasoning;
    if (d.tool_calls) for (const tc of d.tool_calls) { if (tc.function && tc.function.name) acc.toolArgs += `\n[tool ${tc.function.name}] `; if (tc.function && tc.function.arguments) acc.toolArgs += tc.function.arguments; }
    if (!has('--raw')) { const show = d.content ?? d.reasoning_content ?? d.reasoning ?? (d.tool_calls ? '[tool_calls]' : ''); if (show) process.stdout.write(String(show)); }
  }
}
const tEnd = performance.now();
console.log('\n\n' + '='.repeat(60));
console.log('delta keys seen :', [...acc.keys].join(', ') || '(none)');
console.log('finish_reason   :', acc.finish);
console.log('usage           :', JSON.stringify(acc.usage));
console.log('deltas          :', n, ' TTFT', Math.round((tFirst ?? tEnd) - t0), 'ms  total', Math.round(tEnd - t0), 'ms');
const inl = acc.content.match(/<think>|<\/think>|◁think▷|<thought>|<\|channel\|>|\[THINK\]/gi);
console.log('inline think tags in CONTENT :', inl ? [...new Set(inl)].join(' ') : 'none');
console.log('separate reasoning field     :', acc.reasoning ? acc.reasoning.length + ' chars' : 'none');
if (acc.reasoning) console.log('--- reasoning (first 400) ---\n' + acc.reasoning.slice(0, 400));
if (acc.toolArgs) console.log('--- tool calls ---' + acc.toolArgs);
console.log('--- content (first 600) ---\n' + acc.content.slice(0, 600));
