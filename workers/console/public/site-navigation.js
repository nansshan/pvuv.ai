/**
 * [INPUT]: 报表加载器、站点设置与页面挂载点。
 * [OUTPUT]: 导航、实时状态、漏斗与详情页初始化。
 * [POS]: 按活动标签调度查询并恢复访问偏好。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
// ── sections load ON DEMAND ────────────────────────────────────────────────
// Everything used to sit on one long page and load at once: ~15 concurrent
// requests, nearly all of them live scans over the period. On a busy site that
// meant nothing rendered at all until the slowest finished. Now opening the
// page costs the header (cards + alerts) plus ONE section, and a section runs
// its queries the first time it is opened.
const SECTION_LOADERS = {
  overview:   () => Promise.all([loadChart(), loadPanel('sources'), loadPanel('pages')]),
  audience:   () => Promise.all([loadPanel('countries'), loadPanel('devices')]),
  vitals:     async () => { await loadVitals(); document.getElementById('vitalsEmpty').hidden = !document.getElementById('vitalsSec').hidden; },
  campaigns:  () => loadUtm(),
  goals:      async () => { await loadGoals(); document.getElementById('goalsEmpty').hidden = !document.getElementById('goalsSection').hidden; },
  funnel:     async () => { await funnelsReady; runFunnel(); },
  quality:    () => Promise.all([loadQuality(), loadCrawlers(), loadEdge()]),
  adguard:    () => loadAdguard(),
  suspicious: async () => {
    // aggregated by VISITOR (one row per suspicious visitor, not per event):
    // event/session counts, worst score/verdict, union of evidence
    const tr = await get('traffic', '&min_score=30&limit=50');
    renderTraffic(tr.rows || [], TRAFFIC_FOLD);
  },
  ai:         () => loadAiReport(),
};
const SECTION_ORDER = ['overview', 'audience', 'campaigns', 'funnel', 'goals', 'vitals', 'quality', 'adguard', 'suspicious', 'ai'];

let activeSec = 'overview';
// bumped whenever the period or the filters change, so every section reloads
// the next time it is opened instead of showing the previous range's numbers
let dataGen = 0;
const secLoadedAt = new Map();

async function loadQuality() {
  const qy = await get('quality');
  donut(qy.totals);
  const firedFlags = Object.entries(qy.flags).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  document.getElementById('flags').innerHTML = firedFlags.length
    ? `<p class="muted" style="margin:0 0 10px;font-size:12px">${te('Bot-detection checks that fired on suspicious traffic — one visit can trip several.')}</p>`
      + `<table><tr><th>${te('Signal')}</th><th class="num">${te('Events')}</th></tr>` +
      firedFlags.map(([k, n]) => `<tr><td title="${esc(signalHelp(k))}">${esc(signalLabel(k))}</td><td class="num">${fmt(n)}</td></tr>`).join('') + '</table>'
    : `<p class="muted">${te('no signals fired — traffic looks clean')}</p>`;
}

async function showSection(sec, { push = true } = {}) {
  if (!Object.hasOwn(SECTION_LOADERS, sec)) sec = 'overview';
  activeSec = sec;
  document.querySelectorAll('section.sec').forEach((el) => { el.hidden = el.dataset.sec !== sec; });
  document.querySelectorAll('#secnav a').forEach((a) => a.setAttribute('aria-current', a.dataset.target === sec ? 'page' : 'false'));
  if (push) history.replaceState(null, '', '#' + sec);
  if (secLoadedAt.get(sec) === dataGen) return;      // already current
  secLoadedAt.set(sec, dataGen);
  try { await SECTION_LOADERS[sec](); } catch { secLoadedAt.delete(sec); }
}

async function load() {
  dataGen += 1;
  secLoadedAt.clear();
  // the header is the "overview" the page owes you immediately
  const ov = await get('overview');
  renderCards(ov, null);          // paint 11/12 cards the instant overview lands
  renderShadowBanner(ov);
  renderSecNav();
  const section = showSection(activeSec, { push: false });
  const al = await loadAlerts();  // alerts scans more — refine the Forged-search card when it arrives
  renderCards(ov, al);
  await section;
}

// Suspicious-visitor table: folded to the top rows so the page doesn't grow
// by fifty rows of evidence; "show all" expands in place.
const TRAFFIC_FOLD = 12;
function renderTraffic(rows, fold) {
  const el = document.getElementById('traffic');
  if (!rows.length) { el.innerHTML = `<p class="muted">${te('nothing above the threshold — looking clean')}</p>`; return; }
  const shown = rows.slice(0, fold);
  el.innerHTML = `<table class="mtable"><tr><th>${te('Visitor')}</th><th class="num">${te('Events')}</th><th class="num">${te('Sessions')}</th><th>${te('Last seen')}</th><th>${te('Where')}</th><th>${te('Agent')}</th><th class="num">${te('Max score')}</th><th>${te('Verdict')}</th><th>${te('Evidence')}</th></tr>` +
    shown.map((r) => `<tr>
      <td class="nowrap"><a href="/visitor.html?site=${encodeURIComponent(site)}&vid=${encodeURIComponent(r.visitor_id)}" title="${esc(t('Journey timeline'))}">${esc(String(r.visitor_id).slice(0, 8))}…</a></td>
      <td class="num">${fmt(r.events)}</td>
      <td class="num">${fmt(r.sessions)}</td>
      <td class="nowrap muted">${new Date(r.last_ts).toISOString().slice(5, 16).replace('T', ' ')}</td>
      <td class="nowrap">${esc(r.country ?? '–')}${r.asn_type === 'datacenter' ? ' · DC' : ''}</td>
      <td class="nowrap">${esc(r.browser ?? '–')} / ${esc(r.os ?? '–')}</td>
      <td class="num">${r.bot_score}</td>
      <td><span class="badge b-${esc(r.verdict)}">${te(r.verdict)}</span></td>
      <td class="flags">${flagNames(r.bot_flags).map(esc).join(', ') || '–'}</td>
    </tr>`).join('') + '</table>'
    + `<div class="mcards">${shown.map((r) => `<a class="mcard" href="/visitor.html?site=${encodeURIComponent(site)}&vid=${encodeURIComponent(r.visitor_id)}">
      <div class="row"><b>${esc(String(r.visitor_id).slice(0, 8))}…</b><span class="badge b-${esc(r.verdict)}">${te(r.verdict)}</span></div>
      <div class="row muted"><span>${esc(r.country ?? '–')}${r.asn_type === 'datacenter' ? ' · DC' : ''} · ${esc(r.browser ?? '–')} / ${esc(r.os ?? '–')}</span><span>${te('Max score')} ${r.bot_score}</span></div>
      <div class="row muted"><span>${fmt(r.events)} ${te('Events')} · ${fmt(r.sessions)} ${te('Sessions')}</span><span>${new Date(r.last_ts).toISOString().slice(5, 16).replace('T', ' ')}</span></div>
      <div class="flags">${flagNames(r.bot_flags).map(esc).join(', ') || '–'}</div></a>`).join('')}</div>`
    + (rows.length > shown.length
      ? `<button class="more-btn" id="trafficMore">${te('Show all')} ${rows.length}</button>`
      : (fold < rows.length + 1 && rows.length > TRAFFIC_FOLD ? `<button class="more-btn" id="trafficLess">${te('Show fewer')}</button>` : ''));
  const more = document.getElementById('trafficMore');
  if (more) more.addEventListener('click', () => renderTraffic(rows, rows.length));
  const less = document.getElementById('trafficLess');
  if (less) less.addEventListener('click', () => renderTraffic(rows, TRAFFIC_FOLD));
}

// live "online now" — polls independently of the selected period (always the
// last 30 minutes), so the header updates without reloading the whole page.
function sparkline(minutes) {
  const w = 90, h = 20, n = minutes.length, max = Math.max(...minutes, 1);
  const pts = minutes.map((v, i) => `${(i * w / Math.max(n - 1, 1)).toFixed(1)},${(h - 2 - v * (h - 4) / max).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#34d399" stroke-width="1.5"/></svg>`;
}
async function pollRealtime() {
  try {
    const r = await fetch(`/api/sites/${site}/realtime`);
    if (r.status === 401) { location.href = '/login.html'; return; }
    const d = await r.json();
    document.getElementById('realtime').innerHTML =
      `<span class="live"><span class="pulse"></span>${fmt(d.online)} ${te('online now')}</span>` +
      `<span class="muted">${fmt(d.pageviews)} ${te('views')} / ${d.window_minutes}m</span>` +
      sparkline(d.minutes || []);
  } catch { /* transient — keep the last value */ }
}

// remember the last period / metric / interval across refreshes (localStorage)
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      period: document.getElementById('period').value,
      metric: document.getElementById('metric').value,
      interval: document.getElementById('interval').value,
    }));
  } catch { /* storage unavailable — non-fatal */ }
}
function restorePrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { p = {}; }
  const has = (sel, v) => v && [...sel.options].some((o) => o.value === v);
  const periodSel = document.getElementById('period');
  if (has(periodSel, p.period)) periodSel.value = p.period; // else HTML default (today)
  populateControls();                                       // fills metric + interval opts
  const mSel = document.getElementById('metric'), iSel = document.getElementById('interval');
  if (has(mSel, p.metric)) mSel.value = p.metric;
  if (has(iSel, p.interval)) iSel.value = p.interval;
}

// fetch the owner's sites: names the header/realtime row + powers the switcher
let allSites = [];
let siteDomainPrimary = ''; // this site's first allowed domain (for the Google-search helper)
let siteShadowUntil = 0;    // record-only until this instant (0 = enforcing)
async function loadSiteName() {
  try {
    const { sites } = await (await guard(await fetch('/api/sites'))).json();
    allSites = sites || [];
    const s = allSites.find((x) => x.site_id === site);
    if (s) { if (s.name) siteName = s.name; siteDomainPrimary = siteDomain(s); siteShadowUntil = s.shadow_until || 0; }
  } catch { /* fall back to the id */ }
  document.getElementById('siteHeading').textContent = siteName;
  document.getElementById('siteDomain').textContent = siteDomainPrimary;
  document.getElementById('titleText').textContent = siteName;
  setTitle();
  const me = allSites.find((x) => x.site_id === site);
  if (me && me.has_data === 0) startOnboarding(me);
}

// ── the tracking snippet. ONE builder, used by both the first-run screen and
// the Embed-code button, so the two can never drift — the snippet has to stay
// reachable after the first visit lands, since that is when people actually go
// looking for it (adding a second domain, moving hosts, re-checking data-api).
let ingestHostCache = null;
async function ingestHost() {
  if (ingestHostCache === null) {
    let h = '';
    try { h = ((await (await fetch('/api/me')).json()).ingest_host) || ''; } catch { /* fall through */ }
    // sibling-subdomain guess only for deployments predating INGEST_HOST
    ingestHostCache = h || 'in.' + location.hostname.replace(/^(www|console)\./, '');
  }
  return ingestHostCache;
}
async function snippetFor(s) {
  const attrs = [`data-site="${s.site_id}"`, `data-api="https://${await ingestHost()}"`];
  if (s.adguard_mode && s.adguard_mode !== 'off') attrs.push(`data-adguard="${s.adguard_mode}"`);
  if (s.adclient) attrs.push(`data-adclient="${s.adclient}"`);
  return `<script defer src="${location.origin}/f.js"\n        ${attrs.join('\n        ')}><\/script>`;
}

// ── first-run: no event recorded yet → snippet + live probe instead of an
// empty dashboard. Polls /realtime every 5s; the first pageview reloads.
let onboardTimer = null;
async function startOnboarding(s) {
  document.body.classList.add('onboarding');
  document.getElementById('onboard').hidden = false;
  const code = await snippetFor(s);
  document.getElementById('onboardSnippet').textContent = code;
  document.getElementById('onboardCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(code); document.getElementById('onboardCopy').textContent = t('Copied'); } catch { /* clipboard blocked */ }
  };
  const probe = async () => {
    try {
      const d = await (await fetch(`/api/sites/${site}/realtime`)).json();
      if ((d.pageviews || 0) > 0 || (d.online || 0) > 0) { location.reload(); return; }
    } catch { /* keep listening */ }
    onboardTimer = setTimeout(probe, 5000);
  };
  probe();
}

// shadow mode (§7): while record-only, ads still load — show days left + the
// backtested "would block X%" over the selected period, and an Enforce-now button.
function renderShadowBanner(o) {
  const el = document.getElementById('shadowBanner');
  const now = Date.now();
  if (!siteShadowUntil || now >= siteShadowUntil) { el.hidden = true; return; }
  const days = Math.ceil((siteShadowUntil - now) / 86400000);
  const blocked = o && o.pv ? (((o.pv - o.clean_count) / o.pv) * 100).toFixed(1) : '0.0';
  el.hidden = false;
  const SHADOW_EN = `recording only, ads still load for {days} more day${days === 1 ? '' : 's'}. At the current tier, {blocked} of pageviews in this range would be blocked once enforcing.`;
  const body = window.PVI18N.tk('shadow-banner', SHADOW_EN)
    .replace('{days}', `<b>${days}</b>`)
    .replace('{blocked}', `<b>${esc(blocked)}%</b>`);
  el.innerHTML = `<span><b>${te('Shadow mode')}</b> — ${body}</span>`
    + `<button id="enforceBtn" class="btn warn enforce">${te('Enforce now')}</button>`;
  document.getElementById('enforceBtn').addEventListener('click', async () => {
    if (!confirm(t('Start blocking ads for suspected invalid traffic now? This ends the record-only window and can\'t be undone.'))) return;
    const r = await guard(await fetch(`/api/sites/${site}/enforce`, { method: 'POST' }));
    if (r.ok) { siteShadowUntil = 0; el.hidden = true; }
  });
}

// ── site switcher: click the name → searchable dropdown to jump to another site
function siteDomain(s) { try { return (JSON.parse(s.allowed_domains || '[]')[0]) || ''; } catch { return ''; } }
function renderSwitchList(filter) {
  const f = (filter || '').trim().toLowerCase();
  const items = allSites.filter((s) => !f
    || (s.name || '').toLowerCase().includes(f)
    || s.site_id.toLowerCase().includes(f)
    || siteDomain(s).toLowerCase().includes(f));
  const ul = document.getElementById('switchList');
  ul.innerHTML = items.length
    ? items.map((s, i) => `<li role="option" data-id="${esc(s.site_id)}" class="${s.site_id === site ? 'current' : ''}${i === 0 ? ' active' : ''}">
        <span class="nm">${esc(s.name || s.site_id)}</span>${siteDomain(s) ? `<span class="dm">${esc(siteDomain(s))}</span>` : ''}</li>`).join('')
    : '<div class="none">No sites found</div>';
  ul.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => gotoSite(li.dataset.id)));
}
function gotoSite(id) {
  if (id && id !== site) location.href = '/site.html?id=' + encodeURIComponent(id);
  else closeSwitch();
}
function openSwitch() {
  const pop = document.getElementById('switchPop');
  pop.hidden = false;
  document.getElementById('titleBtn').setAttribute('aria-expanded', 'true');
  const s = document.getElementById('switchSearch');
  s.value = ''; renderSwitchList(''); s.focus();
}
function closeSwitch() {
  document.getElementById('switchPop').hidden = true;
  document.getElementById('titleBtn').setAttribute('aria-expanded', 'false');
}
function moveActive(delta) {
  const lis = [...document.querySelectorAll('#switchList li')];
  if (!lis.length) return;
  let idx = lis.findIndex((li) => li.classList.contains('active'));
  if (idx >= 0) lis[idx].classList.remove('active');
  idx = ((idx < 0 ? 0 : idx) + delta + lis.length) % lis.length;
  lis[idx].classList.add('active');
  lis[idx].scrollIntoView({ block: 'nearest' });
}
document.getElementById('titleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('switchPop').hidden ? openSwitch() : closeSwitch();
});
document.getElementById('switchSearch').addEventListener('input', (e) => renderSwitchList(e.target.value));
document.getElementById('switchSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSwitch(); document.getElementById('titleBtn').focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter') { const a = document.querySelector('#switchList li.active'); if (a) gotoSite(a.dataset.id); }
});
document.addEventListener('click', (e) => { if (!document.getElementById('switcher').contains(e.target)) closeSwitch(); });

async function loadUtm() {
  const dim = document.getElementById('utmDim').value;
  const d = await get('breakdown', `&dim=${dim}`);
  // rows are clickable-to-filter only for the fully-supported UTM dims
  // (utm_campaign / utm_medium); the rest render as a plain table.
  renderBreakdown('utm', dim, d.rows || []);
}

// ── Funnel: user builds ordered steps (page path or event), we compute the
// first-occurrence-ordered funnel over the selected period. Steps persist per site.
// ── Funnel ────────────────────────────────────────────────────────────────
// A funnel answers three questions, in this order: how many get through, WHO
// falls out, and WHAT they were doing when they did. The last one is the
// reason we collect dwell / scroll / rage clicks / dead clicks / JS errors at
// all — a drop with "31% of them rage-clicked here" is a bug report; a drop
// without it is just a number.
//
// Definitions live on the server (saved funnels), so they follow you across
// devices and are readable by the API and the AI report. The working copy is
// still mirrored to localStorage so an unsaved edit survives a refresh.
const FUNNEL_KEY = 'pvuv.funnel.' + site;
const DEFAULT_STEPS = [{ type: 'page', value: '/' }, { type: 'event', value: '' }];
let funnels = [];            // saved definitions for this site
let currentFunnelId = null;  // null = an unsaved working copy
let funnelSteps = (() => { try { return JSON.parse(localStorage.getItem(FUNNEL_KEY)) || []; } catch { return []; } })();
if (!Array.isArray(funnelSteps) || funnelSteps.length < 2) funnelSteps = DEFAULT_STEPS.map((x) => ({ ...x }));
let funnelSuggested = false;

function saveFunnel() { try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(funnelSteps)); } catch { /* non-fatal */ } }

async function loadFunnels() {
  try { funnels = (await (await guard(await fetch(`/api/sites/${site}/funnels`))).json()).funnels || []; }
  catch { funnels = []; }
  // open the first saved funnel on arrival — a saved definition is what the
  // owner meant, the local working copy is only a scratchpad
  if (funnels.length && currentFunnelId === null && !localStorage.getItem(FUNNEL_KEY)) applyFunnel(funnels[0].funnel_id, true);
  renderFunnelPicker();
}
const funnelsReady = loadFunnels();

function renderFunnelPicker() {
  const sel = document.getElementById('funnelPick');
  sel.innerHTML = funnels.map((f) => `<option value="${esc(f.funnel_id)}"${f.funnel_id === currentFunnelId ? ' selected' : ''}>${esc(f.name)}</option>`).join('')
    + `<option value=""${currentFunnelId === null ? ' selected' : ''}>${te('Unsaved funnel')}</option>`;
  sel.hidden = false;
  document.getElementById('funnelDel').hidden = currentFunnelId === null;
  const cur = funnels.find((f) => f.funnel_id === currentFunnelId);
  document.getElementById('funnelName').value = cur ? cur.name : '';
}
function applyFunnel(id, quiet) {
  const f = funnels.find((x) => x.funnel_id === id);
  currentFunnelId = f ? f.funnel_id : null;
  if (f) funnelSteps = f.steps.map((x) => ({ ...x }));
  else { try { funnelSteps = JSON.parse(localStorage.getItem(FUNNEL_KEY)) || DEFAULT_STEPS.map((x) => ({ ...x })); } catch { funnelSteps = DEFAULT_STEPS.map((x) => ({ ...x })); } }
  renderFunnelSteps();
  renderFunnelPicker();
  if (!quiet) runFunnel();
}

function renderFunnelSteps() {
  const el = document.getElementById('funnelSteps');
  el.innerHTML = funnelSteps.map((s, i) => `<div class="fstep" data-i="${i}">
      <span class="fnum">${i + 1}</span>
      <select class="ftype"><option value="page"${s.type === 'page' ? ' selected' : ''}>${te('Page path')}</option><option value="event"${s.type === 'event' ? ' selected' : ''}>${te('Event')}</option></select>
      <input class="fval" value="${esc(s.value)}" placeholder="${s.type === 'page' ? '/pricing' : 'signup'}" aria-label="Step ${i + 1} value">
      ${funnelSteps.length > 2 ? `<button class="fx" title="${esc(t('Remove step'))}">×</button>` : ''}
    </div>`).join('');
  el.querySelectorAll('.fstep').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector('.ftype').addEventListener('change', (e) => { funnelSteps[i].type = e.target.value; saveFunnel(); renderFunnelSteps(); });
    row.querySelector('.fval').addEventListener('input', (e) => { funnelSteps[i].value = e.target.value; saveFunnel(); });
    const x = row.querySelector('.fx');
    if (x) x.addEventListener('click', () => { funnelSteps.splice(i, 1); saveFunnel(); renderFunnelSteps(); });
  });
}

const fmsg = (text, bad) => {
  const el = document.getElementById('funnelMsg');
  el.textContent = text; el.style.color = bad ? '#f87171' : '';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
};

async function saveFunnelServer() {
  const valid = funnelSteps.filter((s) => s.value && s.value.trim());
  if (valid.length < 2) { fmsg(t('Add at least 2 steps with a value, then Run.'), true); return; }
  const name = document.getElementById('funnelName').value.trim() || t('Funnel');
  try {
    const r = await guard(await fetch(`/api/sites/${site}/funnels`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ funnel_id: currentFunnelId || undefined, name, steps: valid }),
    }));
    const d = await r.json();
    if (!r.ok) { fmsg(d.error || t('save failed'), true); return; }
    currentFunnelId = d.funnel_id;
    const existing = funnels.find((f) => f.funnel_id === d.funnel_id);
    if (existing) { existing.name = d.name; existing.steps = d.steps; }
    else funnels.push({ funnel_id: d.funnel_id, name: d.name, steps: d.steps });
    try { localStorage.removeItem(FUNNEL_KEY); } catch { /* non-fatal */ }
    renderFunnelPicker();
    fmsg(t('saved'));
  } catch { fmsg(t('save failed'), true); }
}
async function deleteFunnelServer() {
  if (!currentFunnelId) return;
  if (!confirm(t('Delete this funnel?'))) return;
  try {
    await guard(await fetch(`/api/sites/${site}/funnels/${encodeURIComponent(currentFunnelId)}`, { method: 'DELETE' }));
    funnels = funnels.filter((f) => f.funnel_id !== currentFunnelId);
    currentFunnelId = null;
    applyFunnel(null);
  } catch { fmsg(t('failed'), true); }
}

// ── run + render
async function runFunnel() {
  await funnelsReady;
  const valid = funnelSteps.filter((s) => s.value && s.value.trim());
  const out = document.getElementById('funnelResult');
  if (valid.length < 2) { out.innerHTML = `<p class="fhint">${te('Add at least 2 steps with a value, then Run.')}</p>`; return; }
  const seg = document.getElementById('funnelSeg').value;
  out.innerHTML = `<p class="loading" style="margin-top:10px">${te('loading…')}</p>`;
  let d;
  try {
    d = await get('funnel', `&steps=${encodeURIComponent(JSON.stringify(valid))}${seg ? `&breakdown=${seg}` : ''}`);
  } catch { out.innerHTML = `<p class="muted">${te('funnel failed')}</p>`; return; }
  renderFunnel(d, valid);
}

/** One drop annotation: how many left, and the behaviour of the people who
 *  left, measured on the step's own page from the moment they reached it. */
function funnelDropRow(step, i, reached) {
  const f = step.friction;
  const pct = reached ? Math.round(step.dropped / reached * 100) : 0;
  const bits = [`<span class="fnum-drop">−${fmt(step.dropped)}</span> <span>${pct}% ${te('dropped here')}</span>`];
  if (f && f.droppers) {
    const share = (n) => Math.round(n / f.droppers * 100);
    if (f.avg_dwell_ms) bits.push(`<span class="fchip">${te('stayed')} ${dur(f.avg_dwell_ms)}</span>`);
    if (f.avg_scroll != null) bits.push(`<span class="fchip">${te('scrolled')} ${f.avg_scroll}%</span>`);
    if (f.rage_visitors) bits.push(`<span class="fchip bad">${share(f.rage_visitors)}% ${te('rage-clicked')}</span>`);
    if (f.dead_visitors) bits.push(`<span class="fchip warn">${share(f.dead_visitors)}% ${te('clicked something dead')}</span>`);
    if (f.err_visitors) bits.push(`<span class="fchip bad">${share(f.err_visitors)}% ${te('hit a JS error')}</span>`);
  }
  bits.push(`<button class="all-btn" data-drop="${i}">${te('see who →')}</button>`);
  return `<div class="fdrop">${bits.join(' ')}</div>`;
}

const funnelStepLabel = (s) => `${s.type === 'page' ? t('Page') : t('Event')} ${s.value}`;

function renderFunnel(d, valid) {
  const out = document.getElementById('funnelResult');
  const steps = d.steps || [];
  const top = steps[0] ? steps[0].visitors : 0;
  let html = '<div style="margin-top:10px">';
  steps.forEach((s, i) => {
    const v = s.visitors || 0;
    const pctTop = top ? (v / top * 100) : 0;
    const gap = s.median_gap_ms != null ? ` <span class="muted">· ${te('after')} ${dur(s.median_gap_ms)}</span>` : '';
    html += `<div class="frow"><div class="fbar-wrap"><div class="fbar" style="width:${Math.max(pctTop, 1).toFixed(1)}%"></div>`
      + `<span class="flabel">${i + 1}. ${esc(funnelStepLabel(s))}${gap}</span></div>`
      + `<div class="fstat"><b>${fmt(v)}</b> <span class="muted">${pctTop.toFixed(0)}%</span></div></div>`;
    if (i < steps.length - 1 && s.dropped > 0) html += funnelDropRow(s, i, v);
  });
  html += '</div>';
  if (d.breakdown) html += funnelSegTable(d.breakdown, steps);
  if (funnelSuggested) html += `<p class="fhint">${te('Suggested from your homepage and first goal — edit the steps freely; your edits are remembered.')}</p>`;
  funnelSuggested = false;
  out.innerHTML = html;
  out.querySelectorAll('[data-drop]').forEach((b) =>
    b.addEventListener('click', () => openDropoff(Number(b.dataset.drop), valid, steps)));
}

/** Per-segment ladder: where a step leaks for one audience but not the rest.
 *  "Biggest loss" names the transition that costs that segment the most, so
 *  the row is directly actionable instead of just a conversion number. */
function funnelSegTable(bd, steps) {
  let rows = (bd.rows || []).filter((r) => r.counts && r.counts[0] > 0);
  if (!rows.length) return '';
  const N = steps.length;
  // fold platform variants the same way the sources panel does, or the table
  // shows two rows both labelled "Google"
  if (bd.dim === 'source') {
    const merged = new Map();
    for (const r of rows) {
      const key = canonicalSource(r.key) || r.key;
      const m = merged.get(key);
      if (!m) { merged.set(key, { key, counts: r.counts.slice(), conv: 0 }); continue; }
      r.counts.forEach((c, i) => { m.counts[i] += c; });
    }
    rows = [...merged.values()].map((r) => ({ ...r, conv: r.counts[0] ? r.counts[N - 1] / r.counts[0] : 0 }))
      .sort((a, b) => b.counts[0] - a.counts[0]);
  }
  const enough = rows.filter((r) => r.counts[0] >= 20);
  const worst = enough.length ? enough.reduce((a, b) => (b.conv < a.conv ? b : a)) : null;
  const label = { source: 'Source', country: 'Country', device: 'Device', browser: 'Browser', os: 'OS' }[bd.dim] || bd.dim;
  const body = rows.map((r) => {
    let bi = 0, bl = -1;
    for (let i = 0; i < N - 1; i++) { const lost = r.counts[i] - r.counts[i + 1]; if (lost > bl) { bl = lost; bi = i; } }
    const isWorst = worst && r.key === worst.key;
    const name = bd.dim === 'source' ? sourceLabel(r.key) : r.key;
    return `<tr${isWorst ? ' class="worst"' : ''}>
      <td class="lead"><span class="lead-in"><span class="txt" title="${esc(r.key)}">${esc(name)}</span></span></td>
      <td class="num">${fmt(r.counts[0])}</td>
      <td class="num">${fmt(r.counts[N - 1])}</td>
      <td class="num conv">${(r.conv * 100).toFixed(1)}%</td>
      <td class="muted nowrap">${bl > 0 ? `${bi + 1}→${bi + 2} <span class="fnum-drop">−${fmt(bl)}</span>` : '–'}</td>
    </tr>`;
  }).join('');
  return `<div class="fseg"><h3>${te('Conversion by')} ${te(label)}</h3>
    <table><tr><th>${te(label)}</th><th class="num">${te('Entered')}</th><th class="num">${te('Converted')}</th><th class="num">${te('Rate')}</th><th>${te('Biggest loss')}</th></tr>
    ${body}</table>
    ${worst ? `<p class="fhint">${te('Worst converting segment with enough volume is highlighted.')}</p>` : ''}</div>`;
}

/** The people behind a drop number — one click from here to their full trail. */
async function openDropoff(i, valid, steps) {
  const title = `${t('Dropped at step')} ${i + 1} · ${funnelStepLabel(steps[i])}`;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = `<p class="loading">${te('loading…')}</p>`;
  document.getElementById('modal').hidden = false;
  let d;
  try {
    d = await get('funnel_dropoff', `&steps=${encodeURIComponent(JSON.stringify(valid))}&step=${i}&limit=100`);
  } catch { document.getElementById('modalBody').innerHTML = `<p class="muted">${te('funnel failed')}</p>`; return; }
  const rows = d.rows || [];
  document.getElementById('modalBody').innerHTML = rows.length
    ? `<table><tr><th>${te('Visitor')}</th><th>${te('Reached this step')}</th><th>${te('Where')}</th><th>${te('Device')}</th></tr>`
      + rows.map((r) => `<tr>
          <td><a href="/visitor.html?site=${encodeURIComponent(site)}&vid=${encodeURIComponent(r.visitor_id)}">${esc(String(r.visitor_id).slice(0, 8))}…</a></td>
          <td class="muted nowrap">${new Date(r.reached_at).toISOString().slice(0, 16).replace('T', ' ')}</td>
          <td class="nowrap">${flagEmoji(r.country)} ${esc(r.country || '–')}</td>
          <td class="nowrap">${esc(r.device_type || '–')}</td>
        </tr>`).join('') + '</table>'
      + `<p class="muted" style="font-size:12px;margin:10px 2px 0">${te('Open a visitor to replay everything they did before they left.')}`
        + `${rows.length >= 100 ? ` ${te('Showing the 100 most recent.')}` : ''}</p>`
    : `<p class="muted">${te('no visitors matched in this period')}</p>`;
}

document.getElementById('funnelAdd').addEventListener('click', () => { if (funnelSteps.length < 8) { funnelSteps.push({ type: 'event', value: '' }); saveFunnel(); renderFunnelSteps(); } });
document.getElementById('funnelRun').addEventListener('click', runFunnel);
document.getElementById('funnelSave').addEventListener('click', saveFunnelServer);
document.getElementById('funnelDel').addEventListener('click', deleteFunnelServer);
document.getElementById('funnelPick').addEventListener('change', (e) => applyFunnel(e.target.value || null));
document.getElementById('funnelSeg').addEventListener('change', runFunnel);

// ── Core Web Vitals: p75 + Google rating per metric, slowest pages by LCP.
// Hidden until the SDK has reported at least one measured load (clean traffic
// only, server-side). Sub-second values shown in ms, larger in seconds.
const VITAL_META = { // key → [label, help]
  lcp_ms: ['LCP', 'Largest Contentful Paint — when the main content became visible'],
  inp_ms: ['INP*', 'Interaction latency (approximation: slowest observed interaction)'],
  cls: ['CLS', 'Cumulative Layout Shift — how much the page jumped around'],
  fcp_ms: ['FCP', 'First Contentful Paint'],
  ttfb_ms: ['TTFB', 'Time To First Byte — server response speed'],
};
const RATING_META = {
  good: ['#34d399', 'Good'], needs_improvement: ['#fbbf24', 'Needs improvement'], poor: ['#f87171', 'Poor'],
};
const fmtVital = (key, v) => v == null ? '–'
  : key === 'cls' ? Number(v).toFixed(3)
  : v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms';
async function loadVitals() {
  const sec = document.getElementById('vitalsSec');
  const el = document.getElementById('vitals');
  let d;
  try { d = await get('vitals'); } catch { sec.hidden = true; return; }
  if (!d || !d.samples) { sec.hidden = true; return; }
  sec.hidden = false;
  const tiles = Object.keys(VITAL_META).map((k) => {
    const m = (d.metrics || {})[k] || {};
    const r = RATING_META[m.rating] || ['#8b93a1', ''];
    return `<div class="card" title="${esc(t(VITAL_META[k][1]))}" style="border-left:3px solid ${r[0]}">
      <div class="v">${fmtVital(k, m.p75)}</div>
      <div class="k">${esc(VITAL_META[k][0])} <span class="muted">p75</span></div>
      <div class="h" style="color:${r[0]}">${te(r[1] || '')}</div>
      <div class="h">${m.count ? `${fmt(m.count)} ${te('loads')}` : ''}</div>
    </div>`;
  }).join('');
  const pages = (d.pages || []).length
    ? `<h3 style="font-size:13px;margin:16px 0 8px">${te('Slowest pages (LCP p75)')}</h3>`
      + `<table><tr><th>${te('Path')}</th><th class="num">${te('Loads')}</th><th class="num">LCP p75</th></tr>`
      + d.pages.map((p) => `<tr><td>${esc(p.path)}</td><td class="num">${fmt(p.n)}</td>`
        + `<td class="num" style="color:${(RATING_META[p.rating] || ['var(--muted)'])[0]}">${fmtVital('lcp_ms', p.lcp_p75)}</td></tr>`).join('')
      + '</table>'
    : '';
  el.innerHTML = `<p class="muted" style="margin:0 0 10px;font-size:12px">${te('Real-user Core Web Vitals from clean traffic — the same metrics Google Search uses. p75 = 75% of page loads were at least this fast.')}</p>`
    + `<div class="cards cards-5">${tiles}</div>` + pages
    + `<p class="muted" style="margin:10px 0 0;font-size:11.5px">${te('*INP is approximated from the slowest observed interaction.')}</p>`;
}

// ── Public share: enable mints a read-only dashboard link (rotate = new link,
// disable kills it). State rides on /api/sites (public_token).
function shareState() { const s = allSites.find((x) => x.site_id === site); return s ? s.public_token : null; }
function renderShareModal() {
  const tok = shareState();
  document.getElementById('modalTitle').textContent = t('Public dashboard');
  const body = document.getElementById('modalBody');
  if (tok) {
    const shareUrl = `${location.origin}/public.html?site=${encodeURIComponent(site)}&k=${encodeURIComponent(tok)}`;
    body.innerHTML = `<p style="margin:4px 0 10px">${te('Sharing is ON — anyone with this link can view a read-only dashboard (aggregates only, no visitor-level data).')}</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input id="shareUrl" readonly value="${esc(shareUrl)}" style="flex:1;background:var(--bg);color:inherit;border:1px solid var(--border-2);border-radius:6px;padding:7px 9px;font:12.5px ui-monospace,monospace">
        <button id="shareCopy" class="btn">${te('Copy')}</button>
      </div>
      <div style="display:flex;gap:8px">
        <button id="shareRotate" class="btn">${te('Rotate link')}</button>
        <button id="shareOff" class="btn danger">${te('Disable sharing')}</button>
      </div>`;
    document.getElementById('shareCopy').addEventListener('click', async () => {
      const inp = document.getElementById('shareUrl');
      inp.select();
      try { await navigator.clipboard.writeText(inp.value); } catch { document.execCommand('copy'); }
      document.getElementById('shareCopy').textContent = t('Copied!');
    });
    document.getElementById('shareRotate').addEventListener('click', () => setShare(true));
    document.getElementById('shareOff').addEventListener('click', () => setShare(false));
  } else {
    body.innerHTML = `<p style="margin:4px 0 14px">${te('Create a read-only public link for this site — overview, trend, top pages, channels, quality and Web Vitals. No visitor-level data is exposed, and you can revoke the link at any time.')}</p>
      <button id="shareOn" class="btn primary">${te('Enable sharing')}</button>`;
    document.getElementById('shareOn').addEventListener('click', () => setShare(true));
  }
  document.getElementById('modal').hidden = false;
}
async function setShare(enable) {
  try {
    const r = await guard(await fetch(`/api/sites/${site}/share`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enable }),
    }));
    const d = await r.json();
    if (!r.ok) return;
    const s = allSites.find((x) => x.site_id === site);
    if (s) s.public_token = enable ? d.token : null;
    renderShareModal();
  } catch { /* leave the modal as-is */ }
}
document.getElementById('shareBtn').addEventListener('click', renderShareModal);

// Goals = custom (non-lifecycle) events; the panel hides itself when the site
// sends none, so it never clutters sites that don't use pvuv('event', …).
async function loadGoals() {
  const sec = document.getElementById('goalsSection');
  let rows = [];
  try { rows = (await get('breakdown', '&dim=goal')).rows || []; } catch { sec.hidden = true; loadCtit(false); return; }
  if (!rows.length) { sec.hidden = true; loadCtit(false); return; }
  sec.hidden = false;
  renderBreakdown('goals', 'goal', rows);
  loadCtit(true);
  // first visit: the default funnel is "/ → (event)". Fill the event with the
  // site's first goal and run it, so the section shows a result instead of a
  // "add a step" prompt. Only touches an untouched default (never a saved one).
  await funnelsReady;
  const untouched = !funnels.length && currentFunnelId === null
    && funnelSteps.length === 2 && funnelSteps[0].type === 'page' && funnelSteps[0].value === '/'
    && funnelSteps[1].type === 'event' && !funnelSteps[1].value && !localStorage.getItem(FUNNEL_KEY);
  if (untouched && rows[0] && rows[0].key) {
    funnelSteps[1].value = rows[0].key; renderFunnelSteps(); funnelSuggested = true; runFunnel();
  }
}

// Conversion-timing distribution (CTIT): how long after the session started
// each goal event fired. Fraud shapes: a 0–10s spike = conversions faster than
// a human plausibly acts; a near-flat histogram at volume = flooding-like.
async function loadCtit(hasGoals) {
  const sec = document.getElementById('ctitSection');
  if (!hasGoals) { sec.hidden = true; return; }
  const el = document.getElementById('ctit');
  let d;
  try { d = await get('ctit'); } catch { sec.hidden = true; return; }
  if (!d || !d.n) { sec.hidden = true; return; }
  sec.hidden = false;
  const max = Math.max(1, ...d.buckets.map((b) => b.n));
  const bars = d.buckets.map((b) => `
    <div style="display:flex;align-items:center;gap:10px;margin:3px 0">
      <span class="muted" style="width:56px;text-align:right;font-size:12px">${esc(b.label)}</span>
      <div style="flex:1;background:var(--surface-2);border-radius:4px;height:14px;overflow:hidden">
        <div style="width:${(b.n / max * 100).toFixed(1)}%;height:100%;background:${b.label === '<10s' && d.flag ? 'var(--bad)' : '#3b82f6'}"></div>
      </div>
      <span class="num" style="width:70px;font-size:12px">${fmt(b.n)} <span class="muted">${pctf(b.n / d.n)}</span></span>
    </div>`).join('');
  el.innerHTML =
    `<p class="muted" style="margin:0 0 10px;font-size:12px">${te('Time from session start to each conversion (clean traffic). A spike under 10s means conversions faster than a human plausibly acts; a flat spread at volume suggests flooding.')}</p>`
    + bars
    + `<p class="muted" style="margin:10px 0 0;font-size:12.5px">${fmt(d.n)} ${te('conversions')} · ${te('median')} ${dur(d.median_ms)}`
    + (d.flag === 'fast_spike'
      ? ` · <span style="color:var(--bad)">${te('⚠ suspicious: ')}${pctf(d.fast_share)} ${te('convert within 10s of arriving')}</span>` : '')
    + '</p>';
}
document.getElementById('utmDim').addEventListener('change', loadUtm);
document.getElementById('period').addEventListener('change', () => { populateControls(); savePrefs(); load(); });
document.getElementById('metric').addEventListener('change', () => { savePrefs(); loadChart(); });
document.getElementById('interval').addEventListener('change', () => { savePrefs(); loadChart(); });

restorePrefs();
loadFilters();
renderFilters();
buildTabs();
renderFunnelSteps();

// ── section nav: one pill per visible section; the active pill follows the
// scroll position. Hidden sections (no goals / no vitals yet) are skipped, so
// the nav always reflects what the page actually shows.
const SEC_LABEL = { overview: 'Overview', trend: 'Trend', sources: 'Sources', audience: 'Audience', vitals: 'Web Vitals', campaigns: 'Campaigns', goals: 'Goals', funnel: 'Funnel', quality: 'Traffic quality', adguard: 'Ad protection', suspicious: 'Suspicious', ai: 'AI report' };
// The nav is a TAB BAR now, not a scroll-spy: every entry is always listed
// (a stable set is easier to navigate than one that grows as data loads), and
// clicking one swaps the visible section and loads it if it has not been
// opened for the current period/filters yet.
const sectionIcons = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  audience: 'M16 20v-2a5 5 0 0 0-10 0v2 M11 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 6a3 3 0 0 1 0 5 M19 15q3 1 3 5',
  campaigns: 'M3 9h5l12-5v16L8 15H3z M6 15l2 6h3l-2-6',
  funnel: 'M3 4h18l-7 9v6l-4 2v-8z',
  goals: 'M12 3a9 9 0 1 0 .01 0z M12 7a5 5 0 1 0 .01 0z M12 11v2',
  vitals: 'M2 13h5l3-8 4 15 3-9 2 2h3',
  quality: 'M3 20V5 M3 20h18 M8 16v-4 M13 16V7 M18 16v-6',
  adguard: 'M12 3l8 3v6q0 6-8 10-8-4-8-10V6z M8 12l3 3 5-6',
  suspicious: 'M10 3a7 7 0 1 0 .01 0z M15 15l6 6 M10 7v4 M10 13v1',
  ai: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
};
function renderSecNav() {
  const ul = document.getElementById('secnav');
  ul.innerHTML = SECTION_ORDER
    .map((sec) => `<li><a href="#${sec}" data-target="${sec}"${sec === activeSec ? ' aria-current="page"' : ''}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="${sectionIcons[sec]}"/></svg>${te(SEC_LABEL[sec] || sec)}</a></li>`)
    .join('');
  ul.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(a.dataset.target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}
window.addEventListener('hashchange', () => showSection(location.hash.slice(1), { push: false }));
// load the site meta (name, domain, shadow_until) before the first render so the
// header and shadow banner are correct on first paint
loadBrand();
// language switcher: mount the picker, apply static labels, and on change
// re-render everything that builds text dynamically (charts, tables, panels).
window.PVI18N.mountSelect(document.getElementById('lang'));
window.PVI18N.applyStatic();
document.addEventListener('pvuv:lang', () => {
  buildTabs();
  populateControls();
  renderFilters();
  renderFunnelSteps();
  setTitle();
  load();          // reloads the header + whichever section is open
  pollRealtime();
  loadAnomalies();
});

(async () => {
  const deep = location.hash.slice(1);
  if (Object.hasOwn(SECTION_LOADERS, deep)) activeSec = deep;   // honour a shared #section link
  await loadSiteName(); load(); pollRealtime(); loadAnomalies();
})();
setInterval(pollRealtime, 15000);
