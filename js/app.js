/**
 * TW賽馬貼士 — hash-routed SPA
 * Routes: #/  |  #/meeting/:id
 */
(function () {
  'use strict';

  const DATA_BASE = 'data';
  const APP_DATA_VERSION = '20260926st0927attack2';
  /** 馬膽 stake, same convention as the ledger heading: 獨贏 $100 · 位置 $300. */
  const STAKE_WIN = 100;
  const STAKE_PLACE = 300;
  let indexData = null;
  /** id → meeting JSON */
  let meetingsById = new Map();
  /** Settled banker bets, index order (newest first). */
  let settledRows = [];
  let venueFilter = 'all';
  let monthFilter = getCurrentMonthKey();

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const viewHome = $('#view-home');
  const viewDetail = $('#view-detail');
  const btnBack = $('#btn-back');
  const pageTitle = $('#page-title');
  const pageSub = $('#page-sub');
  const meetingList = $('#meeting-list');
  const homeEmpty = $('#home-empty');
  const monthFilterSelect = $('#month-filter');

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

  /** Map tip horse number → place icon (🏆🥈🥉4️⃣) when result present. */
  const PLACE_ICON = { '冠': '🏆', '亞': '🥈', '季': '🥉', '殿': '4️⃣' };
  function placeIconFromLabel(label) {
    return PLACE_ICON[label] || '';
  }
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
        const icon = placeIconFromLabel(label);
        return `<span class="place-badge ${cls}" title="${label}" aria-label="${label}">${icon}</span>`;
      }
    }
    return '';
  }

  /**
   * Tip cell: line1 馬號 馬名 (跑法); line2 odds + place badge (same line).
   */
  function horseCell(h, colClass, result) {
    if (!h) return '<span class="cell-horse">—</span>';
    const name = escapeHtml(h.name);
    const stylePart = h.style ? ` (${h.style})` : '';
    const oddsPart = h.odds != null && h.odds !== '' ? String(h.odds) : '';
    const label = `${h.no} ${h.name}${stylePart}${oddsPart ? ' ' + oddsPart : ''}`;
    const styleHtml = h.style
      ? ` <span class="hs">(${escapeHtml(h.style)})</span>`
      : '';
    const oddsHtml = oddsPart
      ? `<span class="ho">${escapeHtml(oddsPart)}</span>`
      : '<span class="ho ho-empty"></span>';
    const badge = placeBadge(h, result);
    return `<span class="cell-horse ${colClass || ''}" title="${escapeAttr(label)}">
      <span class="hline1"><span class="hn">${h.no} ${name}</span>${styleHtml}</span>
      <span class="hline2">${oddsHtml}${badge}</span>
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


  function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatMonthLabel(month) {
    const [year, monthNumber] = month.split('-');
    return `${year}年${Number(monthNumber)}月`;
  }

  function buildMonthOptions() {
    const months = new Set(indexData.meetings.map((m) => m.date.slice(0, 7)));
    months.add(monthFilter);
    monthFilterSelect.innerHTML = '';
    [...months].sort((a, b) => b.localeCompare(a)).forEach((month) => {
      const option = document.createElement('option');
      option.value = month;
      option.textContent = formatMonthLabel(month);
      monthFilterSelect.appendChild(option);
    });
    monthFilterSelect.value = monthFilter;
  }

  /* ---------- data ---------- */
  function dataUrl(path) {
    return `${DATA_BASE}/${path}?v=${APP_DATA_VERSION}`;
  }

  async function loadIndex() {
    const res = await fetch(dataUrl('index.json'));
    if (!res.ok) throw new Error('無法載入 index.json');
    indexData = await res.json();
    buildMonthOptions();
  }

  async function loadMeeting(id) {
    if (meetingsById.has(id)) return meetingsById.get(id);
    const meta = indexData.meetings.find((m) => m.id === id);
    if (!meta) throw new Error('找不到賽日：' + id);
    const res = await fetch(dataUrl(meta.file));
    if (!res.ok) throw new Error('無法載入賽日資料');
    const meeting = await res.json();
    meetingsById.set(id, meeting);
    return meeting;
  }

  async function loadAllMeetings() {
    const loaded = await Promise.all(indexData.meetings.map(async (meta) => {
      const meeting = await loadMeeting(meta.id);
      return { meta, meeting };
    }));
    settledRows = loaded
      .map(({ meta, meeting }) => settleBankerBet(meta, meeting))
      .filter(Boolean);
  }

  function formatMoney(n) {
    return '$' + Math.round(Number(n) || 0);
  }

  function formatRoi(winAmt, stakeAmt) {
    if (!stakeAmt) return '+/-0%';
    const pct = ((winAmt - stakeAmt) / stakeAmt) * 100;
    const sign = pct >= 0 ? '+' : '';
    const rounded = Math.round(pct * 10) / 10;
    const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return sign + body + '%';
  }

  /** Positive neon green, negative red. Zero keeps the surrounding colour. */
  function plClass(amount) {
    if (amount > 0) return 'pl-pos';
    if (amount < 0) return 'pl-neg';
    return '';
  }

  function toneSpan(text, amount, extraClass) {
    const cls = [extraClass, plClass(amount)].filter(Boolean).join(' ');
    return cls ? '<span class="' + cls + '">' + text + '</span>' : text;
  }

  function signedMoneyHtml(amount, extraClass) {
    return toneSpan(formatSignedMoney(amount), amount, extraClass);
  }

  function roiHtml(winAmt, stakeAmt, extraClass) {
    const pct = stakeAmt ? ((winAmt - stakeAmt) / stakeAmt) * 100 : 0;
    return toneSpan(formatRoi(winAmt, stakeAmt), pct, extraClass);
  }

  function formatLedgerLine(label, stake, win) {
    return label + '｜投注 ' + formatMoney(stake) + '｜贏 ' + formatMoney(win) + '｜回報 ' + roiHtml(win, stake);
  }

  function formatSignedMoney(profit) {
    const profitAbs = Math.abs(Math.round(profit));
    return (profit >= 0 ? '$' : '-$') + profitAbs;
  }

  function toOdds(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function hasFinishResult(result) {
    if (!result || typeof result !== 'object') return false;
    return ['w', '2', '3', '4'].some((key) => result[key] != null && result[key] !== '');
  }

  function placeLabelForNo(no, result) {
    const n = Number(no);
    const map = [
      [result.w, '冠'],
      [result['2'], '亞'],
      [result['3'], '季'],
      [result['4'], '殿'],
    ];
    for (const [fin, label] of map) {
      if (fin != null && fin !== '' && Number(fin) === n) return label;
    }
    return null;
  }

  /**
   * Banker = dailyPicks[0]. Settled once that race has a result.
   * Win pays on 冠; Place pays 冠/亞/季 (殿 does not).
   * Payout = final decimal odds × stake; a miss pays 0.
   * A hit with no final odds is left unsettled so a missing number is not shown as a loss.
   */
  function settleBankerBet(meta, meeting) {
    const banker = (meeting.dailyPicks || [])[0];
    if (!banker) return null;
    const race = (meeting.tipsTable || []).find((row) => Number(row.race) === Number(banker.race));
    if (!race || !hasFinishResult(race.result)) return null;
    const no = Number(banker.no);
    const winHit = Number(race.result.w) === no;
    const placeHit = [race.result.w, race.result['2'], race.result['3']]
      .some((fin) => fin != null && fin !== '' && Number(fin) === no);
    const oddsWin = toOdds(banker.oddsWin);
    const oddsPlace = toOdds(banker.oddsPlace);
    if (winHit && oddsWin == null) return null;
    if (placeHit && oddsPlace == null) return null;
    return {
      id: meeting.id || meta.id,
      date: meeting.date || meta.date,
      venue: meeting.venue || meta.venue,
      venueCode: meeting.venueCode || meta.venueCode,
      bankerName: banker.name || '',
      winReturn: winHit ? Math.round(oddsWin * STAKE_WIN) : 0,
      placeReturn: placeHit ? Math.round(oddsPlace * STAKE_PLACE) : 0,
    };
  }

  /** Settled banker meetings. prefix filters date (month `YYYY-MM` or year `YYYY`). */
  function settledMeetings(venueCode, datePrefix) {
    return settledRows.filter((row) => {
      if (venueCode && venueCode !== 'all' && row.venueCode !== venueCode) return false;
      if (datePrefix && !String(row.date).startsWith(datePrefix)) return false;
      return true;
    });
  }

  function poolTotals(rows) {
    let wStake = 0;
    let pStake = 0;
    let wWin = 0;
    let pWin = 0;
    rows.forEach((row) => {
      wStake += STAKE_WIN;
      pStake += STAKE_PLACE;
      wWin += row.winReturn;
      pWin += row.placeReturn;
    });
    const tStake = wStake + pStake;
    const tWin = wWin + pWin;
    return { wStake, pStake, wWin, pWin, tStake, tWin, profit: tWin - tStake };
  }

  /** Header subtitle: N race days with results + banker WP P&L; respects venue tab. */
  function renderAllTimeProfitSubtitle() {
    if (!pageSub) return;
    pageSub.classList.add('subtitle-profit');
    pageSub.hidden = false;
    const rows = settledMeetings(venueFilter);
    if (!rows.length) {
      pageSub.innerHTML = '0 賽馬日 💰 累計盈利 $0 💰 (回報 +0%)';
      return;
    }
    const t = poolTotals(rows);
    pageSub.innerHTML =
      rows.length + ' 賽馬日 💰 累計盈利 ' + signedMoneyHtml(t.profit) + ' 💰 (回報 ' + roiHtml(t.tWin, t.tStake) + ')';
  }

  function renderWpLedger() {
    const el = document.getElementById('banker-wp-ledger');
    if (!el) return;
    const rows = settledMeetings(venueFilter, monthFilter);
    if (!rows.length) {
      el.innerHTML = '<p class="banker-wp-empty">暫未有結算</p>';
      return;
    }
    const t = poolTotals(rows);
    el.innerHTML =
      '<div class="banker-wp-summary">' +
      '<div class="banker-wp-title">當月累計投注:</div>' +
      '<div class="banker-wp-line">' + formatLedgerLine('W', t.wStake, t.wWin) + '</div>' +
      '<div class="banker-wp-line">' + formatLedgerLine('P', t.pStake, t.pWin) + '</div>' +
      '<div class="banker-wp-line banker-wp-total">TOTAL｜投注 ' + formatMoney(t.tStake) + '｜贏 ' + formatMoney(t.tWin) + '｜</div>' +
      '<div class="banker-wp-line banker-wp-profit">💰 本月盈利 ' + signedMoneyHtml(t.profit, 'banker-wp-profit-val') + ' 💰 (回報 ' + roiHtml(t.tWin, t.tStake, 'banker-wp-profit-val') + ')</div>' +
      '</div>';
  }

  /** Settled banker P/L for a home card. Empty when the banker race has no result. */
  function cardPlHtml(meta) {
    const row = settledRows.find((r) => r.id === meta.id);
    if (!row) return '';
    const tWin = row.winReturn + row.placeReturn;
    const tStake = STAKE_WIN + STAKE_PLACE;
    const profit = tWin - tStake;
    return '<span class="card-pl">💰 盈虧 ' + signedMoneyHtml(profit) + ' (' + roiHtml(tWin, tStake) + ')</span>';
  }

  /** Map 冠/亞/季/殿 → place-badge CSS class for home card colors. */
  function bankerPlaceClass(label) {
    const map = { '冠': 'place-w', '亞': 'place-2', '季': 'place-3', '殿': 'place-4' };
    return map[label] || '';
  }

  /** Home card second line: race count + optional 馬膽 (from index banker fields). */
  function formatBankerLine(m) {
    const count = `${m.raceCount}場賽事`;
    const b = m.banker;
    if (!b || !b.name) return escapeHtml(count);
    const odds = b.odds != null && b.odds !== '' ? String(b.odds) : '';
    const oddsPart = odds ? ` ${escapeHtml(odds)}` : '';
    let placeLabel = m.bankerPlace || '';
    const meeting = meetingsById.get(m.id);
    const banker = meeting && (meeting.dailyPicks || [])[0];
    const race = banker && (meeting.tipsTable || []).find((row) => Number(row.race) === Number(banker.race));
    if (race && hasFinishResult(race.result)) {
      placeLabel = placeLabelForNo(banker.no, race.result) || '';
    }
    let place = '';
    if (placeLabel) {
      const cls = bankerPlaceClass(placeLabel);
      const icon = placeIconFromLabel(placeLabel) || escapeHtml(placeLabel);
      place = ` <span class="place-badge ${cls}" title="${escapeAttr(placeLabel)}" aria-label="${escapeAttr(placeLabel)}">${icon}</span>`;
    }
    return `${escapeHtml(count)} <span class="banker-part">| 馬膽 : ${escapeHtml(b.name)}${oddsPart}${place}</span>`;
  }

  /* ---------- render home ---------- */
  function renderHome() {
    viewHome.hidden = false;
    viewDetail.hidden = true;
    btnBack.hidden = true;
    pageTitle.textContent = '🏇 TW賽馬貼士';
    renderAllTimeProfitSubtitle();
    renderWpLedger();

    const monthMeetings = indexData.meetings.filter((m) =>
      m.date.startsWith(monthFilter)
    );
    let list = monthMeetings.slice();
    if (venueFilter !== 'all') {
      list = list.filter((m) => m.venueCode === venueFilter);
    }

    meetingList.innerHTML = '';
    if (!list.length) {
      homeEmpty.hidden = false;
      homeEmpty.textContent = monthMeetings.length
        ? '找不到符合條件的賽日'
        : '今個月暫未有賽日貼士';
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

      const bankerLine = formatBankerLine(m);
      btn.innerHTML = `
        <div class="row1">
          <span class="row1-main">
            <span class="date">${formatShortDate(m.date)}</span>
            ${cardPlHtml(m)}
          </span>
          <span style="display:flex;gap:6px;align-items:center">${demoBadge}${venueBadge}</span>
        </div>
        <div class="row2">
          <span class="row2-meta">${bankerLine}</span>
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
    viewHome.hidden = true;
    viewDetail.hidden = false;
    btnBack.hidden = false;
    const titleBase = `${formatShortDate(meeting.date)} ${meeting.venue} ${meeting.raceCount}場賽事`;
    pageTitle.textContent = meeting.label ? `${titleBase}【${meeting.label}】` : titleBase;
    if (meeting.label) {
      pageSub.classList.remove('subtitle-profit');
      pageSub.hidden = false;
      pageSub.textContent = meeting.testNote
        ? String(meeting.testNote)
        : `⚠ ${meeting.label} · 僅供參考 · 非投注建議`;
    } else {
      pageSub.textContent = '';
      pageSub.hidden = true;
    }

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
      noteEl.textContent = '已完場 · 命中標示：🏆／🥈／🥉／4️⃣';
    } else if (meeting.label) {
      noteEl.hidden = false;
      noteEl.textContent = meeting.testNote
        ? String(meeting.testNote)
        : `【${meeting.label}】僅供參考 · 非投注建議`;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }

    // 全日重心馬推介 — exactly 3 horses for the day
    const picks = (meeting.dailyPicks || []).slice(0, 3);
    const container = $('#daily-picks');
    container.innerHTML = '';

    const hintEl = document.querySelector('.daily-picks-hint');
    if (hintEl) {
      const hintText = meeting.dailyPicksHint || '(賠率低於2.5只作次選推介)';
      hintEl.textContent = hintText;
    }

    picks.forEach((dp, i) => {
      const card = document.createElement('div');
      card.className = 'pick-card' + (i === 0 ? ' pick-top' : '');
      const clsDist = `${dp.class || ''}${dp.distance != null ? dp.distance : ''}`;
      const raceRow = (meeting.tipsTable || []).find((r) => Number(r.race) === Number(dp.race));
      const hasResult = !!(raceRow && raceRow.result);
      const pickBadge = placeBadge(dp, hasResult ? raceRow.result : null);
      // 「最終賠率」只賽後顯示；唔用隔夜 odds 充當最終
      let finalOddsHtml = '';
      if (hasResult) {
        const wOdds = dp.oddsWin != null ? dp.oddsWin : dp.odds;
        const pOdds = dp.oddsPlace;
        if (wOdds != null && wOdds !== '' && pOdds != null && pOdds !== '') {
          finalOddsHtml =
            ` <span class="pc-final-odds">(最終賠率 W：${escapeHtml(String(wOdds))} ｜P：${escapeHtml(String(pOdds))})</span>`;
        } else if (wOdds != null && wOdds !== '') {
          finalOddsHtml =
            ` <span class="pc-final-odds">(最終賠率 W：${escapeHtml(String(wOdds))})</span>`;
        }
      }
      card.innerHTML = `
        <div class="pc-head">
          <span class="pc-race">第${dp.race}場</span>
          <span class="pc-class">${escapeHtml(clsDist)}</span>
          ${i === 0 ? '<span class="top-badge">⭐ 全日心水</span>' : ''}
        </div>
        <div class="pc-horse">${dp.no || ''} ${escapeHtml(dp.name || '')}${pickBadge}${finalOddsHtml}</div>`;
      container.appendChild(card);
    });

    renderAttackHot(meeting);

    window.scrollTo(0, 0);
  }

  function attackWatchRow(item) {
    if (item == null || item === '') return '';
    if (typeof item !== 'object') {
      return '<div class="pick-card"><div class="pc-race">' + escapeHtml(item) + '</div></div>';
    }
    const odds = item.odds != null && item.odds !== '' ? String(item.odds) : '';
    const line =
      '第' + escapeHtml(item.race) + '場 <span class="attack-horse">' + escapeHtml(item.no) + ' ' + escapeHtml(item.name || '') + '</span>｜隔夜 ' + escapeHtml(odds) + '｜中 ' + escapeHtml(item.hits) + ' 項';
    const signals = Array.isArray(item.signals)
      ? item.signals.filter((s) => s != null && s !== '')
      : [];
    const sig = signals.length
      ? '<div class="pc-note">' + signals.map((s) => escapeHtml(s)).join('、') + '</div>'
      : '';
    return '<div class="pick-card"><div class="pc-race">' + line + '</div>' + sig + '</div>';
  }

  /** Bottom of the day page. Absent when the meeting has no attackHot. */
  function renderAttackHot(meeting) {
    const existing = document.getElementById('attack-hot');
    const hot = meeting && meeting.attackHot;
    if (!hot || typeof hot !== 'object') {
      if (existing) existing.remove();
      return;
    }
    const el = existing || document.createElement('section');
    el.id = 'attack-hot';
    el.className = 'panel';
    if (!existing) viewDetail.appendChild(el);
    const high = Array.isArray(hot.high) ? hot.high : [];
    const watch = Array.isArray(hot.watch) ? hot.watch : [];
    const highHtml = high.length
      ? '<p class="panel-hint">高危</p>' + high.map(attackWatchRow).join('')
      : '';
    const watchHtml = watch.length
      ? '<p class="panel-hint">中危</p>' + watch.map(attackWatchRow).join('')
      : '';
    const summary = hot.summary
      ? '<p class="panel-hint">' + escapeHtml(hot.summary) + '</p>'
      : '';
    const note = hot.note
      ? '<p class="panel-hint">' + escapeHtml(hot.note) + '</p>'
      : '';
    const disclaimer = hot.disclaimer != null && String(hot.disclaimer) !== ''
      ? String(hot.disclaimer)
      : '僅供參考 · 非投注建議';
    const heading = (hot.title || '') + ' | 高危馬 ' + high.length + ' 隻 | 中危馬 ' + watch.length + ' 隻';
    el.innerHTML =
      '<h2 class="panel-title">' + escapeHtml(heading) + '</h2>' +
      summary +
      highHtml +
      watchHtml +
      note +
      '<p class="panel-hint">' + escapeHtml(disclaimer) + '</p>';
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

    monthFilterSelect.addEventListener('change', () => {
      monthFilter = monthFilterSelect.value;
      if (!viewHome.hidden) renderHome();
    });

    window.addEventListener('hashchange', route);
  }

  /* ---------- init ---------- */
  async function init() {
    bindEvents();
    try {
      await loadIndex();
      await loadAllMeetings();
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
