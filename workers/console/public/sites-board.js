/**
 * [INPUT]: 同源站点、汇总、排名与小时序列接口。页面提供翻译与转义函数。
 * [OUTPUT]: loadSites 和 loadRanking 渲染当前时间范围的数据。
 * [POS]: 站点目录负责排序。单卡按需读取最近 24 小时序列。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const boardMetrics = { pv: 'Pageviews', uv: 'Visitors', sessions: 'Sessions' };
let boardVersion = 0;
let rankVersion = 0;
let domainsById = new Map();

function primaryHost(value) {
  try {
    const domains = Array.isArray(value) ? value : JSON.parse(value);
    const raw = domains[0]?.trim();
    if (!raw) return '';
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (url.username || url.password || url.hostname.includes('*')) return '';
    return url.host;
  } catch { return ''; }
}

async function boardData(path) {
  const response = await guard(await fetch(path));
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function metricCells(summary, approximate) {
  return Object.entries(boardMetrics).map(([key, label]) => {
    const approx = key === 'uv' && approximate;
    return `<div${approx ? ' title="' + te('uv-approx') + '"' : ''}><strong>${approx ? '≈' : ''}${fmt(summary[key])}</strong><small>${te(label)}</small></div>`;
  }).join('');
}

function cardMarkup(s) {
  const host = domainsById.get(s.site_id);
  return `<article class="scard" data-id="${esc(s.site_id)}">
    <a class="site-name" href="/site.html?id=${encodeURIComponent(s.site_id)}" title="${esc(s.name)}">${esc(s.name)}</a>
    <div class="domain">${host ? `<a href="https://${esc(host)}/" target="_blank" rel="noopener noreferrer" title="${esc(host)}">${esc(host)} ↗</a>` : '—'}</div>
    <div class="card-controls"><span class="quality"></span>
      <button type="button" class="trend-toggle" aria-pressed="false" title="${te('Last 24 hours')}" aria-label="${te('Trend')} · ${te('Last 24 hours')}"><span aria-hidden="true">⌁</span> ${te('Trend')} · 24h</button></div>
    <div class="metrics">${metricCells({}, false)}</div>
    <div class="chart" hidden><select aria-label="${te('Last 24 hours')}">${Object.entries(boardMetrics).map(([key,label]) => `<option value="${key}">${te(label)}</option>`).join('')}</select><div class="plot" aria-live="polite"></div></div>
    <footer><span title="${te('Timezone')}">${esc(s.timezone || 'UTC')}</span><span title="${te('Ad protection mode')}">◇ ${te(s.adguard_mode || 'off')}</span></footer>
  </article>`;
}

function renderDomains() {
  document.querySelectorAll('#ranking [data-domain]').forEach(el => {
    el.textContent = domainsById.get(el.dataset.domain) || '';
  });
}

async function loadSites() {
  const version = ++boardVersion;
  const period = document.getElementById('period').value;
  const el = document.getElementById('sites');
  try {
    const { sites } = await boardData('/api/sites');
    if (version !== boardVersion) return;
    domainsById = new Map(sites.map(s => [s.site_id, primaryHost(s.allowed_domains)]));
    renderDomains();
    const sortKey = s => (domainsById.get(s.site_id) || s.name).replace(/^www\./i, '');
    sites.sort((a,b) => sortKey(a).localeCompare(sortKey(b), 'en', { sensitivity: 'base' }) || a.site_id.localeCompare(b.site_id));
    document.getElementById('siteCount').textContent = sites.length;
    if (!sites.length) {
      el.innerHTML = `<p class="empty">${te('No sites yet — use the “＋ New site” button to add one.')} <a href="/health.html">${te('Run self-check ↗')}</a></p>`;
      return;
    }
    el.innerHTML = '<div class="scards">' + sites.map(cardMarkup).join('') + '</div>';
    const data = await boardData('/api/sites/summary?period=' + encodeURIComponent(period));
    if (version !== boardVersion) return;
    const summaries = new Map(data.sites.map(row => [row.site_id, row]));
    for (const card of el.querySelectorAll('.scard')) {
      const row = summaries.get(card.dataset.id);
      if (!row) continue;
      card.querySelector('.metrics').innerHTML = metricCells(row, data.uv_approx);
      const quality = card.querySelector('.quality');
      quality.textContent = row.pv ? Math.round(100 * (Number(row.clean_count) + Number(row.suspect_count)) / row.pv) + '% ' + t('human') : t('no data yet');
    }
  } catch {
    if (version === boardVersion) el.insertAdjacentHTML('afterbegin', `<p role="alert">${te('Could not reach the server.')}</p>`);
  }
}

function showNumbers(card) {
  card.querySelector('.metrics').hidden = false;
  card.querySelector('.chart').hidden = true;
  card.querySelector('button').setAttribute('aria-pressed', 'false');
}

async function showTrend(card) {
  const metric = card.querySelector('select').value;
  const plot = card.querySelector('.plot');
  const request = Symbol();
  plot.request = request;
  card.querySelector('.metrics').hidden = true;
  card.querySelector('.chart').hidden = false;
  card.querySelector('button').setAttribute('aria-pressed', 'true');
  plot.textContent = t('loading…');
  try {
    const series = await boardData(`/api/sites/${encodeURIComponent(card.dataset.id)}/timeseries?period=24h&interval=hour&metric=${metric}`);
    if (plot.request !== request) return;
    const points = series.points.filter(p => p.status !== 'future');
    if (points.length < 2 || !points.every(p => Number.isFinite(p.value))) throw new Error('Missing series');
    const peak = Math.max(...points.map(p => p.value));
    const coords = points.map((p,i) => [2 + 196*i/(points.length-1), 29 - 26*p.value/Math.max(1,peak)]);
    const label = te(boardMetrics[metric]) + ' · ' + te('Last 24 hours');
    plot.innerHTML = `<svg viewBox="0 0 200 32" preserveAspectRatio="none" role="img" aria-label="${label}">
      <path d="M0 29H200 M0 15H200" class="guides"/>
      <polyline points="${coords.map(pair => pair.join(',')).join(' ')}"/>
      ${coords.map(([x,y],i) => `<circle cx="${x}" cy="${y}" r="4"><title>${esc(points[i].label)} · ${points[i].value}</title></circle>`).join('')}</svg>
      <div class="axis"><span>${esc(points[0].label)}</span><b>↑ ${fmt(peak)}</b><span>${esc(points.at(-1).label)}</span></div>`;
  } catch {
    if (plot.request === request && !card.querySelector('.chart').hidden) {
      showNumbers(card);
      card.querySelector('button').title = t('Could not reach the server.');
    }
  }
}

const boardRoot = document.getElementById('sites');
boardRoot.addEventListener('click', event => {
  const button = event.target.closest('.trend-toggle');
  if (!button) return;
  const card = button.closest('.scard');
  if (button.getAttribute('aria-pressed') === 'true') showNumbers(card);
  else showTrend(card);
});
boardRoot.addEventListener('change', event => {
  if (event.target.matches('.chart select')) showTrend(event.target.closest('.scard'));
});

async function loadRanking() {
  const version = ++rankVersion;
  const section = document.getElementById('rankingSection');
  const period = document.getElementById('period').value;
  try {
    const { sites } = await boardData('/api/ranking?period=' + encodeURIComponent(period));
    if (version !== rankVersion) return;
    section.hidden = sites.length < 2;
    if (section.hidden) return;
    const pending = sites.every(s => !s.external_pv && !s.internal_pv) && sites.some(s => s.clean_pv > 0);
    const max = Math.max(1, ...sites.map(s => s.external_pv));
    const dash = `<span title="${te('populated by the hourly rollup — check back after :05')}">—</span>`;
    const rows = sites.map((s,i) => `<tr><td class="rank">${String(i+1).padStart(2,'0')}</td>
      <td><a href="/site.html?id=${encodeURIComponent(s.site_id)}">${esc(s.name)}</a><small data-domain="${esc(s.site_id)}"></small></td>
      <td class="num external"><div>${pending ? '' : `<meter aria-hidden="true" min="0" max="${max}" value="${Number(s.external_pv)}"></meter>`}<b>${pending ? dash : fmt(s.external_pv)}</b></div></td>
      <td class="num">${pending ? dash : fmt(s.internal_pv)}</td><td class="num">${fmt(s.clean_pv)}</td>
      <td class="num">${fmt(s.pv)}</td><td class="num">${fmt(s.quality_score)}%</td></tr>`).join('');
    document.getElementById('ranking').innerHTML = `<table><thead><tr><th>#</th><th>${te('Site')}</th>${['External clean','Internal (mutual)','Clean PV','Total PV','Human'].map(key => `<th class="num">${te(key)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    renderDomains();
  } catch { if (version === rankVersion) section.hidden = true; }
}
