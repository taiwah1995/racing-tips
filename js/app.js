/**
 * 賽馬貼士 DEMO — hash-routed SPA
 * Routes: #/  |  #/meeting/:id
 */
(function () {
  'use strict';

  const DATA_BASE = 'data';
  const APP_DATA_VERSION = '20260920d';
  let indexData = null;
  let currentMeeting = null;
  let venueFilter = 'all';
  let horseQuery = '';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const viewHome = $('#view-home');
  const viewDetail = $('#view-detail');
  const btnBack = $('#btn-back');
  const pageTitle = $('#page-title');
  const pageSub = $('#page-sub');
  const meetingList = $('#meeting-list');
  const homeEmpty = $('#home-empty');
  const searchInput = $('#search-horse');

  /* ---------- helpers ---------- */
  function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const dt = new Date(+y, +m - 1, +d);
    return `${y}年${+m}月${+d}日（${weekdays[dt.getDay()]}）`;
  }

  function formatShortDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${y}-${m}-${d}`;
  }

  /** Map tip horse number → place badge label (冠/亞/季/殿) when result present. */
  function placeBadge(h, result) {
    if (!h || !result) return '';
    const no = Number(h.no);
    const map = [
      [result.w, '冠', 'place-w'],
      [result['2'], '亞', 'place-2'],
      [result['3'], '季', 'place-3'],
      [result['4'], '殿', 'place-4'],
    ];
    for (const [finNo, label, cls] of map) {
      if (finNo != null && Number(finNo) === no) {
        return `<span class="place-badge ${cls}" title="${label}">${label}</span>`;
      }
    }
    return '';
  }

  /**
   * Tip cell: 馬號 馬名 (跑法) 賠率 — odds immediately after closing paren.
   * Optional place badge when row has result.
   */
  function horseCell(h, colClass, result) {
    if (!h) return '<span class="cell-horse">—</span>';
    const name = escapeHtml(h.name);
    const stylePart = h.style ? ` (${h.style})` : '';
    const oddsPart = h.odds != null && h.odds !== '' ? ` ${h.odds}` : '';
    const label = `${h.no} ${h.name}${stylePart}${oddsPart}`;
    const match = horseQuery && name.includes(horseQuery);
    const styleOdds =
      (h.style
        ? ` <span class="hs">(${escapeHtml(h.style)})</span>`
        : '') +
      (h.odds != null && h.odds !== ''
        ? ` <span class="ho">${escapeHtml(String(h.odds))}</span>`
        : '');
    const badge = placeBadge(h, result);
    return `<span class="cell-horse ${colClass || ''}${match ? ' hl-match' : ''}" title="${escapeAttr(label)}">
      <span class="hn">${h.no} ${name}</span>${styleOdds}${badge}
    </span>`;
  }

  function raceCell(row) {
    const cls = row.class || '';
    const dist = row.distance != null ? row.distance : '';
    const sub = cls && dist !== '' ? `${escapeHtml(cls)}${dist}` : escapeHtml(cls || String(dist));
    return `<span class="race-cell">
      <span class="race-no-line">${row.race}</span>
      <span class="race-meta-line">${sub}</span>
    </span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function horseMatchesMeeting(m, q) {
    if (!q) return true;
    if (m._allNames) return m._allNames.some((n) => n.includes(q));
    return true;
  }

  /* ---------- data ---------- */
  function dataUrl(path) {
    return `${DATA_BASE}/${path}?v=${APP_DATA_VERSION}`;
  }

  async function loadIndex() {
    const res = await fetch(dataUrl('index.json'));
    if (!res.ok) throw new Error('無法載入 index.json');
    indexData = await res.json();
    // Preload horse names for search filter on home
    await Promise.all(
      indexData.meetings.map(async (m) => {
        try {
          const r = await fetch(dataUrl(m.file));
          const full = await r.json();
          const names = [];
          (full.tipsTable || []).forEach((row) => {
            ['first', 'second', 'third', 'dark'].forEach((k) => {
              if (row[k] && row[k].name) names.push(row[k].name);
            });
          });
          (full.dailyPicks || []).forEach((dp) => {
            if (dp.name) names.push(dp.name);
          });
          m._allNames = names;
        } catch (_) {
          m._allNames = [];
        }
      })
    );
  }

  async function loadMeeting(id) {
    const meta = indexData.meetings.find((m) => m.id === id);
    if (!meta) throw new Error('找不到賽日：' + id);
    const res = await fetch(dataUrl(meta.file));
    if (!res.ok) throw new Error('無法載入賽日資料');
    return res.json();
  }

  /* ---------- render home ---------- */
  function renderHome() {
    viewHome.hidden = false;
    viewDetail.hidden = true;
    btnBack.hidden = true;
    pageTitle.textContent = '🏇 賽馬貼士';
    pageSub.hidden = false;
    pageSub.textContent = '貼士存檔 · DEMO';

    let list = indexData.meetings.slice();
    if (venueFilter !== 'all') {
      list = list.filter((m) => m.venueCode === venueFilter);
    }
    if (horseQuery) {
      list = list.filter((m) =>
        (m._allNames || []).some((n) => n.includes(horseQuery))
      );
    }

    meetingList.innerHTML = '';
    if (!list.length) {
      homeEmpty.hidden = false;
      return;
    }
    homeEmpty.hidden = true;

    list.forEach((m) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'meeting-card';
      btn.setAttribute('data-id', m.id);

      const venueBadge =
        m.venueCode === 'HV'
          ? '<span class="badge badge-hv">快活谷</span>'
          : '<span class="badge badge-st">沙田</span>';
      const demoBadge = m.label
        ? `<span class="badge badge-demo">${escapeHtml(m.label)}</span>`
        : '';

      btn.innerHTML = `
        <div class="row1">
          <span class="date">${formatShortDate(m.date)}</span>
          <span style="display:flex;gap:6px;align-items:center">${demoBadge}${venueBadge}</span>
        </div>
        <div class="row2">
          <span>${m.raceCount} 場賽事</span>
          <span class="chevron">›</span>
        </div>`;
      btn.addEventListener('click', () => {
        location.hash = `#/meeting/${m.id}`;
      });
      li.appendChild(btn);
      meetingList.appendChild(li);
    });
  }

  /* ---------- render detail ---------- */
  function renderDetail(meeting) {
    currentMeeting = meeting;
    viewHome.hidden = true;
    viewDetail.hidden = false;
    btnBack.hidden = false;
    pageTitle.textContent = `${formatShortDate(meeting.date)} ${meeting.venue} ${meeting.raceCount}場賽事`;
    pageSub.textContent = '';
    pageSub.hidden = true;

    const meta = $('#detail-meta');
    if (meta) meta.innerHTML = '';

    // Tips table
    const tbody = $('#tips-tbody');
    tbody.innerHTML = '';
    let hasAnyResult = false;
    (meeting.tipsTable || []).forEach((row) => {
      const result = row.result || null;
      if (result) hasAnyResult = true;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="race-col">${raceCell(row)}</td>
        <td>${horseCell(row.first, 'col-first', result)}</td>
        <td>${horseCell(row.second, '', result)}</td>
        <td>${horseCell(row.third, '', result)}</td>
        <td>${horseCell(row.dark, 'col-dark', result)}</td>`;
      tbody.appendChild(tr);
    });

    // Post-race hit note
    let noteEl = $('#tips-result-note');
    if (!noteEl) {
      noteEl = document.createElement('p');
      noteEl.id = 'tips-result-note';
      noteEl.className = 'panel-hint tips-result-note';
      const scroll = tbody.closest('.table-scroll') || tbody.parentElement;
      scroll.insertAdjacentElement('afterend', noteEl);
    }
    if (hasAnyResult) {
      noteEl.hidden = false;
      noteEl.textContent = '已完場 · 命中標示：冠／亞／季／殿';
    } else {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }

    // 全日重心馬推介 — exactly 3 horses for the day
    const picks = (meeting.dailyPicks || []).slice(0, 3);
    const container = $('#daily-picks');
    container.innerHTML = '';

    picks.forEach((dp, i) => {
      const card = document.createElement('div');
      card.className = 'pick-card' + (i === 0 ? ' pick-top' : '');
      const clsDist = `${dp.class || ''}${dp.distance != null ? dp.distance : ''}`;
      const match = horseQuery && (dp.name || '').includes(horseQuery);
      const stylePart = dp.style ? ` (${escapeHtml(dp.style)})` : '';
      const oddsPart =
        dp.odds != null && dp.odds !== ''
          ? ` <span class="pc-odds-inline">${escapeHtml(String(dp.odds))}</span>`
          : '';
      card.innerHTML = `
        <div class="pc-head">
          <span class="pc-race">第${dp.race}場</span>
          <span class="pc-class">${escapeHtml(clsDist)}</span>
          ${i === 0 ? '<span class="top-badge">⭐ 心水</span>' : ''}
        </div>
        <div class="pc-horse${match ? ' hl-match' : ''}">${dp.no || ''} ${escapeHtml(dp.name || '')}${stylePart}${oddsPart}</div>
        ${dp.note ? `<div class="pc-note">${escapeHtml(dp.note)}</div>` : ''}`;
      container.appendChild(card);
    });

    window.scrollTo(0, 0);
  }

  /* ---------- routing ---------- */
  async function route() {
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/meeting\/([^/]+)/);
    try {
      if (m) {
        const meeting = await loadMeeting(m[1]);
        renderDetail(meeting);
      } else {
        renderHome();
      }
    } catch (err) {
      console.error(err);
      alert(err.message || '載入失敗');
      location.hash = '#/';
    }
  }

  /* ---------- events ---------- */
  function bindEvents() {
    btnBack.addEventListener('click', () => {
      location.hash = '#/';
    });

    $$('.venue-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.venue-tabs .tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        venueFilter = tab.dataset.venue;
        if (!viewHome.hidden) renderHome();
      });
    });

    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        horseQuery = searchInput.value.trim();
        if (!viewHome.hidden) {
          renderHome();
        } else if (currentMeeting) {
          renderDetail(currentMeeting); // re-highlight
        }
      }, 150);
    });

    window.addEventListener('hashchange', route);
  }

  /* ---------- init ---------- */
  async function init() {
    bindEvents();
    try {
      await loadIndex();
      await route();
    } catch (err) {
      meetingList.innerHTML = '';
      homeEmpty.hidden = false;
      homeEmpty.textContent = '載入失敗：' + (err.message || err);
      console.error(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
