/**
 * [INPUT]: 站点参数、筛选条件与统计接口。
 * [OUTPUT]: 指标、响应式趋势图与维度排行。
 * [POS]: 概览与受众共用查询和维度定义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const site = new URLSearchParams(location.search).get('id');
if (!site) location.href = '/sites.html';
document.getElementById('visitorsLink').href = `/visitor.html?site=${encodeURIComponent(site)}`;
document.getElementById('trafficAll').href = `/visitor.html?site=${encodeURIComponent(site)}&verdict=bot`;
// deep link into the journey finder pre-filtered to one page path
const visitorsByPath = (path) =>
  `/visitor.html?site=${encodeURIComponent(site)}&path=${encodeURIComponent(path)}`;
let siteName = site; // replaced with the friendly name once /api/sites loads
let brandName = 'pvuv.ai'; // instance brand (configurable), for the tab title suffix
const PREF_KEY = 'pvuv.chartPrefs';
const FILTER_KEY = 'pvuv.filters.' + site;

// ── faceted filtering (Plausible-style): click any dimension value to narrow
// the whole dashboard; filters stack (AND), one per dimension. Persisted per
// site so a reload keeps the view. Only cleanly-supported dims are clickable.
let filters = [];
const FILTER_UI = new Set(['source', 'page', 'country', 'region', 'city', 'device', 'browser', 'os', 'utm_campaign', 'utm_medium']);
const FILTER_LABEL = { source: 'Source', page: 'Page', country: 'Country', region: 'Region', city: 'City', device: 'Device', browser: 'Browser', os: 'OS', utm_campaign: 'Campaign', utm_medium: 'Medium' };
function loadFilters() {
  try { filters = JSON.parse(localStorage.getItem(FILTER_KEY)) || []; } catch { filters = []; }
  if (!Array.isArray(filters)) filters = [];
}
function saveFilters() { try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* non-fatal */ } }
function filterQS() { return filters.length ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : ''; }
// `values` carries every raw key a merged display row stands for (see
// mergeSources) so the server matches all of them; `value` stays the label.
function addFilter(dim, value, values) {
  if (!FILTER_UI.has(dim) || value == null) return;
  value = String(value);
  if (filters.some((f) => f.dim === dim && f.value === value)) return;
  filters = filters.filter((f) => f.dim !== dim); // one filter per dimension
  filters.push(values && values.length > 1 ? { dim, value, values } : { dim, value });
  saveFilters(); renderFilters(); load();
}
function removeFilter(i) { filters.splice(i, 1); saveFilters(); renderFilters(); load(); }
function clearFilters() { filters = []; saveFilters(); renderFilters(); load(); }
function renderFilters() {
  const el = document.getElementById('filters');
  const label = (f) => f.dim === 'source' ? sourceLabel(f.value) : f.value;
  el.innerHTML = filters.map((f, i) =>
    `<span class="chip"><span>${te(FILTER_LABEL[f.dim] || f.dim)}: <b title="${esc((f.values || [f.value]).join(', '))}">${esc(label(f))}</b></span><button class="x" data-i="${i}" aria-label="Remove filter" title="Remove">×</button></span>`).join('')
    + (filters.length > 1 ? `<button class="clear">${te('Clear all')}</button>` : '');
  el.querySelectorAll('.chip .x').forEach((b) => b.addEventListener('click', () => removeFilter(Number(b.dataset.i))));
  const c = el.querySelector('.clear');
  if (c) c.addEventListener('click', clearFilters);
}

// browser-tab title: "{metric} - {site} - {brand}" so tabs are distinguishable.
function setTitle() {
  const m = document.getElementById('metric');
  const label = m && m.value ? t(METRIC_LABEL[m.value] || '') : '';
  document.title = `${label ? label + ' - ' : ''}${siteName} - ${brandName}`;
}
async function loadBrand() {
  try { const b = await (await fetch('/api/home')).json(); if (b && b.name) brandName = b.name; } catch { /* keep default */ }
  setTitle();
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// i18n: t() translates a UI string for the current language (English falls
// through unchanged). te() = escape(translate) for safe interpolation.
const t = (s) => window.PVI18N.t(s);
const te = (s) => esc(t(s));
const fmt = (n) => n == null ? '–' : Number(n).toLocaleString('en-US');

// country code → flag emoji + human name (Intl.DisplayNames, no lookup table)
let regionNames;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
function flagEmoji(cc) {
  if (!/^[A-Za-z]{2}$/.test(cc || '')) return '';
  const A = 0x1F1E6;
  return `<span class="flag">${String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - 65, A + cc.toUpperCase().charCodeAt(1) - 65)}</span>`;
}
function countryLabel(cc) {
  if (regionNames && /^[A-Za-z]{2}$/.test(cc || '')) { try { return regionNames.of(cc.toUpperCase()) || cc; } catch { return cc; } }
  return cc || '(unknown)';
}

// source favicon (admin dashboard only): resolve common engines to their domain,
// use DuckDuckGo's icon service (privacy-respecting), fall back to a link glyph.
const SOURCE_DOMAIN = {
  google: 'google.com', bing: 'bing.com', duckduckgo: 'duckduckgo.com', yahoo: 'yahoo.com',
  baidu: 'baidu.com', yandex: 'yandex.com', twitter: 'twitter.com', x: 'x.com',
  facebook: 'facebook.com', instagram: 'instagram.com', linkedin: 'linkedin.com',
  youtube: 'youtube.com', reddit: 'reddit.com', github: 'github.com', bilibili: 'bilibili.com',
  weibo: 'weibo.com', zhihu: 'zhihu.com', newsletter: '', email: '',
};
const GENERIC_ICON = "this.outerHTML='<span class=\\'favi-generic\\'>🔗</span>'";
// Display-side twin of shared/source.ts canonicalSource(): rows recorded
// before ingest-time canonicalisation (www.google.com, google.com.hk, t.co …)
// still read as one platform. Filtering keeps the raw stored key.
const SOURCE_CANON = [
  [/(^|\.)google\.[a-z.]+$/, 'google.com'], [/^com\.google\.android\.googlequicksearchbox$/, 'google.com'],
  [/(^|\.)bing\.com$/, 'bing.com'], [/(^|\.)yahoo\.[a-z.]+$/, 'yahoo.com'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo.com'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex.com'], [/(^|\.)baidu\.com$/, 'baidu.com'],
  [/^t\.co$/, 'x.com'], [/(^|\.)twitter\.com$/, 'x.com'], [/(^|\.)x\.com$/, 'x.com'],
  [/(^|\.)facebook\.com$/, 'facebook.com'], [/^fb\.com$/, 'facebook.com'], [/(^|\.)instagram\.com$/, 'instagram.com'],
  [/(^|\.)linkedin\.com$/, 'linkedin.com'], [/^lnkd\.in$/, 'linkedin.com'], [/(^|\.)reddit\.com$/, 'reddit.com'],
  [/(^|\.)youtube\.com$/, 'youtube.com'], [/^youtu\.be$/, 'youtube.com'], [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest.com'],
  [/(^|\.)chatgpt\.com$/, 'chatgpt.com'], [/^chat\.openai\.com$/, 'chatgpt.com'], [/(^|\.)perplexity\.ai$/, 'perplexity.ai'],
  [/(^|\.)bilibili\.com$/, 'bilibili.com'], [/^b23\.tv$/, 'bilibili.com'], [/(^|\.)weibo\.(com|cn)$/, 'weibo.com'],
  [/(^|\.)zhihu\.com$/, 'zhihu.com'], [/^t\.me$/, 'telegram.org'],
];
const SOURCE_NAME = {
  'google.com': 'Google', 'bing.com': 'Bing', 'yahoo.com': 'Yahoo', 'duckduckgo.com': 'DuckDuckGo', 'yandex.com': 'Yandex',
  'baidu.com': 'Baidu', 'x.com': 'X (Twitter)', 'facebook.com': 'Facebook', 'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn', 'reddit.com': 'Reddit', 'youtube.com': 'YouTube', 'pinterest.com': 'Pinterest',
  'chatgpt.com': 'ChatGPT', 'perplexity.ai': 'Perplexity', 'bilibili.com': 'Bilibili', 'weibo.com': 'Weibo',
  'zhihu.com': 'Zhihu', 'telegram.org': 'Telegram', 'github.com': 'GitHub', 'news.ycombinator.com': 'Hacker News',
  'producthunt.com': 'Product Hunt', 'search.brave.com': 'Brave Search', 'claude.ai': 'Claude', 'mail.google.com': 'Gmail',
};
function canonicalSource(src) {
  if (!src || src === '(direct)') return src;
  let h = src.toLowerCase().replace(/^(www|m|l|lm|amp|mobile)\./, '');
  if (!h.includes('.') && SOURCE_DOMAIN[h]) h = SOURCE_DOMAIN[h]; // bare utm_source=google
  for (const [re, canon] of SOURCE_CANON) if (re.test(h)) { h = canon; break; }
  return h;
}
function sourceLabel(src) {
  if (!src || src === '(direct)') return t('Direct');
  const c = canonicalSource(src);
  return SOURCE_NAME[c] || (src.includes('.') ? c : src);
}
function sourceIcon(src) {
  if (!src || src === '(direct)') return '<span class="favi-generic" title="Direct / none">↗</span>';
  const key = src.toLowerCase();
  const domain = src.includes('.') ? canonicalSource(src) : SOURCE_DOMAIN[key];
  if (!domain) return '<span class="favi-generic">🔗</span>';
  return `<img class="favi" loading="lazy" alt="" src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico" onerror="${GENERIC_ICON}">`;
}
const pctf = (x) => (x * 100).toFixed(1) + '%';
const dur = (ms) => ms == null ? '–' : ms >= 60000 ? `${Math.floor(ms/60000)}m ${Math.round(ms%60000/1000)}s` : `${Math.round(ms/1000)}s`;
async function guard(r) { if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); } return r; }
const get = async (p, qs = '') =>
  (await guard(await fetch(`/api/sites/${site}/${p}?period=${document.getElementById('period').value}${qs}${filterQS()}`))).json();

// mirrors shared/flags.ts bit definitions (evidence labels, §11.2)
const FLAG_LABELS = {
  0x0001: 'webdriver', 0x0002: 'automation residue', 0x0004: 'UA/env contradiction',
  0x0008: 'datacenter ASN', 0x0010: 'Sec-Fetch missing', 0x0020: 'timezone/IP mismatch',
  0x0040: 'no interaction & no leave', 0x0080: 'software WebGL', 0x0100: 'mechanical timing',
  0x0200: 'blocklisted cluster', 0x0400: 'honeypot', 0x0800: 'screen/device contradiction',
  0x1000: 'no motion data (Android)', 0x2000: 'motion perfectly static',
  0x4000: 'search referrer from datacenter', 0x8000: 'forged search referrer',
  0x10000: 'headless UA', 0x20000: 'headless window', 0x40000: 'platform/UA mismatch',
  0x80000: 'synthetic render env', 0x100000: 'HTTP/1 + modern browser',
  0x200000: 'mechanical pointer', 0x400000: 'session drift',
};
const flagNames = (bits) => Object.keys(FLAG_LABELS).filter((b) => bits & b).map((b) => FLAG_LABELS[b]);

// Plain-English names + one-line explanations for the fired-signal panel — the
// raw enum names (TZ_IP_MISMATCH …) mean nothing to a site owner. Keyed by the
// FlagName the /quality endpoint returns.
const SIGNAL_INFO = {
  WEBDRIVER: ['Automated browser', 'Reports navigator.webdriver — a real automation/headless browser'],
  AUTOMATION_RESIDUE: ['Automation tool traces', 'Globals left behind by PhantomJS / Selenium-style tools'],
  UA_CH_MISMATCH: ['Browser identity mismatch', 'The declared browser contradicts its own capabilities'],
  DATACENTER_ASN: ['Datacenter / hosting network', 'Request came from a server network, not a home/mobile ISP'],
  SEC_FETCH_MISSING: ['Missing security headers', 'Real browsers send Sec-Fetch-* headers; these did not'],
  TZ_IP_MISMATCH: ['Timezone ≠ location', "Browser timezone doesn't match the IP's country"],
  ZERO_INTERACTION_NO_LEAVE: ['No interaction at all', 'No clicks, scroll, or page-leave — nobody was really there'],
  SOFTWARE_WEBGL: ['No real GPU', 'Graphics rendered in software (SwiftShader/llvmpipe) — typical of bots'],
  MECHANICAL_TIMING: ['Machine-like timing', 'Events spaced too evenly to be human'],
  BLOCKLIST_CLUSTER: ['Known bad cluster', 'Matches a fingerprint/IP group flagged by batch analysis'],
  HONEYPOT: ['Fell for a hidden trap', 'Followed an invisible link no human can see'],
  SCREEN_DEVICE_MISMATCH: ['Fake screen / device', 'Impossible screen size or device characteristics'],
  MOBILE_NO_MOTION: ['Mobile without sensors', 'Claims to be a phone but reports no motion sensors'],
  MOTION_STATIC: ['Frozen motion sensors', 'Motion readings never change — a spoofed device'],
  SEARCH_REF_DATACENTER: ['Fake search visit (datacenter)', 'Claims a Google/Bing referral but comes from a cloud/hosting network — real searchers are on home/mobile ISPs'],
  FORGED_SEARCH_REFERRER: ['Forged search referrer', 'Referrer claims a search engine but is malformed: http, a leaked ?q= query, or navigation headers that contradict an external click'],
  HEADLESS_UA: ['Headless browser', 'The browser identifies itself as a headless automation engine (HeadlessChrome)'],
  HEADLESS_WINDOW: ['Windowless browser', 'The browser window reports zero outer size — typical of a headless / windowless runtime'],
  UA_PLATFORM_MISMATCH: ['OS spoofing', "The claimed operating system (Windows/macOS/iOS) contradicts the browser's actual platform"],
  SYNTHETIC_ENV: ['Synthetic environment', 'Renders color emoji in monochrome and has no real system fonts — a bare headless/container browser, not a real device'],
  HTTP1_MODERN_BROWSER: ['HTTP/1 with modern browser', 'Claims a modern Chrome but spoke HTTP/1.x to the edge — real Chrome negotiates HTTP/2/3; typical of scripted TLS stacks behind a spoofed UA (corporate proxies can also cause this)'],
  MOUSE_MECHANICAL: ['Mechanical pointer', 'Pointer moved with machine-like dynamics: constant speed, zero curvature, or clicks landing with no nearby movement'],
  SESSION_DRIFT: ['Session identity drift', 'Browser family, OS or language changed within one session — impossible for a real visitor; a replayed session cookie or an environment-rotating farm'],
  UNIDENTIFIED_DESKTOP: ['Unidentifiable desktop', 'A desktop device whose user agent names no known browser family and no identifiable OS. Real desktop browsers are one of six families (including the Chromium-based Chinese ones); the three conditions together measured 0.1% of healthy traffic'],
};
const signalLabel = (name) => (SIGNAL_INFO[name] || [name.toLowerCase().replace(/_/g, ' '), ''])[0];
const signalHelp = (name) => (SIGNAL_INFO[name] || ['', ''])[1];

// Per-dimension display config: tab label, column headers, filter value, the
// bar-length basis (Visitors), an optional leading icon (flag / favicon), and
// the row cells. Drives the panels, their sub-tabs, and the "All …" modal.
const utmCell = (r) => [esc(r.key), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv)];
const geoCell = (r) => [esc(r.key), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv)];
// GA4-style channel groups (sessions.channel) — label + glyph per key
const CHANNEL_LABEL = {
  direct: 'Direct', organic_search: 'Organic search', paid_search: 'Paid search',
  organic_social: 'Organic social', paid_social: 'Paid social', email: 'Email',
  ai: 'AI assistants', video: 'Video', referral: 'Referral', '(unknown)': '(unknown)',
};
const CHANNEL_ICON = {
  direct: '↗', organic_search: '🔍', paid_search: '💰', organic_social: '💬',
  paid_social: '📣', email: '✉️', ai: '🤖', video: '▶', referral: '🔗',
};
const dimConfig = {
  source:      { label: 'Sources',   note: '* Sessions that STARTED in this period, from session-level attribution. The Sessions card above counts sessions that recorded a pageview, so the two differ by sessions that only sent behaviour beacons — almost entirely bots.', headers: ['Source', 'Sessions*', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, icon: (r) => sourceIcon(r.key), cells: (r) => [`<span title="${esc(r.key)}">${esc(sourceLabel(r.key))}</span>`, fmt(r.sessions), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv)] },
  channel:     { label: 'Channels',  note: '* Sessions that STARTED in this period, from session-level attribution. The Sessions card above counts sessions that recorded a pageview, so the two differ by sessions that only sent behaviour beacons — almost entirely bots.', headers: ['Channel', 'Sessions*', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, icon: (r) => `<span class="favi-generic">${CHANNEL_ICON[r.key] || '🔗'}</span>`, cells: (r) => [te(CHANNEL_LABEL[r.key] || r.key), fmt(r.sessions), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv)] },
  page:        { label: 'Pages',     headers: ['Path', 'PV', 'Non-bot PV', 'Visitors', 'Bounces'], val: (r) => r.path, bar: (r) => r.uv, cells: (r) => [esc(r.path), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv), fmt(r.bounces)] },
  entry_page:  { label: 'Entry',     headers: ['Entry page', 'Sessions', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: (r) => [esc(r.key), fmt(r.sessions), fmt(r.uv)] },
  exit_page:   { label: 'Exit',      headers: ['Exit page', 'Sessions', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: (r) => [esc(r.key), fmt(r.sessions), fmt(r.uv)] },
  country:     { label: 'Countries', headers: ['Country', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, icon: (r) => flagEmoji(r.key), cells: (r) => [esc(countryLabel(r.key)), fmt(r.pv), fmt(r.pv_clean), fmt(r.uv)] },
  region:      { label: 'Regions',   headers: ['Region', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  city:        { label: 'Cities',    headers: ['City', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  browser:     { label: 'Browser',   headers: ['Browser', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  os:          { label: 'OS',        headers: ['OS', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  device:      { label: 'Device',    headers: ['Device', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  size:        { label: 'Size',      headers: ['Screen', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: geoCell },
  utm_medium:   { label: 'Medium',   headers: ['Medium', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  utm_campaign: { label: 'Campaign', headers: ['Campaign', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  utm_term:     { label: 'Term',     headers: ['Term', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  utm_content:  { label: 'Content',  headers: ['Content', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  ft_source:    { label: 'FT source',   headers: ['First-touch source', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  ft_medium:    { label: 'FT medium',   headers: ['First-touch medium', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  ft_campaign:  { label: 'FT campaign', headers: ['First-touch campaign', 'PV', 'Non-bot PV', 'Visitors'], val: (r) => r.key, bar: (r) => r.uv, cells: utmCell },
  goal: { label: 'Goals', headers: ['Event', 'Fires', 'Visitors', 'Revenue'], val: (r) => r.key, bar: (r) => r.uv, cells: (r) => [esc(r.key), fmt(r.pv), fmt(r.uv), r.revenue ? money(r.revenue) : '–'] },
};

// Shared table markup: proportion bar behind the first column + optional icon.
function breakdownTableHTML(dim, rows, clickable) {
  const cfg = dimConfig[dim];
  const max = Math.max(1, ...rows.map((r) => Number(cfg.bar(r)) || 0));
  return `<table><tr>${cfg.headers.map((h, i) => `<th${i ? ' class="num"' : ''}>${te(h)}</th>`).join('')}</tr>`
    + rows.map((r, idx) => {
        const cells = cfg.cells(r);
        const pct = Math.max(2, (Number(cfg.bar(r)) || 0) / max * 100);
        const icon = cfg.icon ? cfg.icon(r) : '';
        const lead = `<td class="lead"><span class="bar" style="width:${pct.toFixed(1)}%"></span>`
          + `<span class="lead-in">${icon}<span class="txt">${cells[0]}</span>${clickable ? `<span class="drill">${te('+ filter')}</span>` : ''}</span></td>`;
        return `<tr${clickable ? ' class="clickable"' : ''} data-i="${idx}">${lead}${cells.slice(1).map((c) => `<td class="num">${c}</td>`).join('')}</tr>`;
      }).join('') + '</table>'
    + (cfg.note ? `<p class="muted" style="margin:8px 0 0;font-size:11.5px">${te(cfg.note)}</p>` : '');
}

// Fold rows that canonicalise to the same platform into one (legacy data
// recorded www.google.com / google.com.hk / google as separate keys). Counts
// sum; visitors can double-count across variants, which is the lesser evil
// versus three "Google" rows. `keys` remembers the raw keys for filtering.
function mergeSources(rows) {
  const out = new Map();
  for (const r of rows) {
    const c = canonicalSource(r.key) || r.key;
    const m = out.get(c);
    if (!m) { out.set(c, { ...r, key: c, keys: [r.key] }); continue; }
    m.keys.push(r.key);
    for (const k of ['sessions', 'pv', 'pv_clean', 'uv']) if (r[k] != null) m[k] = (Number(m[k]) || 0) + Number(r[k]);
  }
  return [...out.values()].sort((a, b) => (Number(b.pv) || 0) - (Number(a.pv) || 0));
}
function prepRows(dim, rows) { return dim === 'source' ? mergeSources(rows) : rows; }

function renderBreakdown(elId, dim, rows) {
  const el = document.getElementById(elId);
  const clickable = FILTER_UI.has(dim);
  rows = prepRows(dim, rows);
  el.innerHTML = rows.length ? breakdownTableHTML(dim, rows, clickable) : `<p class="muted">${te('no data yet')}</p>`;
  if (clickable) el.querySelectorAll('tr.clickable').forEach((tr) =>
    tr.addEventListener('click', () => { const r = rows[Number(tr.dataset.i)]; addFilter(dim, dimConfig[dim].val(r), r.keys); }));
}

// ── tabbed breakdown panels (Plausible-style dimension switchers)
const PANELS = {
  sources:   ['source', 'channel'],
  pages:     ['page', 'entry_page', 'exit_page'],
  countries: ['country', 'region', 'city'],
  devices:   ['browser', 'os', 'device', 'size'],
};
const panelState = {}; // mount id → active dim
function buildTabs() {
  for (const [mount, dims] of Object.entries(PANELS)) {
    panelState[mount] = panelState[mount] || dims[0];
    const host = document.querySelector(`.tabs[data-tabs="${mount}"]`);
    if (!host) continue;
    if (dims.length <= 1) { host.innerHTML = ''; continue; }
    host.innerHTML = dims.map((d) => `<button data-dim="${d}"${d === panelState[mount] ? ' class="active"' : ''}>${te(dimConfig[d].label)}</button>`).join('');
    host.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      panelState[mount] = b.dataset.dim;
      host.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      loadPanel(mount);
    }));
  }
}
async function loadPanel(mount) {
  const dim = panelState[mount];
  const d = await get('breakdown', `&dim=${dim}`);
  renderBreakdown(mount, dim, d.rows || []);
}

// "All …" — full (top-100) list of the panel's ACTIVE dimension in the modal.
async function openAll(mount) {
  const dim = panelState[mount];
  const cfg = dimConfig[dim];
  document.getElementById('modalTitle').textContent = `${t('All')} · ${t(cfg.label)}`;
  document.getElementById('modalBody').innerHTML = `<p class="loading">${te('loading…')}</p>`;
  document.getElementById('modal').hidden = false;
  const d = await get('breakdown', `&dim=${dim}&limit=100`);
  const rows = prepRows(dim, d.rows || []);
  const clickable = FILTER_UI.has(dim);
  document.getElementById('modalBody').innerHTML = rows.length
    ? breakdownTableHTML(dim, rows, clickable)
      + (clickable ? `<p class="muted" style="font-size:12px;margin:10px 2px 0">${te('Click a row to filter the dashboard by it.')}</p>` : '')
    : `<p class="muted">${te('no data yet')}</p>`;
  if (clickable) document.getElementById('modalBody').querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', () => {
    const r = rows[Number(tr.dataset.i)]; addFilter(dim, cfg.val(r), r.keys); closeModal();
  }));
}
document.querySelectorAll('.all-btn').forEach((b) => b.addEventListener('click', () => openAll(b.dataset.panel)));

// Embed code — available at any time, not only on the first-run screen.
document.getElementById('embedBtn').addEventListener('click', async () => {
  const s = allSites.find((x) => x.site_id === site) || { site_id: site };
  document.getElementById('modalTitle').textContent = t('Embed code');
  document.getElementById('modalBody').innerHTML = `<p class="loading">${te('loading…')}</p>`;
  document.getElementById('modal').hidden = false;
  const code = await snippetFor(s);
  document.getElementById('modalBody').innerHTML = `
    <p class="muted" style="margin:0 0 10px;font-size:13px">${te('Add this to every page, before </head> or at the end of <body>.')}</p>
    <pre id="embedCode" style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:12.5px;font-family:var(--mono);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px">${esc(code)}</pre>
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
      <button class="btn" id="embedCopy">${te('Copy snippet')}</button>
      <a class="btn" href="/health.html" target="_blank" rel="noopener">${te('Run self-check')} ↗</a>
    </div>
    <p class="muted" style="font-size:12px;margin:12px 0 0">${esc(window.PVI18N.tk('embed-note', 'data-api must be your ingest host; data-adguard only matters if you protect ads. Changes reach already-embedded pages within about an hour, as the f.js cache revalidates.'))}</p>`;
  document.getElementById('embedCopy').onclick = async (ev) => {
    try { await navigator.clipboard.writeText(code); ev.target.textContent = t('Copied'); } catch { /* clipboard blocked */ }
  };
});

function closeModal() { document.getElementById('modal').hidden = true; }
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// metric + interval controls (Plausible-style). First interval per period = default.
const METRICS = [
  ['pv', 'Pageviews'], ['uv', 'Visitors'], ['sessions', 'Sessions'],
  ['pv_per_visitor', 'Pages / visitor'],
  ['bounce_rate', 'Bounce rate (engaged)'], ['bounce_rate_single', 'Bounce rate (1-page)'],
  ['avg_duration_ms', 'Engaged time'], ['visit_duration_ms', 'Visit duration'],
];
const METRIC_LABEL = Object.fromEntries(METRICS);
const INTERVALS = {
  '24h': ['hour', 'minute'],
  today: ['hour', 'minute'], yesterday: ['hour', 'minute'],
  '7d': ['day', 'hour'], this_week: ['day', 'hour'], last_week: ['day', 'hour'],
  '30d': ['day', 'week'], this_month: ['day', 'week'], last_month: ['day', 'week'], '90d': ['day', 'week'],
  this_year: ['month', 'week', 'day'],
};
const INTERVAL_LABEL = { minute: 'Minutes', hour: 'Hours', day: 'Days', week: 'Weeks', month: 'Months' };

function fmtMetric(metric, v) {
  if (v == null) return '–';
  if (metric === 'bounce_rate' || metric === 'bounce_rate_single') return (v * 100).toFixed(1) + '%';
  if (metric === 'avg_duration_ms' || metric === 'visit_duration_ms') return dur(v);
  if (metric === 'pv_per_visitor') return Number(v).toFixed(2);
  return fmt(v);
}

// Pick a "nice" axis top + gridline step so the max sits just under a round
// number and lines land on 1/2/5×10ⁿ values (462 → top 500 step 100; a few
// thousand → step 500 or 1000). Targets ~5 gridlines.
function niceScale(max) {
  if (!(max > 0)) return { top: 1, step: 1 };
  const raw = max / 5;                             // aim for ~5 intervals
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  const step = nice * pow;
  return { top: Math.ceil(max / step) * step, step };
}

function lineChart(points, metric) {
  const el = document.getElementById('chart');
  // future buckets (time hasn't arrived) are never drawn — otherwise the line
  // would dive to 0 and look like missing data. The in-progress bucket (status
  // 'partial') is drawn with a dashed connector to show it's still filling.
  const drawn = points.filter((p) => p.status !== 'future');
  const hasData = drawn.some((p) => p.value != null && p.value !== 0);
  if (!drawn.length || !hasData) { el.innerHTML = `<p class="muted">${te('no data yet')}</p>`; return; }
  const W = Math.max(240, el.clientWidth - parseFloat(getComputedStyle(el).paddingInlineStart) * 2);
  const H = Math.min(300, Math.max(180, W * 0.2)), P = 48, PT = 14;
  const max = Math.max(...drawn.map((p) => p.value ?? 0), 1);
  const { top, step } = niceScale(max);
  // x spans the full range (axis shows the whole period); future area stays empty
  const xs = (i) => P + (i * (W - P - 12)) / Math.max(points.length - 1, 1);
  const ys = (v) => H - P - ((v ?? 0) * (H - P - PT)) / top;

  // horizontal gridlines + left-axis value labels at each nice step
  const grid = [];
  for (let g = 0; g <= top + 1e-9; g += step) {
    const y = ys(g).toFixed(1);
    grid.push(`<line x1="${P}" y1="${y}" x2="${W - 12}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`
      + `<text x="${P - 8}" y="${(Number(y) + 3.5).toFixed(1)}" text-anchor="end">${esc(fmtMetric(metric, g))}</text>`);
  }

  const complete = points.map((p, i) => ({ p, i })).filter((x) => x.p.status === 'complete');
  const solid = complete.map((x) => `${xs(x.i).toFixed(1)},${ys(x.p.value).toFixed(1)}`).join(' ');
  const partialIdx = points.findIndex((p) => p.status === 'partial');
  let dashed = '';
  if (partialIdx >= 0) {
    const prev = complete.length ? complete[complete.length - 1].i : partialIdx;
    dashed = `${xs(prev).toFixed(1)},${ys(points[prev].value).toFixed(1)} ${xs(partialIdx).toFixed(1)},${ys(points[partialIdx].value).toFixed(1)}`;
  }

  // no <title> here — the crosshair readout below covers every x-position, and a
  // native tooltip would pop up alongside it
  const dot = (p, i) => p.status === 'future' ? '' :
    `<circle cx="${xs(i).toFixed(1)}" cy="${ys(p.value).toFixed(1)}" r="2.5" fill="${p.status === 'partial' ? 'var(--surface)' : 'var(--plot)'}" stroke="var(--plot)" stroke-width="${p.status === 'partial' ? 1.5 : 0}"/>`;
  const lstep = Math.ceil(points.length / Math.max(2, Math.floor((W - P) / 90)));
  const labels = points.filter((_, i) => i % lstep === 0);

  // Invalid-traffic strip: one cell per bucket, opacity = that bucket's share of
  // bot/suspect pageviews. Deliberately NOT a second line on the main axis — the
  // selected metric may be visitors / sessions / a rate, while invalid traffic is
  // counted in pageviews, so overlaying them would compare different units. As a
  // share it stays readable under any metric and answers the real question:
  // was the bad traffic one short burst, or spread across the whole period?
  const hasInvalid = drawn.some((p) => (p.invalid ?? 0) > 0);
  const SY = H - P + 12, SH = 9;               // strip sits just under the x-axis
  let strip = '';
  if (hasInvalid) {
    const cw = (W - P - 12) / Math.max(points.length, 1);
    strip = points.map((p, i) => {
      if (p.status === 'future' || !p.pv) return '';
      const share = (p.invalid ?? 0) / p.pv;
      if (share <= 0) return '';
      const x = P + i * cw;
      // floor the opacity so a small but real share is still visible
      const op = (0.18 + 0.82 * Math.min(share, 1)).toFixed(2);
      return `<rect x="${x.toFixed(1)}" y="${SY}" width="${Math.max(cw - 1, 1).toFixed(1)}" height="${SH}" rx="1.5" fill="#f87171" opacity="${op}"/>`;
    }).join('');
  }

  const VH = H + (hasInvalid ? 20 : 0);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${VH}" style="width:100%;display:block">
    ${grid.join('')}
    ${solid ? `<polyline points="${solid}" fill="none" stroke="var(--plot)" stroke-width="2"/>` : ''}
    ${dashed ? `<polyline points="${dashed}" fill="none" stroke="var(--plot)" stroke-width="2" stroke-dasharray="4 3" opacity="0.75"/>` : ''}
    ${points.map(dot).join('')}
    ${strip}
    ${hasInvalid ? `<text x="${P - 8}" y="${SY + SH - 1}" text-anchor="end" opacity="0.75">${esc(t('invalid'))}</text>` : ''}
    ${labels.map((p) => `<text x="${xs(points.indexOf(p))}" y="${VH - 6}" text-anchor="middle" ${p.status === 'future' ? 'opacity="0.4"' : ''}>${esc(p.label)}</text>`).join('')}
    <g id="chairG" opacity="0">
      <line id="chairL" y1="${PT}" y2="${H - P}" stroke="#5b6472" stroke-width="1" stroke-dasharray="3 3"/>
      <circle id="chairD" r="4" fill="var(--plot)" stroke="var(--surface)" stroke-width="2"/>
    </g>
    <rect id="chairHit" x="${P}" y="0" width="${W - P - 12}" height="${VH}" fill="transparent" style="cursor:crosshair"/>
  </svg>
  <div class="tt" id="chartTip" hidden></div>`;

  attachChartHover(el, points, metric, { W, VH, P, xs, ys });
}

// Crosshair readout: hovering anywhere along the plot snaps to the nearest
// bucket and shows its numbers — the metric value plus, when present, that
// bucket's invalid-traffic share. Bound per render; replacing el.innerHTML
// discards the previous listeners with their nodes, so nothing accumulates.
function attachChartHover(el, points, metric, geo) {
  const svg = el.querySelector('svg');
  const hit = el.querySelector('#chairHit');
  const g = el.querySelector('#chairG');
  const line = el.querySelector('#chairL');
  const dotEl = el.querySelector('#chairD');
  const tip = el.querySelector('#chartTip');
  if (!svg || !hit || !tip) return;
  // buckets that can actually be read (a 'future' one has no data yet)
  const readable = points.map((p, i) => i).filter((i) => points[i].status !== 'future');
  if (!readable.length) return;

  const pt = svg.createSVGPoint();
  const toViewX = (evt) => {
    const m = svg.getScreenCTM();
    if (!m) return null;
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(m.inverse()).x;
  };

  const show = (evt) => {
    const vx = toViewX(evt);
    if (vx == null) return;
    // nearest readable bucket to the pointer's x
    let idx = readable[0], best = Infinity;
    for (const i of readable) {
      const d = Math.abs(geo.xs(i) - vx);
      if (d < best) { best = d; idx = i; }
    }
    const p = points[idx];
    const x = geo.xs(idx), y = geo.ys(p.value);
    line.setAttribute('x1', x.toFixed(1)); line.setAttribute('x2', x.toFixed(1));
    dotEl.setAttribute('cx', x.toFixed(1)); dotEl.setAttribute('cy', y.toFixed(1));
    g.setAttribute('opacity', '1');

    const rows = [`<div class="tl">${esc(p.label)}${p.status === 'partial' ? ` <span class="tp">${esc(t('in progress'))}</span>` : ''}</div>`,
      `<div class="tv">${esc(t(METRIC_LABEL[metric] || metric))}: ${esc(fmtMetric(metric, p.value))}</div>`];
    if (p.pv) {
      const share = (p.invalid || 0) / p.pv;
      rows.push(`<div class="${share > 0 ? 'ti' : 'tl'}">${esc(t('invalid'))}: ${pctf(share)}`
        + ` <span class="tl">(${fmt(p.invalid || 0)}/${fmt(p.pv)} ${esc(t('pageviews'))})</span></div>`);
    }
    tip.innerHTML = rows.join('');
    tip.hidden = false;
    // position in CSS pixels: the viewBox is scaled to the element's width
    const rect = svg.getBoundingClientRect();
    const sx = rect.width / geo.W;
    tip.style.left = Math.max(60, Math.min(rect.width - 60, x * sx)) + 'px';
    tip.style.top = Math.max(tip.offsetHeight, y * (rect.height / geo.VH) - 10) + 'px';
  };
  const hide = () => { g.setAttribute('opacity', '0'); tip.hidden = true; };

  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);   // tap-to-read on touch devices
  hit.addEventListener('pointerleave', hide);
  el.addEventListener('pointerleave', hide);
}

function populateControls() {
  const mSel = document.getElementById('metric');
  // rebuild each call so labels follow the current language; preserve selection
  const mCur = mSel.value;
  mSel.innerHTML = METRICS.map(([v, l]) => `<option value="${v}">${te(l)}</option>`).join('');
  if (mCur) mSel.value = mCur;
  const period = document.getElementById('period').value;
  const opts = INTERVALS[period] || ['day'];
  const iSel = document.getElementById('interval');
  const cur = iSel.value;
  iSel.innerHTML = opts.map((v) => `<option value="${v}">${te(INTERVAL_LABEL[v])}</option>`).join('');
  iSel.value = opts.includes(cur) ? cur : opts[0]; // keep choice if still valid, else default
}

// KPI cards. The two bounce definitions are shown as separate cards (more
// direct than a toggle): "engaged" = GA4 style, "1-page" = UA/Plausible/Similarweb.
function renderCards(o, al) {
  const cleanShare = (o.pv ? ((o.clean_count + o.suspect_count) / o.pv) * 100 : 0).toFixed(1);
  const perVisitor = o.uv ? (o.pv / o.uv).toFixed(2) : '–';
  const pct = (v) => v == null ? '–' : (v * 100).toFixed(1) + '%';
  // k (label) and h (sub-label) are UI strings → translated; v is a value;
  // help is the long explanation, shown as a tooltip so labels stay one line.
  const card = (k, v, h, help, cls) =>
    `<div class="card${cls ? ' ' + cls : ''}"${help ? ` title="${esc(t(help))}"` : ''}><div class="v">${v}</div><div class="k">${te(k)}</div><div class="h">${h ? te(h) : ''}</div></div>`;
  // forged search-referrer traffic (the two new signals) + its share of
  // search-referred visits — makes "fake Google" visible without SQL.
  const st = (al && al.stats) || {};
  const fakeN = st.fake_search || 0;
  const fakeShare = st.search_pv ? `${(fakeN / st.search_pv * 100).toFixed(1)}% ${t('of search visits')}` : t('of search visits');
  // Two rows of six: audience volume on top, quality & outcomes below. The
  // conversion cards always render so the grid never goes ragged — a site
  // without custom events simply shows a dash.
  document.getElementById('cards').innerHTML =
    card('Visitors', fmt(o.uv), 'unique people', 'Distinct visitors (by visitor id) in this range, bots and crawlers excluded') +
    card('Sessions', fmt(o.sessions), 'visits', 'Visits — a new session starts after 30 minutes idle or at midnight') +
    card('Pageviews', fmt(o.pv), 'all traffic', 'Every recorded pageview, including traffic later judged invalid') +
    card('Pages / visitor', perVisitor, 'depth', 'Pageviews divided by visitors') +
    card('Engaged time', dur(o.avg_duration_ms), 'visible dwell', 'Average time the page was actually visible per visit, exit page included (measured, not inferred)') +
    card('Visit duration', dur(o.visit_duration_ms), 'first → last event', 'Classic session length: first to last event in the visit (Universal Analytics / Plausible definition — exit page counts as 0)') +
    card('Human share', cleanShare + '%', 'of pageviews', 'Share of pageviews not judged bot or crawler') +
    card('Bounce (engaged)', pct(o.bounce_rate), 'GA4 style', 'Visits with no engagement: under 10s, no second page, no conversion (GA4 definition)') +
    card('Bounce (1-page)', pct(o.bounce_rate_single), 'Plausible style', 'Visits that saw exactly one page (Universal Analytics / Plausible definition)') +
    card('Forged search', fmt(fakeN), fakeShare, 'Visits claiming a Google/Bing referral that the forgery checks rejected', fakeN > 0 ? 'card-warn' : '') +
    card('Conversions', o.conversions ? fmt(o.conversions) : '–', 'custom events', 'Custom events sent by your site (signup, purchase …) from clean traffic') +
    card('Revenue', o.revenue ? money(o.revenue) : '–', 'from events with revenue', 'Sum of the revenue property on custom events, in USD');
}
const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let chartData;
let chartRequest = 0;
let lastChartWidth = 0;
new ResizeObserver(([entry]) => {
  const width = entry.contentRect.width;
  if (width && width !== lastChartWidth && chartData) {
    lastChartWidth = width;
    lineChart(chartData.points, chartData.metric);
  }
}).observe(document.getElementById('chart'));

async function loadChart() {
  const request = ++chartRequest;
  const metric = document.getElementById('metric').value;
  const interval = document.getElementById('interval').value;
  document.getElementById('chartTitle').textContent = t(METRIC_LABEL[metric]);
  setTitle(); // reflect the selected metric in the tab title
  const ts = await get('timeseries', `&metric=${metric}&interval=${interval}`);
  if (request !== chartRequest) return;
  chartData = { points: ts.points, metric };
  lineChart(ts.points, metric);
}
