/* تلفزيون مفتوح — مشغّل قنوات عربية وفرنكوفونية مجانية
 * المصدر: قوائم iptv-org العامة (https://github.com/iptv-org/iptv)
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
  const CAT_LABEL ={ general: 'عامة', news: 'إخبارية', doc: 'وثائقية/ثقافية' };
  const LANG_LABEL = { ara: 'عربية', fra: 'فرنسية' };
  const START_TIMEOUT_MS = 20000;
  const FAIL_TTL_MS = 12 * 3600 * 1000;
  const CACHE_KEY = 'tv.playlists.v1';

  const $ = (s) => document.querySelector(s);
  const els = {
    video: $('#video'), overlay: $('#overlay'), ovIcon: $('#ovIcon'), ovTitle: $('#ovTitle'),
    ovText: $('#ovText'), ovActions: $('#ovActions'), list: $('#list'), count: $('#count'),
    source: $('#source'), search: $('#search'), country: $('#country'), langSeg: $('#langSeg'),
    catChips: $('#catChips'), nowBar: $('#nowBar'), nowLogo: $('#nowLogo'), nowName: $('#nowName'),
    nowMeta: $('#nowMeta'), btnFav: $('#btnFav'), btnExternal: $('#btnExternal'),
    btnPrev: $('#btnPrev'), btnNext: $('#btnNext'), btnRefresh: $('#btnRefresh'),
    btnHelp: $('#btnHelp'), help: $('#help'), toast: $('#toast'),
  };

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isHttpsPage = location.protocol === 'https:';
  const regionName = (() => {
    try { const dn = new Intl.DisplayNames(['ar'], { type: 'region' }); return (c) => { try { return dn.of(c) || c; } catch { return c; } }; }
    catch { return (c) => c; }
  })();

  // ---------- تخزين محلي آمن ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const state = {
    channels: [],
    filtered: [],
    lang: store.get('tv.lang', 'all'),
    cat: store.get('tv.cat', 'all'),
    country: store.get('tv.country', ''),
    query: '',
    favs: new Set(store.get('tv.favs', [])),
    failed: store.get('tv.failed', {}),
    current: null,
    srcIndex: 0,
    hls: null,
    startTimer: null,
    playToken: 0,
  };

  // ---------- تحليل ملف M3U ----------
  function parseM3U(text, lang) {
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
        out.push({ ...cur, url: line, lang });
        cur = null;
      }
    }
    return out;
  }

  function buildChannels(playlists) {
    const map = new Map();
    for (const lang of Object.keys(SOURCES)) {
      const text = playlists[lang];
      if (typeof text !== 'string') continue;
      for (const e of parseM3U(text, lang)) {
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
          ch = { key, name, logo: e.attrs['tvg-logo'] || '', country, cats: new Set(), langs: new Set(), sources: [] };
          map.set(key, ch);
        }
        cats.forEach((c) => ch.cats.add(c));
        ch.langs.add(lang);
        if (!ch.logo && e.attrs['tvg-logo']) ch.logo = e.attrs['tvg-logo'];
        if (!ch.sources.some((s) => s.url === e.url)) {
          ch.sources.push({
            url: e.url, quality, geo, not247, opts: e.opts,
            needsHeaders: e.opts.length > 0 || !!e.attrs['http-referrer'] || !!e.attrs['http-user-agent'],
          });
        }
      }
    }
    const qn = (q) => parseInt(q, 10) || 0;
    const score = (s) => (isHttpsPage && s.url.startsWith('http:') ? -1e5 : 0) - (s.needsHeaders ? 1e4 : 0)
      - (s.geo ? 5e3 : 0) - (s.not247 ? 2e3 : 0) + Math.min(qn(s.quality), 1080);
    const list = [...map.values()];
    for (const ch of list) ch.sources.sort((a, b) => score(b) - score(a));
    list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    return list;
  }

  // ---------- جلب القوائم ----------
  async function fetchText(url, ms = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  function applyPlaylists(playlists, sourceLabel) {
    state.channels = buildChannels(playlists);
    fillCountries();
    render();
    els.source.textContent = sourceLabel;
    if (state.current) {
      const again = state.channels.find((c) => c.key === state.current.key);
      if (again) { state.current = again; updateNowBar(); }
    }
  }

  async function loadChannels({ manual = false } = {}) {
    if (!state.channels.length) {
      const cached = store.get(CACHE_KEY, null);
      if (cached && cached.ara) applyPlaylists(cached, 'نسخة محفوظة · ' + fmtDate(cached.at));
      else if (window.FALLBACK_M3U) applyPlaylists(window.FALLBACK_M3U, 'نسخة مدمجة');
    }
    els.btnRefresh.classList.add('spin');
    try {
      const [ara, fra] = await Promise.all([fetchText(SOURCES.ara), fetchText(SOURCES.fra)]);
      if (!ara.includes('#EXTINF') || !fra.includes('#EXTINF')) throw new Error('bad playlist');
      const data = { ara, fra, at: Date.now() };
      store.set(CACHE_KEY, data);
      applyPlaylists(data, 'محدَّثة الآن');
      if (manual) toast('تم تحديث قائمة القنوات');
    } catch (err) {
      console.warn('تعذّر تحديث القوائم:', err);
      if (manual) toast('تعذّر التحديث، تُستعمل آخر نسخة محفوظة');
    } finally {
      els.btnRefresh.classList.remove('spin');
    }
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString('ar-MA', { day: 'numeric', month: 'short' }); } catch { return ''; }
  }

  // ---------- الفلاتر والعرض ----------
  function fillCountries() {
    const counts = new Map();
    for (const c of state.channels) if (c.country) counts.set(c.country, (counts.get(c.country) || 0) + 1);
    const opts = [...counts.entries()]
      .map(([code, n]) => ({ code, n, label: regionName(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    els.country.innerHTML = '<option value="">كل البلدان</option>' +
      opts.map((o) => `<option value="${o.code}">${esc(o.label)} (${o.n})</option>`).join('');
    if (state.country && counts.has(state.country)) els.country.value = state.country;
    else state.country = '';
  }

  const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٟ̀-ͯ]/g, '');

  function applyFilters() {
    const q = norm(state.query.trim());
    state.filtered = state.channels.filter((c) => {
      if (state.lang !== 'all' && !c.langs.has(state.lang)) return false;
      if (state.cat === 'fav') { if (!state.favs.has(c.key)) return false; }
      else if (state.cat !== 'all' && !c.cats.has(state.cat)) return false;
      if (state.country && c.country !== state.country) return false;
      if (q && !norm(c.name).includes(q) && !norm(regionName(c.country || 'ZZ')).includes(q)) return false;
      return true;
    });
  }

  function isFailed(c) {
    const t = state.failed[c.key];
    return t && Date.now() - t < FAIL_TTL_MS;
  }

  function render() {
    applyFilters();
    const frag = document.createDocumentFragment();
    for (const c of state.filtered) {
      const li = document.createElement('li');
      li.className = 'ch' + (state.current && state.current.key === c.key ? ' active' : '') + (isFailed(c) ? ' failed' : '');
      li.dataset.key = c.key;
      li.setAttribute('role', 'option');
      const tags = [];
      if (c.country) tags.push(`<span class="tag">${esc(regionName(c.country))}</span>`);
      for (const k of c.cats) if (k !== 'general') tags.push(`<span class="tag ${k}">${CAT_LABEL[k]}</span>`);
      if (state.lang === 'all') for (const l of c.langs) tags.push(`<span class="tag">${LANG_LABEL[l]}</span>`);
      if (c.sources.every((s) => s.geo)) tags.push('<span class="tag warn">محجوبة جغرافياً · قد تحتاج VPN</span>');
      if (isFailed(c)) tags.push('<span class="tag warn">تعذّر التشغيل مؤخراً</span>');
      const initials = esc(c.name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
      li.innerHTML = `
        <div class="ch-logo">${c.logo ? `<img loading="lazy" referrerpolicy="no-referrer" alt="" src="${esc(c.logo)}" data-i="${initials}">` : initials}</div>
        <div class="ch-body"><span class="ch-name">${esc(c.name)}</span><div class="ch-meta">${tags.join('')}</div></div>
        <button class="fav-btn${state.favs.has(c.key) ? ' on' : ''}" aria-label="المفضلة" title="المفضلة">${state.favs.has(c.key) ? '★' : '☆'}</button>`;
      frag.appendChild(li);
    }
    els.list.replaceChildren(frag);
    if (!state.filtered.length) {
      els.list.innerHTML = `<li class="empty">${state.cat === 'fav' ? 'لا توجد قنوات في المفضلة بعد. اضغط ☆ بجانب أي قناة لإضافتها.' : (state.channels.length ? 'لا توجد قنوات مطابقة.' : 'جارٍ تحميل القنوات…')}</li>`;
    }
    els.list.querySelectorAll('.ch-logo img').forEach((img) => {
      img.addEventListener('error', () => { img.parentElement.textContent = img.dataset.i; }, { once: true });
    });
    els.count.textContent = `${state.filtered.length} قناة`;
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
    els.video.removeAttribute('src');
    try { els.video.load(); } catch { /* ignore */ }
  }

  function playChannel(ch) {
    state.current = ch;
    state.srcIndex = 0;
    store.set('tv.last', ch.key);
    updateNowBar();
    highlightActive();
    trySource();
  }

  function playable(src) {
    return !(isHttpsPage && src.url.startsWith('http:'));
  }

  function trySource() {
    const ch = state.current;
    if (!ch) return;
    stopPlayback();
    const token = ++state.playToken;
    while (state.srcIndex < ch.sources.length && !playable(ch.sources[state.srcIndex])) state.srcIndex++;
    if (state.srcIndex >= ch.sources.length) return onAllFailed(token);

    const src = ch.sources[state.srcIndex];
    const n = ch.sources.length;
    showOverlay({
      loading: true, title: ch.name,
      text: n > 1 ? `جارٍ الاتصال… (الرابط ${state.srcIndex + 1} من ${n})` : 'جارٍ الاتصال…',
    });

    const fail = () => {
      if (token !== state.playToken) return;
      state.srcIndex++;
      if (state.srcIndex < ch.sources.length) trySource();
      else onAllFailed(token);
    };
    state.startTimer = setTimeout(fail, START_TIMEOUT_MS);

    const v = els.video;
    let started = false;
    const onPlaying = () => {
      if (token !== state.playToken) return;
      started = true;
      state.reconnects = 0;
      clearTimeout(state.startTimer);
      hideOverlay();
      if (state.failed[ch.key]) { delete state.failed[ch.key]; store.set('tv.failed', state.failed); highlightActive(); }
    };
    v.addEventListener('playing', onPlaying, { once: true });

    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30, manifestLoadingTimeOut: 15000 });
      state.hls = hls;
      let mediaRecovered = false;
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (token === state.playToken) startPlay(v); });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (token !== state.playToken || !d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) { mediaRecovered = true; hls.recoverMediaError(); return; }
        clearTimeout(state.startTimer);
        if (started && (state.reconnects || 0) < 3) {
          // كان البث يعمل ثم انقطع: نعيد الاتصال بنفس الرابط
          state.reconnects = (state.reconnects || 0) + 1;
          toast('انقطع البث، جارٍ إعادة الاتصال…');
          setTimeout(() => { if (token === state.playToken) trySource(); }, 1500);
          return;
        }
        fail();
      });
      hls.loadSource(src.url);
      hls.attachMedia(v);
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src.url;
      v.addEventListener('error', () => { clearTimeout(state.startTimer); fail(); }, { once: true });
      startPlay(v);
    } else {
      clearTimeout(state.startTimer);
      onAllFailed(token);
    }
  }

  function startPlay(v) {
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        // منع التشغيل التلقائي بالصوت: نشغّل بدون صوت مع زر لتفعيله
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
    const anyHttpBlocked = ch.sources.some((s) => !playable(s));
    const anyGeo = ch.sources.some((s) => s.geo);
    let text = 'قد يكون البث متوقفاً حالياً أو محجوباً في بلدك.';
    if (anyHttpBlocked) text = 'هذا البث لا يمكن تشغيله داخل المتصفح من رابط آمن (https)، افتحه في مشغّل خارجي.';
    else if (anyGeo) {
      const where = ch.country ? ' في ' + regionName(ch.country) : ' في بلد القناة';
      text = `هذه القناة محجوبة جغرافياً. لتجاوز الحجب: شغّل تطبيق VPN واختر خادماً${where}، ثم اضغط «إعادة المحاولة».`;
    }
    const actions = [
      mkBtn('إعادة المحاولة', () => { state.srcIndex = 0; trySource(); }, anyGeo),
      mkBtn(isAndroid ? 'فتح في VLC / مشغّل آخر' : 'فتح في VLC', () => openExternal(ch), !anyGeo),
      anyGeo ? mkBtn('كيف أستعمل VPN؟', openVpnHelp) : mkBtn('القناة التالية', () => step(1)),
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
    const src = ch.sources[Math.min(state.srcIndex, ch.sources.length - 1)] || ch.sources[0];
    if (isAndroid) {
      const m = src.url.match(/^(https?):\/\/(.*)$/i);
      if (m) {
        location.href = `intent://${m[2]}#Intent;scheme=${m[1]};type=application/x-mpegURL;S.title=${encodeURIComponent(ch.name)};end`;
        return;
      }
    }
    // الحاسوب: ملف قائمة تشغيل يفتح تلقائياً في VLC إن كان مثبتاً
    const body = ['#EXTM3U'];
    for (const s of ch.sources) {
      body.push(`#EXTINF:-1,${ch.name}${s.quality ? ' (' + s.quality + ')' : ''}`);
      body.push(...s.opts);
      body.push(s.url);
    }
    const blob = new Blob([body.join('\n') + '\n'], { type: 'audio/x-mpegurl' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ch.name.replace(/[\\/:*?"<>|]/g, '').trim() + '.m3u';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('تم تنزيل ملف القناة — افتحه بـ VLC');
    try { navigator.clipboard && navigator.clipboard.writeText(src.url); } catch { /* ignore */ }
  }

  // ---------- واجهة ----------
  function updateNowBar() {
    const ch = state.current;
    if (!ch) { els.nowBar.hidden = true; return; }
    els.nowBar.hidden = false;
    els.nowName.textContent = ch.name;
    const parts = [];
    if (ch.country) parts.push(regionName(ch.country));
    parts.push([...ch.cats].map((k) => CAT_LABEL[k]).join(' · '));
    parts.push([...ch.langs].map((l) => LANG_LABEL[l]).join(' / '));
    els.nowMeta.textContent = parts.filter(Boolean).join(' — ');
    if (ch.logo) { els.nowLogo.src = ch.logo; els.nowLogo.hidden = false; } else els.nowLogo.hidden = true;
    const fav = state.favs.has(ch.key);
    els.btnFav.textContent = fav ? '★' : '☆';
    els.btnFav.classList.toggle('on', fav);
    document.title = ch.name + ' — تلفزيون مفتوح';
  }

  function highlightActive() {
    els.list.querySelectorAll('.ch').forEach((li) => {
      const c = state.channels.find((x) => x.key === li.dataset.key);
      li.classList.toggle('active', !!state.current && li.dataset.key === state.current.key);
      if (c) li.classList.toggle('failed', !!isFailed(c));
    });
    const act = els.list.querySelector('.ch.active');
    if (act && window.innerWidth > 900) act.scrollIntoView({ block: 'nearest' });
  }

  function toggleFav(key) {
    if (state.favs.has(key)) state.favs.delete(key); else state.favs.add(key);
    store.set('tv.favs', [...state.favs]);
    if (state.cat === 'fav') render();
    else {
      const li = els.list.querySelector(`.ch[data-key="${CSS.escape(key)}"] .fav-btn`);
      if (li) { const on = state.favs.has(key); li.classList.toggle('on', on); li.textContent = on ? '★' : '☆'; }
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

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
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
    const ch = state.channels.find((c) => c.key === li.dataset.key);
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
  els.country.addEventListener('change', () => { state.country = els.country.value; store.set('tv.country', state.country); render(); });
  els.search.addEventListener('input', () => { state.query = els.search.value; render(); });

  els.btnFav.addEventListener('click', () => state.current && toggleFav(state.current.key));
  els.btnExternal.addEventListener('click', () => openExternal());
  els.btnPrev.addEventListener('click', () => step(-1));
  els.btnNext.addEventListener('click', () => step(1));
  els.btnRefresh.addEventListener('click', () => loadChannels({ manual: true }));
  els.btnHelp.addEventListener('click', openHelp);

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, select, textarea');
    if (e.key === '/' && !typing) { e.preventDefault(); els.search.focus(); return; }
    if (e.key === 'Escape' && typing) { e.target.blur(); return; }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'ب') {
      if (document.fullscreenElement) document.exitFullscreen();
      else els.video.requestFullscreen && els.video.requestFullscreen().catch(() => {});
    } else if (e.key === 'm' || e.key === 'M' || e.key === 'ة') { els.video.muted = !els.video.muted; toast(els.video.muted ? 'تم كتم الصوت' : 'تم تفعيل الصوت'); }
  });

  // ---------- البدء ----------
  setSeg(els.langSeg, 'lang', state.lang);
  setSeg(els.catChips, 'cat', state.cat);
  loadChannels().then(() => {
    const last = store.get('tv.last', null);
    const ch = last && state.channels.find((c) => c.key === last);
    if (ch && !state.current) {
      state.current = ch; updateNowBar(); highlightActive();
      showOverlay({ title: 'آخر قناة شاهدتها: ' + ch.name, text: 'اضغط للمتابعة أو اختر قناة أخرى من القائمة.', actions: [mkBtn('▶ تشغيل', () => playChannel(ch), true)] });
    }
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
