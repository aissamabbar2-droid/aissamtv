/* تلفزيون مفتوح — مشغّل قنوات عربية وفرنكوفونية مجانية + قوائم M3U / Xtream خاصة
 * المصدر الافتراضي: قوائم iptv-org العامة (https://github.com/iptv-org/iptv)
 */
(() => {
  'use strict';

  const SOURCES = {
    ara: 'https://iptv-org.github.io/iptv/languages/ara.m3u',
    fra: 'https://iptv-org.github.io/iptv/languages/fra.m3u',
  };
  // تصنيفات iptv-org → أصناف التطبيق
  const CAT_MAP = {
    General: 'general', News: 'news',
    Documentary: 'doc', Culture: 'doc', Education: 'doc', Science: 'doc',
  };
  // قنوات عمومية/وثائقية مصنّفة في المصدر كـ«ترفيه» أو «غير محدد»
  const EXTRA_CATS = {
    'arte.fr': 'doc', 'RMCDecouverte.fr': 'doc', 'Savoirmedia.ca': 'doc',
    'TV5MondeAfrica.fr': 'general', 'TV5MondeAsia.fr': 'general', 'TV5MondePacific.fr': 'general',
    'TV5QuebecCanada.ca': 'general', 'TV5Unis.ca': 'general', 'TF1.fr': 'general', 'M6.fr': 'general',
    'LaUne.be': 'general', 'Tipik.be': 'general', 'LCP.fr': 'news', 'RTB.bf': 'general',
    'SudanTV.sd': 'general', 'FujairahTV.ae': 'general', 'UTV.iq': 'general', 'YemenTodayTV.ye': 'general',
    'WattanTV.ps': 'general', 'AlSaudiyaAlaan.sa': 'news',
  };
  const CAT_LABEL = { general: 'عامة', news: 'إخبارية', doc: 'وثائقية/ثقافية' };
  const LANG_LABEL = { ara: 'عربية', fra: 'فرنسية' };
  const KIND_LABEL = { live: 'مباشر', movie: 'فيلم', series: 'مسلسل' };
  const START_TIMEOUT_MS = 20000;
  const FAIL_TTL_MS = 12 * 3600 * 1000;
  const MAX_RENDER = 300;
  const CACHE_KEY = 'tv.playlists.v1';
  const META_KEY = 'tv.mylists.v1';

  const $ = (s) => document.querySelector(s);
  const els = {
    video: $('#video'), overlay: $('#overlay'), ovIcon: $('#ovIcon'), ovTitle: $('#ovTitle'),
    ovText: $('#ovText'), ovActions: $('#ovActions'), list: $('#list'), count: $('#count'),
    source: $('#source'), search: $('#search'), country: $('#country'), group: $('#group'),
    langSeg: $('#langSeg'), catChips: $('#catChips'), kindChips: $('#kindChips'),
    openFilters: $('#openFilters'), customFilters: $('#customFilters'),
    srcSel: $('#srcSel'), btnAdd: $('#btnAdd'), btnSrcDel: $('#btnSrcDel'),
    nowBar: $('#nowBar'), nowLogo: $('#nowLogo'), nowName: $('#nowName'),
    nowMeta: $('#nowMeta'), btnFav: $('#btnFav'), btnExternal: $('#btnExternal'),
    btnPrev: $('#btnPrev'), btnNext: $('#btnNext'), btnRefresh: $('#btnRefresh'),
    btnHelp: $('#btnHelp'), help: $('#help'), toast: $('#toast'),
    addDlg: $('#addDlg'), addForm: $('#addForm'), addType: $('#addType'), addName: $('#addName'),
    addUrl: $('#addUrl'), addFile: $('#addFile'), xtServer: $('#xtServer'), xtUser: $('#xtUser'),
    xtPass: $('#xtPass'), addStatus: $('#addStatus'), addOk: $('#addOk'), addCancel: $('#addCancel'),
  };

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isNativeApp = !!(window.OpenTVNative && window.OpenTVNative.proxyConfig);
  const isHttpsPage = location.protocol === 'https:';
  const APK_URL = 'https://github.com/aissamabbar2-droid/aissamtv/releases/latest/download/OpenTV.apk';
  // على متصفح الهاتف: تطبيق الأندرويد يفتح ما يمنعه المتصفح
  const needsApk = () => isAndroid && !isNativeApp && !state.proxy;
  const regionName = (() => {
    try { const dn = new Intl.DisplayNames(['ar'], { type: 'region' }); return (c) => { try { return dn.of(c) || c; } catch { return c; } }; }
    catch { return (c) => c; }
  })();

  // ---------- تخزين محلي ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  // محتوى القوائم الخاصة قد يكون كبيراً (آلاف القنوات والأفلام) → IndexedDB
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('opentv', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('lists', { keyPath: 'id' });
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('lists', mode);
        const req = fn(tx.objectStore('lists'));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
    },
    get(id) { return this.run('readonly', (s) => s.get(id)); },
    put(o) { return this.run('readwrite', (s) => s.put(o)); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)); },
  };

  const state = {
    sourceId: store.get('tv.source', 'open'),
    myLists: store.get(META_KEY, []),
    openChannels: [],
    openLabel: '',
    channels: [],
    filtered: [],
    lang: store.get('tv.lang', 'all'),
    cat: store.get('tv.cat', 'all'),
    country: store.get('tv.country', ''),
    kind: 'all',
    group: '',
    query: '',
    favs: new Set(store.get('tv.favs', [])),
    failed: store.get('tv.failed', {}),
    current: null,
    attempts: [],
    attemptIdx: 0,
    hls: null,
    mpg: null,
    startTimer: null,
    playToken: 0,
    reconnects: 0,
    proxy: null,
  };
  const isOpenSource = () => state.sourceId === 'open';

  // ---------- تحليل ملف M3U ----------
  function parseM3U(text) {
    const out = [];
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        const attrs = {};
        line.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
        const lastQuote = line.lastIndexOf('"');
        const comma = line.indexOf(',', lastQuote > -1 ? lastQuote : 0);
        cur = { attrs, title: comma > -1 ? line.slice(comma + 1).trim() : '', opts: [] };
      } else if (line.startsWith('#EXTVLCOPT') && cur) {
        cur.opts.push(line);
      } else if (!line.startsWith('#') && cur) {
        out.push({ ...cur, url: line });
        cur = null;
      }
    }
    return out;
  }

  function sourceFrom(e, extra = {}) {
    let ref = e.attrs['http-referrer'] || '';
    let ua = e.attrs['http-user-agent'] || '';
    for (const o of e.opts) {
      const m = o.match(/^#EXTVLCOPT:http-(referrer|user-agent)=(.*)$/i);
      if (m && m[1].toLowerCase() === 'referrer') ref = ref || m[2].trim();
      else if (m) ua = ua || m[2].trim();
    }
    return { url: e.url, opts: e.opts, ref, ua, quality: '', geo: false, not247: false, ...extra };
  }

  function buildOpenChannels(playlists) {
    const map = new Map();
    for (const lang of Object.keys(SOURCES)) {
      const text = playlists[lang];
      if (typeof text !== 'string') continue;
      for (const e of parseM3U(text)) {
        const tvgId = e.attrs['tvg-id'] || '';
        const cats = new Set();
        for (const g of (e.attrs['group-title'] || '').split(';')) if (CAT_MAP[g]) cats.add(CAT_MAP[g]);
        const extra = EXTRA_CATS[tvgId.split('@')[0]];
        if (extra) cats.add(extra);
        if (!cats.size) continue;

        let name = e.title;
        const quality = (name.match(/\((\d{3,4}[pi])\)/) || [])[1] || '';
        const geo = /\[Geo-blocked\]/i.test(name);
        const not247 = /\[Not 24\/7\]/i.test(name);
        name = name.replace(/\(\d{3,4}[pi]\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
        const country = ((tvgId.match(/\.([a-z]{2})(?:@|$)/i) || [])[1] || '').toUpperCase();
        // المعرّف الكامل (مع @) يفصل بين نسخ القناة: France 24 بالعربية ≠ بالفرنسية
        const key = (tvgId || name).toLowerCase();

        let ch = map.get(key);
        if (!ch) {
          ch = { key, name, logo: e.attrs['tvg-logo'] || '', country, cats: new Set(), langs: new Set(), sources: [], kind: 'live', group: '' };
          map.set(key, ch);
        }
        cats.forEach((c) => ch.cats.add(c));
        ch.langs.add(lang);
        if (!ch.logo && e.attrs['tvg-logo']) ch.logo = e.attrs['tvg-logo'];
        if (!ch.sources.some((s) => s.url === e.url)) ch.sources.push(sourceFrom(e, { quality, geo, not247 }));
      }
    }
    const qn = (q) => parseInt(q, 10) || 0;
    const score = (s) => (isHttpsPage && s.url.startsWith('http:') ? -1e5 : 0) - ((s.ref || s.ua) && !state.proxy ? 1e4 : 0)
      - (s.geo ? 5e3 : 0) - (s.not247 ? 2e3 : 0) + Math.min(qn(s.quality), 1080);
    const list = [...map.values()];
    for (const ch of list) { ch.sources.sort((a, b) => score(b) - score(a)); ch.norm = norm(ch.name); }
    list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    return list;
  }

  function kindOf(url) {
    const u = url.split('?')[0].toLowerCase();
    if (u.includes('/movie/') || /\.(mp4|mkv|avi|m4v|mov|webm|wmv|flv)$/.test(u)) return 'movie';
    if (u.includes('/series/')) return 'series';
    return 'live';
  }

  function buildCustom(text, listId) {
    const list = [];
    const groups = new Map();
    const kinds = new Set();
    const seen = new Set();
    for (const e of parseM3U(text)) {
      const key = listId + '|' + e.url;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = (e.title || e.attrs['tvg-name'] || e.url).trim();
      const kind = kindOf(e.url);
      const group = (e.attrs['group-title'] || '').trim() || 'بدون مجموعة';
      groups.set(group, (groups.get(group) || 0) + 1);
      kinds.add(kind);
      list.push({
        key, name, norm: norm(name), logo: e.attrs['tvg-logo'] || '', group, kind,
        country: '', cats: new Set(), langs: new Set(), sources: [sourceFrom(e)],
      });
    }
    return { list, groups, kinds };
  }

  // ---------- الشبكة ----------
  async function fetchText(url, ms = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) { const err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return await r.text();
    } finally { clearTimeout(t); }
  }

  function proxify(url, src = {}) {
    const p = state.proxy;
    let q = `${p.base}/p?t=${p.token}&u=${encodeURIComponent(url)}`;
    if (src.ref) q += '&r=' + encodeURIComponent(src.ref);
    if (src.ua) q += '&a=' + encodeURIComponent(src.ua);
    return q;
  }

  // تحميل قائمة خاصة: مباشرة، ثم عبر المساعد المحلي إن كان الخادم يمنع المتصفح
  async function fetchPlaylist(url) {
    const canDirect = !(isHttpsPage && url.startsWith('http:'));
    let err = null;
    if (canDirect) {
      try { return await fetchText(url, 45000); } catch (e) { err = e; if (e.status && !state.proxy) throw e; }
    }
    if (state.proxy) return fetchText(proxify(url), 180000);
    const e = err || new Error('mixed-content');
    e.blocked = true;
    throw e;
  }

  // ---------- المساعد المحلي (نسخة الحاسوب المثبّتة، أو تطبيق الأندرويد) ----------
  async function initProxy() {
    let cfg = null;
    if (isNativeApp) {
      try { cfg = JSON.parse(window.OpenTVNative.proxyConfig() || 'null'); } catch { cfg = null; }
    } else {
      const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      if (!local) return;
      await new Promise((res) => {
        const s = document.createElement('script');
        s.src = 'data/local.js';
        s.onload = res; s.onerror = res;
        document.head.appendChild(s);
      });
      cfg = window.LOCAL_PROXY;
    }
    if (!cfg || !cfg.token) return;
    // تطبيق الأندرويد يعطي عنواناً على نطاق الصفحة نفسه؛ نسخة الحاسوب تعطي منفذاً محلياً
    const base = cfg.base || `http://127.0.0.1:${cfg.port}`;
    try {
      const txt = await fetchText(`${base}/ping?t=${cfg.token}`, 2500);
      if (txt.trim() === 'ok') {
        state.proxy = { base, token: cfg.token };
        // يُبقي المساعد يعمل ما دامت النافذة مفتوحة
        setInterval(() => fetch(`${base}/ping?t=${cfg.token}`).catch(() => {}), 5 * 60 * 1000);
      }
    } catch { /* المساعد غير مشغّل */ }
  }

  // ---------- القوائم المفتوحة (iptv-org) ----------
  function applyOpen(playlists, label) {
    state.openChannels = buildOpenChannels(playlists);
    state.openLabel = label;
    if (!isOpenSource()) return;
    state.channels = state.openChannels;
    fillCountries();
    render();
    updateStatus();
    if (state.current) {
      const again = state.channels.find((c) => c.key === state.current.key);
      if (again) { state.current = again; updateNowBar(); }
    }
  }

  async function loadOpen({ manual = false } = {}) {
    if (!state.openChannels.length) {
      const cached = store.get(CACHE_KEY, null);
      if (cached && cached.ara) applyOpen(cached, 'نسخة محفوظة · ' + fmtDate(cached.at));
      else if (window.FALLBACK_M3U) applyOpen(window.FALLBACK_M3U, 'نسخة مدمجة');
    }
    els.btnRefresh.classList.add('spin');
    try {
      const [ara, fra] = await Promise.all([fetchText(SOURCES.ara), fetchText(SOURCES.fra)]);
      if (!ara.includes('#EXTINF') || !fra.includes('#EXTINF')) throw new Error('bad playlist');
      const data = { ara, fra, at: Date.now() };
      store.set(CACHE_KEY, data);
      applyOpen(data, 'محدَّثة الآن');
      if (manual) toast('تم تحديث قائمة القنوات');
    } catch (err) {
      console.warn('تعذّر تحديث القوائم:', err);
      if (manual) toast('تعذّر التحديث، تُستعمل آخر نسخة محفوظة');
    } finally {
      els.btnRefresh.classList.remove('spin');
    }
  }

  // ---------- القوائم الخاصة ----------
  function saveMeta() { store.set(META_KEY, state.myLists); }
  const metaOf = (id) => state.myLists.find((m) => m.id === id);

  function fillSourceSelect() {
    const opts = ['<option value="open">📺 القنوات المفتوحة (عربية وفرنكوفونية)</option>'];
    for (const m of state.myLists) opts.push(`<option value="${esc(m.id)}">📁 ${esc(m.name)} (${m.count})</option>`);
    opts.push('<option value="__add">➕ إضافة قائمة M3U أو Xtream…</option>');
    els.srcSel.innerHTML = opts.join('');
    els.srcSel.value = state.sourceId;
  }

  async function setSource(id) {
    if (id !== 'open' && !metaOf(id)) id = 'open';
    state.sourceId = id;
    store.set('tv.source', id);
    els.srcSel.value = id;
    stopPlayback();
    state.current = null;
    updateNowBar();
    showOverlay({ title: 'اختر قناة من القائمة', text: id === 'open' ? 'يتم جلب أحدث روابط البث المفتوح تلقائياً.' : 'اختر قناة أو فيلماً من قائمتك.' });
    const open = id === 'open';
    els.openFilters.hidden = !open;
    els.country.hidden = !open;
    els.customFilters.hidden = open;
    els.group.hidden = open;
    els.btnSrcDel.hidden = open;
    state.query = ''; els.search.value = '';
    if (open) {
      state.channels = state.openChannels;
      fillCountries();
      render();
      updateStatus();
      restoreLast();
      return;
    }
    state.channels = [];
    els.list.innerHTML = '<li class="empty">جارٍ فتح القائمة…</li>';
    try {
      const rec = await idb.get(id);
      if (!rec) throw new Error('missing');
      applyCustom(rec);
      restoreLast();
    } catch (err) {
      console.warn(err);
      els.list.innerHTML = '<li class="empty">تعذّر فتح هذه القائمة. احذفها وأضفها من جديد.</li>';
    }
  }

  function applyCustom(rec) {
    const { list, groups, kinds } = buildCustom(rec.text, rec.id);
    state.channels = list;
    state.kind = 'all';
    state.group = '';
    setSeg(els.kindChips, 'kind', 'all');
    els.kindChips.querySelectorAll('button').forEach((b) => {
      const k = b.dataset.kind;
      b.hidden = !(k === 'all' || k === 'fav' || (kinds.has(k) && kinds.size > 1));
    });
    els.group.innerHTML = `<option value="">كل المجموعات (${groups.size})</option>` +
      [...groups.entries()].map(([g, n]) => `<option value="${esc(g)}">${esc(g)} (${n})</option>`).join('');
    const m = metaOf(rec.id);
    if (m && m.count !== list.length) { m.count = list.length; saveMeta(); fillSourceSelect(); }
    render();
    updateStatus(rec.at);
  }

  function xtreamUrl(server, user, pass) {
    let s = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    s = s.replace(/\/(get|player_api)\.php.*$/i, '');
    return `${s}/get.php?username=${encodeURIComponent(user.trim())}&password=${encodeURIComponent(pass.trim())}&type=m3u_plus&output=m3u8`;
  }
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return 'قائمتي'; } };

  function fetchErrorText(err) {
    if (err && err.status && !state.proxy) {
      // كثير من خوادم IPTV ترفض الطلبات القادمة من المتصفح وتقبل تطبيقات المشغّلات فقط
      return `رفض الخادم الطلب (الرمز ${err.status}). كثير من خوادم IPTV لا تقبل الطلبات من المتصفح. ` +
        (isAndroid ? 'ثبّت تطبيق الأندرويد (الرابط في نافذة المساعدة ؟) وأضف القائمة منه.'
          : 'على الحاسوب: افتح «تلفزيون مفتوح» من اختصاره على سطح المكتب (يعمل معه «المساعد المحلي») وأضف القائمة منه.');
    }
    if (err && err.status) return `ردّ الخادم بالخطأ ${err.status}. تحقق من الرابط ومن أن اشتراكك فعّال (بعض الاشتراكات تسمح بجهاز واحد فقط في نفس الوقت).`;
    if (err && err.name === 'AbortError') return 'انتهت مهلة التحميل. القائمة كبيرة جداً أو الخادم بطيء؛ حاول مرة أخرى.';
    if (err && err.blocked) {
      if (needsApk()) return 'هذا الخادم لا يسمح بفتح القائمة من داخل المتصفح. ثبّت تطبيق الأندرويد (الرابط في نافذة المساعدة ؟) فهو يفتح هذه القوائم.';
      return 'هذا الخادم لا يسمح بفتح القائمة من داخل المتصفح. على الحاسوب: افتح التطبيق من اختصاره المثبّت (يعمل معه «المساعد المحلي»). أو نزّل ملف القائمة واختر «ملف من الجهاز».';
    }
    return 'تعذّر الوصول إلى الرابط. تأكد من صحته ومن اتصالك بالإنترنت.';
  }

  let addType = 'url';
  function openAddDialog() {
    els.addForm.reset();
    setAddType('url');
    els.addStatus.textContent = '';
    els.addStatus.className = 'add-status';
    els.addOk.disabled = false;
    els.addDlg.showModal();
  }
  function setAddType(t) {
    addType = t;
    setSeg(els.addType, 't', t);
    els.addDlg.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
  }
  function addStatus(msg, isErr = false) {
    els.addStatus.textContent = msg;
    els.addStatus.className = 'add-status' + (isErr ? ' err' : '');
  }

  async function onAddSubmit(e) {
    e.preventDefault();
    let text = '';
    let url = '';
    let name = els.addName.value.trim();
    els.addOk.disabled = true;
    addStatus('جارٍ تحميل القائمة… (قد يستغرق ذلك دقيقة للقوائم الكبيرة)');
    try {
      if (addType === 'file') {
        const f = els.addFile.files[0];
        if (!f) throw Object.assign(new Error(), { msg: 'اختر ملف القائمة أولاً.' });
        text = await f.text();
        name = name || f.name.replace(/\.[^.]+$/, '');
      } else if (addType === 'url') {
        url = els.addUrl.value.trim();
        if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error(), { msg: 'أدخل رابطاً يبدأ بـ http:// أو https://' });
        text = await fetchPlaylist(url);
        name = name || hostOf(url);
      } else {
        if (!els.xtServer.value.trim() || !els.xtUser.value.trim() || !els.xtPass.value.trim()) {
          throw Object.assign(new Error(), { msg: 'أدخل عنوان الخادم واسم المستخدم وكلمة السر.' });
        }
        url = xtreamUrl(els.xtServer.value, els.xtUser.value, els.xtPass.value);
        text = await fetchPlaylist(url);
        name = name || 'Xtream · ' + hostOf(url);
      }
      if (!text.includes('#EXTINF')) {
        throw Object.assign(new Error(), { msg: 'المحتوى ليس قائمة M3U صالحة. تحقق من الرابط أو من بيانات الدخول.' });
      }
      const id = 'pl' + Date.now().toString(36);
      const at = Date.now();
      const count = (text.match(/#EXTINF/g) || []).length;
      await idb.put({ id, text, url, at });
      state.myLists.push({ id, name, type: addType, count, at });
      saveMeta();
      fillSourceSelect();
      els.addDlg.close();
      await setSource(id);
      toast(`أُضيفت «${name}»: ${count} عنصر`);
    } catch (err) {
      console.warn(err);
      addStatus(err.msg || fetchErrorText(err), true);
    } finally {
      els.addOk.disabled = false;
    }
  }

  async function refreshSource() {
    if (isOpenSource()) return loadOpen({ manual: true });
    const id = state.sourceId;
    const rec = await idb.get(id);
    if (!rec) return;
    if (!rec.url) { toast('هذه القائمة من ملف محلي: لتحديثها احذفها ثم استورد الملف الجديد.'); return; }
    els.btnRefresh.classList.add('spin');
    try {
      const text = await fetchPlaylist(rec.url);
      if (!text.includes('#EXTINF')) throw Object.assign(new Error(), { msg: 'المحتوى الجديد ليس قائمة صالحة.' });
      rec.text = text; rec.at = Date.now();
      await idb.put(rec);
      if (state.sourceId === id) applyCustom(rec);
      toast('تم تحديث القائمة');
    } catch (err) {
      toast(err.msg || fetchErrorText(err));
    } finally {
      els.btnRefresh.classList.remove('spin');
    }
  }

  async function deleteSource() {
    const m = metaOf(state.sourceId);
    if (!m) return;
    if (!confirm(`حذف القائمة «${m.name}» من هذا الجهاز؟`)) return;
    try { await idb.del(m.id); } catch { /* ignore */ }
    state.myLists = state.myLists.filter((x) => x.id !== m.id);
    saveMeta();
    fillSourceSelect();
    await setSource('open');
    toast('حُذفت القائمة');
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' }); } catch { return ''; }
  }

  function updateStatus(at) {
    const parts = [];
    if (isOpenSource()) parts.push(state.openLabel);
    else if (at) parts.push('حُمِّلت ' + fmtDate(at));
    if (state.proxy) parts.push('المساعد المحلي ✓');
    els.source.textContent = parts.filter(Boolean).join(' · ');
  }

  // ---------- الفلاتر والعرض ----------
  function fillCountries() {
    const counts = new Map();
    for (const c of state.openChannels) if (c.country) counts.set(c.country, (counts.get(c.country) || 0) + 1);
    const opts = [...counts.entries()]
      .map(([code, n]) => ({ code, n, label: regionName(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    els.country.innerHTML = '<option value="">كل البلدان</option>' +
      opts.map((o) => `<option value="${o.code}">${esc(o.label)} (${o.n})</option>`).join('');
    if (state.country && counts.has(state.country)) els.country.value = state.country;
    else state.country = '';
  }

  function norm(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[ً-ٟ̀-ͯ]/g, ''); }

  function applyFilters() {
    const q = norm(state.query.trim());
    if (isOpenSource()) {
      state.filtered = state.channels.filter((c) => {
        if (state.lang !== 'all' && !c.langs.has(state.lang)) return false;
        if (state.cat === 'fav') { if (!state.favs.has(c.key)) return false; }
        else if (state.cat !== 'all' && !c.cats.has(state.cat)) return false;
        if (state.country && c.country !== state.country) return false;
        if (q && !c.norm.includes(q) && !norm(regionName(c.country || 'ZZ')).includes(q)) return false;
        return true;
      });
    } else {
      state.filtered = state.channels.filter((c) => {
        if (state.kind === 'fav') { if (!state.favs.has(c.key)) return false; }
        else if (state.kind !== 'all' && c.kind !== state.kind) return false;
        if (state.group && c.group !== state.group) return false;
        if (q && !c.norm.includes(q)) return false;
        return true;
      });
    }
  }

  function isFailed(c) {
    const t = state.failed[c.key];
    return t && Date.now() - t < FAIL_TTL_MS;
  }

  function render() {
    applyFilters();
    const frag = document.createDocumentFragment();
    const open = isOpenSource();
    const shown = state.filtered.slice(0, MAX_RENDER);
    for (const c of shown) {
      const li = document.createElement('li');
      li.className = 'ch' + (state.current && state.current.key === c.key ? ' active' : '') + (isFailed(c) ? ' failed' : '');
      li.dataset.key = c.key;
      li.setAttribute('role', 'option');
      const tags = [];
      if (open) {
        if (c.country) tags.push(`<span class="tag">${esc(regionName(c.country))}</span>`);
        for (const k of c.cats) if (k !== 'general') tags.push(`<span class="tag ${k}">${CAT_LABEL[k]}</span>`);
        if (state.lang === 'all') for (const l of c.langs) tags.push(`<span class="tag">${LANG_LABEL[l]}</span>`);
        if (c.sources.every((s) => s.geo)) tags.push('<span class="tag warn">محجوبة جغرافياً · قد تحتاج VPN</span>');
      } else {
        if (c.kind !== 'live') tags.push(`<span class="tag ${c.kind === 'movie' ? 'doc' : 'news'}">${KIND_LABEL[c.kind]}</span>`);
        if (!state.group) tags.push(`<span class="tag" dir="auto">${esc(c.group)}</span>`);
      }
      if (isFailed(c)) tags.push('<span class="tag warn">تعذّر التشغيل مؤخراً</span>');
      const initials = esc(c.name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
      const logo = /^https?:\/\//i.test(c.logo) ? c.logo : '';
      li.innerHTML = `
        <div class="ch-logo">${logo ? `<img loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(logo)}" data-i="${initials}">` : initials}</div>
        <div class="ch-body"><span class="ch-name" dir="auto">${esc(c.name)}</span><div class="ch-meta">${tags.join('')}</div></div>
        <button class="fav-btn${state.favs.has(c.key) ? ' on' : ''}" aria-label="المفضلة" title="المفضلة">${state.favs.has(c.key) ? '★' : '☆'}</button>`;
      frag.appendChild(li);
    }
    if (state.filtered.length > shown.length) {
      const more = document.createElement('li');
      more.className = 'empty';
      more.textContent = `يُعرض ${shown.length} من ${state.filtered.length}. استعمل البحث أو اختر مجموعة لتصل إلى الباقي.`;
      frag.appendChild(more);
    }
    els.list.replaceChildren(frag);
    if (!state.filtered.length) {
      const favMode = state.cat === 'fav' || state.kind === 'fav';
      els.list.innerHTML = `<li class="empty">${favMode ? 'لا توجد عناصر في المفضلة بعد. اضغط ☆ بجانب أي قناة لإضافتها.' : (state.channels.length ? 'لا توجد نتائج مطابقة.' : 'جارٍ التحميل…')}</li>`;
    }
    els.list.querySelectorAll('.ch-logo img').forEach((img) => {
      img.addEventListener('error', () => { img.parentElement.textContent = img.dataset.i; }, { once: true });
    });
    els.count.textContent = `${state.filtered.length} ${isOpenSource() ? 'قناة' : 'عنصر'}`;
  }

  // ---------- التشغيل ----------
  function showOverlay({ icon = '📺', title = '', text = '', actions = [], loading = false } = {}) {
    els.overlay.classList.remove('hide');
    els.ovIcon.innerHTML = loading ? '<div class="loader"></div>' : icon;
    els.ovTitle.textContent = title;
    els.ovText.textContent = text;
    els.ovActions.replaceChildren(...actions);
  }
  const hideOverlay = () => els.overlay.classList.add('hide');

  function mkBtn(label, onClick, primary = false) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary';
    b.addEventListener('click', onClick);
    return b;
  }

  function stopPlayback() {
    clearTimeout(state.startTimer);
    if (state.hls) { try { state.hls.destroy(); } catch { /* ignore */ } state.hls = null; }
    if (state.mpg) {
      const p = state.mpg; state.mpg = null;
      try { p.pause(); p.unload(); p.detachMediaElement(); p.destroy(); } catch { /* ignore */ }
    }
    els.video.removeAttribute('src');
    try { els.video.load(); } catch { /* ignore */ }
  }

  // نوع المشغّل المناسب حسب شكل الرابط
  function guessPlayers(url) {
    const u = url.split('?')[0].toLowerCase();
    if (/\.m3u8$/.test(u) || /\.m3u8/i.test(url)) return ['hls'];
    if (/\.(mp4|m4v|webm|mkv|mov|ogv|avi|wmv|flv|mpg|mpeg)$/.test(u)) return ['native'];
    if (/\.ts$/.test(u) || /\/\d+$/.test(u)) return ['mpegts', 'hls'];
    return ['hls', 'mpegts', 'native'];
  }

  function buildAttempts(ch) {
    const out = [];
    ch.sources.forEach((s, si) => {
      const canDirect = !(isHttpsPage && s.url.startsWith('http:'));
      const needsHeaders = !!(s.ref || s.ua);
      for (const k of guessPlayers(s.url)) {
        if (k === 'native') {
          if (canDirect && !(needsHeaders && state.proxy)) out.push({ si, k, proxy: false });
          if (state.proxy && (needsHeaders || !canDirect)) out.push({ si, k, proxy: true });
          if (state.proxy && canDirect && !needsHeaders) out.push({ si, k, proxy: true });
          continue;
        }
        if (canDirect && !(needsHeaders && state.proxy)) out.push({ si, k, proxy: false });
        if (state.proxy) out.push({ si, k, proxy: true });
      }
    });
    return out;
  }

  function playChannel(ch) {
    state.current = ch;
    state.attempts = buildAttempts(ch);
    state.attemptIdx = 0;
    state.reconnects = 0;
    store.set('tv.last.' + state.sourceId, ch.key);
    updateNowBar();
    highlightActive();
    tryAttempt();
  }

  function tryAttempt() {
    const ch = state.current;
    if (!ch) return;
    stopPlayback();
    const token = ++state.playToken;
    if (state.attemptIdx >= state.attempts.length) return onAllFailed(token);
    const att = state.attempts[state.attemptIdx];
    const src = ch.sources[att.si];
    const n = state.attempts.length;
    showOverlay({ loading: true, title: ch.name, text: n > 1 ? `جارٍ الاتصال… (محاولة ${state.attemptIdx + 1} من ${n})` : 'جارٍ الاتصال…' });

    const v = els.video;
    let started = false;
    const fail = () => {
      if (token !== state.playToken) return;
      clearTimeout(state.startTimer);
      if (started && state.reconnects < 3) {
        // كان البث يعمل ثم انقطع: نعيد الاتصال بنفس الطريقة
        state.reconnects++;
        toast('انقطع البث، جارٍ إعادة الاتصال…');
        setTimeout(() => { if (token === state.playToken) tryAttempt(); }, 1500);
        return;
      }
      state.attemptIdx++;
      tryAttempt();
    };
    state.startTimer = setTimeout(fail, START_TIMEOUT_MS);
    v.addEventListener('playing', () => {
      if (token !== state.playToken) return;
      started = true;
      state.reconnects = 0;
      clearTimeout(state.startTimer);
      hideOverlay();
      if (state.failed[ch.key]) { delete state.failed[ch.key]; store.set('tv.failed', state.failed); highlightActive(); }
    }, { once: true });

    if (att.k === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, backBufferLength: 30, manifestLoadingTimeOut: 15000,
          xhrSetup: att.proxy ? (xhr, url) => { xhr.open('GET', proxify(url, src), true); } : undefined,
        });
        state.hls = hls;
        let mediaRecovered = false;
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (token === state.playToken) startPlay(v); });
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (token !== state.playToken || !d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
          fail();
        });
        hls.loadSource(src.url);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = att.proxy ? proxify(src.url, src) : src.url;
        v.addEventListener('error', fail, { once: true });
        startPlay(v);
      } else fail();
    } else if (att.k === 'mpegts') {
      if (!(window.mpegts && mpegts.isSupported())) { fail(); return; }
      const p = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: att.proxy ? proxify(src.url, src) : src.url },
        { enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: true, autoCleanupSourceBuffer: true },
      );
      state.mpg = p;
      p.on(mpegts.Events.ERROR, () => fail());
      p.attachMediaElement(v);
      p.load();
      startPlay(v);
    } else {
      v.src = att.proxy ? proxify(src.url, src) : src.url;
      v.addEventListener('error', fail, { once: true });
      startPlay(v);
    }
  }

  function startPlay(v) {
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        // منع التشغيل التلقائي بالصوت: نشغّل بدون صوت مع تنبيه
        v.muted = true;
        v.play().then(() => toast('اضغط على أيقونة الصوت في المشغّل لتفعيله')).catch(() => {});
      });
    }
  }

  function onAllFailed(token) {
    if (token !== undefined && token !== state.playToken) return;
    const ch = state.current;
    clearTimeout(state.startTimer);
    stopPlayback();
    state.failed[ch.key] = Date.now();
    store.set('tv.failed', state.failed);
    highlightActive();
    const anyGeo = ch.sources.some((s) => s.geo);
    const httpOnHttps = isHttpsPage && ch.sources.every((s) => s.url.startsWith('http:'));
    let text = 'قد يكون البث متوقفاً حالياً أو محجوباً في بلدك.';
    if (ch.kind === 'movie' || ch.kind === 'series') {
      text = 'قد يكون ترميز هذا الفيلم غير مدعوم داخل المتصفح (مثل صوت AC3 أو فيديو HEVC)، أو أن الرابط منتهٍ. جرّب فتحه في VLC.';
    } else if (httpOnHttps && !state.proxy) {
      text = needsApk()
        ? 'هذا البث لا يُفتح داخل المتصفح. ثبّت تطبيق الأندرويد ليعمل، أو افتحه في VLC.'
        : 'هذا البث لا يُفتح داخل المتصفح من رابط آمن (https). افتحه في مشغّل خارجي، أو استعمل نسخة الحاسوب المثبّتة.';
    } else if (anyGeo) {
      const where = ch.country ? ' في ' + regionName(ch.country) : ' في بلد القناة';
      text = `هذه القناة محجوبة جغرافياً. لتجاوز الحجب: شغّل تطبيق VPN واختر خادماً${where}، ثم اضغط «إعادة المحاولة».`;
    } else if (!isOpenSource() && !state.proxy) {
      text = needsApk()
        ? 'قد يمنع الخادم التشغيل داخل المتصفح. ثبّت تطبيق الأندرويد ليفتح هذه القوائم، أو افتح القناة في VLC.'
        : 'قد يمنع الخادم التشغيل داخل المتصفح. على الحاسوب افتح التطبيق من اختصاره المثبّت ليعمل «المساعد المحلي»، أو افتح القناة في VLC.';
    }
    const actions = [
      mkBtn('إعادة المحاولة', () => { state.attempts = buildAttempts(ch); state.attemptIdx = 0; state.reconnects = 0; tryAttempt(); }, anyGeo),
      mkBtn(isAndroid ? 'فتح في VLC / مشغّل آخر' : 'فتح في VLC', () => openExternal(ch), !anyGeo && !needsApk()),
      anyGeo ? mkBtn('كيف أستعمل VPN؟', openVpnHelp)
        : needsApk() ? mkBtn('تحميل تطبيق الأندرويد', () => { location.href = APK_URL; }, true)
        : mkBtn('التالي', () => step(1)),
    ];
    showOverlay({ icon: '⚠️', title: 'تعذّر تشغيل ' + ch.name, text, actions });
  }

  function openHelp() {
    if (els.help.showModal) { if (!els.help.open) els.help.showModal(); } else els.help.setAttribute('open', '');
  }
  function openVpnHelp() {
    openHelp();
    const sec = document.getElementById('vpnHelp');
    if (sec) sec.scrollIntoView({ block: 'start' });
  }

  // ---------- المشغّل الخارجي ----------
  function openExternal(ch = state.current) {
    if (!ch) return;
    const att = state.attempts[Math.min(state.attemptIdx, state.attempts.length - 1)];
    const src = (att && ch.sources[att.si]) || ch.sources[0];
    if (isAndroid) {
      const m = src.url.match(/^(https?):\/\/(.*)$/i);
      if (m) {
        location.href = `intent://${m[2]}#Intent;scheme=${m[1]};type=${ch.kind === 'live' ? 'application/x-mpegURL' : 'video/*'};S.title=${encodeURIComponent(ch.name)};end`;
        return;
      }
    }
    // الحاسوب: ملف قائمة تشغيل يفتح تلقائياً في VLC إن كان مثبتاً
    const body = ['#EXTM3U'];
    for (const s of ch.sources) {
      body.push(`#EXTINF:-1,${ch.name}${s.quality ? ' (' + s.quality + ')' : ''}`);
      if (s.ref) body.push('#EXTVLCOPT:http-referrer=' + s.ref);
      if (s.ua) body.push('#EXTVLCOPT:http-user-agent=' + s.ua);
      body.push(s.url);
    }
    const blob = new Blob([body.join('\n') + '\n'], { type: 'audio/x-mpegurl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (ch.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'channel') + '.m3u';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('تم تنزيل ملف التشغيل — افتحه بـ VLC');
    try { navigator.clipboard && navigator.clipboard.writeText(src.url); } catch { /* ignore */ }
  }

  // ---------- واجهة ----------
  function updateNowBar() {
    const ch = state.current;
    if (!ch) { els.nowBar.hidden = true; document.title = 'تلفزيون مفتوح'; return; }
    els.nowBar.hidden = false;
    els.nowName.textContent = ch.name;
    const parts = [];
    if (isOpenSource()) {
      if (ch.country) parts.push(regionName(ch.country));
      parts.push([...ch.cats].map((k) => CAT_LABEL[k]).join(' · '));
      parts.push([...ch.langs].map((l) => LANG_LABEL[l]).join(' / '));
    } else {
      parts.push(KIND_LABEL[ch.kind]);
      parts.push(ch.group);
    }
    els.nowMeta.textContent = parts.filter(Boolean).join(' — ');
    const logo = /^https?:\/\//i.test(ch.logo) ? ch.logo : '';
    if (logo) { els.nowLogo.src = logo; els.nowLogo.hidden = false; } else els.nowLogo.hidden = true;
    const fav = state.favs.has(ch.key);
    els.btnFav.textContent = fav ? '★' : '☆';
    els.btnFav.classList.toggle('on', fav);
    document.title = ch.name + ' — تلفزيون مفتوح';
  }

  function highlightActive() {
    const byKey = new Map(state.filtered.map((c) => [c.key, c]));
    els.list.querySelectorAll('.ch').forEach((li) => {
      const c = byKey.get(li.dataset.key);
      li.classList.toggle('active', !!state.current && li.dataset.key === state.current.key);
      if (c) li.classList.toggle('failed', !!isFailed(c));
    });
    const act = els.list.querySelector('.ch.active');
    if (act && window.innerWidth > 900) act.scrollIntoView({ block: 'nearest' });
  }

  function toggleFav(key) {
    if (state.favs.has(key)) state.favs.delete(key); else state.favs.add(key);
    store.set('tv.favs', [...state.favs]);
    if (state.cat === 'fav' || state.kind === 'fav') render();
    else {
      const b = els.list.querySelector(`.ch[data-key="${CSS.escape(key)}"] .fav-btn`);
      if (b) { const on = state.favs.has(key); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; }
    }
    if (state.current && state.current.key === key) updateNowBar();
    toast(state.favs.has(key) ? 'أُضيفت إلى المفضلة' : 'حُذفت من المفضلة');
  }

  function step(dir) {
    const list = state.filtered.length ? state.filtered : state.channels;
    if (!list.length) return;
    let i = state.current ? list.findIndex((c) => c.key === state.current.key) : -1;
    i = (i + dir + list.length) % list.length;
    playChannel(list[i]);
  }

  function restoreLast() {
    const last = store.get('tv.last.' + state.sourceId, null);
    const ch = last && state.channels.find((c) => c.key === last);
    if (ch && !state.current) {
      state.current = ch; updateNowBar(); highlightActive();
      showOverlay({ title: 'آخر ما شاهدته: ' + ch.name, text: 'اضغط للمتابعة أو اختر من القائمة.', actions: [mkBtn('▶ تشغيل', () => playChannel(ch), true)] });
    }
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setSeg(container, attr, value) {
    container.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
  }

  // ---------- الأحداث ----------
  els.list.addEventListener('click', (e) => {
    const li = e.target.closest('.ch');
    if (!li) return;
    if (e.target.closest('.fav-btn')) { toggleFav(li.dataset.key); return; }
    const ch = state.filtered.find((c) => c.key === li.dataset.key);
    if (ch) {
      playChannel(ch);
      if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  els.langSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.lang = b.dataset.lang; store.set('tv.lang', state.lang);
    setSeg(els.langSeg, 'lang', state.lang); render();
  });
  els.catChips.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.cat = b.dataset.cat; store.set('tv.cat', state.cat);
    setSeg(els.catChips, 'cat', state.cat); render();
  });
  els.kindChips.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.kind = b.dataset.kind;
    setSeg(els.kindChips, 'kind', state.kind); render();
  });
  els.country.addEventListener('change', () => { state.country = els.country.value; store.set('tv.country', state.country); render(); });
  els.group.addEventListener('change', () => { state.group = els.group.value; render(); });
  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = els.search.value; render(); }, state.channels.length > 3000 ? 200 : 0);
  });

  els.srcSel.addEventListener('change', () => {
    const v = els.srcSel.value;
    if (v === '__add') { els.srcSel.value = state.sourceId; openAddDialog(); return; }
    setSource(v);
  });
  els.btnAdd.addEventListener('click', openAddDialog);
  els.btnSrcDel.addEventListener('click', deleteSource);
  els.addType.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setAddType(b.dataset.t); });
  els.addForm.addEventListener('submit', onAddSubmit);
  els.addCancel.addEventListener('click', () => els.addDlg.close());

  els.btnFav.addEventListener('click', () => state.current && toggleFav(state.current.key));
  els.btnExternal.addEventListener('click', () => openExternal());
  els.btnPrev.addEventListener('click', () => step(-1));
  els.btnNext.addEventListener('click', () => step(1));
  els.btnRefresh.addEventListener('click', refreshSource);
  els.btnHelp.addEventListener('click', openHelp);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = e.target.matches('input, select, textarea');
    if (e.key === '/' && !typing) { e.preventDefault(); els.search.focus(); return; }
    if (e.key === 'Escape' && typing) { e.target.blur(); return; }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'ب') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (els.video.requestFullscreen) els.video.requestFullscreen().catch(() => {});
    } else if (e.key === 'm' || e.key === 'M' || e.key === 'ة') { els.video.muted = !els.video.muted; toast(els.video.muted ? 'تم كتم الصوت' : 'تم تفعيل الصوت'); }
  });

  // ---------- البدء ----------
  setSeg(els.langSeg, 'lang', state.lang);
  setSeg(els.catChips, 'cat', state.cat);
  fillSourceSelect();
  (async () => {
    await initProxy();
    const openReady = loadOpen();
    await setSource(state.sourceId);
    await openReady;
    if (isOpenSource()) restoreLast();
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
