/**
 * [INPUT]: 站点指标、统计接口与语言字典。
 * [OUTPUT]: 质量诊断、防护、AI 报告与数据导出。
 * [POS]: 专题报表复用详情页的筛选范围。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
function donut(t) {
  const total = t.clean + t.suspect + t.bot + t.crawler || 1;
  const colors = { clean: '#34d399', suspect: '#fbbf24', bot: '#f87171', crawler: '#64748b' };
  let off = 0;
  const C = 2 * Math.PI * 40;
  const segs = Object.keys(colors).map((k) => {
    const frac = t[k] / total;
    const seg = `<circle r="40" cx="60" cy="60" fill="none" stroke="${colors[k]}" stroke-width="16"
      stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}"
      transform="rotate(-90 60 60)"/>`;
    off += frac;
    return seg;
  }).join('');
  const T = window.PVI18N.t; // `t` is the totals param here, so alias the translator
  document.getElementById('quality').innerHTML = `
    <div style="display:flex;gap:20px;align-items:center">
      <svg viewBox="0 0 120 120" width="130">${segs}
        <text x="60" y="58" text-anchor="middle" style="font-size:15px;fill:var(--text);font-weight:700">${((t.clean + t.suspect) / total * 100).toFixed(1)}%</text>
        <text x="60" y="74" text-anchor="middle">${esc(T('counted'))}</text></svg>
      <div class="legend" style="flex-direction:column;align-items:flex-start">
        <span><i class="dot" style="background:#34d399"></i>${esc(T('clean'))} ${fmt(t.clean)}</span>
        <span><i class="dot" style="background:#fbbf24"></i>${esc(T('suspect'))} ${fmt(t.suspect)} <span class="muted">${esc(T('(counted, flagged)'))}</span></span>
        <span><i class="dot" style="background:var(--bad)"></i>${esc(T('bot'))} ${fmt(t.bot)} <span class="muted">${esc(T('(excluded)'))}</span></span>
        <span><i class="dot" style="background:#64748b"></i>${esc(T('verified crawler'))} ${fmt(t.crawler)} <span class="muted">${esc(T('(separate)'))}</span></span>
      </div>
    </div>`;
}

// "Unreasonable data" alerts — self-contained plausibility checks (server-side).
// Crawler categories (§6.6) — only rendered when the deployer has imported a
// bot directory AND some traffic matched it. Descriptive: it says which KINDS
// of crawlers visited, and changes nothing about how they were scored.
async function loadCrawlers() {
  const sec = document.getElementById('crawlerSec');
  const el = document.getElementById('crawlers');
  let rows = [];
  try { rows = (await get('breakdown', '&dim=bot_category&limit=50')).rows || []; }
  catch { sec.hidden = true; return; }
  if (!rows.length) { sec.hidden = true; return; }   // no directory, or no match
  sec.hidden = false;
  const total = rows.reduce((a, r) => a + (r.pv || 0), 0) || 1;
  el.innerHTML = `<p class="muted" style="margin:0 0 10px;font-size:12px">${te('Identified crawler traffic grouped by what the crawler is for. Classification only — these visits are scored exactly as before.')}</p>`
    + `<table><tr><th>${te('Category')}</th><th class="num">${te('PV')}</th><th class="num">${te('Visitors')}</th><th class="num">${te('Share')}</th></tr>`
    + rows.map((r) => `<tr><td>${esc(t(CRAWLER_CAT[r.key] || r.key))}</td>`
        + `<td class="num">${fmt(r.pv)}</td><td class="num">${fmt(r.uv)}</td>`
        + `<td class="num">${pctf((r.pv || 0) / total)}</td></tr>`).join('')
    + '</table>';
}
// Cloudflare edge requests (§6.7) — only rendered when the deployer configured
// a Cloudflare API token AND at least one completed day has been pulled.
//
// This panel exists because the beacon has a blind spot it cannot report on:
// anything that fetches HTML without running JavaScript is absent from every
// other number on this page. Cloudflare counted those requests, so the gap
// between the two is measurable — and it is where AI crawlers live.
async function loadEdge() {
  const sec = document.getElementById('edgeSec');
  const el = document.getElementById('edge');
  let d;
  try { d = await get('edge'); } catch { sec.hidden = true; return; }
  if (!d || !d.available) { sec.hidden = true; return; }
  sec.hidden = false;
  const tt = d.totals || {};
  // today is deliberately absent (its edge counts are still accumulating), so
  // say which range these numbers actually cover rather than implying the
  // selected period
  const covered = d.days && d.days.length
    ? `${esc(d.days[0].day)} → ${esc(d.days[d.days.length - 1].day)}` : '';
  const agents = (d.agents || []).slice(0, 15);
  el.innerHTML =
    `<p class="muted" style="margin:0 0 10px;font-size:12px">${te('Requests Cloudflare served for this site, next to the pageviews the tracking script reported. The difference is HTML that was fetched without ever running JavaScript — AI crawlers, scrapers and feed readers. Descriptive only: none of this affects scoring, verdicts or ad protection.')}`
      + (covered ? ` <span style="opacity:.7">(${covered})</span>` : '') + '</p>'
    + '<div class="grid2" style="margin-bottom:12px">'
      + `<div><table><tr><th>${te('Measure')}</th><th class="num">${te('Requests')}</th></tr>`
        + `<tr><td>${te('Edge HTML requests')}</td><td class="num">${fmt(tt.html_requests)}</td></tr>`
        + `<tr><td>${te('Browser pageviews')}</td><td class="num">${fmt(tt.pv)}</td></tr>`
        + `<tr><td><b>${te('Gap — fetched, never ran JS')}</b></td>`
          + `<td class="num"><b>${fmt(tt.gap)}</b> <span class="muted">${pctf(tt.gap_share)}</span></td></tr>`
        + `<tr><td class="muted">${te('All edge requests (assets included)')}</td><td class="num muted">${fmt(tt.requests)}</td></tr>`
        + '</table></div>'
      + '<div>' + (agents.length
        ? `<table><tr><th>${te('User agent')}</th><th class="num">${te('Requests')}</th></tr>`
          + agents.map((a) => `<tr><td title="${esc(a.user_agent)}" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.user_agent)}</td>`
            + `<td class="num">${fmt(a.requests)}</td></tr>`).join('')
          + '</table>'
        : `<p class="muted">${te('no data yet')}</p>`) + '</div>'
    + '</div>';
}

// friendly names for the categories the public directories use; unknown keys
// fall through to the raw value so a new category is never hidden
const CRAWLER_CAT = {
  ai_agent_declared: 'AI agent (declared)',
  search: 'Search engine', ai_training: 'AI training', ai: 'AI', ai_assistant: 'AI assistant',
  ai_search: 'AI search', seo: 'SEO tool', advertising: 'Ad verification', ads: 'Ad verification',
  monitoring: 'Monitoring', security: 'Security scanner', archive: 'Archiving',
  social: 'Social preview', academic: 'Academic', accessibility: 'Accessibility',
  aggregator: 'Aggregator', page_preview: 'Link preview', uncategorized: 'Uncategorised',
};

// Traffic-health strip — every ratio the alert rules watch, shown ALWAYS with
// its distance to the threshold. Alerts only appear once a line is crossed, so
// without this a site owner can't see where they actually stand (or that a
// number is climbing) until it is already a problem.
function renderHealth(res) {
  const el = document.getElementById('health');
  if (!el) return;
  const st = (res && res.stats) || {};
  const th = (res && res.thresholds) || {};
  const pv = st.pv || 0;
  if (!pv) { el.innerHTML = `<p class="muted">${te('no data yet')}</p>`; return; }

  // value/limit are fractions; `of` names the denominator so the number is unambiguous
  const metrics = [
    { k: 'Invalid traffic', v: (st.invalid || 0) / pv, lim: th.invalid_share,
      n: st.invalid || 0, of: 'of pageviews', help: 'Pageviews judged bot or suspect' },
    { k: 'Datacenter traffic', v: (st.datacenter || 0) / pv, lim: th.datacenter_share,
      n: st.datacenter || 0, of: 'of pageviews', help: 'From cloud/hosting networks rather than home or mobile ISPs' },
    { k: 'No-interaction visits', v: (st.zero_interaction || 0) / pv, lim: th.zero_interaction_share,
      n: st.zero_interaction || 0, of: 'of pageviews', help: 'No click, scroll or page-leave in the whole session' },
    // MUST use the same ratio the alert rule uses (forged / all pageviews), or
    // the strip would show "over the line" while no alert fires. The share of
    // search visits is context only — it rides in the sub-line, not the bar.
    { k: 'Forged search referrals', v: (st.fake_search || 0) / pv, lim: th.fake_search_share,
      n: st.fake_search || 0, of: 'of pageviews', help: 'Claim a search-engine referral that looks forged',
      extra: st.search_pv
        ? t('{n} of {m} search visits').replace('{n}', fmt(st.fake_search || 0)).replace('{m}', fmt(st.search_pv))
        : t('no search traffic in this period') },
  ];

  el.innerHTML = `<div class="health">` + metrics.map((m) => {
    const lim = typeof m.lim === 'number' && m.lim > 0 ? m.lim : null;
    const ratio = lim ? m.v / lim : 0;                       // 1.0 = exactly at the line
    const cls = !lim ? 'ok' : ratio >= 1 ? 'over' : ratio >= 0.75 ? 'near' : 'ok';
    // scale so the threshold marker sits at 75% of the bar; clamp the fill
    const fill = Math.max(2, Math.min(100, (lim ? ratio * 75 : m.v * 100)));
    const note = !lim ? ''
      : cls === 'over' ? t('over the {x} alert line').replace('{x}', pctf(lim))
      : t('alert line {x}').replace('{x}', pctf(lim));
    return `<div class="hm ${cls}" title="${esc(t(m.help))}">
      <div class="hl"><span>${te(m.k)}</span><span>${fmt(m.n)}</span></div>
      <div class="hv">${pctf(m.v)}</div>
      <div class="hbar"><i style="width:${fill.toFixed(1)}%"></i>${lim ? '<span class="lim" style="left:75%"></span>' : ''}</div>
      <div class="sub">${te(m.of)}${note ? ' · ' + esc(note) : ''}${m.extra ? '<br>' + esc(m.extra) : ''}</div>
    </div>`;
  }).join('') + `</div>`
    + (res && res.muted ? `<p class="muted" style="margin:10px 0 0;font-size:12px">${te('Sample too small for alerts — shown for reference only.')}</p>` : '');
}

// Alert bodies arrive from the API as finished English sentences with the
// numbers already interpolated, so they can't go through the plain string
// table. Each alert also carries `values`, which lets the console rebuild the
// same sentence from a translatable template — same approach as anomalyText.
// Falls back to the server's English detail for any id added later.
const ALERT_DETAIL = {
  invalid_share: ['alert-invalid', '{share} of pageviews are bot/suspect (alert above {threshold}).'],
  datacenter: ['alert-datacenter', '{share} of pageviews come from cloud/hosting IPs (alert above {threshold}).'],
  fake_search: ['alert-fake-search', '{share} of pageviews claim a search referrer but look forged (alert above {threshold}).'],
  zero_interaction: ['alert-zero-interaction', '{share} of pageviews had no pointer / keyboard input and no leave signal (alert above {threshold}).'],
  bounce_low: ['alert-bounce-low', 'Single-page bounce is only {share} — real audiences rarely fall below {threshold}; often automated multi-hit traffic.'],
  pages_per_visitor: ['alert-ppv', '{value} pages/visitor (alert above {threshold}) — can indicate scraping.'],
  source_concentration: ['alert-source-concentration', '“{key}” is {share} of sessions (alert above {threshold}) — check for referral spam or forged referrers.'],
};
function alertText(a) {
  const tpl = ALERT_DETAIL[a.id];
  if (!tpl || !a.values) return a.detail;
  return Object.entries(a.values).reduce((str, [k, v]) => str.split(`{${k}}`).join(v), window.PVI18N.tk(tpl[0], tpl[1]));
}

// Returns the full payload so renderCards can reuse its stats (forged-search etc.).
async function loadAlerts() {
  const el = document.getElementById('alerts');
  let res = { alerts: [], stats: {} };
  try { res = await get('alerts'); } catch { el.innerHTML = ''; renderHealth(null); return res; }
  el.innerHTML = (res.alerts || []).map((x) => {
    const crit = x.severity === 'critical';
    // say so when the numbers describe the filtered slice rather than the site
    const scope = res.filtered ? ` <span class="muted" style="font-weight:400">${te('· within the current filter')}</span>` : '';
    return `<div class="alert alert-${crit ? 'critical' : 'warning'}"><span class="ico">${crit ? '⛔' : '⚠️'}</span>`
      + `<span class="body"><b>${esc(te(x.title))}</b>${scope}<span>${esc(alertText(x))}</span></span></div>`;
  }).join('');
  renderHealth(res); // the strip shows the same ratios even when nothing trips
  return res;
}

// Baseline anomalies (daily cron output) — historical, not period-scoped, so
// fetched directly once rather than through the period-aware get().
async function loadAnomalies() {
  const el = document.getElementById('anomalies');
  let list = [];
  try {
    const r = await guard(await fetch(`/api/sites/${site}/anomalies`));
    list = (await r.json()).anomalies || [];
  } catch { el.innerHTML = ''; return; }
  el.innerHTML = list.length
    ? `<div class="anomaly-hd">${te('Recent anomalies (vs baseline)')}</div>`
      + list.map((a) => `<div class="anomaly"><span class="ico">${a.kind === 'drop' ? '📉' : a.kind === 'concentration' ? '🎯' : '📈'}</span>`
        + `<span class="day">${esc(a.day)}</span><span>${esc(anomalyText(a))}</span></div>`).join('')
    : '';
}
// The cron stores an English sentence; other languages rebuild it from the
// structured fields (dimension / baseline / actual / deviation) so the banner
// reads natively. Shapes without enough structure (distribution findings)
// keep the server text.
function anomalyText(a) {
  if (window.PVI18N.lang === 'en') return a.message;
  const x = (n, d = 1) => Number(n).toFixed(d);
  // ratio recomputed from the raw numbers so the text never depends on how a
  // given cron version encoded `deviation`
  const ratio = a.baseline ? a.actual / a.baseline : a.deviation;
  const fill = (key, en, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), window.PVI18N.tk(key, en));
  if ((a.dimension === 'pageviews' || a.dimension === 'pv') && a.kind === 'spike')
    return fill('anom-pv-spike', 'Pageviews {x}× the recent average ({from} → {to})', { x: x(ratio), from: fmt(Math.round(a.baseline)), to: fmt(a.actual) });
  if ((a.dimension === 'pageviews' || a.dimension === 'pv') && a.kind === 'drop')
    return fill('anom-pv-drop', 'Pageviews fell to {pct}% of the recent average ({from} → {to})', { pct: Math.round(ratio * 100), from: fmt(Math.round(a.baseline)), to: fmt(a.actual) });
  if (a.dimension === 'invalid_share')
    return fill('anom-invalid', 'Invalid traffic {now}% of pageviews vs {base}% baseline', { now: Math.round(a.actual * 100), base: Math.round(a.baseline * 100) });
  if (String(a.dimension).startsWith('dist:') && a.top_sig)
    return fill('anom-dist', '{what}: “{top}” is {now}% of clean {unit} vs {base}% baseline', {
      what: t(a.dimension === 'dist:device' ? 'Clean traffic collapsed onto one device profile' : 'Clean visits concentrated on one landing page'),
      top: a.top_sig, now: Math.round(a.actual * 100), base: Math.round(a.baseline * 100), unit: t(a.unit || 'pageviews') });
  if (String(a.dimension).startsWith('source:'))
    return fill('anom-source', 'Traffic from “{src}” {x}× its recent average ({from} → {to} visitors)', { src: sourceLabel(a.dimension.slice(7)), x: x(ratio), from: fmt(Math.round(a.baseline)), to: fmt(a.actual) });
  return a.message;
}

// ── AI report ──────────────────────────────────────────────────────────────
// Tiny, safe Markdown → HTML (headings / bold / code / bullet lists / paras).
// Content is escaped BEFORE any formatting, so the model's output can never
// inject markup — only the whitelisted transforms below produce tags.
function mdInline(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}
function mdToHtml(src) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  let html = '', inList = false, m;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const t = esc(raw).trim();
    if (!t) { closeList(); continue; }
    if ((m = t.match(/^#{1,6}\s+(.*)$/))) { closeList(); html += `<h3>${mdInline(m[1])}</h3>`; }
    else if ((m = t.match(/^[-*]\s+(.*)$/))) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${mdInline(m[1])}</li>`; }
    else { closeList(); html += `<p>${mdInline(t)}</p>`; }
  }
  closeList();
  return html;
}
function renderReport(rep) {
  const el = document.getElementById('aiReport');
  if (!rep || !rep.content) { el.innerHTML = `<p class="muted">${te('No report yet — click Generate to analyze the selected period.')}</p>`; return; }
  const when = rep.created_at ? new Date(rep.created_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  el.innerHTML = `<div class="ai-md">${mdToHtml(rep.content)}</div>`
    + `<p class="muted" style="margin:12px 0 0;font-size:12px">${esc(rep.period || '')}${when ? ' · generated ' + esc(when) : ''}</p>`;
}
async function loadAiReport() {
  const btn = document.getElementById('aiGen');
  try {
    const d = await (await guard(await fetch(`/api/sites/${site}/ai_report`))).json();
    if (!d.configured) {
      btn.disabled = true;
      btn.title = 'Configure an AI provider in Settings first';
      document.getElementById('aiReport').innerHTML =
        '<p class="muted">AI reports are not configured. Set a provider, model and API key under <a href="/sites.html" style="color:var(--link);text-decoration:none">Settings ⚙</a>.</p>';
      return;
    }
    btn.disabled = false;
    renderReport(d.report);
  } catch { /* non-fatal */ }
}
document.getElementById('aiGen').addEventListener('click', async () => {
  const btn = document.getElementById('aiGen'), el = document.getElementById('aiReport');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = t('Generating…');
  el.innerHTML = '<p class="muted">Analyzing traffic and writing the report — this can take up to a minute.</p>';
  try {
    const r = await guard(await fetch(`/api/sites/${site}/ai_report?period=${document.getElementById('period').value}`, { method: 'POST' }));
    const d = await r.json();
    if (!r.ok) el.innerHTML = `<p class="err" style="color:var(--bad)">${esc(d.error || t('generation failed'))}</p>`;
    else renderReport(d);
  } catch { el.innerHTML = `<p class="err" style="color:var(--bad)">${te('generation failed')}</p>`; }
  finally { btn.disabled = false; btn.textContent = label; }
});

// ── Ad protection panel (§7.5 / §11.5): current tier + per-tier impact estimate
// (block rate & est. false-positive), block reasons, top blocked sources, and a
// block-volume sparkline. The tier can be switched here and applies via /v with
// no re-embed.
// The stored values stay loose/balanced/strict (the SDK and /v depend on them),
// but they are NOT displayed under those names: "loose" blocks everything that
// isn't clean, which is MORE than "balanced" — on one production site 84.2% vs
// 56.8%. Anyone reading the three words in order concluded the opposite of what
// the tiers do, so the UI names them by what they block and lists them in
// ascending strength.
const MODE_HELP = {
  off: 'ads always load — protection disabled',
  loose: 'load ads only for clean traffic (blocks all suspect + bad)',
  balanced: 'block bots/crawlers always; suspect only without interaction',
  strict: 'load ads only for clean traffic that also interacted',
};
const MODE_LABEL = {
  off: 'Off',
  balanced: 'Balanced — bots & crawlers',
  loose: 'Aggressive — everything not clean',
  strict: 'Strictest — clean + interacted',
};
// ascending block rate, so the table reads as a strength ladder
const TIER_ORDER = ['balanced', 'loose', 'strict'];
async function loadAdguard() {
  const el = document.getElementById('adguard');
  let d;
  try { d = await get('adguard'); } catch { el.innerHTML = `<p class="muted">${te('no data yet')}</p>`; return; }
  const MODES = ['off', ...TIER_ORDER];
  const tierRow = (name) => {
    const t = d.tiers[name]; if (!t) return '';
    const cur = d.current_mode === name;
    return `<tr${cur ? ' style="background:var(--info-bg)"' : ''}>
      <td>${te(MODE_LABEL[name] || name)}${cur ? ` <span class="muted">${te('· current')}</span>` : ''}</td>
      <td class="num">${pctf(t.block_rate)}</td>
      <td class="num">${fmt(t.block)}</td>
      <td class="num">${pctf(t.fp_rate)}</td></tr>`;
  };
  const reasons = (d.reasons || []).map((r) =>
    `<tr><td title="${esc(signalHelp(r.flag))}">${esc(signalLabel(r.flag))}</td><td class="num">${fmt(r.n)}</td></tr>`).join('');
  // same platform folding as the Top-sources panel, so "Google" is one row here too
  const sources = mergeSources((d.sources || []).map((s) => ({ ...s, key: s.source ?? '(direct)' }))).map((s) =>
    `<tr><td title="${esc(s.keys.join(', '))}">${esc(sourceLabel(s.key))}</td><td class="num">${fmt(s.sessions)}</td><td class="num">${fmt(s.pv)}</td></tr>`).join('');
  const trend = (d.trend || []).map((x) => x.blocked);
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label style="font-size:13px">${te('Mode')}
        <select id="agModeSel" style="margin-left:6px;background:var(--bg);color:inherit;border:1px solid var(--border-2);border-radius:6px;padding:5px 8px;font:inherit">
          ${MODES.map((m) => `<option value="${m}"${m === d.current_mode ? ' selected' : ''}>${te(MODE_LABEL[m] || m)}</option>`).join('')}
        </select>
      </label>
      <span class="muted" id="agModeMsg" style="font-size:12px">${te(MODE_HELP[d.current_mode] || '')}</span>
    </div>
    <p class="muted" style="margin:14px 0 6px;font-size:12px">${te('Estimated impact over this period')} (${fmt(d.pv)} ${te('pageviews')}). ${esc(window.PVI18N.tk('fp-explainer', '"Est. false-positive" = share of blocked traffic that showed pointer or keyboard input. Visits recorded before the pointer split fall back to the old any-interaction bit, which counted scrolling — a scraper scrolls too, so those days read high.'))}</p>
    <table><tr><th>${te('Tier')}</th><th class="num">${te('Block rate')}</th><th class="num">${te('Blocked PV')}</th><th class="num">${te('Est. false-positive')}</th></tr>
      ${TIER_ORDER.map(tierRow).join('')}</table>
    ${trend.some((v) => v > 0) ? `<div style="margin-top:12px;display:flex;align-items:center;gap:10px"><span class="muted" style="font-size:12px">${te('Blocked/day')}</span>${sparkline(trend)}</div>` : ''}
    <div class="grid2" style="margin-top:16px">
      <div><h3 style="font-size:13px;margin:0 0 8px">${te('Block reasons')}</h3>
        ${reasons ? `<table><tr><th>${te('Signal')}</th><th class="num">${te('Events')}</th></tr>${reasons}</table>` : `<p class="muted">${te('none')}</p>`}</div>
      <div><h3 style="font-size:13px;margin:0 0 8px">${te('Top blocked sources')}</h3>
        ${sources ? `<table><tr><th>${te('Source')}</th><th class="num">${te('Sessions')}</th><th class="num">PV</th></tr>${sources}</table>` : `<p class="muted">${te('none')}</p>`}</div>
    </div>`;
  document.getElementById('agModeSel').addEventListener('change', async (e) => {
    const mode = e.target.value;
    const msg = document.getElementById('agModeMsg');
    msg.textContent = t('saving…');
    try {
      const r = await guard(await fetch(`/api/sites/${site}/adguard`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }),
      }));
      if (r.ok) { msg.textContent = t(MODE_HELP[mode] || '') + ' · ' + t('saved, applies on next page load'); loadAdguard(); }
      else msg.textContent = t('save failed');
    } catch { msg.textContent = t('save failed'); }
  });
}

// ── Data export ─────────────────────────────────────────────────────────────
// Bundle every endpoint the dashboard reads — for the CURRENTLY selected period
// AND active filters — into one JSON file. Limits are generous (not the on-screen
// top-N) so the export is the full data for the range, easy to audit offline.
const DL_DIMS = ['source', 'channel', 'page', 'entry_page', 'exit_page', 'country', 'region', 'city',
  'browser', 'os', 'device', 'size', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ft_source', 'ft_medium', 'ft_campaign', 'goal'];
async function downloadData() {
  const btn = document.getElementById('dlBtn');
  const label = btn.querySelector('span');
  const orig = label.textContent;
  btn.disabled = true; label.textContent = t('Preparing…');
  // each fetch is isolated so one failure doesn't abort the whole export
  const safe = async (p, extra = '') => { try { return await get(p, extra); } catch (e) { return { error: String((e && e.message) || e) }; } };
  try {
    const period = document.getElementById('period').value;
    const metric = document.getElementById('metric').value;
    const interval = document.getElementById('interval').value;
    const bundle = {
      meta: {
        app: 'pvuv.ai', schema: 1, generated_at: new Date().toISOString(),
        site_id: site, site_name: siteName, period, filters, metric, interval,
        note: 'Values reflect the selected period and any active filters. Breakdowns/traffic use generous limits, so this is the full data for the range, not the on-screen top-N.',
      },
      overview: await safe('overview'),
      realtime: await safe('realtime'),
      quality: await safe('quality'),
      timeseries: await (async () => {
        const out = {}; // every metric at the current interval, so any chart can be cross-checked
        for (const [mv] of METRICS) out[mv] = await safe('timeseries', `&metric=${mv}&interval=${interval}`);
        return { interval, selected_metric: metric, metrics: out };
      })(),
      alerts: await safe('alerts'),
      adguard: await safe('adguard'),
      traffic: await safe('traffic', '&min_score=0&limit=1000'),
      breakdowns: {},
    };
    // anomalies is not period-scoped (matches the dashboard's own direct fetch)
    try { bundle.anomalies = await (await guard(await fetch(`/api/sites/${site}/anomalies`))).json(); }
    catch (e) { bundle.anomalies = { error: String(e) }; }
    for (const d of DL_DIMS) bundle.breakdowns[d] = await safe('breakdown', `&dim=${d}&limit=1000`);
    const validFunnel = (typeof funnelSteps !== 'undefined' ? funnelSteps : []).filter((s) => s && s.value);
    if (validFunnel.length >= 2) bundle.funnel = await safe('funnel', `&steps=${encodeURIComponent(JSON.stringify(validFunnel))}`);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pvuv-${site}-${period}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  } finally {
    btn.disabled = false; label.textContent = orig;
  }
}
document.getElementById('dlBtn').addEventListener('click', downloadData);
