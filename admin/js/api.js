// কনটেন্ট সংরক্ষণের স্তর: GitHub API (অনলাইন) অথবা লোকাল সার্ভার (python build.py --serve)
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const utf8ToB64 = (s) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };

// ---------- ছোট IndexedDB ক্যাশ (sha → লেখা) ----------
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('keyari-admin', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('blobs', mode); const st = t.objectStore('blobs'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)).catch(() => undefined),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)).catch(() => undefined),
    clear: () => tx('readwrite', (s) => s.clear()).catch(() => undefined),
  };
})();

class GitHubBackend {
  constructor({ owner, repo, branch, token }) {
    Object.assign(this, { owner, repo, branch: branch || 'main', token });
    this.mode = 'github';
    this.api = 'https://api.github.com';
  }
  async req(path, opts = {}, raw = false) {
    const r = await fetch(this.api + path, {
      ...opts,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); msg = j.message || msg; } catch (e) { /* */ }
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return r;
  }
  repoPath(p) { return `/repos/${this.owner}/${this.repo}${p}`; }
  async verify() {
    const user = await (await this.req('/user')).json();
    const repo = await (await this.req(this.repoPath(''))).json();
    if (!repo.permissions || !repo.permissions.push) throw new Error('এই রিপোতে লেখার (push) অনুমতি নেই');
    this.defaultBranch = repo.default_branch;
    if (!this.branch) this.branch = repo.default_branch;
    return { login: user.login, name: user.name, avatar: user.avatar_url, private: repo.private, html_url: repo.html_url, pages: repo.has_pages };
  }
  async tree() {
    const j = await (await this.req(this.repoPath(`/git/trees/${encodeURIComponent(this.branch)}?recursive=1`))).json();
    return j.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha, size: t.size }));
  }
  async readText(path, sha) {
    if (sha) { const c = await idb.get(sha); if (c !== undefined) return c; }
    const r = await this.req(this.repoPath(`/contents/${enc(path)}?ref=${encodeURIComponent(this.branch)}`), {}, true);
    const t = await r.text();
    if (sha) idb.set(sha, t);
    return t;
  }
  async readBlob(path) {
    const r = await this.req(this.repoPath(`/contents/${enc(path)}?ref=${encodeURIComponent(this.branch)}`), {}, true);
    return r.blob();
  }
  /** একাধিক ফাইল এক কমিটে: changes = [{path, text} | {path, base64} | {path, delete:true}] */
  async commit(message, changes, attempt = 0) {
    const ref = await (await this.req(this.repoPath(`/git/ref/heads/${encodeURIComponent(this.branch)}`))).json();
    const headSha = ref.object.sha;
    const head = await (await this.req(this.repoPath(`/git/commits/${headSha}`))).json();
    const entries = [];
    // ছোট ব্যাচে ব্লব তৈরি
    const queue = [...changes];
    const worker = async () => {
      while (queue.length) {
        const ch = queue.shift();
        if (ch.delete) { entries.push({ path: ch.path, mode: '100644', type: 'blob', sha: null }); continue; }
        const body = ch.base64 !== undefined ? { content: ch.base64, encoding: 'base64' } : { content: utf8ToB64(ch.text ?? ''), encoding: 'base64' };
        const b = await (await this.req(this.repoPath('/git/blobs'), { method: 'POST', body: JSON.stringify(body) })).json();
        entries.push({ path: ch.path, mode: '100644', type: 'blob', sha: b.sha });
        if (ch.text !== undefined) idb.set(b.sha, ch.text);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, changes.length || 1) }, worker));
    const tree = await (await this.req(this.repoPath('/git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) })).json();
    const commit = await (await this.req(this.repoPath('/git/commits'), { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }) })).json();
    try {
      await this.req(this.repoPath(`/git/refs/heads/${encodeURIComponent(this.branch)}`), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
    } catch (e) {
      if ((e.status === 422 || e.status === 409) && attempt < 2) return this.commit(message, changes, attempt + 1);
      throw e;
    }
    return { sha: commit.sha, url: commit.html_url };
  }
  async history(path) {
    const j = await (await this.req(this.repoPath(`/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.branch)}&per_page=30`))).json();
    return j.map((c) => ({ sha: c.sha, message: c.commit.message, date: c.commit.author.date, author: c.commit.author.name, url: c.html_url }));
  }
  async readAt(path, sha) {
    const r = await this.req(this.repoPath(`/contents/${enc(path)}?ref=${sha}`), {}, true);
    return r.text();
  }
  async runs() {
    const j = await (await this.req(this.repoPath('/actions/runs?per_page=8'))).json();
    return (j.workflow_runs || []).map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, title: r.display_title, created: r.created_at, updated: r.updated_at, url: r.html_url, event: r.event }));
  }
  async dispatch(workflow = 'deploy.yml') {
    await this.req(this.repoPath(`/actions/workflows/${workflow}/dispatches`), { method: 'POST', body: JSON.stringify({ ref: this.branch }) });
  }
  repoUrl() { return `https://github.com/${this.owner}/${this.repo}`; }
}

class LocalBackend {
  constructor() { this.mode = 'local'; this.base = (window.__KEYARI_BASE || ''); }
  async verify() {
    const r = await fetch(this.base + '/_api/status', { cache: 'no-store' });
    if (!r.ok) throw new Error('লোকাল সার্ভার পাওয়া যায়নি');
    return { login: 'local', name: 'লোকাল সম্পাদক', avatar: '', private: true };
  }
  async tree() { const j = await (await fetch(this.base + '/_api/tree', { cache: 'no-store' })).json(); return j.tree; }
  async readText(path) { const r = await fetch(this.base + '/_api/raw?path=' + encodeURIComponent(path), { cache: 'no-store' }); if (!r.ok) throw new Error('ফাইল পাওয়া যায়নি: ' + path); return r.text(); }
  async readBlob(path) { const r = await fetch(this.base + '/_api/raw?path=' + encodeURIComponent(path), { cache: 'no-store' }); return r.blob(); }
  async commit(message, changes) {
    const r = await fetch(this.base + '/_api/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, changes }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'সংরক্ষণ ব্যর্থ');
    if (!j.ok) throw new Error('সংরক্ষিত হয়েছে, কিন্তু সাইট তৈরিতে ত্রুটি:\n' + j.log);
    return { sha: 'local' };
  }
  async history() { return []; }
  async readAt() { throw new Error('লোকাল মোডে সংস্করণ ইতিহাস নেই (git log ব্যবহার করুন)'); }
  async runs() { return []; }
  async dispatch() { }
  repoUrl() { return ''; }
}

export const Backend = { GitHubBackend, LocalBackend, clearCache: () => idb.clear() };
