/* تلفزيون مفتوح — مشغّل قنوات عربية وفرنكوفونية مجانية + قوائم M3U / Xtream خاصة
 * الأقسام: الرئيسية، البث المباشر، الأفلام، المسلسلات
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
  const VIEW_LABEL = { live: 'البث المباشر', movie: 'الأفلام', series: 'المسلسلات' };
  const UNIT = { live: 'قناة', movie: 'فيلم', series: 'مسلسل' };
  const START_TIMEOUT_MS = 20000;
  const FAIL_TTL_MS = 12 * 3600 * 1000;
  const LIMIT = 200;
  const CACHE_KEY = 'tv.playlists.v1';
  const META_KEY = 'tv.mylists.v1';
  const APP_VERSION = '2.0.0';
  const SETTINGS_KEY = 'tv.settings.v1';
  const HIST_KEY = 'tv.history.v1';
  const RESUME_KEY = 'tv.resume.v1';
  const SETTINGS_DEFAULTS = {
    player: 'internal', liveFormat: 'auto', buffer: 'normal', fit: 'contain', autoplayLast: false,
    subs: true, subSize: 'm', pipButton: true, autoPip: false,
    sort: 'default', layout: 'list', clock: true, clock24: true, autoRefresh: 'daily',
    parental: false, pinHash: '', autoAdult: true,
  };
  // التخزين المؤقت: أعلى = تقطّع أقل وتأخّر أكبر عن البث المباشر
  const BUFFER = {
    low: { hls: { maxBufferLength: 10, liveSyncDurationCount: 2, backBufferLength: 10 }, stash: 128 * 1024, chase: true },
    normal: { hls: { maxBufferLength: 30, liveSyncDurationCount: 3, backBufferLength: 30 }, stash: 384 * 1024, chase: true },
    high: { hls: { maxBufferLength: 90, maxMaxBufferLength: 180, liveSyncDurationCount: 5, backBufferLength: 60 }, stash: 1024 * 1024, chase: false },
  };
  // كلمات تدل على محتوى البالغين (للقفل التلقائي في الرقابة الأبوية)
  const ADULT_RE = /\b(xxx|adults?|porn\w*|erotic\w*|18\s?\+|\+\s?18)\b|للكبار|إباحي/i;
  // «اسم المسلسل S01 E02» أو «1x02»
  const EP_RE = /^(.*?)[\s._\-|:]*(?:S(\d{1,2})[\s._-]*E(\d{1,4})|(\d{1,2})x(\d{1,3}))/i;
  const collator = new Intl.Collator(['ar', 'fr', 'en'], { sensitivity: 'base', numeric: true });

  const $ = (s) => document.querySelector(s);
  const els = {
    home: $('#home'), browse: $('#browse'), tabs: $('#tabs'), searchBox: $('#searchBox'), search: $('#search'),
    srcSel: $('#srcSel'), btnAdd: $('#btnAdd'), btnSrcDel: $('#btnSrcDel'), homeStatus: $('#homeStatus'),
    homeRows: $('#homeRows'), cntLive: $('#cntLive'), cntMovie: $('#cntMovie'), cntSeries: $('#cntSeries'),
    cats: $('#cats'), viewTitle: $('#viewTitle'), langSeg: $('#langSeg'), count: $('#count'), lockInfo: $('#lockInfo'),
    content: document.querySelector('.content'), list: $('#list'), posters: $('#posters'), episodes: $('#episodes'), more: $('#more'),
    stage: $('#stage'), stageTitle: $('#stageTitle'), btnClose: $('#btnClose'), btnNextEp: $('#btnNextEp'),
    video: $('#video'), overlay: $('#overlay'), ovIcon: $('#ovIcon'), ovTitle: $('#ovTitle'),
    ovText: $('#ovText'), ovActions: $('#ovActions'),
    nowBar: $('#nowBar'), nowLogo: $('#nowLogo'), nowName: $('#nowName'), nowMeta: $('#nowMeta'),
    btnFav: $('#btnFav'), btnExternal: $('#btnExternal'), btnPrev: $('#btnPrev'), btnNext: $('#btnNext'),
    btnPip: $('#btnPip'), btnFull: $('#btnFull'),
    btnRefresh: $('#btnRefresh'), btnSettings: $('#btnSettings'), btnHelp: $('#btnHelp'), help: $('#help'),
    toast: $('#toast'), clock: $('#clock'), goHome: $('#goHome'),
    addDlg: $('#addDlg'), addForm: $('#addForm'), addType: $('#addType'), addName: $('#addName'),
    addUrl: $('#addUrl'), addFile: $('#addFile'), xtServer: $('#xtServer'), xtUser: $('#xtUser'),
    xtPass: $('#xtPass'), addStatus: $('#addStatus'), addOk: $('#addOk'), addCancel: $('#addCancel'),
    settings: $('#settings'), setBody: $('#setBody'), setTitle: $('#setTitle'), setBack: $('#setBack'), setClose: $('#setClose'),
    pinDlg: $('#pinDlg'), pinForm: $('#pinForm'), pinTitle: $('#pinTitle'), pinInput: $('#pinInput'), pinCancel: $('#pinCancel'),
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
  // الإعدادات (تُحفظ على هذا الجهاز)
  const S = Object.assign({}, SETTINGS_DEFAULTS, store.get(SETTINGS_KEY, {}));
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
    byKind: { live: [], movie: [], series: [] },
    seriesCount: 0,
    view: 'home',
    catSel: { live: 'all', movie: 'all', series: 'all' },
    lang: store.get('tv.lang', 'all'),
    query: '',
    limit: LIMIT,
    filtered: [],
    seriesSel: null,     // المسلسل المفتوح (عرض الحلقات)
    season: null,
    epList: [],          // حلقات المسلسل الجاري (للحلقة التالية)
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
    unlocked: false,     // الرقابة الأبوية: فُتح المحتوى المقفل حتى إغلاق التطبيق
    lockedCount: 0,
    resumeAt: 0,         // موضع متابعة الفيلم
    lastSave: 0,
    parentalOk: false,
  };
  const isOpenSource = () => state.sourceId === 'open';

  // ---------- أدوات صغيرة ----------
  const svgIcon = (name) => `<svg><use href="#i-${name}"/></svg>`;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function norm(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[ً-ٟ̀-ͯ]/g, ''); }
  const initials = (name) => name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const safeImg = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' }); } catch { return ''; }
  }
  function setSeg(container, attr, value) {
    container.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
  }

  // ---------- المجموعات المخفية والمقفلة، السجل ومتابعة المشاهدة ----------
  // في القنوات المفتوحة «المجموعة» هي البلد؛ في القوائم الخاصة هي group-title
  const groupOf = (c) => (isOpenSource() ? (c.country || '??') : c.group);
  const groupLabel = (g) => (isOpenSource() ? (g === '??' ? 'غير محدد' : regionName(g)) : g);
  const hiddenSet = (id = state.sourceId) => new Set(store.get('tv.hidden.' + id, []));
  const lockedSet = (id = state.sourceId) => new Set(store.get('tv.locked.' + id, []));
  function isLocked(c, locked) {
    if (!S.parental || !S.pinHash || state.unlocked) return false;
    if (locked.has(groupOf(c))) return true;
    return S.autoAdult && ADULT_RE.test((c.group || '') + ' ' + c.name);
  }
  function addHistory(ch) {
    const all = store.get(HIST_KEY, {});
    const list = (all[state.sourceId] || []).filter((x) => x.key !== ch.key);
    list.unshift({ key: ch.key, kind: ch.kind || 'live', at: Date.now() });
    all[state.sourceId] = list.slice(0, 60);
    store.set(HIST_KEY, all);
  }
  const historyKeys = () => (store.get(HIST_KEY, {})[state.sourceId] || []).map((x) => x.key);
  const getResume = (key) => store.get(RESUME_KEY, {})[key];
  function saveResume(key, t, d) {
    const r = store.get(RESUME_KEY, {});
    if (t < 30 || d - t < 60) delete r[key];
    else r[key] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    const keys = Object.keys(r);
    if (keys.length > 300) keys.sort((a, b) => r[a].at - r[b].at).slice(0, keys.length - 300).forEach((k) => delete r[k]);
    store.set(RESUME_KEY, r);
  }

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
    // حلقات Xtream ملفات mp4/mkv تحت /series/: نفحص المسار قبل الامتداد
    if (u.includes('/series/')) return 'series';
    if (u.includes('/movie/') || /\.(mp4|mkv|avi|m4v|mov|webm|wmv|flv)$/.test(u)) return 'movie';
    return 'live';
  }

  function epInfo(name) {
    const m = name.match(EP_RE);
    if (!m || !m[1].trim()) return { title: name.trim(), s: 0, e: 0 };
    return { title: m[1].trim().replace(/[\s\-|:._]+$/, ''), s: +(m[2] || m[4] || 0), e: +(m[3] || m[5] || 0) };
  }

  function buildCustom(text, listId) {
    const list = [];
    const seen = new Set();
    let idx = 0;
    for (const e of parseM3U(text)) {
      const key = listId + '|' + e.url;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = (e.title || e.attrs['tvg-name'] || e.url).trim();
      const kind = kindOf(e.url);
      const group = (e.attrs['group-title'] || '').trim() || 'بدون مجموعة';
      const item = {
        key, name, norm: norm(name), logo: e.attrs['tvg-logo'] || '', group, kind, idx: idx++,
        country: '', cats: new Set(), langs: new Set(), sources: [sourceFrom(e)],
      };
      if (kind === 'series') {
        const ei = epInfo(name);
        item.sTitle = ei.title || name;
        item.season = ei.s;
        item.ep = ei.e;
        item.skey = listId + '|s|' + group + '|' + item.sTitle.toLowerCase();
      }
      list.push(item);
    }
    return list;
  }

  // تجميع الحلقات في مسلسلات
  function groupSeries(items) {
    const map = new Map();
    for (const c of items) {
      let s = map.get(c.skey);
      if (!s) {
        s = { skey: c.skey, title: c.sTitle, group: c.group, poster: '', eps: [], norm: norm(c.sTitle), idx: c.idx };
        map.set(c.skey, s);
      }
      if (!s.poster && safeImg(c.logo)) s.poster = c.logo;
      s.eps.push(c);
    }
    const list = [...map.values()];
    for (const s of list) s.eps.sort((a, b) => (a.season - b.season) || (a.ep - b.ep) || (a.idx - b.idx));
    return list;
  }

  // ---------- الشبكة ----------
  async function fetchText(url, ms = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) {
        const err = new Error('HTTP ' + r.status);
        err.status = r.status;
        // خطأ صادر عن المساعد نفسه (لم يصل ردّ من الخادم) أم ردّ حقيقي من الخادم؟
        err.helper = r.headers.get('X-OpenTV-Error') === '1';
        try { err.detail = (await r.text()).slice(0, 300); } catch { err.detail = ''; }
        throw err;
      }
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
    splitKinds();
    updateStatus();
    render();
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

  function splitKinds() {
    const k = { live: [], movie: [], series: [] };
    for (const c of state.channels) (k[c.kind] || k.live).push(c);
    state.byKind = k;
    state.seriesCount = k.series.length ? groupSeries(k.series).length : 0;
  }

  async function setSource(id) {
    if (id !== 'open' && !metaOf(id)) id = 'open';
    if (state.current) { savePosition(true); stopPlayback(); state.current = null; }
    closeFullPlayer(false);
    state.sourceId = id;
    store.set('tv.source', id);
    els.srcSel.value = id;
    state.catSel = { live: 'all', movie: 'all', series: 'all' };
    state.seriesSel = null;
    state.limit = LIMIT;
    els.btnSrcDel.hidden = id === 'open';
    if (id === 'open') {
      state.channels = state.openChannels;
      splitKinds();
      updateStatus();
      setView(viewAvailable(state.view) ? state.view : 'home', { force: true });
      return;
    }
    state.channels = [];
    splitKinds();
    render();
    try {
      const rec = await idb.get(id);
      if (!rec) throw new Error('missing');
      applyCustom(rec);
      setView(viewAvailable(state.view) ? state.view : 'home', { force: true });
      // تحديث تلقائي حسب الإعداد (في الخلفية)
      const stale = S.autoRefresh === 'open' || (S.autoRefresh === 'daily' && Date.now() - (rec.at || 0) > 24 * 3600 * 1000);
      if (rec.url && stale) refreshSource({ id, silent: true });
    } catch (err) {
      console.warn(err);
      toast('تعذّر فتح هذه القائمة. احذفها وأضفها من جديد.');
    }
  }

  function applyCustom(rec) {
    state.channels = buildCustom(rec.text, rec.id);
    splitKinds();
    const m = metaOf(rec.id);
    if (m && m.count !== state.channels.length) { m.count = state.channels.length; saveMeta(); fillSourceSelect(); }
    updateStatus(rec.at);
    render();
  }

  function xtreamUrl(server, user, pass) {
    let s = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    s = s.replace(/\/(get|player_api)\.php.*$/i, '');
    const output = S.liveFormat === 'ts' ? 'ts' : 'm3u8';
    return `${s}/get.php?username=${encodeURIComponent(user.trim())}&password=${encodeURIComponent(pass.trim())}&type=m3u_plus&output=${output}`;
  }
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return 'قائمتي'; } };

  // أسباب فشل المساعد في الوصول إلى الخادم (رموز ويندوز وأندرويد)
  const HELPER_REASONS = [
    [/NameResolution|UnknownHost/i, 'تعذّر العثور على عنوان الخادم: قد يكون الرابط غير صحيح، أو أن مزوّد الإنترنت يحجب هذا الخادم (جرّب تغيير DNS أو استعمال VPN).'],
    [/Timeout|timed out/i, 'لم يردّ الخادم في الوقت المحدد. القوائم الكبيرة تحتاج وقتاً، أو أن الخادم مشغول؛ حاول مرة أخرى بعد قليل.'],
    [/ConnectFailure|ConnectException|refused/i, 'الخادم لا يقبل الاتصال من هذا الجهاز: قد يكون متوقفاً، أو محجوباً في شبكتك.'],
    [/SecureChannel|TrustFailure|SSL/i, 'تعذّر إنشاء اتصال آمن (https) مع الخادم.'],
    [/ConnectionClosed|ReceiveFailure|KeepAlive|reset|closed/i, 'قطع الخادم الاتصال قبل الإرسال. بعض الخوادم لا تقبل إلا تطبيقات معيّنة، أو تسمح بجهاز واحد في نفس الوقت.'],
    [/ProtocolViolation/i, 'ردّ الخادم بصيغة غير قياسية.'],
  ];

  function fetchErrorText(err) {
    if (err && err.helper) {
      const d = err.detail || '';
      const hit = HELPER_REASONS.find(([re]) => re.test(d));
      return 'تعذّر على المساعد الوصول إلى خادم القائمة. ' + (hit ? hit[1] : `(التفاصيل: ${d.split('|').pop()})`);
    }
    if (err && err.status && !state.proxy) {
      // كثير من خوادم IPTV ترفض الطلبات القادمة من المتصفح وتقبل تطبيقات المشغّلات فقط
      return `رفض الخادم الطلب (الرمز ${err.status}). كثير من خوادم IPTV لا تقبل الطلبات من المتصفح. ` +
        (isAndroid ? 'ثبّت تطبيق الأندرويد (الرابط في نافذة المساعدة) وأضف القائمة منه.'
          : 'على الحاسوب: افتح «تلفزيون مفتوح» من اختصاره على سطح المكتب (يعمل معه «المساعد المحلي») وأضف القائمة منه.');
    }
    if (err && err.status) return `ردّ الخادم بالخطأ ${err.status}. تحقق من الرابط ومن أن اشتراكك فعّال (بعض الاشتراكات تسمح بجهاز واحد فقط في نفس الوقت).`;
    if (err && err.name === 'AbortError') return 'انتهت مهلة التحميل. القائمة كبيرة جداً أو الخادم بطيء؛ حاول مرة أخرى.';
    if (err && err.blocked) {
      if (needsApk()) return 'هذا الخادم لا يسمح بفتح القائمة من داخل المتصفح. ثبّت تطبيق الأندرويد (الرابط في نافذة المساعدة) فهو يفتح هذه القوائم.';
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
      setView('home', { force: true });
      toast(`أُضيفت «${name}»: ${count} عنصر`);
    } catch (err) {
      console.warn(err);
      addStatus(err.msg || fetchErrorText(err), true);
    } finally {
      els.addOk.disabled = false;
    }
  }

  async function refreshSource({ id = state.sourceId, silent = false } = {}) {
    if (id === 'open') { await loadOpen({ manual: !silent }); return true; }
    const rec = await idb.get(id);
    if (!rec) return false;
    if (!rec.url) {
      if (!silent) toast('هذه القائمة من ملف محلي: لتحديثها احذفها ثم استورد الملف الجديد.');
      return false;
    }
    els.btnRefresh.classList.add('spin');
    try {
      const text = await fetchPlaylist(rec.url);
      if (!text.includes('#EXTINF')) throw Object.assign(new Error(), { msg: 'المحتوى الجديد ليس قائمة صالحة.' });
      rec.text = text; rec.at = Date.now();
      await idb.put(rec);
      const m = metaOf(id);
      if (m) { m.count = (text.match(/#EXTINF/g) || []).length; m.at = rec.at; saveMeta(); fillSourceSelect(); }
      if (state.sourceId === id) applyCustom(rec);
      if (!silent) toast('تم تحديث القائمة');
      return true;
    } catch (err) {
      if (!silent) toast(err.msg || fetchErrorText(err));
      return false;
    } finally {
      els.btnRefresh.classList.remove('spin');
    }
  }

  async function deleteSource(id = state.sourceId) {
    const m = metaOf(id);
    if (!m) return false;
    if (!confirm(`حذف القائمة «${m.name}» من هذا الجهاز؟`)) return false;
    try { await idb.del(m.id); } catch { /* ignore */ }
    state.myLists = state.myLists.filter((x) => x.id !== m.id);
    saveMeta();
    for (const k of ['tv.hidden.', 'tv.locked.', 'tv.last.']) { try { localStorage.removeItem(k + m.id); } catch { /* ignore */ } }
    fillSourceSelect();
    if (state.sourceId === m.id) await setSource('open');
    toast('حُذفت القائمة');
    return true;
  }

  function updateStatus(at) {
    const parts = [];
    if (isOpenSource()) parts.push(state.openLabel);
    else if (at) parts.push('حُمِّلت ' + fmtDate(at));
    if (state.proxy) parts.push('المساعد المحلي ✓');
    els.homeStatus.textContent = parts.filter(Boolean).join(' · ');
  }

  // =====================================================================
  // ---------- التنقّل بين الأقسام ----------
  // =====================================================================
  const viewAvailable = (v) => v === 'home' || (state.byKind[v] || []).length > 0;

  function updateTabs() {
    els.tabs.querySelectorAll('button').forEach((b) => {
      const v = b.dataset.view;
      b.classList.toggle('on', v === state.view);
      b.hidden = !(v === 'home' || v === 'live' || viewAvailable(v));
    });
  }

  function setView(view, { pop = false, force = false } = {}) {
    if (!viewAvailable(view) && !(view === 'live' && isOpenSource())) {
      toast(isOpenSource() ? 'الأفلام والمسلسلات تظهر عند إضافة قائمة فيها (زر ＋ في الرئيسية).' : 'هذا القسم غير متوفر في القائمة الحالية.');
      return;
    }
    const prev = state.view;
    if (prev !== view || force) {
      if (state.current) { savePosition(true); stopPlayback(); state.current = null; }
      closeFullPlayer(false);
      state.seriesSel = null;
      state.limit = LIMIT;
      if (prev !== view) { state.query = ''; els.search.value = ''; }
    }
    if (!pop && prev === 'home' && view !== 'home') history.pushState({ tag: 'view' }, '');
    state.view = view;
    document.body.dataset.view = view;
    els.home.hidden = view !== 'home';
    els.browse.hidden = view === 'home';
    els.searchBox.hidden = view === 'home';
    els.search.placeholder = view === 'home' ? 'ابحث…' : `ابحث في ${VIEW_LABEL[view]}…`;
    updateNowBar();
    if (view === 'live') showOverlay({ icon: svgIcon('tv'), title: 'اختر قناة من القائمة', text: isOpenSource() ? 'روابط البث المفتوح تُحدَّث تلقائياً.' : '' });
    render();
    if (els.content) els.content.scrollTop = 0;
    if (window.innerWidth <= 900) window.scrollTo({ top: 0 });
    if (view === 'live' && (prev !== 'live' || force)) restoreLast();
  }

  function goHome() {
    if (history.state && history.state.tag && history.state.tag !== 'root') history.back();
    else setView('home');
  }

  // =====================================================================
  // ---------- العرض ----------
  // =====================================================================
  function render() {
    updateTabs();
    if (state.view === 'home') { renderHome(); return; }
    const view = state.view;
    const base = baseItems(view);
    const seriesAll = view === 'series' ? groupSeries(base) : null;
    const defs = catDefs(view, base, seriesAll);
    let cat = state.catSel[view];
    if (!defs.some((d) => d.id === cat)) cat = state.catSel[view] = 'all';
    renderCats(defs, cat);
    const ctx = { hist: historyKeys(), resume: store.get(RESUME_KEY, {}) };
    ctx.histSet = new Set(ctx.hist);
    const q = norm(state.query.trim());
    const catDef = defs.find((d) => d.id === cat);
    els.viewTitle.textContent = VIEW_LABEL[view] + (cat !== 'all' && catDef ? ' · ' + catDef.label : '');
    els.langSeg.hidden = !isOpenSource();
    setSeg(els.langSeg, 'lang', state.lang);

    els.list.hidden = view !== 'live';
    els.posters.hidden = view === 'live' || (view === 'series' && !!state.seriesSel);
    els.episodes.hidden = !(view === 'series' && state.seriesSel);

    if (view === 'series') {
      if (state.seriesSel) {
        renderEpisodes(seriesAll, ctx);
        els.count.textContent = '';
        els.more.hidden = true;
      } else {
        let list = seriesAll.filter((s) => seriesInCat(s, cat, ctx) && (!q || s.norm.includes(q)));
        list = sortList(list, cat, ctx, (s) => s.title, (s) => s.eps);
        renderSeriesGrid(list, ctx);
        els.count.textContent = `${list.length} ${UNIT.series}`;
      }
    } else {
      let list = base.filter((c) => inCat(c, cat, ctx) &&
        (!q || c.norm.includes(q) || (isOpenSource() && norm(regionName(c.country || 'ZZ')).includes(q))));
      list = sortList(list, cat, ctx, (c) => c.name, (c) => [c]);
      state.filtered = list;
      if (view === 'live') renderLiveList(list, cat);
      else renderMovieGrid(list, ctx);
      els.count.textContent = `${list.length} ${UNIT[view]}`;
    }
    els.lockInfo.hidden = !state.lockedCount;
    els.lockInfo.textContent = state.lockedCount ? `🔒 ${state.lockedCount} مقفل — فتح` : '';
  }

  // عناصر القسم بعد حذف المخفي والمقفل وتطبيق اللغة
  function baseItems(view) {
    const hidden = hiddenSet();
    const locked = lockedSet();
    let n = 0;
    const src = state.byKind[view] || [];
    const out = src.filter((c) => {
      if (hidden.has(groupOf(c))) return false;
      if (isLocked(c, locked)) { n++; return false; }
      if (isOpenSource() && state.lang !== 'all' && !c.langs.has(state.lang)) return false;
      return true;
    });
    state.lockedCount = n;
    return out;
  }

  function catDefs(view, base, seriesAll) {
    const open = isOpenSource();
    const items = view === 'series' ? seriesAll : base;
    const resume = store.get(RESUME_KEY, {});
    const out = [];
    if (view === 'live') {
      const hist = new Set(historyKeys());
      out.push({ id: 'recent', label: 'شوهد مؤخراً', icon: 'clock', n: base.filter((c) => hist.has(c.key)).length });
    } else {
      const n = view === 'series'
        ? seriesAll.filter((s) => s.eps.some((e) => resume[e.key])).length
        : base.filter((c) => resume[c.key]).length;
      out.push({ id: 'resume', label: 'متابعة المشاهدة', icon: 'play', n });
    }
    out.push({ id: 'all', label: 'الكل', icon: 'grid', n: items.length });
    out.push({ id: 'fav', label: 'المفضلة', icon: 'star', n: items.filter((x) => state.favs.has(x.skey || x.key)).length });
    if (open) {
      out.push({ sep: 'الأصناف' });
      for (const [k, label] of [['news', 'إخبارية'], ['doc', 'وثائقية وثقافية'], ['general', 'عامة']]) {
        out.push({ id: 'cat:' + k, label, n: base.filter((c) => c.cats.has(k)).length });
      }
      out.push({ sep: 'البلدان' });
      const counts = new Map();
      for (const c of base) counts.set(c.country || '??', (counts.get(c.country || '??') || 0) + 1);
      [...counts].map(([g, n]) => ({ id: 'g:' + g, label: groupLabel(g), n }))
        .sort((a, b) => collator.compare(a.label, b.label)).forEach((d) => out.push(d));
    } else {
      const counts = new Map();
      for (const x of items) counts.set(x.group, (counts.get(x.group) || 0) + 1);
      if (counts.size) out.push({ sep: 'المجموعات' });
      for (const [g, n] of counts) out.push({ id: 'g:' + g, label: g, n });
    }
    return out;
  }

  function inCat(c, cat, ctx) {
    if (cat === 'all') return true;
    if (cat === 'fav') return state.favs.has(c.key);
    if (cat === 'recent') return ctx.histSet.has(c.key);
    if (cat === 'resume') return !!ctx.resume[c.key];
    if (cat.startsWith('cat:')) return c.cats.has(cat.slice(4));
    if (cat.startsWith('g:')) return groupOf(c) === cat.slice(2);
    return true;
  }
  function seriesInCat(s, cat, ctx) {
    if (cat === 'all') return true;
    if (cat === 'fav') return state.favs.has(s.skey);
    if (cat === 'resume') return s.eps.some((e) => ctx.resume[e.key]);
    if (cat.startsWith('g:')) return s.group === cat.slice(2);
    return true;
  }
  function sortList(list, cat, ctx, nameOf, epsOf) {
    if (cat === 'recent') {
      const pos = new Map(ctx.hist.map((k, i) => [k, i]));
      return list.sort((a, b) => pos.get(a.key) - pos.get(b.key));
    }
    if (cat === 'resume') {
      const last = (x) => Math.max(0, ...epsOf(x).map((e) => (ctx.resume[e.key] || {}).at || 0));
      return list.sort((a, b) => last(b) - last(a));
    }
    if (S.sort === 'az' || S.sort === 'za') {
      const dir = S.sort === 'za' ? -1 : 1;
      return list.sort((a, b) => dir * collator.compare(nameOf(a), nameOf(b)));
    }
    return list;
  }

  function renderCats(defs, cat) {
    els.cats.innerHTML = defs.map((d) => (d.sep
      ? `<li class="sep">${esc(d.sep)}</li>`
      : `<li><button type="button" class="cat${d.id === cat ? ' on' : ''}" data-cat="${esc(d.id)}">${d.icon ? svgIcon(d.icon) : ''}<span class="cname" dir="auto">${esc(d.label)}</span><span class="ccount">${d.n}</span></button></li>`)).join('');
  }

  function emptyMsg(cat) {
    return {
      fav: 'لا توجد عناصر في المفضلة بعد. اضغط ★ لإضافتها.',
      recent: 'لم تشاهد شيئاً من هذه القائمة بعد.',
      resume: 'لا توجد أفلام أو حلقات بدأت مشاهدتها.',
    }[cat] || (state.channels.length ? 'لا توجد نتائج مطابقة.' : 'جارٍ التحميل…');
  }

  const isFailed = (c) => { const t = state.failed[c.key]; return t && Date.now() - t < FAIL_TTL_MS; };
  function logoHtml(c) {
    const ini = esc(initials(c.name) || '•');
    const logo = safeImg(c.logo);
    return logo ? `<img loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(logo)}" data-i="${ini}">` : ini;
  }

  function renderLiveList(list, cat) {
    const open = isOpenSource();
    const shown = list.slice(0, state.limit);
    const cur = state.current && state.current.key;
    els.list.classList.toggle('grid', S.layout === 'grid');
    els.list.innerHTML = shown.length ? shown.map((c, i) => {
      const tags = [];
      if (open) {
        if (c.country) tags.push(`<span class="tag">${esc(regionName(c.country))}</span>`);
        for (const k of c.cats) if (k !== 'general') tags.push(`<span class="tag ${k}">${CAT_LABEL[k]}</span>`);
        if (state.lang === 'all') for (const l of c.langs) tags.push(`<span class="tag">${LANG_LABEL[l]}</span>`);
        if (c.sources.every((s) => s.geo)) tags.push('<span class="tag warn">محجوبة جغرافياً · قد تحتاج VPN</span>');
      } else if (!cat.startsWith('g:')) {
        tags.push(`<span class="tag" dir="auto">${esc(c.group)}</span>`);
      }
      if (isFailed(c)) tags.push('<span class="tag warn">تعذّر التشغيل مؤخراً</span>');
      const fav = state.favs.has(c.key);
      return `<li class="row${c.key === cur ? ' active' : ''}${isFailed(c) ? ' failed' : ''}" data-key="${esc(c.key)}">` +
        `<span class="num">${i + 1}</span><span class="logo">${logoHtml(c)}</span>` +
        `<span class="rbody"><span class="name" dir="auto">${esc(c.name)}</span>${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</span>` +
        `<button class="fav${fav ? ' on' : ''}" type="button" aria-label="المفضلة">${svgIcon('star')}</button></li>`;
    }).join('') : `<li class="empty">${emptyMsg(cat)}</li>`;
    els.more.hidden = list.length <= shown.length;
  }

  function posterHtml({ key, attr = 'data-key', title, img, pct = 0, badge = '', fav = false, active = false }) {
    const src = safeImg(img);
    return `<div class="poster${active ? ' active' : ''}" ${attr}="${esc(key)}" tabindex="0" role="button" aria-label="${esc(title)}">` +
      `<div class="pimg"><span class="pinit" dir="auto">${esc(title.slice(0, 48))}</span>` +
      (src ? `<img loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(src)}">` : '') +
      (badge ? `<span class="pbadge">${esc(badge)}</span>` : '') +
      (pct ? `<span class="pbar"><i style="width:${pct}%"></i></span>` : '') +
      `</div><div class="ptitle" dir="auto">${esc(title)}</div>` +
      `<button class="pfav${fav ? ' on' : ''}" type="button" aria-label="المفضلة">${svgIcon('star')}</button></div>`;
  }
  const pctOf = (r) => (r && r.d ? Math.max(2, Math.min(100, Math.round((100 * r.t) / r.d))) : 0);

  function renderMovieGrid(list, ctx) {
    const shown = list.slice(0, state.limit);
    const cur = state.current && state.current.key;
    els.posters.innerHTML = shown.length
      ? shown.map((c) => posterHtml({ key: c.key, title: c.name, img: c.logo, pct: pctOf(ctx.resume[c.key]), fav: state.favs.has(c.key), active: c.key === cur })).join('')
      : `<div class="empty">${emptyMsg(state.catSel.movie)}</div>`;
    els.more.hidden = list.length <= shown.length;
  }

  function renderSeriesGrid(list, ctx) {
    const shown = list.slice(0, state.limit);
    els.posters.innerHTML = shown.length
      ? shown.map((s) => {
        const last = s.eps.map((e) => ctx.resume[e.key]).filter(Boolean).sort((a, b) => b.at - a.at)[0];
        return posterHtml({ key: s.skey, attr: 'data-skey', title: s.title, img: s.poster, pct: pctOf(last), badge: `${s.eps.length} حلقة`, fav: state.favs.has(s.skey) });
      }).join('')
      : `<div class="empty">${emptyMsg(state.catSel.series)}</div>`;
    els.more.hidden = list.length <= shown.length;
  }

  function renderEpisodes(seriesAll, ctx) {
    const s = seriesAll.find((x) => x.skey === state.seriesSel);
    if (!s) { state.seriesSel = null; render(); return; }
    const seasons = [...new Set(s.eps.map((e) => e.season))];
    if (!seasons.includes(state.season)) {
      // افتح على موسم آخر حلقة شوهدت، أو الموسم الأول
      const last = s.eps.filter((e) => ctx.resume[e.key]).sort((a, b) => ctx.resume[b.key].at - ctx.resume[a.key].at)[0];
      state.season = last ? last.season : seasons[0];
    }
    const eps = s.eps.filter((e) => e.season === state.season);
    const fav = state.favs.has(s.skey);
    const cont = s.eps.filter((e) => ctx.resume[e.key]).sort((a, b) => ctx.resume[b.key].at - ctx.resume[a.key].at)[0];
    const cur = state.current && state.current.key;
    const src = safeImg(s.poster);
    els.viewTitle.textContent = VIEW_LABEL.series + ' · ' + s.title;
    els.episodes.innerHTML =
      `<button type="button" class="set-btn ep-back" data-act="back">${svgIcon('back')} كل المسلسلات</button>` +
      `<div class="ep-hero"><div class="pimg"><span class="pinit" dir="auto">${esc(s.title.slice(0, 40))}</span>${src ? `<img referrerpolicy="no-referrer" alt="" src="${esc(src)}">` : ''}</div>` +
      `<div><h3 dir="auto">${esc(s.title)}</h3><p dir="auto">${esc(s.group)} · ${s.eps.length} حلقة${seasons.length > 1 ? ' · ' + seasons.length + ' مواسم' : ''}</p>` +
      `<div class="set-actions">` +
      (cont ? `<button type="button" class="set-btn primary" data-act="cont" data-key="${esc(cont.key)}">${svgIcon('play')} متابعة: ${esc(cont.ep ? `الموسم ${cont.season} · الحلقة ${cont.ep}` : cont.name)}</button>` : '') +
      `<button type="button" class="set-btn" data-act="sfav">${svgIcon('star')} ${fav ? 'في المفضلة ✓' : 'أضف إلى المفضلة'}</button></div></div></div>` +
      (seasons.length > 1 ? `<div class="seasons">${seasons.map((n) => `<button type="button" class="chip${n === state.season ? ' on' : ''}" data-season="${n}">${n ? 'الموسم ' + n : 'حلقات'}</button>`).join('')}</div>` : '') +
      `<ol class="eps">${eps.map((e) => {
        const pct = pctOf(ctx.resume[e.key]);
        return `<li class="ep${e.key === cur ? ' active' : ''}" data-key="${esc(e.key)}">${svgIcon('play')}<span class="epn">${e.ep ? 'الحلقة ' + e.ep : ''}</span><span class="ept" dir="auto">${esc(e.name)}</span>${pct ? `<span class="pbar"><i style="width:${pct}%"></i></span>` : ''}</li>`;
      }).join('')}</ol>`;
    state.epList = s.eps;
  }

  function renderHome() {
    const open = isOpenSource();
    const n = { live: state.byKind.live.length, movie: state.byKind.movie.length, series: state.seriesCount };
    els.cntLive.textContent = n.live ? `${n.live} ${UNIT.live}` : (open ? 'جارٍ التحميل…' : 'غير متوفر في هذه القائمة');
    els.cntMovie.textContent = n.movie ? `${n.movie} ${UNIT.movie}` : (open ? 'أضف قائمة فيها أفلام' : 'غير متوفر في هذه القائمة');
    els.cntSeries.textContent = n.series ? `${n.series} ${UNIT.series}` : (open ? 'أضف قائمة فيها مسلسلات' : 'غير متوفر في هذه القائمة');
    document.querySelectorAll('.htile[data-go]').forEach((t) => t.classList.toggle('disabled', !viewAvailable(t.dataset.go) && !(t.dataset.go === 'live' && open)));

    // صفّا «متابعة المشاهدة» و«شوهد مؤخراً»
    const resume = store.get(RESUME_KEY, {});
    const byKey = new Map(state.channels.map((c) => [c.key, c]));
    const cont = Object.keys(resume).filter((k) => byKey.has(k)).sort((a, b) => resume[b].at - resume[a].at).slice(0, 14).map((k) => byKey.get(k));
    const hist = historyKeys().map((k) => byKey.get(k)).filter((c) => c && c.kind === 'live').slice(0, 14);
    let html = '';
    if (cont.length) {
      html += `<div class="home-row"><h3>${svgIcon('play')} متابعة المشاهدة</h3><div class="strip">${cont.map((c) => posterHtml({
        key: c.key, title: c.kind === 'series' ? `${c.sTitle}${c.ep ? ' · ح ' + c.ep : ''}` : c.name, img: c.logo, pct: pctOf(resume[c.key]),
      })).join('')}</div></div>`;
    }
    if (hist.length) {
      html += `<div class="home-row"><h3>${svgIcon('clock')} شوهد مؤخراً</h3><div class="strip">${hist.map((c) =>
        `<div class="row chan" data-key="${esc(c.key)}" role="button" tabindex="0" style="grid-template-columns:1fr;justify-items:center;text-align:center"><span class="logo" style="width:100%;height:60px">${logoHtml(c)}</span><span class="name" dir="auto" style="text-align:center;font-size:13px">${esc(c.name)}</span></div>`).join('')}</div></div>`;
    }
    els.homeRows.innerHTML = html;
  }

  // =====================================================================
  // ---------- التشغيل ----------
  // =====================================================================
  function showOverlay({ icon = '', title = '', text = '', actions = [], loading = false } = {}) {
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
    if (/\.ts$/.test(u)) return ['mpegts', 'hls'];
    if (/\/\d+$/.test(u)) return S.liveFormat === 'hls' ? ['hls', 'mpegts'] : ['mpegts', 'hls'];
    return ['hls', 'mpegts', 'native'];
  }

  // روابط Xtream للبث المباشر متاحة عادةً بصيغتين (m3u8 و ts): نجرّب المفضّلة أولاً
  const XT_LIVE = /^(https?:\/\/[^/]+\/(?:live\/)?[^/]+\/[^/]+\/\d+)\.(m3u8|ts)(\?.*)?$/i;
  function urlVariants(url) {
    if (isOpenSource()) return [url];
    const m = url.match(XT_LIVE);
    if (!m) return [url];
    const hls = `${m[1]}.m3u8${m[3] || ''}`;
    const ts = `${m[1]}.ts${m[3] || ''}`;
    const pref = S.liveFormat === 'ts' ? 'ts' : S.liveFormat === 'hls' ? 'm3u8' : m[2].toLowerCase();
    return pref === 'ts' ? [ts, hls] : [hls, ts];
  }

  function buildAttempts(ch) {
    const out = [];
    ch.sources.forEach((s, si) => {
      const needsHeaders = !!(s.ref || s.ua);
      for (const url of urlVariants(s.url)) {
        const canDirect = !(isHttpsPage && url.startsWith('http:'));
        for (const k of guessPlayers(url)) {
          if (canDirect && !(needsHeaders && state.proxy)) out.push({ si, url, k, proxy: false });
          if (state.proxy) out.push({ si, url, k, proxy: true });
        }
      }
    });
    return out;
  }

  function openFullPlayer(ch) {
    if (!els.stage.classList.contains('full')) {
      els.stage.classList.add('full');
      document.body.classList.add('noscroll');
      history.pushState({ tag: 'full' }, '');
    }
    els.stage.classList.remove('idle');
    els.stageTitle.textContent = ch.kind === 'series' && ch.ep ? `${ch.sTitle} · الموسم ${ch.season} · الحلقة ${ch.ep}` : ch.name;
    const i = state.epList.findIndex((e) => e.key === ch.key);
    els.btnNextEp.hidden = !(ch.kind === 'series' && i >= 0 && i < state.epList.length - 1);
  }
  function closeFullPlayer(stop = true) {
    if (!els.stage.classList.contains('full')) return;
    if (stop) { savePosition(true); stopPlayback(); state.current = null; }
    els.stage.classList.remove('full');
    document.body.classList.remove('noscroll');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    updateNowBar();
    if (stop) render();
  }
  function requestCloseFull() {
    if (history.state && history.state.tag === 'full') history.back();
    else closeFullPlayer();
  }
  function nextEpisode() {
    const i = state.current ? state.epList.findIndex((e) => e.key === state.current.key) : -1;
    if (i >= 0 && i < state.epList.length - 1) playChannel(state.epList[i + 1], { fromStart: true });
  }

  function playChannel(ch, opts = {}) {
    // المشغّل الافتراضي خارجي (VLC / MX Player)
    if (S.player === 'external' && !opts.internal) {
      stopPlayback();
      state.current = ch;
      state.attempts = buildAttempts(ch);
      state.attemptIdx = 0;
      if (ch.kind === 'live') store.set('tv.last.' + state.sourceId, ch.key);
      addHistory(ch);
      if (ch.kind !== 'live') openFullPlayer(ch);
      updateNowBar();
      highlightActive();
      openExternal(ch);
      showOverlay({
        icon: svgIcon('ext'), title: ch.name, text: 'فُتح في المشغّل الخارجي. يمكنك تغيير ذلك من الإعدادات ← المشغّل.',
        actions: [mkBtn('▶ تشغيل هنا', () => playChannel(ch, { internal: true }), true)],
      });
      return;
    }
    if (ch.kind !== 'live') openFullPlayer(ch);
    // فيلم أو حلقة بدأت مشاهدتها: متابعة أم من البداية؟
    const r = ch.kind !== 'live' && !opts.fromStart && opts.resumeAt === undefined ? getResume(ch.key) : null;
    if (r) {
      stopPlayback();
      state.current = ch;
      updateNowBar();
      highlightActive();
      showOverlay({
        icon: svgIcon('play'), title: ch.name, text: `توقفت عند ${fmtTime(r.t)} من ${fmtTime(r.d)}.`,
        actions: [
          mkBtn('▶ متابعة المشاهدة', () => playChannel(ch, { ...opts, resumeAt: r.t }), true),
          mkBtn('من البداية', () => playChannel(ch, { ...opts, fromStart: true })),
        ],
      });
      return;
    }
    state.resumeAt = opts.resumeAt || 0;
    state.current = ch;
    state.attempts = buildAttempts(ch);
    state.attemptIdx = 0;
    state.reconnects = 0;
    if (ch.kind === 'live') store.set('tv.last.' + state.sourceId, ch.key);
    addHistory(ch);
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
      if (state.resumeAt) { try { v.currentTime = state.resumeAt; } catch { /* ignore */ } state.resumeAt = 0; }
    }, { once: true });

    const buf = BUFFER[S.buffer] || BUFFER.normal;
    if (att.k === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, manifestLoadingTimeOut: 15000, ...buf.hls,
          xhrSetup: att.proxy ? (xhr, url) => { xhr.open('GET', proxify(url, src), true); } : undefined,
        });
        state.hls = hls;
        hls.subtitleDisplay = !!S.subs;
        let mediaRecovered = false;
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (token === state.playToken) startPlay(v); });
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
          if (S.subs && hls.subtitleTracks.length && hls.subtitleTrack < 0) hls.subtitleTrack = 0;
        });
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (token !== state.playToken || !d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
          fail();
        });
        hls.loadSource(att.url);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = att.proxy ? proxify(att.url, src) : att.url;
        v.addEventListener('error', fail, { once: true });
        startPlay(v);
      } else fail();
    } else if (att.k === 'mpegts') {
      if (!(window.mpegts && mpegts.isSupported())) { fail(); return; }
      const p = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: att.proxy ? proxify(att.url, src) : att.url },
        {
          enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: buf.chase, autoCleanupSourceBuffer: true,
          enableStashBuffer: true, stashInitialSize: buf.stash,
        },
      );
      state.mpg = p;
      p.on(mpegts.Events.ERROR, () => fail());
      p.attachMediaElement(v);
      p.load();
      startPlay(v);
    } else {
      v.src = att.proxy ? proxify(att.url, src) : att.url;
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
        : ch.kind === 'live' ? mkBtn('التالية', () => step(1)) : mkBtn('رجوع', requestCloseFull),
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
    const url = (att && att.url) || src.url;
    if (isAndroid) {
      const m = url.match(/^(https?):\/\/(.*)$/i);
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
    try { navigator.clipboard && navigator.clipboard.writeText(url); } catch { /* ignore */ }
  }

  // ---------- شريط القناة ----------
  function updateNowBar() {
    const ch = state.current;
    els.stage.classList.toggle('idle', !ch);
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
    const logo = safeImg(ch.logo);
    if (logo) { els.nowLogo.src = logo; els.nowLogo.hidden = false; } else { els.nowLogo.removeAttribute('src'); els.nowLogo.hidden = true; }
    els.nowLogo.parentElement.hidden = !logo;
    els.btnFav.classList.toggle('on', state.favs.has(ch.key));
    els.btnPrev.hidden = els.btnNext.hidden = ch.kind !== 'live';
    document.title = ch.name + ' — تلفزيون مفتوح';
  }

  function highlightActive() {
    const cur = state.current && state.current.key;
    document.querySelectorAll('#list [data-key], #posters [data-key], #episodes .ep[data-key]').forEach((el) => {
      el.classList.toggle('active', el.dataset.key === cur);
    });
    const act = els.list.querySelector('.row.active');
    if (act && window.innerWidth > 900) act.scrollIntoView({ block: 'nearest' });
  }

  function toggleFav(key) {
    if (!key) return;
    if (state.favs.has(key)) state.favs.delete(key); else state.favs.add(key);
    store.set('tv.favs', [...state.favs]);
    const top = els.content ? els.content.scrollTop : 0;
    render();
    if (els.content) els.content.scrollTop = top;
    updateNowBar();
    toast(state.favs.has(key) ? 'أُضيفت إلى المفضلة' : 'حُذفت من المفضلة');
  }

  function step(dir) {
    if (state.view !== 'live') return;
    const list = state.filtered.length ? state.filtered : state.byKind.live;
    if (!list.length) return;
    let i = state.current ? list.findIndex((c) => c.key === state.current.key) : -1;
    i = (i + dir + list.length) % list.length;
    playChannel(list[i]);
  }

  function restoreLast() {
    const last = store.get('tv.last.' + state.sourceId, null);
    const ch = last && state.byKind.live.find((c) => c.key === last);
    if (ch && !state.current) {
      if (S.autoplayLast) { playChannel(ch); return; }
      showOverlay({
        icon: svgIcon('tv'), title: 'آخر ما شاهدته: ' + ch.name, text: 'اضغط للمتابعة أو اختر من القائمة.',
        actions: [mkBtn('▶ تشغيل', () => playChannel(ch), true)],
      });
      if (window.innerWidth <= 900) els.stage.classList.remove('idle');
    }
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  // =====================================================================
  // ---------- الإعدادات ----------
  // =====================================================================
  function applySettings() {
    document.documentElement.style.setProperty('--fit', S.fit);
    document.documentElement.dataset.sub = S.subSize;
    els.list.classList.toggle('grid', S.layout === 'grid');
    els.btnPip.hidden = !(S.pipButton && document.pictureInPictureEnabled);
    try { els.video.autoPictureInPicture = !!S.autoPip; } catch { /* ignore */ }
    els.video.toggleAttribute('autopictureinpicture', !!S.autoPip);
    if (state.hls) state.hls.subtitleDisplay = !!S.subs;
    tickClock();
  }
  function saveSettings() { store.set(SETTINGS_KEY, S); applySettings(); }

  function tickClock() {
    els.clock.hidden = !S.clock;
    if (!S.clock) return;
    try {
      els.clock.textContent = new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit', hour12: !S.clock24 });
    } catch { els.clock.textContent = ''; }
  }

  // --- الرمز السري (الرقابة الأبوية): يكفي تشفير بسيط محلي ---
  function hashPin(pin) {
    let h = 0x811c9dc5;
    for (const ch of 'opentv:' + pin) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'f' + h.toString(16);
  }
  function askPin(title) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; if (els.pinDlg.open) els.pinDlg.close(); resolve(v); };
      els.pinTitle.textContent = title;
      els.pinInput.value = '';
      els.pinForm.onsubmit = (e) => { e.preventDefault(); done(els.pinInput.value.trim()); };
      els.pinCancel.onclick = () => done(null);
      // حدث الإغلاق يصل متأخراً: نتجاهله إن كانت النافذة قد فُتحت من جديد لسؤال آخر
      els.pinDlg.onclose = () => { if (!els.pinDlg.open) done(null); };
      els.pinDlg.showModal();
      els.pinInput.focus();
    });
  }
  async function verifyPin(title = 'أدخل الرمز السري') {
    const p = await askPin(title);
    if (p === null) return false;
    if (hashPin(p) === S.pinHash) return true;
    toast('الرمز غير صحيح');
    return false;
  }
  async function unlockContent() {
    if (await verifyPin('أدخل الرمز لعرض المحتوى المقفل')) {
      state.unlocked = true;
      render();
      toast('فُتح المحتوى المقفل حتى إغلاق التطبيق');
    }
  }

  // --- أداة صغيرة لبناء عناصر الواجهة ---
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const row = (label, hint, control) => h('div', { class: 'set-row' },
    h('div', { class: 'set-label' }, h('strong', {}, label), hint ? h('small', {}, hint) : null), control);
  const note = (text) => h('p', { class: 'set-note' }, text);
  const sec = (text) => h('h3', { class: 'set-sec' }, text);
  const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: 'set-btn ' + cls, onclick }, label);

  // خيار من عدة قيم (أزرار متجاورة)
  function choice(key, options, after) {
    const wrap = h('div', { class: 'seg small', role: 'radiogroup' });
    for (const [val, label] of options) {
      const b = h('button', { type: 'button', class: S[key] === val ? 'on' : '' }, label);
      b.addEventListener('click', () => {
        S[key] = val;
        saveSettings();
        wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        if (after) after(val);
      });
      wrap.append(b);
    }
    return wrap;
  }
  // مفتاح تشغيل/إيقاف
  function toggle(key, after, guard) {
    const b = h('button', { type: 'button', class: 'switch' + (S[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(!!S[key]) });
    b.addEventListener('click', async () => {
      if (guard && !(await guard(!S[key]))) return;
      S[key] = !S[key];
      saveSettings();
      b.classList.toggle('on', S[key]);
      b.setAttribute('aria-checked', String(S[key]));
      if (after) after(S[key]);
    });
    return b;
  }

  // مجموعات المصدر الحالي مع أعدادها وأنواعها
  function sourceGroups() {
    const groups = new Map();
    for (const c of state.channels) {
      const g = groupOf(c);
      if (!groups.has(g)) groups.set(g, { n: 0, kinds: new Set() });
      const x = groups.get(g);
      x.n++;
      x.kinds.add(c.kind || 'live');
    }
    return groups;
  }

  // قائمة خانات اختيار للمجموعات (للإخفاء أو للقفل)
  function groupChecks(storeKey, onChange) {
    const chosen = new Set(store.get(storeKey, []));
    const groups = sourceGroups();
    const box = h('div');
    const search = h('input', { type: 'search', class: 'set-search', placeholder: `ابحث في ${groups.size} مجموعة…` });
    const area = h('div');
    const draw = () => {
      const q = norm(search.value.trim());
      const sections = isOpenSource() ? [['', null]] : [['live', 'مباشر'], ['movie', 'أفلام'], ['series', 'مسلسلات']];
      area.replaceChildren();
      let shown = 0;
      for (const [kind, label] of sections) {
        const items = [...groups.entries()]
          .filter(([g, x]) => (!kind || x.kinds.has(kind)) && (!q || norm(groupLabel(g)).includes(q)))
          .sort((a, b) => collator.compare(groupLabel(a[0]), groupLabel(b[0])));
        if (!items.length) continue;
        if (label) area.append(sec(`${label} (${items.length})`));
        const grid = h('div', { class: 'checks' });
        for (const [g, x] of items.slice(0, 400)) {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = chosen.has(g);
          cb.addEventListener('change', () => {
            if (cb.checked) chosen.add(g); else chosen.delete(g);
            store.set(storeKey, [...chosen]);
            onChange();
          });
          grid.append(h('label', { class: 'check' }, cb, h('span', { dir: 'auto' }, groupLabel(g)), h('small', {}, x.n)));
          shown++;
        }
        area.append(grid);
      }
      if (!shown) area.append(note('لا توجد مجموعات مطابقة.'));
    };
    search.addEventListener('input', draw);
    draw();
    box.append(search, area);
    return box;
  }

  const sourceName = () => (isOpenSource() ? 'القنوات المفتوحة' : (metaOf(state.sourceId) || {}).name || '');
  const refreshView = () => render();

  const PAGES = {
    player: {
      icon: '🎬', title: 'المشغّل', desc: 'المشغّل الافتراضي، صيغة البث، التخزين المؤقت',
      render: () => [
        row('المشغّل الافتراضي', isAndroid ? 'الخارجي يفتح VLC أو MX Player أو غيرهما مباشرة عند اختيار قناة.' : 'الخارجي ينزّل ملف تشغيل يفتح في VLC مباشرة عند اختيار قناة.',
          choice('player', [['internal', 'الداخلي'], ['external', isAndroid ? 'خارجي (VLC/MX)' : 'خارجي (VLC)']])),
        row('صيغة البث المباشر', 'لقوائم Xtream. «تلقائي» يجرّب الصيغة الأصلية ثم الأخرى. TS أسرع مع بعض الخوادم، وHLS أنسب للهاتف.',
          choice('liveFormat', [['auto', 'تلقائي'], ['hls', 'HLS (m3u8)'], ['ts', 'MPEG-TS']])),
        row('التخزين المؤقت', 'أعلى = تقطّع أقل مع الإنترنت الضعيف، لكن تأخّر أكبر عن البث المباشر.',
          choice('buffer', [['low', 'منخفض'], ['normal', 'عادي'], ['high', 'مرتفع']])),
        row('ملاءمة الصورة', 'كيف تظهر الصورة إذا اختلف مقاسها عن الشاشة.',
          choice('fit', [['contain', 'ملاءمة'], ['cover', 'ملء وقص'], ['fill', 'تمديد']])),
        row('تشغيل آخر قناة عند الفتح', 'يفتح التطبيق على آخر قناة مباشرة شاهدتها.', toggle('autoplayLast')),
        note('تُطبَّق إعدادات الصيغة والتخزين المؤقت ابتداءً من القناة التالية.'),
      ],
    },
    subs: {
      icon: '💬', title: 'الترجمة', desc: 'إظهار الترجمة وحجم خطها',
      render: () => [
        row('إظهار الترجمة', 'عندما يوفّرها البث أو الفيلم.', toggle('subs')),
        row('حجم الخط', '', choice('subSize', [['s', 'صغير'], ['m', 'متوسط'], ['l', 'كبير']])),
      ],
    },
    pip: {
      icon: '🖼️', title: 'صورة داخل صورة', desc: 'نافذة صغيرة عائمة فوق التطبيقات الأخرى',
      render: () => [
        document.pictureInPictureEnabled ? null : note('هذه الميزة غير مدعومة على هذا الجهاز أو المتصفح.'),
        row('زر صورة داخل صورة', 'يظهر في شريط القناة.', toggle('pipButton')),
        row('تلقائي عند مغادرة النافذة', 'يعمل في Chrome وEdge عند تثبيت التطبيق.', toggle('autoPip')),
      ],
    },
    lists: {
      icon: '📋', title: 'قوائم التشغيل', desc: 'إضافة، تحديث، إعادة تسمية، حذف',
      render: () => {
        const cards = [];
        cards.push(h('div', { class: 'list-card' + (isOpenSource() ? ' cur' : '') },
          h('div', { class: 'lc-info' }, h('strong', {}, '📺 القنوات المفتوحة'), h('small', {}, `${state.openChannels.length} قناة · عربية وفرنكوفونية`)),
          h('div', { class: 'lc-actions' },
            btn('فتح', () => { closeSettings(); setSource('open').then(() => setView('home', { force: true })); }),
            btn('⟳ تحديث', () => refreshSource({ id: 'open' })))));
        const typeLabel = { url: 'رابط M3U', file: 'ملف', xtream: 'Xtream' };
        for (const m of state.myLists) {
          cards.push(h('div', { class: 'list-card' + (state.sourceId === m.id ? ' cur' : '') },
            h('div', { class: 'lc-info' }, h('strong', { dir: 'auto' }, '📁 ' + m.name),
              h('small', {}, `${m.count} عنصر · ${typeLabel[m.type] || ''} · حُمِّلت ${fmtDate(m.at)}`)),
            h('div', { class: 'lc-actions' },
              btn('فتح', () => { closeSettings(); setSource(m.id).then(() => setView('home', { force: true })); }),
              m.type !== 'file' ? btn('⟳ تحديث', async () => { toast('جارٍ التحديث…'); await refreshSource({ id: m.id }); showPage('lists'); }) : null,
              btn('✎ إعادة تسمية', () => {
                const name = prompt('الاسم الجديد للقائمة:', m.name);
                if (name && name.trim()) { m.name = name.trim(); saveMeta(); fillSourceSelect(); showPage('lists'); }
              }),
              btn('🗑 حذف', async () => { if (await deleteSource(m.id)) showPage('lists'); }, 'danger'))));
        }
        if (!state.myLists.length) cards.push(note('لم تُضف أي قائمة خاصة بعد.'));
        return [...cards, h('div', { class: 'set-actions' },
          btn('➕ إضافة قائمة', () => { closeSettings(); openAddDialog(); }, 'primary'),
          state.myLists.length ? btn('⟳ تحديث كل القوائم', refreshAll) : null)];
      },
    },
    hide: {
      icon: '🙈', title: 'إخفاء المجموعات', desc: 'إخفاء مجموعات أو بلدان لا تهمّك',
      render: () => [
        note(`القائمة الحالية: «${sourceName()}». اختر ما تريد إخفاءه؛ يمكنك إظهاره متى شئت.`),
        h('div', { class: 'set-actions' }, btn('إظهار الكل', () => { store.set('tv.hidden.' + state.sourceId, []); refreshView(); showPage('hide'); })),
        groupChecks('tv.hidden.' + state.sourceId, refreshView),
      ],
    },
    view: {
      icon: '🧩', title: 'العرض والترتيب', desc: 'ترتيب القنوات، قائمة أو شبكة',
      render: () => [
        row('الترتيب', 'الافتراضي: أبجدي للقنوات المفتوحة، وترتيب المزوّد لقوائمك.',
          choice('sort', [['default', 'الافتراضي'], ['az', 'أ ← ي'], ['za', 'ي ← أ']], render)),
        row('شكل قائمة القنوات المباشرة', 'الشبكة تعرض الشعارات بشكل أكبر.', choice('layout', [['list', 'قائمة'], ['grid', 'شبكة']], render)),
      ],
    },
    parental: {
      icon: '🔒', title: 'الرقابة الأبوية', desc: 'قفل المحتوى برمز سري',
      render: () => {
        const parts = [];
        const guard = async () => !S.parental || !S.pinHash || state.parentalOk || (state.parentalOk = await verifyPin());
        if (!S.pinHash) {
          parts.push(note('عيّن رمزاً سرياً (4 إلى 8 أرقام) لقفل المجموعات التي تختارها ومحتوى البالغين. يُطلب الرمز لعرضها.'));
          parts.push(h('div', { class: 'set-actions' }, btn('تعيين الرمز السري', setPin, 'primary')));
          return parts;
        }
        parts.push(row('تفعيل الرقابة', 'عند التفعيل يُخفى المحتوى المقفل حتى إدخال الرمز.',
          toggle('parental', () => { state.unlocked = false; refreshView(); }, guard)));
        parts.push(row('قفل محتوى البالغين تلقائياً', 'المجموعات والقنوات التي تحمل كلمات مثل XXX أو +18 أو «للكبار».',
          toggle('autoAdult', refreshView, guard)));
        parts.push(h('div', { class: 'set-actions' },
          btn('تغيير الرمز', async () => { if (await guard()) setPin(); }),
          state.unlocked ? btn('إعادة القفل الآن', () => { state.unlocked = false; refreshView(); toast('أُعيد قفل المحتوى'); }) : null));
        parts.push(sec(`مجموعات مقفلة في «${sourceName()}»`));
        const holder = h('div');
        if (state.parentalOk || !S.parental) holder.append(groupChecks('tv.locked.' + state.sourceId, refreshView));
        else holder.append(btn('أدخل الرمز لتعديل المجموعات المقفلة', async () => { if (await guard()) showPage('parental'); }));
        parts.push(holder);
        return parts;
      },
    },
    history: {
      icon: '🧹', title: 'مسح السجل', desc: 'سجل المشاهدة، المتابعة، المفضلة',
      render: () => [
        note('سجل القنوات يظهر في «شوهد مؤخراً»، ومواضع الأفلام والحلقات في «متابعة المشاهدة».'),
        h('div', { class: 'set-actions' },
          btn('مسح سجل القنوات المباشرة', () => clearHistory('live')),
          btn('مسح سجل الأفلام والمسلسلات ومواضع المتابعة', () => clearHistory('vod')),
          btn('مسح علامات «تعذّر التشغيل»', () => { state.failed = {}; store.set('tv.failed', {}); render(); toast('مُسحت العلامات'); }),
          btn('مسح المفضلة', () => {
            if (!confirm('مسح كل المفضلة؟')) return;
            state.favs.clear(); store.set('tv.favs', []); render(); updateNowBar(); toast('مُسحت المفضلة');
          }, 'danger')),
      ],
    },
    clock: {
      icon: '🕐', title: 'الساعة', desc: 'إظهار الساعة وصيغة الوقت',
      render: () => [
        row('إظهار الساعة', 'في أعلى الشاشة (على الحاسوب).', toggle('clock')),
        row('صيغة الوقت', '', choice('clock24', [[true, '24 ساعة'], [false, '12 ساعة']])),
      ],
    },
    update: {
      icon: '⟳', title: 'التحديث', desc: 'تحديث القوائم تلقائياً',
      render: () => [
        row('تحديث قوائمك تلقائياً', 'عند فتح القائمة، في الخلفية.',
          choice('autoRefresh', [['never', 'أبداً'], ['daily', 'مرة في اليوم'], ['open', 'عند كل فتح']])),
        h('div', { class: 'set-actions' },
          btn('⟳ تحديث القنوات المفتوحة', () => refreshSource({ id: 'open' })),
          state.myLists.length ? btn('⟳ تحديث كل قوائمي الآن', refreshAll) : null),
        note(location.protocol === 'file:'
          ? 'نسخة الحاسوب: لتحديث التطبيق نفسه شغّل ملف التثبيت الجديد. قوائم القنوات تتحدّث تلقائياً.'
          : 'واجهة التطبيق تتحدّث تلقائياً من الإنترنت عند كل فتح.'),
      ],
    },
    about: {
      icon: 'ℹ️', title: 'حول التطبيق', desc: 'الإصدار والروابط',
      render: () => [
        row('الإصدار', '', h('span', { dir: 'ltr' }, APP_VERSION)),
        row('طريقة التشغيل', '', h('span', {}, isNativeApp ? 'تطبيق الأندرويد' : location.protocol === 'file:' ? 'نسخة الحاسوب المثبّتة' : 'المتصفح')),
        row('المساعد المحلي', 'يفتح القوائم والروابط التي يمنعها المتصفح.', h('span', {}, state.proxy ? 'يعمل ✓' : 'غير متاح هنا')),
        h('div', { class: 'set-actions' },
          btn('طريقة الاستعمال', () => { closeSettings(); openHelp(); }),
          isAndroid && !isNativeApp ? btn('تحميل تطبيق الأندرويد', () => { location.href = APK_URL; }, 'primary') : null),
        note('القنوات المفتوحة من القائمة العامة iptv-org. التطبيق مشغّل فقط ولا يوفّر أي محتوى. ألوانه مستوحاة من طين أسوار مكناس وزليج باب منصور.'),
      ],
    },
  };

  function showSettingsHome() {
    els.setTitle.textContent = 'الإعدادات';
    els.setBack.hidden = true;
    const tiles = h('div', { class: 'tiles' });
    for (const [id, p] of Object.entries(PAGES)) {
      tiles.append(h('button', { type: 'button', class: 'tile', onclick: () => showPage(id) },
        h('span', { class: 'ti', 'aria-hidden': 'true' }, p.icon),
        h('span', {}, h('strong', {}, p.title), h('small', {}, p.desc))));
    }
    els.setBody.replaceChildren(tiles);
  }
  function showPage(id) {
    const p = PAGES[id];
    if (!p) return showSettingsHome();
    els.setTitle.textContent = p.icon + ' ' + p.title;
    els.setBack.hidden = false;
    els.setBody.replaceChildren(...[].concat(p.render()).filter(Boolean));
    els.setBody.scrollTop = 0;
  }
  function openSettings(page) {
    state.parentalOk = false;
    if (!els.settings.open) els.settings.showModal();
    if (page) showPage(page); else showSettingsHome();
  }
  function closeSettings() { if (els.settings.open) els.settings.close(); }

  async function setPin() {
    const p1 = await askPin('اختر رمزاً سرياً جديداً (4 إلى 8 أرقام)');
    if (p1 === null) return;
    if (!/^\d{4,8}$/.test(p1)) { toast('الرمز يجب أن يكون من 4 إلى 8 أرقام'); return; }
    const p2 = await askPin('أعد كتابة الرمز للتأكيد');
    if (p2 === null) return;
    if (p1 !== p2) { toast('الرمزان غير متطابقين'); return; }
    const first = !S.pinHash;
    S.pinHash = hashPin(p1);
    if (first) S.parental = true;
    state.parentalOk = true;
    state.unlocked = false;
    saveSettings();
    refreshView();
    toast(first ? 'تم تعيين الرمز وتفعيل الرقابة الأبوية' : 'تم تغيير الرمز');
    if (els.settings.open) showPage('parental');
  }

  function clearHistory(which) {
    const all = store.get(HIST_KEY, {});
    for (const id of Object.keys(all)) all[id] = all[id].filter((x) => (which === 'live' ? x.kind !== 'live' : x.kind === 'live'));
    store.set(HIST_KEY, all);
    if (which === 'vod') store.set(RESUME_KEY, {});
    render();
    toast(which === 'live' ? 'مُسح سجل القنوات المباشرة' : 'مُسح سجل الأفلام والمسلسلات');
  }

  async function refreshAll() {
    const lists = state.myLists.filter((m) => m.type !== 'file');
    if (!lists.length) { toast('لا توجد قوائم بروابط لتحديثها'); return; }
    let ok = 0;
    for (const [i, m] of lists.entries()) {
      toast(`جارٍ تحديث ${i + 1} من ${lists.length}: ${m.name}`);
      if (await refreshSource({ id: m.id, silent: true })) ok++;
    }
    toast(`تم تحديث ${ok} من ${lists.length} قائمة`);
    if (els.settings.open && els.setTitle.textContent.includes('قوائم')) showPage('lists');
  }

  // حفظ موضع المشاهدة في الأفلام والحلقات
  function savePosition(force) {
    const ch = state.current;
    const v = els.video;
    if (!ch || ch.kind === 'live' || !isFinite(v.duration) || v.duration < 120 || v.currentTime < 1) return;
    const now = Date.now();
    if (!force && now - state.lastSave < 10000) return;
    state.lastSave = now;
    saveResume(ch.key, v.currentTime, v.duration);
  }

  // =====================================================================
  // ---------- الأحداث ----------
  // =====================================================================
  const byKey = (key) => state.channels.find((c) => c.key === key);

  // الشريط العلوي والرئيسية
  els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    if (b.dataset.view === 'home') goHome(); else setView(b.dataset.view);
  });
  els.goHome.addEventListener('click', goHome);
  document.querySelectorAll('.htile[data-go]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.go)));
  document.querySelectorAll('.hbtn[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'lists') openSettings('lists');
    else if (a === 'settings') openSettings();
    else if (a === 'refresh') refreshSource();
    else if (a === 'help') openHelp();
  }));
  els.homeRows.addEventListener('click', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const ch = byKey(el.dataset.key);
    if (!ch) return;
    if (ch.kind === 'series') {
      const s = groupSeries(state.byKind.series).find((x) => x.skey === ch.skey);
      state.epList = s ? s.eps : [ch];
    }
    setView(ch.kind);
    playChannel(ch);
  });

  // الأصناف
  els.cats.addEventListener('click', (e) => {
    const b = e.target.closest('.cat');
    if (!b) return;
    state.catSel[state.view] = b.dataset.cat;
    state.limit = LIMIT;
    state.seriesSel = null;
    render();
    if (els.content) els.content.scrollTop = 0;
  });
  els.langSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.lang = b.dataset.lang; store.set('tv.lang', state.lang);
    state.limit = LIMIT;
    render();
  });

  // قائمة القنوات المباشرة
  els.list.addEventListener('click', (e) => {
    const li = e.target.closest('.row');
    if (!li) return;
    if (e.target.closest('.fav')) { toggleFav(li.dataset.key); return; }
    const ch = state.filtered.find((c) => c.key === li.dataset.key);
    if (ch) {
      playChannel(ch);
      if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // الملصقات (أفلام / مسلسلات)
  function onPoster(e) {
    const p = e.target.closest('.poster');
    if (!p) return;
    const key = p.dataset.key || p.dataset.skey;
    if (e.target.closest('.pfav')) { toggleFav(key); return; }
    if (p.dataset.skey) {
      state.seriesSel = p.dataset.skey;
      state.season = null;
      history.pushState({ tag: 'series' }, '');
      render();
      if (els.content) els.content.scrollTop = 0;
      if (window.innerWidth <= 900) window.scrollTo({ top: 0 });
      return;
    }
    const ch = byKey(key);
    if (ch) playChannel(ch);
  }
  els.posters.addEventListener('click', onPoster);
  els.posters.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPoster(e); });

  // الحلقات
  els.episodes.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'back') { if (history.state && history.state.tag === 'series') history.back(); else { state.seriesSel = null; render(); } }
      else if (a === 'sfav') toggleFav(state.seriesSel);
      else if (a === 'cont') { const ch = byKey(act.dataset.key); if (ch) playChannel(ch); }
      return;
    }
    const s = e.target.closest('[data-season]');
    if (s) { state.season = +s.dataset.season; render(); return; }
    const ep = e.target.closest('.ep');
    if (ep) { const ch = byKey(ep.dataset.key); if (ch) playChannel(ch); }
  });

  els.more.addEventListener('click', () => { state.limit += LIMIT; render(); });

  // البحث
  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value;
      state.limit = LIMIT;
      if (state.view === 'series') state.seriesSel = null;
      render();
    }, state.channels.length > 3000 ? 220 : 60);
  });

  // صور لا تُحمَّل: نعرض الحروف الأولى بدلها
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.i !== undefined && img.parentElement) img.parentElement.textContent = img.dataset.i;
    else if (img.closest('.pimg')) img.remove();
    else if (img === els.nowLogo) img.hidden = true;
  }, true);

  // مصادر القوائم
  els.srcSel.addEventListener('change', () => {
    const v = els.srcSel.value;
    if (v === '__add') { els.srcSel.value = state.sourceId; openAddDialog(); return; }
    setSource(v);
  });
  els.btnAdd.addEventListener('click', openAddDialog);
  els.btnSrcDel.addEventListener('click', () => deleteSource());
  els.addType.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setAddType(b.dataset.t); });
  els.addForm.addEventListener('submit', onAddSubmit);
  els.addCancel.addEventListener('click', () => els.addDlg.close());

  // المشغّل
  els.btnFav.addEventListener('click', () => state.current && toggleFav(state.current.key));
  els.btnExternal.addEventListener('click', () => openExternal());
  els.btnPrev.addEventListener('click', () => step(-1));
  els.btnNext.addEventListener('click', () => step(1));
  els.btnFull.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (els.video.requestFullscreen) els.video.requestFullscreen().catch(() => {});
  });
  els.btnClose.addEventListener('click', requestCloseFull);
  els.btnNextEp.addEventListener('click', nextEpisode);
  els.btnPip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await els.video.requestPictureInPicture();
    } catch { toast('صورة داخل صورة غير متاحة الآن (شغّل قناة أولاً)'); }
  });
  els.video.addEventListener('timeupdate', () => savePosition(false));
  els.video.addEventListener('pause', () => savePosition(true));
  els.video.addEventListener('ended', () => {
    const ch = state.current;
    if (!ch || ch.kind === 'live') return;
    saveResume(ch.key, 0, 1); // انتهت: لا متابعة
    const i = state.epList.findIndex((e) => e.key === ch.key);
    if (ch.kind === 'series' && i >= 0 && i < state.epList.length - 1) { toast('الحلقة التالية…'); setTimeout(nextEpisode, 1200); }
  });
  window.addEventListener('pagehide', () => savePosition(true));

  // أزرار عامة
  els.btnRefresh.addEventListener('click', () => refreshSource());
  els.btnHelp.addEventListener('click', openHelp);
  els.btnSettings.addEventListener('click', () => openSettings());
  els.setBack.addEventListener('click', showSettingsHome);
  els.setClose.addEventListener('click', closeSettings);
  els.lockInfo.addEventListener('click', unlockContent);

  // زر الرجوع (المتصفح أو هاتف الأندرويد)
  window.addEventListener('popstate', () => {
    if (els.stage.classList.contains('full')) { closeFullPlayer(); return; }
    if (state.view === 'series' && state.seriesSel) { state.seriesSel = null; render(); return; }
    if (state.view !== 'home') setView('home', { pop: true });
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = e.target instanceof Element && e.target.matches('input, select, textarea');
    if (e.key === 'Escape') {
      if (typing) { e.target.blur(); return; }
      if (els.stage.classList.contains('full')) { requestCloseFull(); return; }
      if (state.view === 'series' && state.seriesSel) { history.back(); return; }
      if (state.view !== 'home') goHome();
      return;
    }
    if (e.key === '/' && !typing && state.view !== 'home') { e.preventDefault(); els.search.focus(); return; }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { if (state.view === 'live') { e.preventDefault(); step(1); } }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { if (state.view === 'live') { e.preventDefault(); step(-1); } }
    else if (e.key === 's' || e.key === 'S' || e.key === 'س') { e.preventDefault(); openSettings(); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'ب') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (state.current && els.video.requestFullscreen) els.video.requestFullscreen().catch(() => {});
    } else if (e.key === 'm' || e.key === 'M' || e.key === 'ة') { els.video.muted = !els.video.muted; toast(els.video.muted ? 'تم كتم الصوت' : 'تم تفعيل الصوت'); }
  });

  // ارتفاع الشريط العلوي (للعناصر الثابتة على الهاتف)
  function measureTop() {
    const top = document.querySelector('.topbar');
    const hgt = top ? top.offsetHeight : 0;
    document.documentElement.style.setProperty('--topbar-h', hgt + 'px');
    document.documentElement.style.setProperty('--sticky-top', (hgt + 6) + 'px');
  }
  window.addEventListener('resize', measureTop);

  // =====================================================================
  // ---------- البدء ----------
  // =====================================================================
  fillSourceSelect();
  applySettings();
  measureTop();
  setInterval(tickClock, 15000);
  history.replaceState({ tag: 'root' }, '');
  (async () => {
    await initProxy();
    const openReady = loadOpen();
    await setSource(state.sourceId);
    await openReady;
    if (state.view === 'home') render();
    if (S.autoplayLast) {
      const last = store.get('tv.last.' + state.sourceId, null);
      if (last && state.byKind.live.some((c) => c.key === last)) setView('live');
    }
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
