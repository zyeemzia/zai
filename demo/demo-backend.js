/* ZBZAI live demo backend · Copyright © ZyeemZia
 * The website demo runs the real ZBZAI web app against this in-browser copy of
 * the engine's knowledge vault: the same chunking, the same ranked search and
 * the same vault answers as zbzai_server.py. What a visitor teaches is kept in
 * their own browser only. The downloadable engine adds the server, the LAN,
 * and a real AI model. */
(() => {
  'use strict';
  const SEED = window.ZBZAI_SEED || [];
  const STOP = new Set('a an and are as at be but by can do does for from how i if in is it its me my of on or so that the this to was what when where which who why will with you your'.split(' '));
  const KEY = 'zbzai-demo-vault-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: in-memory only */ } };

  function chunk(text, size = 900) {
    const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const out = []; let cur = '';
    for (let p of paras) {
      if ((cur + '\n\n' + p).length <= size) { cur = (cur + '\n\n' + p).trim(); continue; }
      if (cur) out.push(cur);
      while (p.length > size) { let cut = p.lastIndexOf('. ', size); cut = cut > size / 2 ? cut + 1 : size; out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); }
      cur = p;
    }
    if (cur) out.push(cur);
    return out;
  }
  let V = load();
  if (!V) {
    V = { docs: [], passages: [], chats: {}, next: 1 };
    for (const s of SEED) addDoc(s.title, s.text, 'seed', s.added || Date.now() / 1000);
    save(V);
  }
  function addDoc(title, text, kind, added) {
    const id = V.next++;
    V.docs.unshift({ id, title, kind, added: added || Date.now() / 1000, chars: text.length });
    for (const body of chunk(text)) V.passages.push({ doc_id: id, title, body });
    return { id, n: chunk(text).length };
  }
  const words = q => (q.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []).filter(w => !STOP.has(w) && w.length > 1);

  function search(q, k = 6) {
    const ws = [...new Set(words(q))];
    if (!ws.length) return [];
    const N = V.passages.length || 1;
    const df = Object.fromEntries(ws.map(w => [w, V.passages.filter(p => (p.title + ' ' + p.body).toLowerCase().includes(w)).length]));
    return V.passages.map(p => {
      const t = (p.title + ' ' + p.body).toLowerCase(), tl = p.title.toLowerCase();
      let s = 0;
      for (const w of ws) {
        const tf = t.split(w).length - 1;
        if (tf) s += Math.log(1 + N / (1 + df[w])) * (tf / (tf + 1.2)) * (tl.includes(w) ? 2 : 1);
      }
      return { ...p, score: s };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }

  function vaultAnswer(q, passages) {
    const ws = [...new Set(words(q).filter(w => w.length > 2))];
    const sents = [];
    passages.slice(0, 6).forEach((p, rank) => {
      const body = p.body.replace(/^\s*#+\s.*$/gm, '').replace(/^(Question|Answer):\s*/gm, '');
      for (let s of body.split(/(?<=[.!?])\s+|\n+/)) { s = s.trim().replace(/^[-*\s]+/, ''); if (s.length >= 25) sents.push({ rank, s, title: p.title, low: s.toLowerCase() }); }
    });
    if (!sents.length) return null;
    const n = sents.length, idf = {};
    for (const w of ws) idf[w] = Math.log(1 + n / (1 + sents.filter(x => x.low.includes(w)).length));
    const c = sents.map(x => ({ ...x, score: ws.reduce((a, w) => a + (x.low.includes(w) ? idf[w] : 0), 0) * 10 - x.rank - x.s.length / 400 }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (!c.length) return null;
    const top = c[0].score, seen = new Set(), picked = [];
    for (const x of c) { if (x.score < top * 0.45 || seen.has(x.s)) continue; seen.add(x.s); picked.push(x); if (picked.length === 4) break; }
    return 'From what I have learned:\n\n' + picked.map(x => `- ${x.s} [${x.title}]`).join('\n') +
      '\n\n_(Demo: answered from the knowledge vault in your browser. The downloadable engine adds a real AI model that writes full answers from these sources, fully offline.)_';
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.ZBZAI_BACKEND = {
    async status() {
      return { name: 'ZBZAI', version: (window.ZBZAI_VERSION || '1.0.0') + ' demo', brain: 'vault', setting: 'auto',
        local: { available: false, models: [], model: null }, cloud: { available: false, why: 'not part of the web demo', model: 'claude-opus-5-5' },
        vault: { documents: V.docs.length, passages: V.passages.length, search: 'browser' },
        online: { available: false, why: 'the downloaded engine uses ZyeemZia AI online for free', name: 'ZyeemZia AI (free)' }, update: { available: false }, copyright: 'Copyright © ZyeemZia',
        urls: ['http://192.168.1.20:8765/  (example: your computer shows its own)'], learning_open_to_all: true };
    },
    async knowledge() { return V.docs; },
    async search(q) { return search(q, 10); },
    async learn(p) {
      let text = p.text || '', title = p.title;
      if (p.file_b64) {
        const name = (p.filename || '').toLowerCase();
        if (!/\.(txt|md|csv|json|html?|log|xml|ya?ml|py|js)$/.test(name)) throw new Error('In the web demo, upload text files (.txt .md .csv .json .html). The engine also reads Word and PDF.');
        text = new TextDecoder().decode(Uint8Array.from(atob(p.file_b64), c => c.charCodeAt(0)));
        if (/\.html?$/.test(name)) text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
        title = title || p.filename;
      }
      text = text.trim();
      if (text.length < 2) throw new Error('nothing to learn');
      if (text.length > 400000) throw new Error('That is a lot for a browser demo: the engine handles big documents.');
      const r = addDoc((title || text.split('\n')[0].slice(0, 80)).trim(), text, p.file_b64 ? 'file' : 'note');
      save(V);
      return { ok: true, doc_id: r.id, passages: r.n };
    },
    async forget(id) { V.docs = V.docs.filter(d => d.id !== id); V.passages = V.passages.filter(p => p.doc_id !== id); save(V); return { ok: true }; },
    async images() { return []; },
    async templates() { return V.tpl || []; },
    async coworkers() {
      let ready = [];
      try { ready = (await (await fetch('coworkers.json')).json()).map(c => Object.assign(c, { builtin: true })); } catch { /* offline */ }
      return (V.cw || []).concat(ready);
    },
    async saveCoworker(c) {
      if (!c.name || c.name.length < 2) throw new Error('Give the coworker a name.');
      const item = Object.assign({}, c, { id: c.id && c.id.startsWith('c') ? c.id : 'c' + Date.now().toString(36), builtin: false });
      V.cw = [item].concat((V.cw || []).filter(x => x.id !== item.id)); save(V); return item;
    },
    async deleteCoworker(id) { V.cw = (V.cw || []).filter(x => x.id !== id); save(V); return { ok: true }; },
    async saveTemplate(name, sample) {
      if (!name || (sample || '').trim().length < 20) throw new Error('Give the format a name and a full sample.');
      V.tpl = (V.tpl || []).filter(t => t.name.toLowerCase() !== name.toLowerCase());
      const it = { id: 'u' + Date.now().toString(36), name: name.slice(0, 80), sample: sample.slice(0, 20000) };
      V.tpl.unshift(it); addDoc('Format: ' + it.name, sample, 'format'); save(V); return it;
    },
    async deleteTemplate(id) { V.tpl = (V.tpl || []).filter(t => t.id !== id); save(V); return { ok: true }; },
    async checkUpdate() { return { available: false, latest: window.ZBZAI_VERSION, notes: '' }; },
    async applyUpdate() { throw new Error('The web demo is always the newest version. Downloaded copies update themselves from Settings.'); },
    async settings() { throw new Error('Settings live on the host computer. Download ZBZAI to use them.'); },
    async feedback(q, a) { addDoc('Learned answer: ' + q.slice(0, 70), `Question: ${q}\n\nAnswer: ${a.split('_(Demo')[0]}`, 'learned'); save(V); return { ok: true }; },
    async history(s) { return V.chats[s] || []; },
    async chat(message, session, on) {
      const passages = search(message, 6);
      on('meta', { brain: 'vault', model: null, sources: passages.map(p => ({ title: p.title, doc_id: p.doc_id })) });
      const ans = vaultAnswer(message, passages) || 'I have not learned anything about that yet. Open **Knowledge**, teach me a few facts, then ask again: that is exactly how ZBZAI grows.';
      for (const part of ans.match(/\S+\s*/g) || []) { on('text', part); await sleep(12); }
      (V.chats[session] = V.chats[session] || []).push({ role: 'user', content: message }, { role: 'assistant', content: ans });
      V.chats[session] = V.chats[session].slice(-40); save(V);
      on('done', { brain: 'vault' });
    }
  };
})();
