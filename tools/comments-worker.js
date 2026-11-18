/**
 * কেয়ারির মন্তব্য-সার্ভার (Cloudflare Workers + KV) — বিনামূল্যের প্ল্যানেই চলে।
 *
 * কী করে:
 *  - পাঠক নাম (ঐচ্ছিক) ও মন্তব্য পাঠালে সেটা "অপেক্ষমাণ" হিসেবে জমা হয়
 *  - অ্যাডমিন অনুমোদন দিলে তবেই সবার কাছে দেখায়
 *  - অ্যাডমিন প্যানেলের "মন্তব্য" পাতা থেকে অনুমোদন / লুকানো / উত্তর / মুছে ফেলা
 *
 * সেটআপ README-র "মন্তব্য চালু করা" অংশে বাংলায় লেখা আছে।
 * দরকার: KV নেমস্পেস বাইন্ডিং  →  COMMENTS
 *        সিক্রেট ভ্যারিয়েবল       →  ADMIN_TOKEN  (অ্যাডমিনের পাসওয়ার্ড; নিজে ঠিক করুন, লম্বা ও এলোমেলো)
 *        ঐচ্ছিক ভ্যারিয়েবল        →  ALLOWED_ORIGIN (যেমন https://thekeyari.com — না দিলে সব জায়গা থেকে চলবে)
 */

const MAX_TEXT = 2000;
const MAX_NAME = 60;
const PER_HOUR = 5; // এক আইপি থেকে ঘণ্টায় সর্বোচ্চ কয়টি মন্তব্য

const safe = (s) => String(s || '').replace(/[^\w-]/g, '_').slice(0, 80);

function cors(env, req) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(env, req, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(env, req), ...extra },
  });
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isAdmin = (req, env) => {
  const h = req.headers.get('authorization') || '';
  return !!env.ADMIN_TOKEN && h === 'Bearer ' + env.ADMIN_TOKEN;
};

async function listAll(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.COMMENTS.list({ prefix, cursor, limit: 1000 });
    out.push(...r.keys);
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 5000);
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    if (!env.COMMENTS) return json(env, req, { error: 'KV বাইন্ডিং (COMMENTS) নেই' }, 500);

    // ---------- পাঠক: অনুমোদিত মন্তব্য দেখা ----------
    if (url.pathname === '/comments' && req.method === 'GET') {
      const post = safe(url.searchParams.get('post'));
      if (!post) return json(env, req, { comments: [] });
      const keys = (await listAll(env, `c:${post}:`)).filter((k) => k.metadata && k.metadata.s === 'a');
      const items = (await Promise.all(keys.map((k) => env.COMMENTS.get(k.name, 'json')))).filter(Boolean);
      items.sort((a, b) => a.ts - b.ts);
      return json(env, req, {
        comments: items.map((c) => ({ id: c.id, name: c.name || '', text: c.text, ts: c.ts, reply: c.reply || '', reply_ts: c.reply_ts || 0 })),
      });
    }

    // ---------- পাঠক: নতুন মন্তব্য পাঠানো (অপেক্ষমাণ হয়ে জমা হয়) ----------
    if (url.pathname === '/comments' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json(env, req, { error: 'ভুল অনুরোধ' }, 400); }
      if (b.website) return json(env, req, { ok: true, id: 'x', status: 'pending' }); // স্প্যাম-ফাঁদ: বট এটা ভরে ফেলে
      const post = safe(b.post);
      const text = String(b.text || '').trim();
      const name = String(b.name || '').trim().slice(0, MAX_NAME);
      if (!post) return json(env, req, { error: 'লেখা চেনা যায়নি' }, 400);
      if (!name) return json(env, req, { error: 'আপনার নাম লিখুন' }, 400);
      if (text.length < 2) return json(env, req, { error: 'মন্তব্য খুব ছোট' }, 400);
      if (text.length > MAX_TEXT) return json(env, req, { error: `মন্তব্য ${MAX_TEXT} অক্ষরের মধ্যে রাখুন` }, 400);
      if ((text.match(/https?:\/\//gi) || []).length > 2) return json(env, req, { error: 'একসাথে অনেক লিংক দেওয়া যাবে না' }, 400);

      const ip = req.headers.get('cf-connecting-ip') || 'x';
      const rk = 'r:' + (await sha(ip));
      const used = parseInt((await env.COMMENTS.get(rk)) || '0', 10);
      if (used >= PER_HOUR) return json(env, req, { error: 'অনেকগুলো মন্তব্য পাঠানো হয়েছে, একটু পরে আবার চেষ্টা করুন' }, 429);
      await env.COMMENTS.put(rk, String(used + 1), { expirationTtl: 3600 });

      const ts = Date.now();
      const id = ts.toString(36) + Math.random().toString(36).slice(2, 7);
      const rec = { id, post, title: String(b.title || '').slice(0, 200), url: String(b.url || '').slice(0, 400), name, text, ts, reply: '', reply_ts: 0 };
      await env.COMMENTS.put(`c:${post}:${id}`, JSON.stringify(rec), { metadata: { s: 'p', t: ts } });
      return json(env, req, { ok: true, id, status: 'pending' });
    }

    // ---------- অ্যাডমিন ----------
    if (url.pathname.startsWith('/admin/')) {
      if (!isAdmin(req, env)) return json(env, req, { error: 'অনুমতি নেই' }, 401);

      if (url.pathname === '/admin/comments' && req.method === 'GET') {
        const status = url.searchParams.get('status') || 'all'; // p | a | all
        let keys = await listAll(env, 'c:');
        const counts = { p: 0, a: 0 };
        keys.forEach((k) => { const s = (k.metadata && k.metadata.s) || 'p'; counts[s] = (counts[s] || 0) + 1; });
        if (status !== 'all') keys = keys.filter((k) => ((k.metadata && k.metadata.s) || 'p') === status);
        keys.sort((a, b) => ((b.metadata && b.metadata.t) || 0) - ((a.metadata && a.metadata.t) || 0));
        keys = keys.slice(0, 200);
        const items = (await Promise.all(keys.map(async (k) => {
          const v = await env.COMMENTS.get(k.name, 'json');
          return v ? { ...v, key: k.name, status: (k.metadata && k.metadata.s) === 'a' ? 'approved' : 'pending' } : null;
        }))).filter(Boolean);
        return json(env, req, { comments: items, counts: { pending: counts.p, approved: counts.a } });
      }

      if (url.pathname === '/admin/comments' && req.method === 'POST') {
        let b;
        try { b = await req.json(); } catch (e) { return json(env, req, { error: 'ভুল অনুরোধ' }, 400); }
        const key = String(b.key || '');
        if (!key.startsWith('c:')) return json(env, req, { error: 'ভুল কী' }, 400);
        const cur = await env.COMMENTS.getWithMetadata(key, 'json');
        if (!cur.value) return json(env, req, { error: 'মন্তব্যটি পাওয়া যায়নি' }, 404);
        const rec = cur.value;
        if (b.action === 'delete') { await env.COMMENTS.delete(key); return json(env, req, { ok: true }); }
        let s = (cur.metadata && cur.metadata.s) || 'p';
        if (b.action === 'approve') s = 'a';
        if (b.action === 'unapprove') s = 'p';
        if (typeof b.reply === 'string') { rec.reply = b.reply.trim().slice(0, MAX_TEXT); rec.reply_ts = rec.reply ? Date.now() : 0; }
        if (typeof b.text === 'string' && b.text.trim()) rec.text = b.text.trim().slice(0, MAX_TEXT);
        await env.COMMENTS.put(key, JSON.stringify(rec), { metadata: { s, t: (cur.metadata && cur.metadata.t) || rec.ts } });
        return json(env, req, { ok: true, status: s === 'a' ? 'approved' : 'pending' });
      }
    }

    if (url.pathname === '/' || url.pathname === '/health') return json(env, req, { ok: true, service: 'keyari-comments' });
    return json(env, req, { error: 'পাওয়া যায়নি' }, 404);
  },
};
