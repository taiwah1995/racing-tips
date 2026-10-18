/**
 * TW賽馬貼士 — hash-routed SPA
 * Routes: #/  |  #/meeting/:id  |  #/wind  |  #/flying  |  #/combo  |  #/football
 */
(function () {
  'use strict';

  const DATA_BASE = 'data';
  const APP_DATA_VERSION = '20261018football14';
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
  const viewWind = $('#view-wind');
  const viewFlying = $('#view-flying');
  const viewCombo = $('#view-combo');
  const viewFootball = $('#view-football');
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

  /** `更新：M/D` with no leading zero. Empty when the date cannot be read. */
  function formatUpdateMD(isoOrDate) {
    let month = null;
    let day = null;
    if (isoOrDate instanceof Date) {
      if (Number.isNaN(isoOrDate.getTime())) return '';
      month = isoOrDate.getMonth() + 1;
      day = isoOrDate.getDate();
    } else {
      const raw = String(isoOrDate == null ? '' : isoOrDate).trim();
      const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      const serial = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
      if (iso) {
        month = Number(iso[2]);
        day = Number(iso[3]);
      } else if (serial) {
        month = Number(serial[2]) + 1;
        day = Number(serial[3]);
      }
    }
    if (!Number.isInteger(month) || !Number.isInteger(day)) return '';
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return '更新：' + month + '/' + day;
  }

  function panelUpdatedHtml(isoOrDate) {
    const text = formatUpdateMD(isoOrDate);
    return text ? '<span class="panel-updated">' + escapeHtml(text) + '</span>' : '';
  }

  /** One place that puts the update label after whatever title HTML is already there. */
  function panelTitleHtml(innerHtml, isoOrDate) {
    return '<h2 class="panel-title">' + innerHtml + panelUpdatedHtml(isoOrDate) + '</h2>';
  }

  function setHeadingUpdated(heading, isoOrDate) {
    if (!heading) return;
    const old = heading.querySelector('.panel-updated');
    if (old) old.remove();
    const html = panelUpdatedHtml(isoOrDate);
    if (html) heading.insertAdjacentHTML('beforeend', html);
  }

  /** Map tip horse number → place icon (🏆🥈🥉4️⃣) when result present. */
  const PLACE_ICON = { '冠': '🏆', '亞': '🥈', '季': '🥉', '殿': '4️⃣' };
  const PLACE_SLOTS = [
    ['w', '冠', 'place-w'],
    ['2', '亞', 'place-2'],
    ['3', '季', 'place-3'],
    ['4', '殿', 'place-4'],
  ];
  function placeIconFromLabel(label) {
    return PLACE_ICON[label] || '';
  }
  /**
   * Finish for a horse number. A slot is a number or an array of numbers (dead heat).
   * Returns { key, label, cls } or null. 冠 is checked before 亞, 季, then 殿.
   */
  function positionOf(result, no) {
    if (!result || typeof result !== 'object') return null;
    const n = Number(no);
    if (!Number.isFinite(n)) return null;
    for (let s = 0; s < PLACE_SLOTS.length; s++) {
      const key = PLACE_SLOTS[s][0];
      const fin = result[key];
      if (fin == null || fin === '') continue;
      const nums = Array.isArray(fin) ? fin : [fin];
      for (let i = 0; i < nums.length; i++) {
        const item = nums[i];
        if (item != null && item !== '' && Number(item) === n) {
          return { key: key, label: PLACE_SLOTS[s][1], cls: PLACE_SLOTS[s][2] };
        }
      }
    }
    return null;
  }
  function placeBadge(h, result) {
    if (!h || !result) return '';
    const pos = positionOf(result, h.no);
    if (!pos) return '';
    const icon = placeIconFromLabel(pos.label);
    return `<span class="place-badge ${pos.cls}" title="${pos.label}" aria-label="${pos.label}">${icon}</span>`;
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

  function defaultMonthKey() {
    const now = new Date();
    const today = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    const dates = (indexData.meetings || [])
      .map((m) => m.date)
      .filter(Boolean)
      .slice()
      .sort();
    const upcoming = dates.find((date) => date >= today);
    const chosen = upcoming || dates[dates.length - 1];
    return chosen ? chosen.slice(0, 7) : getCurrentMonthKey();
  }

  async function loadIndex() {
    const res = await fetch(dataUrl('index.json'));
    if (!res.ok) throw new Error('無法載入 index.json');
    indexData = await res.json();
    monthFilter = defaultMonthKey();
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
    const pos = positionOf(result, no);
    return pos ? pos.label : null;
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
    const pos = positionOf(race.result, no);
    const winHit = !!(pos && pos.key === 'w');
    const placeHit = !!(pos && (pos.key === 'w' || pos.key === '2' || pos.key === '3'));
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

  function renderZeroLedger() {
    return (
      '<div class="banker-wp-summary">' +
      '<div class="banker-wp-title">當月累計投注:</div>' +
      '<div class="banker-wp-line">W｜投注 $0｜贏 $0｜回報 +0%</div>' +
      '<div class="banker-wp-line">P｜投注 $0｜贏 $0｜回報 +0%</div>' +
      '<div class="banker-wp-line banker-wp-total">TOTAL｜投注 $0｜贏 $0｜</div>' +
      '<div class="banker-wp-line banker-wp-profit">💰 本月盈利 <span class="banker-wp-profit-val">$0</span> 💰 (回報 <span class="banker-wp-profit-val">+0%</span>)</div>' +
      '</div>'
    );
  }

  function ledgerUpdateDate() {
    const settled = settledRows.map((row) => row.date).filter(Boolean).sort();
    if (settled.length) return settled[settled.length - 1];
    const indexed = (indexData && indexData.meetings ? indexData.meetings : [])
      .map((m) => m.date)
      .filter(Boolean)
      .sort();
    return indexed.length ? indexed[indexed.length - 1] : '';
  }

  function renderWpLedger() {
    const heading = document.querySelector('#banker-wp-book .panel-title');
    setHeadingUpdated(heading, ledgerUpdateDate());
    const el = document.getElementById('banker-wp-ledger');
    if (!el) return;
    const rows = settledMeetings(venueFilter, monthFilter);
    if (!rows.length) {
      el.innerHTML = renderZeroLedger();
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
    viewWind.hidden = true;
    viewFlying.hidden = true;
    viewCombo.hidden = true;
    viewFootball.hidden = true;
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
    viewWind.hidden = true;
    viewFlying.hidden = true;
    viewCombo.hidden = true;
    viewFootball.hidden = true;
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

    const tipsTable = document.getElementById('tips-table');
    const dailyPicks = document.getElementById('daily-picks');
    setHeadingUpdated(
      tipsTable && tipsTable.closest('.panel') && tipsTable.closest('.panel').querySelector('.panel-title'),
      meeting.date
    );
    setHeadingUpdated(
      dailyPicks && dailyPicks.closest('.panel') && dailyPicks.closest('.panel').querySelector('.panel-title'),
      meeting.date
    );

    const meta = $('#detail-meta');
    if (meta) meta.innerHTML = '';

    // Tips table
    const tbody = $('#tips-tbody');
    tbody.innerHTML = '';
    let hasAnyResult = false;
    (meeting.tipsTable || []).forEach((row, index) => {
      const result = row.result || null;
      if (result) hasAnyResult = true;
      const alt = index % 2 === 1 ? ' tips-alt' : '';
      const noteHtml = patternNoteHtml(row.patternNote);
      const tr = document.createElement('tr');
      tr.className = 'tips-race' + alt + (noteHtml ? ' has-note' : '');
      tr.innerHTML = `
        <td class="race-col">${raceCell(row)}</td>
        <td>${horseCell(row.first, 'col-first', result)}</td>
        <td>${horseCell(row.second, '', result)}</td>
        <td>${horseCell(row.third, '', result)}</td>
        <td>${horseCell(row.dark, 'col-dark', result)}</td>`;
      tbody.appendChild(tr);
      if (noteHtml) {
        const noteTr = document.createElement('tr');
        noteTr.className = 'pattern-note' + alt;
        noteTr.innerHTML = '<td></td><td class="pattern-note-cell" colspan="4">' + noteHtml + '</td>';
        tbody.appendChild(noteTr);
      }
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
    renderMeetingFlying(meeting);

    window.scrollTo(0, 0);
  }

  /** One line under the four tip cells: 留意 items, then 避 items. */
  function patternNoteHtml(note) {
    if (!note || typeof note !== 'object') return '';
    const items = [];
    const watch = Array.isArray(note.watch) ? note.watch : [];
    const avoid = Array.isArray(note.avoid) ? note.avoid : [];
    watch.forEach((text) => {
      if (text == null || text === '') return;
      items.push('<span class="pl-pos">留意</span> ' + escapeHtml(text));
    });
    avoid.forEach((text) => {
      if (text == null || text === '') return;
      items.push('<span class="pl-neg">避</span> ' + escapeHtml(text));
    });
    return items.join('；');
  }

  /** hits >= 6 高危, 4–5 中危. Anything else is not shown. */
  function attackTier(hits) {
    const n = Number(hits);
    if (!Number.isFinite(n)) return '';
    if (n >= 6) return '高危';
    if (n >= 4 && n < 6) return '中危';
    return '';
  }

  function formatAttackOdds(odds) {
    if (odds == null || odds === '') return '';
    const n = Number(odds);
    if (!Number.isFinite(n)) return String(odds);
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function attackHorseRow(item, tier, showRace) {
    const odds = formatAttackOdds(item.odds);
    const nameClass = tier === '中危' ? 'attack-horse-mid' : 'attack-horse';
    const raceLabel = '第' + escapeHtml(item.race) + '場 ';
    const raceClass = showRace ? 'attack-race' : 'attack-race attack-race-cont';
    const line =
      '(' + tier + ') <span class="attack-horse">' +
      escapeHtml(item.no) + '</span> <span class="' + nameClass + '">' + escapeHtml(item.name || '') + '</span>｜隔夜 ' +
      escapeHtml(odds) + '｜中 ' + escapeHtml(item.hits) + ' 項';
    const signals = Array.isArray(item.signals)
      ? item.signals.filter((s) => s != null && s !== '')
      : [];
    const sig = signals.length
      ? '<div class="pc-note">' + signals.map((s) => escapeHtml(s)).join('、') + '</div>'
      : '';
    return '<div class="pick-card attack-horse-row">' +
      '<span class="' + raceClass + '"' + (showRace ? '' : ' aria-hidden="true"') + '>' + raceLabel + '</span>' +
      '<div class="attack-horse-body"><div class="pc-race">' + line + '</div>' + sig + '</div>' +
      '</div>';
  }

  /** 高危 then 中危. A repeated race label is kept only on the first horse of a consecutive run. */
  function attackRowsHtml(groups) {
    const rows = [];
    groups.high.forEach((item) => rows.push({ item, tier: '高危' }));
    groups.mid.forEach((item) => rows.push({ item, tier: '中危' }));
    return rows.map((row, index) => {
      const prev = index > 0 ? rows[index - 1].item : null;
      const showRace = !prev || String(prev.race) !== String(row.item.race);
      return attackHorseRow(row.item, row.tier, showRace);
    }).join('');
  }

  /**
   * high then watch, data order. Same race+number is kept once.
   * Shown order is 高危 first, then 中危.
   */
  function attackHorseGroups(hot) {
    const lists = []
      .concat(Array.isArray(hot.high) ? hot.high : [])
      .concat(Array.isArray(hot.watch) ? hot.watch : []);
    const seen = new Set();
    const high = [];
    const mid = [];
    lists.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const key = String(item.race) + '|' + String(item.no);
      if (seen.has(key)) return;
      seen.add(key);
      const tier = attackTier(item.hits);
      if (tier === '高危') high.push(item);
      else if (tier === '中危') mid.push(item);
    });
    return { high, mid };
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
    const groups = attackHorseGroups(hot);
    const summary = hot.summary
      ? '<p class="panel-hint">' + escapeHtml(hot.summary) + '</p>'
      : '';
    const note = hot.note
      ? '<p class="panel-hint">' + escapeHtml(hot.note) + '</p>'
      : '';
    const disclaimer = hot.disclaimer != null && String(hot.disclaimer) !== ''
      ? String(hot.disclaimer)
      : '僅供參考 · 非投注建議';
    const heading =
      '🚫 是日攻擊熱門馬｜<span class="attack-count">高危馬 ' + groups.high.length +
      ' 隻</span>｜<span class="attack-count">中危馬 ' + groups.mid.length + ' 隻</span>';
    el.innerHTML =
      panelTitleHtml(heading, meeting && meeting.date) +
      summary +
      attackRowsHtml(groups) +
      note +
      '<p class="panel-hint">' + escapeHtml(disclaimer) + '</p>';
  }

  /* ---------- 收風 dashboard (live Google Sheet, nothing stored) ---------- */
  const WIND_SHEET_ID = '10vr-9Huqp6UyBJMDtRUKmjhMi_0TP0wjlYEv9ZI55co';
  const WIND_DAY_GID = '1708201936';
  const WIND_GROUPS = ['大風', '有風', '位置風', '食糊位', '其他'];
  let windLoad = 0;

  function windSheetUrl(sheetName, extraParams) {
    const q = new URLSearchParams({
      tqx: 'out:json',
      sheet: sheetName,
      t: String(Date.now()),
    });
    if (extraParams) {
      Object.keys(extraParams).forEach((key) => {
        q.set(key, extraParams[key]);
      });
    }
    return 'https://docs.google.com/spreadsheets/d/' + WIND_SHEET_ID + '/gviz/tq?' + q.toString();
  }

  function parseGviz(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('收風資料格式錯誤');
    return JSON.parse(text.slice(start, end + 1));
  }

  function gvizCell(row, index) {
    const cells = row && row.c;
    if (!cells || index >= cells.length) return null;
    return cells[index] || null;
  }

  function cellText(cell) {
    if (!cell) return '';
    if (cell.f != null && cell.f !== '') return String(cell.f);
    if (cell.v == null || cell.v === '') return '';
    if (typeof cell.v === 'number') {
      return Number.isInteger(cell.v) ? String(cell.v) : String(cell.v);
    }
    return String(cell.v);
  }

  function cellNumber(cell) {
    if (!cell || cell.v == null || cell.v === '') return null;
    const n = Number(cell.v);
    return Number.isFinite(n) ? n : null;
  }

  /** Sheet stores 命中% as text like 71.4% or 0%. Blank is not a rate. */
  function parseHitRate(cell) {
    const raw = cell && cell.v != null && cell.v !== '' ? cell.v : (cell && cell.f);
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim().replace('%', ''));
    return Number.isFinite(n) ? n : null;
  }

  function dateSortKey(cell) {
    if (!cell) return null;
    const v = cell.v;
    const fromSerial = typeof v === 'string' && v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (fromSerial) return (+fromSerial[1]) * 10000 + (+fromSerial[2] + 1) * 100 + (+fromSerial[3]);
    const label = cell.f || (typeof v === 'string' ? v : '');
    const fromLabel = String(label).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fromLabel) return (+fromLabel[3]) * 10000 + (+fromLabel[2]) * 100 + (+fromLabel[1]);
    return null;
  }

  function isoFromSortKey(key) {
    const n = Number(key);
    if (!Number.isFinite(n)) return '';
    const year = Math.floor(n / 10000);
    const month = Math.floor((n % 10000) / 100);
    const day = n % 100;
    if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /** Newest race day on 賽日累計收風統計. Date(y,m,d) months are 0-based. */
  function maxWindMeetingDate(table) {
    let best = null;
    (table && table.rows ? table.rows : []).forEach((row) => {
      const cell = gvizCell(row, 1);
      const label = cellText(cell).trim();
      if (!label || isLabelRow(label)) return;
      const key = dateSortKey(cell);
      if (key == null) return;
      if (best == null || key > best) best = key;
    });
    return best == null ? '' : isoFromSortKey(best);
  }

  function isLabelRow(text) {
    const t = String(text || '').replace(/\s+/g, '');
    return t === '馬房' || t === '賽日' || t === '練馬師';
  }

  /** 命中% and 三甲% only. Blank stays empty; it is not 0%. */
  function rateCellHtml(text) {
    if (text == null || String(text).trim() === '') return '';
    const n = Number(String(text).trim().replace('%', ''));
    const shown = escapeHtml(String(text));
    if (!Number.isFinite(n)) return shown;
    if (n >= 65) return '<span class="pl-pos">' + shown + '</span>';
    if (n >= 45) return '<span class="wind-rate-mid">' + shown + '</span>';
    return '<span class="pl-neg">' + shown + '</span>';
  }

  function windGroupCells(row) {
    const out = [];
    for (let i = 0; i < 20; i++) out.push(cellText(gvizCell(row, 5 + i)));
    return out;
  }

  function trainerRows(table) {
    const rows = [];
    (table.rows || []).forEach((row) => {
      const name = cellText(gvizCell(row, 1)).trim();
      if (!name || isLabelRow(name)) return;
      const runners = cellNumber(gvizCell(row, 2));
      const rate = parseHitRate(gvizCell(row, 4));
      rows.push({
        label: name,
        count: cellText(gvizCell(row, 2)),
        hit: cellText(gvizCell(row, 3)),
        rateText: cellText(gvizCell(row, 4)),
        rate: rate,
        runners: runners,
        bottom: runners == null || runners === 0 || rate == null,
        groups: windGroupCells(row),
      });
    });
    rows.sort((a, b) => {
      if (a.bottom !== b.bottom) return a.bottom ? 1 : -1;
      if (!a.bottom && a.rate !== b.rate) return b.rate - a.rate;
      const ar = a.runners == null ? -1 : a.runners;
      const br = b.runners == null ? -1 : b.runners;
      if (ar !== br) return br - ar;
      return a.label.localeCompare(b.label, 'zh-HK');
    });
    return rows;
  }

  function meetingRows(table) {
    const rows = [];
    (table.rows || []).forEach((row) => {
      const dateCell = gvizCell(row, 1);
      const label = cellText(dateCell).trim();
      const key = dateSortKey(dateCell);
      if (!label || !key || isLabelRow(label)) return;
      const runners = cellNumber(gvizCell(row, 2));
      rows.push({
        label: label,
        sortKey: key,
        count: cellText(gvizCell(row, 2)),
        hit: cellText(gvizCell(row, 3)),
        rateText: cellText(gvizCell(row, 4)),
        runners: runners,
        groups: windGroupCells(row),
      });
    });
    rows.sort((a, b) => b.sortKey - a.sortKey);
    return rows;
  }

  function formatWindRate(rate) {
    const rounded = Math.round(rate * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
  }

  function formatWindCount(n) {
    return Number.isInteger(n) ? String(n) : String(n);
  }

  /** 大風 and 有風 only, when (Win + Place) / (Win + Place + Lose) is above 60%. */
  function windPickRows(table) {
    const kinds = [
      { name: '大風', start: 5 },
      { name: '有風', start: 9 },
    ];
    const picks = [];
    (table.rows || []).forEach((row) => {
      const name = cellText(gvizCell(row, 1)).trim();
      if (!name || isLabelRow(name)) return;
      kinds.forEach((kind) => {
        const cells = [0, 1, 2].map((i) => gvizCell(row, kind.start + i));
        const blank = cells.every((cell) => !cell || cell.v == null || cell.v === '');
        if (blank) return;
        const nums = cells.map((cell) => {
          if (!cell || cell.v == null || cell.v === '') return 0;
          const n = Number(cell.v);
          return Number.isFinite(n) ? n : 0;
        });
        const total = nums[0] + nums[1] + nums[2];
        if (!(total > 0)) return;
        const hits = nums[0] + nums[1];
        const rate = (hits / total) * 100;
        if (!(rate > 60)) return;
        picks.push({
          name: name,
          kind: kind.name,
          win: nums[0],
          place: nums[1],
          lose: nums[2],
          total: total,
          hits: hits,
          rate: rate,
        });
      });
    });
    picks.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === '大風' ? -1 : 1;
      if (a.rate !== b.rate) return b.rate - a.rate;
      if (a.win !== b.win) return b.win - a.win;
      if (a.place !== b.place) return b.place - a.place;
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name, 'zh-HK');
    });
    return picks;
  }

  function windPickHtml(picks, updated) {
    const splitGroups = picks.some((pick) => pick.kind === '大風') &&
      picks.some((pick) => pick.kind === '有風');
    let splitMarked = false;
    const body = picks.map((pick) => {
      const hitText = formatWindCount(pick.hits) + '/' + formatWindCount(pick.total);
      let rowClass = '';
      if (splitGroups && pick.kind === '有風' && !splitMarked) {
        rowClass = ' class="wind-pick-split"';
        splitMarked = true;
      }
      return '<tr' + rowClass + '>' +
        '<td class="wind-pick-name">' + escapeHtml(pick.name) + '</td>' +
        '<td class="wind-pick-kind">' + escapeHtml(pick.kind) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.total)) + '</td>' +
        '<td>' + escapeHtml(hitText) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.win)) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.place)) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.lose)) + '</td>' +
        '<td>' + rateCellHtml(formatWindRate(pick.rate)) + '</td>' +
        '</tr>';
    }).join('');
    return '<section class="panel" id="wind-picks">' +
      panelTitleHtml('風向組合推介', updated) +
      '<div class="wind-scroll">' +
      '<table class="wind-pick">' +
      '<thead><tr><th>馬房</th><th>風類</th><th>隻數</th><th>命中</th><th>Win</th><th>Place</th><th>Lose</th><th>三甲%</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></section>';
  }

  function windTableHtml(title, nameHeader, rows, updated) {
    const groupHeads = WIND_GROUPS.map((name) => '<th class="wind-group" colspan="4">' + name + '</th>').join('');
    const subHeads = WIND_GROUPS.map(() => '<th>Win</th><th>Place</th><th>Lose</th><th>三甲%</th>').join('');
    const body = rows.map((row) => {
      const groups = row.groups.map((value, index) => {
        const html = index % 4 === 3 ? rateCellHtml(value) : escapeHtml(value);
        return '<td>' + html + '</td>';
      }).join('');
      return '<tr>' +
        '<td class="wind-name">' + escapeHtml(row.label) + '</td>' +
        '<td>' + escapeHtml(row.count) + '</td>' +
        '<td>' + escapeHtml(row.hit) + '</td>' +
        '<td>' + rateCellHtml(row.rateText) + '</td>' +
        groups +
        '</tr>';
    }).join('');
    return '<section class="panel">' +
      panelTitleHtml(escapeHtml(title), updated) +
      '<div class="wind-scroll">' +
      '<table class="wind-table">' +
      '<thead><tr>' +
      '<th class="wind-name" rowspan="2">' + escapeHtml(nameHeader) + '</th>' +
      '<th rowspan="2">隻數</th><th rowspan="2">命中</th><th rowspan="2">命中%</th>' +
      groupHeads +
      '</tr><tr>' + subHeads + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></section>';
  }

  async function loadWindSheet(sheetName) {
    const res = await fetch(windSheetUrl(sheetName));
    if (!res.ok) throw new Error('無法載入收風統計');
    const data = parseGviz(await res.text());
    if (!data.table) throw new Error('無法載入收風統計');
    return data.table;
  }

  /**
   * gviz types the 賽日 column as date and returns null for any date typed in as
   * text (e.g. 11/10/2026, 14/10/2026), so those race days vanished and 「更新」
   * stuck on the last real date cell. The untyped CSV export keeps them; fill only
   * blank date cells, matched by the row number in column A.
   */
  function parseSimpleCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  async function fillWindDayDates(table, sheetGid) {
    if (!table || !table.rows) return table;
    const missing = table.rows.some((row) => {
      const no = cellText(gvizCell(row, 0)).trim();
      return /^\d+$/.test(no) && !cellText(gvizCell(row, 1)).trim() && cellText(gvizCell(row, 2)).trim();
    });
    if (!missing) return table;
    try {
      const url = 'https://docs.google.com/spreadsheets/d/' + WIND_SHEET_ID +
        '/export?format=csv&gid=' + encodeURIComponent(sheetGid) + '&t=' + Date.now();
      const res = await fetch(url);
      if (!res.ok) return table;
      const byNo = {};
      parseSimpleCsv(await res.text()).forEach((cols) => {
        const no = String(cols[0] || '').trim();
        const date = String(cols[1] || '').trim();
        if (/^\d+$/.test(no) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) byNo[no] = date;
      });
      table.rows.forEach((row) => {
        const no = cellText(gvizCell(row, 0)).trim();
        if (!row.c || !byNo[no] || cellText(gvizCell(row, 1)).trim()) return;
        row.c[1] = { v: byNo[no], f: byNo[no] };
      });
    } catch (err) {
      console.error(err);
    }
    return table;
  }

  async function renderWind() {
    const token = ++windLoad;
    viewHome.hidden = true;
    viewDetail.hidden = true;
    viewWind.hidden = false;
    viewFlying.hidden = true;
    viewCombo.hidden = true;
    viewFootball.hidden = true;
    btnBack.hidden = false;
    pageTitle.textContent = '收風統計';
    pageSub.classList.remove('subtitle-profit');
    pageSub.hidden = false;
    pageSub.textContent = '賽馬臨場收風統計表';
    const status = $('#wind-status');
    const host = $('#wind-tables');
    if (status) {
      status.hidden = false;
      status.textContent = '載入中…';
    }
    if (host) host.innerHTML = '';
    try {
      const [trainers, days] = await Promise.all([
        loadWindSheet('馬房累計收風統計 2'),
        loadWindSheet('賽日累計收風統計').then((t) => fillWindDayDates(t, WIND_DAY_GID)),
      ]);
      if (token !== windLoad || viewWind.hidden) return;
      if (host) {
        const updated = maxWindMeetingDate(days);
        host.innerHTML =
          windPickHtml(windPickRows(trainers), updated) +
          windTableHtml('馬房累計收風統計', '馬房', trainerRows(trainers), updated) +
          windTableHtml('賽日累計收風統計', '賽日', meetingRows(days), updated);
      }
      if (status) status.hidden = true;
    } catch (err) {
      console.error(err);
      if (token !== windLoad) return;
      if (status) {
        status.hidden = false;
        status.textContent = '載入失敗：' + (err.message || err);
      }
    }
  }

  /* ---------- 賽日有飛馬 (same live sheet, separate page) ---------- */
  const FLY_CATS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'A2.3', 'A3.1', 'A3.2', 'A3.3', 'A3.4', 'A3.5', 'A3.6', 'A3.7', 'A3.8', 'A3.9'];
  const FLY_BANDS = [
    { name: 'A1', count: 2 },
    { name: 'A2', count: 3 },
    { name: 'A3', count: 9 },
  ];
  let flyingLoad = 0;
  let flyingSeasons = { now: [], prev: [] };
  let flyingSeason = 'now';
  let flyingSheetDate = '';

  async function loadGvizTable(sheetName, extraParams) {
    const res = await fetch(windSheetUrl(sheetName, extraParams));
    if (!res.ok) throw new Error('無法載入');
    const data = parseGviz(await res.text());
    if (!data.table) throw new Error('無法載入');
    return data.table;
  }

  function flyingColsOk(table) {
    const labels = (table.cols || []).map((col) => String(col.label || '').trim());
    return labels.includes('馬名') && labels.includes('練馬師');
  }

  /** Newest 日期 on 賽日有飛馬. Used for 賠率啟示錄, which has no sheet date of its own. */
  function maxFlyingSheetDate(table) {
    if (!flyingColsOk(table)) return '';
    let best = '';
    parseFlyingHorses(table).forEach((horse) => {
      const date = String(horse.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (date > best) best = date;
    });
    return best;
  }

  function normalizeFlyingDate(cell) {
    if (!cell) return '';
    const v = cell.v;
    if (typeof v === 'string') {
      const serial = v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
      if (serial) {
        const month = String(Number(serial[2]) + 1).padStart(2, '0');
        const day = String(Number(serial[3])).padStart(2, '0');
        return serial[1] + '-' + month + '-' + day;
      }
      const iso = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (iso) return iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
    }
    const formatted = cell.f != null ? String(cell.f).trim() : '';
    const fromFormatted = formatted.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (fromFormatted) {
      return fromFormatted[1] + '-' + fromFormatted[2].padStart(2, '0') + '-' + fromFormatted[3].padStart(2, '0');
    }
    return formatted || (v == null ? '' : String(v).trim());
  }

  function flyingVenue(text) {
    const raw = String(text || '').trim();
    const key = raw.toUpperCase();
    if (key === 'ST' || raw === '沙田') return '沙田';
    if (key === 'HV' || raw === '跑馬地' || raw === '快活谷') return '跑馬地';
    return raw;
  }

  function flyingDash(text) {
    const t = String(text || '').trim();
    return t || '-';
  }

  /** R / S / T odds always show one decimal. Blank and non-numeric stay unchanged. */
  function flyingOddsText(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    const n = Number(t);
    if (!Number.isFinite(n)) return t;
    return n.toFixed(1);
  }

  function flyingPlaceHtml(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    const n = Number(t);
    if (n === 1) return '🏆';
    if (n === 2) return '🥈';
    if (n === 3) return '🥉';
    if (n === 4) return '4️⃣';
    if (Number.isFinite(n) && n >= 5) return escapeHtml(String(n));
    return escapeHtml(t);
  }

  function flyingMoney(text) {
    const t = String(text || '').trim().replace(/^\$/, '');
    return t ? '$' + t : '';
  }

  function parseFlyingHorses(table) {
    const index = {};
    (table.cols || []).forEach((col, i) => {
      index[String(col.label || '').trim()] = i;
    });
    const horses = [];
    (table.rows || []).forEach((row) => {
      const name = cellText(gvizCell(row, index['馬名'])).trim();
      if (!name) return;
      const finish = cellText(gvizCell(row, index['名次'])).trim();
      horses.push({
        date: normalizeFlyingDate(gvizCell(row, index['日期'])),
        venue: flyingVenue(cellText(gvizCell(row, index['場地']))),
        race: cellText(gvizCell(row, index['場次'])).trim(),
        no: cellText(gvizCell(row, index['馬號'])).trim(),
        name: name,
        trainer: cellText(gvizCell(row, index['練馬師'])).trim(),
        group: cellText(gvizCell(row, index['細組'])).trim(),
        r: cellText(gvizCell(row, index['R'])).trim(),
        s: cellText(gvizCell(row, index['S'])).trim(),
        t: cellText(gvizCell(row, index['T'])).trim(),
        score: cellText(gvizCell(row, index['評分'])).trim(),
        grade: cellText(gvizCell(row, index['等級'])).trim(),
        comment: cellText(gvizCell(row, index['短評'])).trim(),
        finish: finish,
        winPay: cellText(gvizCell(row, index['獨贏派彩'])).trim(),
        placePay: cellText(gvizCell(row, index['位置派彩'])).trim(),
      });
    });
    return horses;
  }

  function flyingMeetings(horses) {
    const groups = new Map();
    horses.forEach((horse) => {
      const key = horse.date + '|' + horse.venue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(horse);
    });
    const meetings = [...groups.entries()].map(([key, list]) => {
      list.sort((a, b) => {
        const race = (Number(a.race) || 0) - (Number(b.race) || 0);
        if (race !== 0) return race;
        return (Number(a.no) || 0) - (Number(b.no) || 0);
      });
      const [date, venue] = key.split('|');
      const finished = list.filter((horse) => horse.finish !== '');
      const placed = finished.filter((horse) => {
        const n = Number(horse.finish);
        return n === 1 || n === 2 || n === 3;
      }).length;
      const wins = finished.filter((horse) => Number(horse.finish) === 1).length;
      return { date: date, venue: venue, horses: list, finished: finished.length, placed: placed, wins: wins };
    });
    meetings.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.venue.localeCompare(b.venue, 'zh-HK');
    });
    return meetings;
  }

  function flyingGradeClass(grade) {
    return { A: 'fly-grade-a', B: 'fly-grade-b', C: 'fly-grade-c', D: 'fly-grade-d' }[grade] || '';
  }

  /** Sheet 等級 wins. A blank grade is derived from 評分. */
  function flyingResolvedGrade(horse) {
    const sheet = String(horse.grade || '').trim().toUpperCase();
    if (sheet) return sheet;
    const score = Number(String(horse.score || '').trim());
    if (!Number.isFinite(score)) return '';
    if (score >= 70) return 'A';
    if (score >= 55) return 'B';
    if (score >= 40) return 'C';
    return 'D';
  }

  function flyingAdviceText(grade) {
    if (grade === 'A') return '主攻；可 1W3P 或加重位置';
    if (grade === 'B') return '正選／細注';
    if (grade === 'C') return '觀察或極細注';
    return '';
  }

  function flyingHorseHtml(horse) {
    const grade = flyingResolvedGrade(horse);
    const gradeClass = flyingGradeClass(grade);
    const badge = grade
      ? '<span class="fly-grade ' + gradeClass + '">' + escapeHtml(grade) + '</span>'
      : '';
    const score = String(horse.score || '').trim();
    const scoreHtml = score
      ? '<span class="fly-score-big ' + gradeClass + '">' + escapeHtml(score) + '</span>'
      : '';
    const mark = (badge || scoreHtml)
      ? '<span class="fly-mark">' + badge + scoreHtml + '</span>'
      : '';
    const advice = flyingAdviceText(grade);
    const winOdds = flyingOddsText(horse.t);
    const meta = [horse.trainer, horse.group].filter(Boolean).map(escapeHtml).join(' · ');
    const adviceHtml = advice
      ? '<span class="' + gradeClass + '">' + escapeHtml(advice) + '</span>'
      : '';
    const metaHtml = meta
      ? '<span class="fly-meta">' + (advice ? '｜' : '') + meta + '</span>'
      : '';
    const place = flyingPlaceHtml(horse.finish);
    const winPay = flyingMoney(horse.winPay);
    const placePay = flyingMoney(horse.placePay);
    const payBits = [];
    if (winPay) payBits.push('W ' + escapeHtml(winPay));
    if (placePay) payBits.push('P ' + escapeHtml(placePay));
    return '<article class="fly-horse">' +
      '<div class="fly-horse-top"><span class="fly-horse-name">#' + escapeHtml(horse.no) +
      ' ' + escapeHtml(horse.name) + '｜W：' + escapeHtml(winOdds || '—') +
      (place ? '｜' + place : '') + '</span>' + mark + '</div>' +
      (adviceHtml || metaHtml ? '<p class="fly-advice">' + adviceHtml + metaHtml + '</p>' : '') +
      (horse.comment ? '<p class="fly-note">' + escapeHtml(horse.comment) + '</p>' : '') +
      (payBits.length ? '<p class="fly-result"><span class="fly-pay">' + payBits.join(' ') + '</span></p>' : '') +
      '</article>';
  }

  function flyingPickLegendHtml() {
    const rows = [
      ['≥70', 'A', '主攻；可 1W3P 或加重位置'],
      ['55–69', 'B', '正選／細注'],
      ['40–54', 'C', '觀察或極細注'],
    ];
    const body = rows.map((row) =>
      '<tr><td>' + escapeHtml(row[0]) + '</td>' +
      '<td><span class="fly-grade ' + flyingGradeClass(row[1]) + '">' + escapeHtml(row[1]) + '</span></td>' +
      '<td>' + escapeHtml(row[2]) + '</td></tr>'
    ).join('');
    return '<table class="fly-pick-legend"><colgroup>' +
      '<col style="width:52px"><col style="width:44px"><col></colgroup>' +
      '<thead><tr><th>分數</th><th>等級</th><th>建議</th></tr></thead><tbody>' +
      body + '</tbody></table>';
  }

  function flyingRaceLabel(race) {
    const t = String(race || '').trim();
    if (!t) return 'R—';
    return /^r/i.test(t) ? t.replace(/^r/i, 'R') : 'R' + t;
  }

  function flyingByRace(horses) {
    const groups = new Map();
    horses.forEach((horse) => {
      const key = String(horse.race || '').trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(horse);
    });
    return [...groups.entries()].sort((a, b) => {
      const an = Number(a[0]);
      const bn = Number(b[0]);
      const aOk = Number.isFinite(an);
      const bOk = Number.isFinite(bn);
      if (aOk && bOk && an !== bn) return an - bn;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return a[0].localeCompare(b[0], 'zh-HK');
    }).map(([race, list]) => {
      const ranked = list.slice().sort((a, b) => {
        const as = Number(a.score);
        const bs = Number(b.score);
        const aOk = Number.isFinite(as);
        const bOk = Number.isFinite(bs);
        if (aOk && bOk && as !== bs) return bs - as;
        if (aOk !== bOk) return aOk ? -1 : 1;
        const no = (Number(a.no) || 0) - (Number(b.no) || 0);
        if (no !== 0) return no;
        return String(a.no).localeCompare(String(b.no), 'zh-HK');
      });
      return { race: race, horses: ranked };
    });
  }

  function flyingRaceHtml(race) {
    return '<article class="fly-race">' +
      '<header class="fly-race-head">' +
      '<span class="fly-race-chip">' + escapeHtml(flyingRaceLabel(race.race)) + '</span>' +
      '<span class="fly-race-count">' + race.horses.length + ' 隻</span>' +
      '</header>' +
      race.horses.map(flyingHorseHtml).join('') +
      '</article>';
  }

  function flyingPercentText(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return '';
    const n = Number(raw.replace('%', ''));
    if (!Number.isFinite(n)) return raw;
    return String(Math.round(n)) + '%';
  }

  function flyingHitHtml(meeting) {
    if (!(meeting.finished > 0)) return '';
    const rate = rateCellHtml(flyingPercentText((meeting.placed / meeting.finished) * 100));
    return '<span class="fly-hit">入三甲 ' + meeting.placed + ' / ' + meeting.finished + ' ' +
      rate + ' · 頭馬 ' + meeting.wins + '</span>';
  }

  function flyingRaceCardsHtml(horses) {
    return '<div class="fly-meet-body">' + flyingByRace(horses).map(flyingRaceHtml).join('') + '</div>';
  }

  function flyingPicksHtml(table) {
    if (!flyingColsOk(table)) {
      return '<section class="panel">' + panelTitleHtml('賽日推介', '') +
        '<p class="empty">未能讀取賽日有飛馬</p></section>';
    }
    const meetings = flyingMeetings(parseFlyingHorses(table));
    const meeting = meetings[0];
    if (!meeting) {
      return '<section class="panel">' + panelTitleHtml('賽日推介', '') +
        '<p class="empty">暫未有飛馬名單</p></section>';
    }
    return '<section class="panel">' + panelTitleHtml('賽日推介', meeting.date) +
      flyingPickLegendHtml() +
      '<section class="fly-meet is-open">' +
      '<div class="fly-meet-head">' +
      '<span class="fly-meet-title">' + escapeHtml(meeting.date) + ' ' + escapeHtml(meeting.venue) + '</span>' +
      flyingHitHtml(meeting) +
      '</div>' +
      flyingRaceCardsHtml(meeting.horses) +
      '</section></section>';
  }

  let meetingFlyToken = 0;

  function meetingFlyMatches(meeting, horse) {
    const date = String(meeting && meeting.date || '').trim();
    const venue = flyingVenue((meeting && (meeting.venue || meeting.venueCode)) || '');
    return horse.date === date && horse.venue === venue;
  }

  function flyingMeetingPanelHtml(horses, date) {
    const stats = flyingMeetings(horses)[0];
    const hit = stats ? flyingHitHtml(stats) : '';
    return '<section class="panel" id="meeting-flying">' +
      panelTitleHtml('賽日有飛馬', date) +
      (hit ? '<div class="fly-hit-line">' + hit + '</div>' : '') +
      flyingPickLegendHtml() +
      flyingRaceCardsHtml(horses) +
      '</section>';
  }

  /** Live 賽日有飛馬 rows for this meeting only. A slow sheet must not block the tips table. */
  function renderMeetingFlying(meeting) {
    const token = ++meetingFlyToken;
    const stale = document.getElementById('meeting-flying');
    if (stale) stale.remove();
    if (!meeting || !meeting.id) return;
    const id = String(meeting.id);
    loadGvizTable('賽日有飛馬', { headers: '1' }).then((table) => {
      if (token !== meetingFlyToken || viewDetail.hidden) return;
      const current = (location.hash || '').match(/^#\/meeting\/([^/?#]+)/);
      if (!current || decodeURIComponent(current[1]) !== id) return;
      if (!flyingColsOk(table)) return;
      const horses = parseFlyingHorses(table).filter((horse) => meetingFlyMatches(meeting, horse));
      if (!horses.length) return;
      const again = document.getElementById('meeting-flying');
      if (again) again.remove();
      viewDetail.insertAdjacentHTML('beforeend', flyingMeetingPanelHtml(horses, meeting.date));
    }).catch(() => {});
  }

  function flyingCellBlank(row, index) {
    return cellText(gvizCell(row, index)).trim() === '';
  }

  function isZeroPair(text) {
    const parts = String(text || '').split('/').map((part) => part.trim());
    return parts.length === 2 && parts[0] === '0' && parts[1] === '0';
  }

  function wholeCount(cell) {
    if (!cell || cell.v == null || cell.v === '') return 0;
    const n = Number(cell.v);
    return Number.isFinite(n) ? n : 0;
  }

  function wholeText(n) {
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : String(n);
  }

  function parseFlyingTrainers(table) {
    const rows = table.rows || [];
    const trainers = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (flyingCellBlank(row, 1)) continue;
      let follow = null;
      const next = rows[i + 1];
      if (next && flyingCellBlank(next, 0) && flyingCellBlank(next, 1)) {
        follow = next;
        i += 1;
      }
      const total = wholeCount(gvizCell(row, 2));
      if (!(total > 0)) continue;
      const cats = [];
      for (let c = 0; c < FLY_CATS.length; c++) {
        cats.push({
          appear: wholeCount(gvizCell(row, 15 + c)),
          hit: follow ? wholeCount(gvizCell(follow, 15 + c)) : 0,
        });
      }
      trainers.push({
        name: cellText(gvizCell(row, 1)).trim(),
        total: cellText(gvizCell(row, 2)).trim(),
        top3: cellText(gvizCell(row, 3)).trim(),
        top3Rate: cellText(gvizCell(row, 4)).trim(),
        win: cellText(gvizCell(row, 5)).trim(),
        winRate: cellText(gvizCell(row, 6)).trim(),
        place: cellText(gvizCell(row, 7)).trim(),
        placeRate: cellText(gvizCell(row, 8)).trim(),
        a1: cellText(gvizCell(row, 9)).trim(),
        a1Rate: cellText(gvizCell(row, 10)).trim(),
        a2: cellText(gvizCell(row, 11)).trim(),
        a2Rate: cellText(gvizCell(row, 12)).trim(),
        a3: cellText(gvizCell(row, 13)).trim(),
        a3Rate: cellText(gvizCell(row, 14)).trim(),
        cats: cats,
      });
    }
    const numbered = [];
    const totals = [];
    trainers.forEach((trainer) => {
      if (trainer.name.includes('合計')) totals.push(trainer);
      else numbered.push(trainer);
    });
    let rank = 0;
    return numbered.concat(totals).map((trainer) => {
      const showRank = !trainer.name.includes('合計');
      if (showRank) rank += 1;
      return Object.assign({}, trainer, { rank: showRank ? String(rank) : '' });
    });
  }

  function flyingRateHtml(text, zeroPair) {
    if (zeroPair) return '<span class="fly-muted">' + escapeHtml(text || '') + '</span>';
    return rateCellHtml(text);
  }

  function flyingPairCell(pair, rate, extraClass) {
    const cls = 'fly-pair' + (extraClass ? ' ' + extraClass : '');
    return '<td class="' + cls + '">' + escapeHtml(pair) +
      (rate ? '<br>' + flyingRateHtml(rate, isZeroPair(pair)) : '') + '</td>';
  }

  /** Same widths for both seasons. Name column matches the 2026-27 one-line width. */
  const FLY_COL_WIDTHS = [72, 36, 36, 46, 28, 36, 28, 36, 56, 56, 56].concat(FLY_CATS.map(() => 44));
  const FLY_SPLIT_COLS = { 1: true, 4: true, 6: true, 8: true };

  function flyingTrainerTable(trainers) {
    const mainHeads = ['出現', '三甲', '三甲%', 'W', 'W%', 'P', 'P%', 'A1 命中', 'A2 命中', 'A3 命中'];
    const headMain = mainHeads.map((name, index) => {
      const col = index + 1;
      const cls = FLY_SPLIT_COLS[col] ? ' class="fly-split"' : '';
      return '<th rowspan="2"' + cls + '>' + name + '</th>';
    }).join('');
    const colgroup = '<colgroup>' + FLY_COL_WIDTHS.map((width) => '<col style="width:' + width + 'px">').join('') + '</colgroup>';
    const tableWidth = FLY_COL_WIDTHS.reduce((sum, width) => sum + width, 0);
    const bands = FLY_BANDS.map((band) =>
      '<th class="fly-band" colspan="' + band.count + '">' + band.name + '</th>'
    ).join('');
    let catIndex = 0;
    const sub = FLY_CATS.map((name) => {
      const start = catIndex === 0 || catIndex === 2 || catIndex === 5;
      catIndex += 1;
      return '<th' + (start ? ' class="fly-band-start"' : '') + '>' + name + '</th>';
    }).join('');
    const body = trainers.map((trainer) => {
      let seen = 0;
      const cats = trainer.cats.map((cat) => {
        const start = seen === 0 || seen === 2 || seen === 5;
        seen += 1;
        const cls = start ? ' class="fly-band-start"' : '';
        if (!(cat.appear > 0)) return '<td' + cls + '></td>';
        const hit = escapeHtml(wholeText(cat.hit));
        const appear = escapeHtml(wholeText(cat.appear));
        const ratio = cat.hit / cat.appear;
        let hitHtml = hit;
        if (ratio > 0.65) hitHtml = '<span class="pl-pos">' + hit + '</span>';
        else if (ratio > 0.5) hitHtml = '<span class="wind-rate-mid">' + hit + '</span>';
        return '<td' + cls + '>' + hitHtml + '/' + appear + '</td>';
      }).join('');
      const rankHtml = trainer.rank
        ? '<span class="fly-rank">' + escapeHtml(trainer.rank) + '</span> '
        : '';
      return '<tr>' +
        '<td class="fly-name">' + rankHtml + escapeHtml(trainer.name) + '</td>' +
        '<td class="fly-split">' + escapeHtml(trainer.total) + '</td>' +
        '<td>' + escapeHtml(trainer.top3) + '</td>' +
        '<td>' + rateCellHtml(flyingPercentText(trainer.top3Rate)) + '</td>' +
        '<td class="fly-split">' + escapeHtml(trainer.win) + '</td>' +
        '<td>' + escapeHtml(flyingPercentText(trainer.winRate)) + '</td>' +
        '<td class="fly-split">' + escapeHtml(trainer.place) + '</td>' +
        '<td>' + escapeHtml(flyingPercentText(trainer.placeRate)) + '</td>' +
        flyingPairCell(trainer.a1, flyingPercentText(trainer.a1Rate), 'fly-split') +
        flyingPairCell(trainer.a2, flyingPercentText(trainer.a2Rate)) +
        flyingPairCell(trainer.a3, flyingPercentText(trainer.a3Rate)) +
        cats +
        '</tr>';
    }).join('');
    return '<div class="fly-scroll"><table class="fly-table" style="width:' + tableWidth + 'px">' +
      colgroup +
      '<thead><tr>' +
      '<th class="fly-name" rowspan="2">練馬師</th>' + headMain + bands +
      '</tr><tr>' + sub + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function flyingTrainerHtml() {
    const trainers = flyingSeasons[flyingSeason] || [];
    const nowActive = flyingSeason === 'now' ? ' active' : '';
    const prevActive = flyingSeason === 'prev' ? ' active' : '';
    const table = trainers.length
      ? flyingTrainerTable(trainers)
      : '<p class="empty">暫未有練馬師資料</p>';
    return '<section class="panel" id="fly-trainers">' +
      panelTitleHtml('賠率啟示錄', flyingSheetDate) +
      '<div class="fly-seasons" role="tablist">' +
      '<button type="button" class="tab' + nowActive + '" data-fly-season="now">2026-27</button>' +
      '<button type="button" class="tab' + prevActive + '" data-fly-season="prev">2025-26</button>' +
      '</div>' +
      '<p class="fly-legend">入三甲/出現。 <span class="pl-pos">≥65%</span> <span class="wind-rate-mid">45–64%</span> <span class="pl-neg">&lt;45%</span> <span class="fly-muted">0/0</span></p>' +
      table + '</section>';
  }

  function renderFlyingTrainers() {
    const host = document.getElementById('fly-trainers');
    if (!host) return;
    const scroll = host.querySelector('.fly-scroll');
    const left = scroll ? scroll.scrollLeft : 0;
    host.outerHTML = flyingTrainerHtml();
    const next = document.getElementById('fly-trainers');
    const nextScroll = next && next.querySelector('.fly-scroll');
    if (nextScroll) nextScroll.scrollLeft = left;
  }

  function bindFlyingOnce() {
    if (viewFlying.dataset.bound === '1') return;
    viewFlying.dataset.bound = '1';
    viewFlying.addEventListener('click', (event) => {
      const seasonBtn = event.target.closest('[data-fly-season]');
      if (!seasonBtn) return;
      flyingSeason = seasonBtn.getAttribute('data-fly-season') || 'now';
      renderFlyingTrainers();
    });
  }

  async function renderFlying() {
    const token = ++flyingLoad;
    viewHome.hidden = true;
    viewDetail.hidden = true;
    viewWind.hidden = true;
    viewFlying.hidden = false;
    viewCombo.hidden = true;
    viewFootball.hidden = true;
    btnBack.hidden = false;
    pageTitle.textContent = '賽日有飛馬';
    pageSub.classList.remove('subtitle-profit');
    pageSub.hidden = true;
    pageSub.textContent = '';
    const status = $('#flying-status');
    const host = $('#flying-body');
    if (status) {
      status.hidden = false;
      status.textContent = '載入中…';
    }
    if (host) host.innerHTML = '';
    bindFlyingOnce();
    try {
      const [flyResult, nowResult, prevResult] = await Promise.allSettled([
        loadGvizTable('賽日有飛馬', { headers: '1' }),
        loadGvizTable('A123 分析 26/27', { headers: '0', range: 'A4:AC49' }),
        loadGvizTable('A123 分析 26/27', { headers: '0', range: 'A58:AC105' }),
      ]);
      if (token !== flyingLoad || viewFlying.hidden) return;
      flyingSeason = 'now';
      flyingSeasons = {
        now: nowResult.status === 'fulfilled' ? parseFlyingTrainers(nowResult.value) : [],
        prev: prevResult.status === 'fulfilled' ? parseFlyingTrainers(prevResult.value) : [],
      };
      flyingSheetDate = flyResult.status === 'fulfilled' ? maxFlyingSheetDate(flyResult.value) : '';
      const picks = flyResult.status === 'fulfilled'
        ? flyingPicksHtml(flyResult.value)
        : '<section class="panel">' + panelTitleHtml('賽日推介', '') + '<p class="empty">未能讀取賽日有飛馬</p></section>';
      const trainers = (nowResult.status === 'fulfilled' || prevResult.status === 'fulfilled')
        ? flyingTrainerHtml()
        : '<section class="panel">' + panelTitleHtml('賠率啟示錄', flyingSheetDate) + '<p class="empty">未能讀取賠率啟示錄</p></section>';
      if (host) host.innerHTML = picks + trainers;
      if (status) status.hidden = true;
    } catch (err) {
      console.error(err);
      if (token !== flyingLoad) return;
      if (status) {
        status.hidden = false;
        status.textContent = '載入失敗：' + (err.message || err);
      }
    }
  }

  /* ---------- 練騎合作 (live sheet + data/combo-seq.json) ---------- */
  const COMBO_NOW = '26-27';
  const COMBO_PREV = '25-26';
  const COMBO_PREV2 = '24-25';
  const COMBO_SEASONS = [
    { id: COMBO_NOW, label: '今季 26-27' },
    { id: COMBO_PREV, label: '上季 25-26' },
    { id: COMBO_PREV2, label: '前季 24-25' },
  ];
  const COMBO_JOCKEY_GID = '560967743';
  const COMBO_TRAINER_GID = '903424869';
  let comboLoad = 0;
  let comboMap = null;
  let comboSeq = null;
  let comboMode = 'trainer';
  let comboMinN = 5;
  let comboQuery = '';
  let comboSort = 'place';
  let comboCompare = false;
  let comboSeason = COMBO_NOW;

  function comboSeasonLabel(id) {
    const hit = COMBO_SEASONS.find((s) => s.id === id);
    return hit ? hit.label : COMBO_SEASONS[0].label;
  }

  function comboSuccessTitleText() {
    return '要注意 · 成功組合（' + comboSeasonLabel(comboSeason) + '）';
  }

  function comboSheetUrl(gid) {
    const q = new URLSearchParams({
      tqx: 'out:json',
      gid: String(gid),
      t: String(Date.now()),
    });
    return 'https://docs.google.com/spreadsheets/d/' + WIND_SHEET_ID + '/gviz/tq?' + q.toString();
  }

  function comboNum(cell) {
    if (!cell) return null;
    let value = cell.v;
    if (value == null || value === '') value = cell.f;
    if (value == null || value === '') return null;
    if (typeof value === 'string') value = value.replace('%', '').trim();
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function comboColIndex(table) {
    const index = {};
    (table.cols || []).forEach((col, i) => {
      const label = String(col.label || '').trim();
      if (label && index[label] == null) index[label] = i;
    });
    return index;
  }

  function comboRecords(table) {
    const index = comboColIndex(table);
    const need = ['年度', '騎師', '練', '出賽', '勝出%', '上名%'];
    if (need.some((key) => index[key] == null)) return [];
    const firstI = index['冠'];
    const secondI = index['亞'];
    const thirdI = index['季'];
    const out = [];
    (table.rows || []).forEach((row) => {
      const season = cellText(gvizCell(row, index['年度'])).trim();
      if (season !== COMBO_NOW && season !== COMBO_PREV && season !== COMBO_PREV2) return;
      const jockey = cellText(gvizCell(row, index['騎師'])).trim();
      const trainer = cellText(gvizCell(row, index['練'])).trim();
      if (!jockey || !trainer) return;
      const n = comboNum(gvizCell(row, index['出賽']));
      const win = comboNum(gvizCell(row, index['勝出%']));
      const place = comboNum(gvizCell(row, index['上名%']));
      if (n == null || win == null || place == null) return;
      out.push({
        season: season,
        jockey: jockey,
        trainer: trainer,
        n: n,
        win: win,
        place: place,
        first: firstI == null ? null : comboNum(gvizCell(row, firstI)),
        second: secondI == null ? null : comboNum(gvizCell(row, secondI)),
        third: thirdI == null ? null : comboNum(gvizCell(row, thirdI)),
      });
    });
    return out;
  }

  /** 騎練 tab wins when the same season|jockey|trainer pair differs. */
  function buildComboMap(trainerTable, jockeyTable) {
    const map = new Map();
    comboRecords(trainerTable).forEach((row) => {
      map.set(row.season + '|' + row.jockey + '|' + row.trainer, row);
    });
    comboRecords(jockeyTable).forEach((row) => {
      map.set(row.season + '|' + row.jockey + '|' + row.trainer, row);
    });
    return map;
  }

  function comboCountText(n) {
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n));
  }

  function comboPctText(n) {
    if (!Number.isFinite(n)) return '';
    const rounded = Math.round(n * 10) / 10;
    const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return body + '%';
  }

  function comboRateHtml(n) {
    const text = comboPctText(n);
    if (!text) return '';
    let cls = 'combo-neg';
    if (n >= 65) cls = 'combo-pos';
    else if (n >= 45) cls = 'combo-mid';
    return '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function comboPairText(row) {
    if (comboMode === 'jockey') return row.jockey + ' · ' + row.trainer;
    return row.trainer + ' · ' + row.jockey;
  }

  /** trainer short | jockey full name, same key as data/combo-seq.json. */
  function comboSeqFor(row) {
    if (!row || !comboSeq || !comboSeq.pairs) return null;
    const entry = comboSeq.pairs[row.trainer + '|' + row.jockey];
    return entry && typeof entry === 'object' ? entry : null;
  }

  /** W green, P yellow, X unchanged. Sequence is already limited to those letters. */
  function comboSeqLettersHtml(seq) {
    return seq.split('').map((ch) => {
      if (ch === 'W') return '<span class="combo-pos">W</span>';
      if (ch === 'P') return '<span class="combo-mid">P</span>';
      return 'X';
    }).join('');
  }

  /** `` | 隔 x 次未上名 | 近10次：WWXP`` — empty when this pair was not fetched. */
  function comboSeqSuffixHtml(row) {
    const entry = comboSeqFor(row);
    if (!entry) return '';
    const seq = String(entry.seq || '');
    if (!/^[WPX]+$/.test(seq)) return '';
    if (entry.gap == null || entry.gap === '') return '';
    const gap = Number(entry.gap);
    if (!Number.isFinite(gap) || gap < 0) return '';
    return '<span class="combo-seq"> | 隔 ' + Math.round(gap) +
      ' 次未上名 | 近10次：' + comboSeqLettersHtml(seq) + '</span>';
  }

  /** combo-seq.json is current-season only: past seasons show 「—」. */
  function comboPairTitleHtml(row) {
    if (row.season !== COMBO_NOW) {
      return escapeHtml(comboPairText(row)) +
        '<span class="combo-seq"> | 隔 — 次未上名 | 近10次：—</span>';
    }
    return escapeHtml(comboPairText(row)) + comboSeqSuffixHtml(row);
  }

  function comboFinishCount(value) {
    if (value == null || !Number.isFinite(value)) return null;
    return Math.round(value);
  }

  /**
   * Win rate is the sheet 勝出%, count is 冠.
   * 上名 rate is the sheet 上名%, count is 冠+亞+季.
   */
  function comboSuccessStatsHtml(row) {
    const wins = comboFinishCount(row.first);
    const second = comboFinishCount(row.second);
    const third = comboFinishCount(row.third);
    const top3 = wins != null && second != null && third != null ? wins + second + third : null;
    const winCount = wins != null ? ' (' + wins + '場)' : '';
    const top3Count = top3 != null ? ' (' + top3 + '場)' : '';
    return 'Win ' + comboRateHtml(row.win) + winCount +
      ' · 上名 ' + comboRateHtml(row.place) + top3Count +
      ' · 合作 ' + escapeHtml(comboCountText(row.n)) + ' 場';
  }

  /** Min–max 獨贏 of races this pair won. Omitted when either side is missing. */
  function comboWinOddsHtml(row) {
    if (row.season !== COMBO_NOW) return '<div class="combo-odds">合作勝出頭馬獨贏區間 —</div>';
    const entry = comboSeqFor(row);
    if (!entry || entry.winOddsMin == null || entry.winOddsMax == null) return '';
    const min = Number(entry.winOddsMin);
    const max = Number(entry.winOddsMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
    const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
    return '<div class="combo-odds">合作勝出頭馬獨贏區間 ' +
      escapeHtml(fmt(min) + ' - ' + fmt(max) + '倍') + '</div>';
  }

  function comboSuccessRows(map) {
    const rows = [];
    map.forEach((row) => {
      if (row.season !== comboSeason) return;
      if (row.n >= 5 && row.win >= 20 && row.place >= 45) rows.push(row);
    });
    rows.sort((a, b) => b.place - a.place || b.win - a.win || b.n - a.n);
    return rows.slice(0, 12);
  }

  function comboChaseRows(map) {
    const rows = [];
    map.forEach((now) => {
      if (now.season !== COMBO_NOW) return;
      const prev = map.get(COMBO_PREV + '|' + now.jockey + '|' + now.trainer);
      if (!prev) return;
      if (!(prev.n >= 15 && (prev.place >= 40 || prev.win >= 15))) return;
      if (!(now.n >= 3)) return;
      const placeDrop = prev.place - now.place;
      const winDrop = prev.win - now.win;
      if (!(placeDrop >= 15 || (prev.win >= 15 && winDrop >= 10))) return;
      rows.push({ now: now, prev: prev, placeDrop: placeDrop, winDrop: winDrop });
    });
    rows.sort((a, b) => b.placeDrop - a.placeDrop || b.winDrop - a.winDrop || b.prev.n - a.prev.n);
    return rows;
  }

  function comboRankRows(map) {
    const query = comboQuery.trim();
    const rows = [];
    map.forEach((row) => {
      if (row.season !== COMBO_NOW) return;
      if (!(row.n >= comboMinN)) return;
      if (query && row.jockey.indexOf(query) < 0 && row.trainer.indexOf(query) < 0) return;
      rows.push({
        now: row,
        prev: map.get(COMBO_PREV + '|' + row.jockey + '|' + row.trainer) || null,
      });
    });
    const primary = comboSort === 'win' ? 'win' : 'place';
    const secondary = primary === 'win' ? 'place' : 'win';
    rows.sort((a, b) => b.now[primary] - a.now[primary] || b.now[secondary] - a.now[secondary] || b.now.n - a.now.n);
    return rows;
  }

  function comboDeltaHtml(now, prev) {
    if (!Number.isFinite(now) || !Number.isFinite(prev)) return '—';
    const delta = Math.round((now - prev) * 10) / 10;
    const body = Number.isInteger(delta) ? String(delta) : delta.toFixed(1);
    const text = delta > 0 ? '+' + body : body;
    const cls = delta > 0 ? 'combo-pos' : (delta < 0 ? 'combo-neg' : '');
    return cls ? '<span class="' + cls + '">' + escapeHtml(text) + '</span>' : escapeHtml(text);
  }

  function comboSuccessHtml(map) {
    const rows = comboSuccessRows(map);
    if (!rows.length) return '<p class="combo-empty">今季未有符合組合</p>';
    return rows.map((row) => {
      const small = row.n >= 5 && row.n < 8
        ? '<span class="combo-badge combo-badge-soft">樣本細</span>'
        : '';
      return '<div class="combo-card">' +
        '<div class="combo-pair">' + comboPairTitleHtml(row) +
        '<span class="combo-badge">熱</span>' + small + '</div>' +
        '<div class="combo-stats">' + comboSuccessStatsHtml(row) + '</div>' +
        comboWinOddsHtml(row) + '</div>';
    }).join('');
  }

  function comboChaseHtml(map) {
    const rows = comboChaseRows(map);
    if (!rows.length) return '<p class="combo-empty">未有符合的落後組合</p>';
    return rows.map((row) => {
      return '<div class="combo-card">' +
        '<div class="combo-pair">' + comboPairTitleHtml(row.now) + '</div>' +
        '<div class="combo-drop">上名 ' + comboRateHtml(row.prev.place) + '→' + comboRateHtml(row.now.place) +
        ' · 勝出 ' + comboRateHtml(row.prev.win) + '→' + comboRateHtml(row.now.win) +
        ' · 場數 ' + escapeHtml(comboCountText(row.prev.n)) + '→' + escapeHtml(comboCountText(row.now.n)) +
        '</div></div>';
    }).join('');
  }

  function comboRankHtml(map) {
    const rows = comboRankRows(map);
    const compareHead = comboCompare
      ? '<th>上季出賽</th><th>Δ勝出</th><th>Δ上名</th>'
      : '';
    const body = rows.length
      ? rows.map((row) => {
        const compare = comboCompare
          ? '<td>' + (row.prev ? escapeHtml(comboCountText(row.prev.n)) : '—') + '</td>' +
            '<td>' + comboDeltaHtml(row.now.win, row.prev && row.prev.win) + '</td>' +
            '<td>' + comboDeltaHtml(row.now.place, row.prev && row.prev.place) + '</td>'
          : '';
        return '<tr>' +
          '<td class="combo-name">' + escapeHtml(comboPairText(row.now)) + '</td>' +
          '<td>' + escapeHtml(comboCountText(row.now.n)) + '</td>' +
          '<td>' + comboRateHtml(row.now.win) + '</td>' +
          '<td>' + comboRateHtml(row.now.place) + '</td>' +
          compare + '</tr>';
      }).join('')
      : '<tr><td class="combo-name" colspan="' + (comboCompare ? 7 : 4) + '">沒有符合的組合</td></tr>';
    return '<table class="combo-table"><thead><tr>' +
      '<th class="combo-name">組合</th><th>出賽</th><th>勝出%</th><th>上名%</th>' +
      compareHead + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function paintComboPanels() {
    if (!comboMap) return;
    const success = document.getElementById('combo-success');
    const chase = document.getElementById('combo-chase');
    const rank = document.getElementById('combo-rank-body');
    if (success) success.innerHTML = comboSuccessHtml(comboMap);
    const successTitle = document.getElementById('combo-success-title');
    if (successTitle) successTitle.textContent = comboSuccessTitleText();
    if (chase) chase.innerHTML = comboChaseHtml(comboMap);
    if (rank) rank.innerHTML = comboRankHtml(comboMap);
  }

  function comboShell(updated) {
    const trainerActive = comboMode !== 'jockey' ? ' active' : '';
    const jockeyActive = comboMode === 'jockey' ? ' active' : '';
    return '<div class="combo-modes" role="tablist">' +
      '<button type="button" class="tab' + trainerActive + '" data-combo-mode="trainer">練騎</button>' +
      '<button type="button" class="tab' + jockeyActive + '" data-combo-mode="jockey">騎練</button>' +
      '</div>' +
      '<section class="panel" id="combo-success-panel">' + panelTitleHtml('<span id="combo-success-title">' + escapeHtml(comboSuccessTitleText()) + '</span>', updated) +
      '<div class="combo-tools">' +
      '<label class="combo-field">季度 <select id="combo-season">' +
      COMBO_SEASONS.map((s) => '<option value="' + escapeAttr(s.id) + '"' + (s.id === comboSeason ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>').join('') +
      '</select></label></div>' +
      '<p class="combo-note">場數≥5 · 勝出≥20% · 上名≥45%</p>' +
      '<div id="combo-success"></div></section>' +
      '<section class="panel" id="combo-chase-panel">' + panelTitleHtml('可追落後', updated) +
      '<p class="combo-note">上季 25-26 → 今季 26-27</p>' +
      '<div id="combo-chase"></div></section>' +
      '<section class="panel" id="combo-rank-panel">' + panelTitleHtml('完整排名表（今季）', updated) +
      '<div class="combo-tools">' +
      '<label class="combo-field">最少出賽 <input id="combo-min" type="number" min="0" step="1" value="' + escapeAttr(String(comboMinN)) + '"></label>' +
      '<input id="combo-q" type="search" placeholder="騎師或練馬師" value="' + escapeAttr(comboQuery) + '">' +
      '<label class="combo-field">排序 <select id="combo-sort">' +
      '<option value="place"' + (comboSort !== 'win' ? ' selected' : '') + '>上名%</option>' +
      '<option value="win"' + (comboSort === 'win' ? ' selected' : '') + '>勝出%</option>' +
      '</select></label>' +
      '<label class="combo-field"><input id="combo-cmp" type="checkbox"' + (comboCompare ? ' checked' : '') + '> 對比上季</label>' +
      '</div>' +
      '<div class="combo-scroll" id="combo-rank-body"></div></section>' +
      '<p class="combo-foot">僅供參考 · 非投注建議</p>';
  }

  function readComboControls(event) {
    const target = event.target;
    if (!target) return false;
    if (target.id === 'combo-min') {
      const n = Number(target.value);
      comboMinN = Number.isFinite(n) && n >= 0 ? n : 0;
      return true;
    }
    if (target.id === 'combo-q') {
      comboQuery = target.value || '';
      return true;
    }
    if (target.id === 'combo-sort') {
      comboSort = target.value === 'win' ? 'win' : 'place';
      return true;
    }
    if (target.id === 'combo-season') {
      comboSeason = COMBO_SEASONS.some((s) => s.id === target.value) ? target.value : COMBO_NOW;
      return true;
    }
    if (target.id === 'combo-cmp') {
      comboCompare = !!target.checked;
      return true;
    }
    return false;
  }

  function bindComboOnce() {
    if (!viewCombo || viewCombo.dataset.bound === '1') return;
    viewCombo.dataset.bound = '1';
    viewCombo.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-combo-mode]');
      if (!btn) return;
      comboMode = btn.getAttribute('data-combo-mode') === 'jockey' ? 'jockey' : 'trainer';
      viewCombo.querySelectorAll('[data-combo-mode]').forEach((el) => {
        el.classList.toggle('active', el === btn);
      });
      paintComboPanels();
    });
    viewCombo.addEventListener('input', (event) => {
      if (readComboControls(event)) paintComboPanels();
    });
    viewCombo.addEventListener('change', (event) => {
      if (readComboControls(event)) paintComboPanels();
    });
  }

  async function loadComboSeq() {
    try {
      const res = await fetch(dataUrl('combo-seq.json'));
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data.pairs !== 'object' || data.pairs == null) return null;
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function renderCombo() {
    const token = ++comboLoad;
    viewHome.hidden = true;
    viewDetail.hidden = true;
    viewWind.hidden = true;
    viewFlying.hidden = true;
    viewCombo.hidden = false;
    viewFootball.hidden = true;
    btnBack.hidden = false;
    pageTitle.textContent = '練騎合作';
    pageSub.classList.remove('subtitle-profit');
    pageSub.hidden = false;
    pageSub.textContent = '今季 26-27';
    const status = $('#combo-status');
    const host = $('#combo-body');
    if (status) {
      status.hidden = false;
      status.textContent = '載入中…';
    }
    if (host) host.innerHTML = '';
    bindComboOnce();
    try {
      const [jockeyRes, trainerRes, seq] = await Promise.all([
        fetch(comboSheetUrl(COMBO_JOCKEY_GID)),
        fetch(comboSheetUrl(COMBO_TRAINER_GID)),
        loadComboSeq(),
      ]);
      if (!jockeyRes.ok || !trainerRes.ok) throw new Error('無法載入練騎合作');
      const jockeyData = parseGviz(await jockeyRes.text());
      const trainerData = parseGviz(await trainerRes.text());
      if (!jockeyData.table || !trainerData.table) throw new Error('無法載入練騎合作');
      if (token !== comboLoad || viewCombo.hidden) return;
      comboMap = buildComboMap(trainerData.table, jockeyData.table);
      comboSeq = seq;
      if (host) {
        host.innerHTML = comboShell(seq && seq.updated);
        paintComboPanels();
      }
      if (status) status.hidden = true;
    } catch (err) {
      console.error(err);
      if (token !== comboLoad) return;
      if (status) {
        status.hidden = false;
        status.textContent = '載入失敗：' + (err.message || err);
      }
    }
  }

  /* ---------- 波盤推介 (live gviz; JSON file only if the sheet cannot be fetched) ---------- */
  const FOOTBALL_SHEET_ID = '1UdCJnyxAt5XzV0gbY4FCKrDYio_-SPBoyaAqaBBtKXw';
  const FOOTBALL_SHEET_NAME = '波盤推介';
  const FOOTBALL_ALLDAY_GID = '986852779';
  const FOOTBALL_ALLDAY_SHEET = '全日分析';
  const FOOTBALL_WL = { W: '全贏', WH: '贏半', P: '走盤', LH: '輸半', L: '全輸' };
  let footballLoad = 0;

  function footballGvizUrl(outKind) {
    const q = new URLSearchParams({
      tqx: 'out:' + outKind,
      gid: '0',
      t: String(Date.now()),
    });
    // CSV is the text feed (gid=0). JSON keeps Date() values; headers=1 names the columns.
    if (outKind === 'json') q.set('headers', '1');
    q.set('sheet', FOOTBALL_SHEET_NAME);
    return 'https://docs.google.com/spreadsheets/d/' + FOOTBALL_SHEET_ID + '/gviz/tq?' + q.toString();
  }

  function parseFootballGviz(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('波盤資料格式錯誤');
    return JSON.parse(text.slice(start, end + 1));
  }

  function footballYmd(y, m, d) {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return '';
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return '';
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /** yyyy-mm-dd, dd/mm/yyyy, or gviz Date(y,m,d) with a 0-based month. */
  function parseFootballDate(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    const serial = text.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (serial) return footballYmd(+serial[1], +serial[2] + 1, +serial[3]);
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return footballYmd(+iso[1], +iso[2], +iso[3]);
    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return footballYmd(+dmy[3], +dmy[2], +dmy[1]);
    return '';
  }

  function footballDateFromCell(cell) {
    if (!cell) return '';
    if (typeof cell.v === 'string') {
      const fromValue = parseFootballDate(cell.v);
      if (fromValue) return fromValue;
    }
    if (cell.f != null) {
      const fromFormatted = parseFootballDate(cell.f);
      if (fromFormatted) return fromFormatted;
    }
    return '';
  }

  /** CSV text wins. A blank text date falls back to the gviz Date() / formatted cell. */
  function footballRowDate(text, cell) {
    return parseFootballDate(text) || footballDateFromCell(cell);
  }

  function footballHeaderMap(cells) {
    const map = {};
    (cells || []).forEach((cell, i) => {
      const name = String(cell || '').trim().replace(/^\uFEFF/, '').replace(/％/g, '%');
      if (name && map[name] == null) map[name] = i;
    });
    return map;
  }

  function footballFindHeader(rows) {
    for (let i = 0; i < rows.length; i++) {
      const map = footballHeaderMap(rows[i]);
      if (map['日期'] != null && map['注數'] != null) return { index: i, map: map };
    }
    return null;
  }

  function footballJsonCols(table) {
    const map = {};
    (table.cols || []).forEach((col, i) => {
      const name = String(col.label || '').trim().replace(/％/g, '%');
      if (name && map[name] == null) map[name] = i;
    });
    return map;
  }

  function footballCsvCell(cols, map, name) {
    if (!cols || !map || map[name] == null) return '';
    return String(cols[map[name]] == null ? '' : cols[map[name]]).trim();
  }

  function footballJsonCell(row, cols, name) {
    if (!row || !cols || cols[name] == null) return null;
    return gvizCell(row, cols[name]);
  }

  function footballText(csvText, cell) {
    if (csvText) return csvText;
    return cellText(cell).trim();
  }

  function footballStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function parseFootballStake(text) {
    const t = String(text == null ? '' : text).trim().replace(/,/g, '');
    if (!t) return null;
    const matched = t.match(/^(-?\d+(?:\.\d+)?)(?:注)?$/);
    if (!matched) return null;
    const n = Number(matched[1]);
    return Number.isFinite(n) ? n : null;
  }

  function footballStake(text, cell) {
    const fromText = parseFootballStake(text);
    if (fromText != null) return fromText;
    if (cell && typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
    return parseFootballStake(cellText(cell));
  }

  function footballOdds(text, cell) {
    const t = String(text == null ? '' : text).trim();
    if (t) return t;
    if (cell && typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v.toFixed(2);
    return cellText(cell).trim();
  }

  function footballProfit(text, cell) {
    const t = String(text == null ? '' : text).trim();
    if (t && t !== '—' && t !== '-' && t !== '–') {
      const n = Number(t.replace(/[$,，\s]/g, '').replace(/^\+/, ''));
      return Number.isFinite(n) ? n : null;
    }
    if (!t && cell && typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
    return null;
  }

  function normalizeFootballWl(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return '';
    const zh = { '全贏': 'W', '贏半': 'WH', '走盤': 'P', '輸半': 'LH', '全輸': 'L' };
    if (zh[text]) return zh[text];
    const up = text.toUpperCase().replace(/\s+/g, '');
    if (up === 'W' || up === 'WH' || up === 'P' || up === 'LH' || up === 'L') return up;
    return text;
  }

  /** Sheet column is capped at 30 characters. Longer text is cut so the card stays one block. */
  function footballReason(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    const chars = Array.from(t);
    if (chars.length <= 30) return t;
    return chars.slice(0, 30).join('') + '…';
  }

  /** Optional 過關 cell. Y / 是 / 1 locks that row into 穩陣過關. */
  function footballPassMarked(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return false;
    if (text === '是' || text === '1') return true;
    const up = text.toUpperCase();
    return up === 'Y' || up === 'YES';
  }

  function footballLockFromRow(cols, map, jsonRow, jsonCols) {
    const csv = (name) => footballCsvCell(cols, map, name);
    const json = (name) => footballJsonCell(jsonRow, jsonCols, name);
    let marked = false;
    if (map && map['過關'] != null) marked = footballPassMarked(csv('過關'));
    else if (jsonCols && jsonCols['過關'] != null) marked = footballPassMarked(cellText(json('過關')));
    if (!marked) return null;
    const date = footballRowDate(csv('日期'), json('日期'));
    if (!date) return null;
    return {
      date: date,
      match: footballText(csv('場次'), json('場次')),
      pick: footballText(csv('推介'), json('推介')),
      line: footballText(csv('買法'), json('買法')),
      odds: footballOdds(csv('賠率'), json('賠率')),
    };
  }

  function footballTipFromRow(cols, map, jsonRow, jsonCols) {
    const csv = (name) => footballCsvCell(cols, map, name);
    const json = (name) => footballJsonCell(jsonRow, jsonCols, name);
    const date = footballRowDate(csv('日期'), json('日期'));
    if (!date) return null;
    const stake = footballStake(csv('注數'), json('注數'));
    if (!(stake > 0)) return null;
    return {
      date: date,
      ko: footballText(csv('時間'), json('時間')),
      league: footballText(csv('聯賽'), json('聯賽')),
      match: footballText(csv('場次'), json('場次')),
      pick: footballText(csv('推介'), json('推介')),
      line: footballText(csv('買法'), json('買法')),
      odds: footballOdds(csv('賠率'), json('賠率')),
      confidence: footballText(csv('信心%'), json('信心%')),
      stake: stake,
      status: footballText(csv('狀態'), json('狀態')),
      reason: footballReason(footballText(csv('推介原因'), json('推介原因'))),
      result: footballText(csv('賽果'), json('賽果')),
      wl: normalizeFootballWl(footballText(csv('W/L'), json('W/L'))),
      profit: footballProfit(csv('利潤'), json('利潤')),
    };
  }

  function footballGroupDays(tips) {
    const map = new Map();
    tips.forEach((tip) => {
      if (!map.has(tip.date)) map.set(tip.date, []);
      map.get(tip.date).push(tip);
    });
    return [...map.keys()].sort().map((date) => ({
      date: date,
      label: '',
      tips: map.get(date),
    }));
  }

  function footballModelFromSheet(csvRows, table) {
    const csvHeader = csvRows ? footballFindHeader(csvRows) : null;
    const jsonCols = table ? footballJsonCols(table) : null;
    const hasCsv = !!(csvHeader && csvHeader.map['注數'] != null && csvHeader.map['日期'] != null);
    const hasJson = !!(jsonCols && jsonCols['注數'] != null && jsonCols['日期'] != null);
    if (!hasCsv && !hasJson) return null;
    const tips = [];
    const locks = [];
    if (hasCsv) {
      for (let r = csvHeader.index + 1; r < csvRows.length; r++) {
        const jsonRow = hasJson && csvHeader.index === 0 && table.rows ? table.rows[r - 1] : null;
        const lock = footballLockFromRow(csvRows[r] || [], csvHeader.map, jsonRow, jsonCols);
        if (lock) locks.push(lock);
        const tip = footballTipFromRow(csvRows[r] || [], csvHeader.map, jsonRow, jsonCols);
        if (tip) tips.push(tip);
      }
    } else {
      (table.rows || []).forEach((row) => {
        const lock = footballLockFromRow(null, null, row, jsonCols);
        if (lock) locks.push(lock);
        const tip = footballTipFromRow(null, null, row, jsonCols);
        if (tip) tips.push(tip);
      });
    }
    return { unit: 100, days: footballGroupDays(tips), locks: locks };
  }

  function footballModelFromFile(data) {
    const unitNum = Number(data && data.unit);
    const unit = Number.isFinite(unitNum) && unitNum > 0 ? unitNum : 100;
    const days = [];
    const locks = [];
    (data && data.days ? data.days : []).forEach((day) => {
      const date = parseFootballDate(day && day.date);
      if (!date) return;
      const tips = [];
      (day.tips || []).forEach((tip) => {
        const stake = Number(tip && tip.stake);
        if (!(stake > 0)) return;
        const odds = tip.odds == null || tip.odds === ''
          ? ''
          : (typeof tip.odds === 'number' ? tip.odds.toFixed(2) : String(tip.odds));
        tips.push({
          date: date,
          ko: footballStr(tip.ko),
          league: footballStr(tip.league),
          match: footballStr(tip.match),
          pick: footballStr(tip.pick),
          line: footballStr(tip.market != null && tip.market !== '' ? tip.market : tip['買法']),
          odds: odds,
          confidence: tip.confidence == null || tip.confidence === '' ? '' : String(tip.confidence),
          stake: stake,
          status: footballStr(tip.status),
          reason: footballReason(footballStr(tip.reason != null ? tip.reason : tip['推介原因'])),
          result: footballStr(tip.result),
          wl: normalizeFootballWl(tip.wl),
          profit: tip.profit == null || tip.profit === '' || !Number.isFinite(Number(tip.profit)) ? null : Number(tip.profit),
        });
        if (footballPassMarked(tip.pass != null ? tip.pass : tip['過關'])) {
          locks.push({
            date: date,
            match: footballStr(tip.match),
            pick: footballStr(tip.pick),
            line: footballStr(tip.market != null && tip.market !== '' ? tip.market : tip['買法']),
            odds: odds,
          });
        }
      });
      if (tips.length) days.push({ date: date, label: footballStr(day.label), tips: tips });
    });
    days.sort((a, b) => a.date.localeCompare(b.date));
    return { unit: unit, days: days, locks: locks };
  }

  async function footballFetchText(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function loadFootballSheet() {
    const [csvText, jsonText] = await Promise.all([
      footballFetchText(footballGvizUrl('csv')),
      footballFetchText(footballGvizUrl('json')),
    ]);
    if (csvText == null && jsonText == null) throw new Error('無法載入波盤推介');
    let csvRows = null;
    let table = null;
    if (csvText != null) csvRows = parseSimpleCsv(csvText);
    if (jsonText != null) {
      try {
        const data = parseFootballGviz(jsonText);
        if (!data || data.status === 'error' || !data.table) throw new Error('波盤資料格式錯誤');
        table = data.table;
      } catch (err) {
        if (csvRows == null) throw err;
        console.error(err);
      }
    }
    const model = footballModelFromSheet(csvRows, table);
    if (!model) throw new Error('波盤資料格式錯誤');
    return model;
  }

  async function loadFootball() {
    try {
      const model = await loadFootballSheet();
      return { model: model, source: 'sheet' };
    } catch (err) {
      console.error(err);
      const res = await fetch(dataUrl('football-tips.json'));
      if (!res.ok) throw new Error('無法載入波盤推介');
      return { model: footballModelFromFile(await res.json()), source: 'file' };
    }
  }

  function footballAllDayGvizUrl(outKind) {
    const q = new URLSearchParams({
      tqx: 'out:' + outKind,
      gid: FOOTBALL_ALLDAY_GID,
      t: String(Date.now()),
      sheet: FOOTBALL_ALLDAY_SHEET,
    });
    if (outKind === 'json') q.set('headers', '1');
    return 'https://docs.google.com/spreadsheets/d/' + FOOTBALL_SHEET_ID + '/gviz/tq?' + q.toString();
  }

  /** Every row on the 全日分析 tab, including 注數 0. Stars are computed later from 信心%. */
  function footballAllDayFromRow(cols, map, jsonRow, jsonCols) {
    const csv = (name) => footballCsvCell(cols, map, name);
    const json = (name) => footballJsonCell(jsonRow, jsonCols, name);
    const date = footballRowDate(csv('日期'), json('日期'));
    if (!date) return null;
    const stake = footballStake(csv('注數'), json('注數'));
    return {
      date: date,
      time: footballText(csv('時間'), json('時間')),
      league: footballText(csv('聯賽'), json('聯賽')),
      match: footballText(csv('場次'), json('場次')),
      pick: footballText(csv('推介'), json('推介')),
      line: footballText(csv('買法'), json('買法')),
      odds: footballOdds(csv('賠率'), json('賠率')),
      confidence: footballText(csv('信心%'), json('信心%')),
      stake: stake,
      result: footballText(csv('賽果'), json('賽果')),
      wl: normalizeFootballWl(footballText(csv('W/L'), json('W/L'))),
    };
  }

  function footballAllDayFromSheet(csvRows, table) {
    const csvHeader = csvRows ? footballFindHeader(csvRows) : null;
    const jsonCols = table ? footballJsonCols(table) : null;
    const hasCsv = !!(csvHeader && csvHeader.map['注數'] != null && csvHeader.map['日期'] != null);
    const hasJson = !!(jsonCols && jsonCols['注數'] != null && jsonCols['日期'] != null);
    if (!hasCsv && !hasJson) return [];
    const rows = [];
    if (hasCsv) {
      for (let r = csvHeader.index + 1; r < csvRows.length; r++) {
        const jsonRow = hasJson && csvHeader.index === 0 && table.rows ? table.rows[r - 1] : null;
        const row = footballAllDayFromRow(csvRows[r] || [], csvHeader.map, jsonRow, jsonCols);
        if (row) rows.push(row);
      }
    } else {
      (table.rows || []).forEach((row) => {
        const item = footballAllDayFromRow(null, null, row, jsonCols);
        if (item) rows.push(item);
      });
    }
    return rows;
  }

  function footballAllDayFromFile(data) {
    const rows = [];
    (data && data.items ? data.items : []).forEach((item) => {
      const date = parseFootballDate(item && item.date);
      if (!date) return;
      const stakeNum = item.stake == null || item.stake === '' ? null : Number(item.stake);
      rows.push({
        date: date,
        time: footballStr(item.time),
        league: footballStr(item.league),
        match: footballStr(item.match),
        pick: '',
        line: footballStr(item.pick),
        odds: item.odds == null || item.odds === '' ? '' : String(item.odds),
        confidence: item.confidence == null || item.confidence === '' ? '' : String(item.confidence),
        stake: Number.isFinite(stakeNum) ? stakeNum : null,
        result: footballStr(item.result),
        wl: normalizeFootballWl(item.wl),
      });
    });
    return rows;
  }

  async function loadFootballAllDaySheet() {
    const [csvText, jsonText] = await Promise.all([
      footballFetchText(footballAllDayGvizUrl('csv')),
      footballFetchText(footballAllDayGvizUrl('json')),
    ]);
    if (csvText == null && jsonText == null) throw new Error('無法載入全日分析');
    let csvRows = null;
    let table = null;
    if (csvText != null) csvRows = parseSimpleCsv(csvText);
    if (jsonText != null) {
      try {
        const data = parseFootballGviz(jsonText);
        if (!data || data.status === 'error' || !data.table) throw new Error('全日分析資料格式錯誤');
        table = data.table;
      } catch (err) {
        if (csvRows == null) throw err;
        console.error(err);
      }
    }
    const rows = footballAllDayFromSheet(csvRows, table);
    if (!rows.length) throw new Error('全日分析空白');
    return rows;
  }

  async function loadFootballAllDay() {
    try {
      const rows = await loadFootballAllDaySheet();
      return { rows: rows, source: 'sheet' };
    } catch (err) {
      console.error(err);
      try {
        const res = await fetch(dataUrl('football-allday.json'));
        if (!res.ok) return { rows: [], source: 'file' };
        return { rows: footballAllDayFromFile(await res.json()), source: 'file' };
      } catch (fileErr) {
        console.error(fileErr);
        return { rows: [], source: 'file' };
      }
    }
  }

  function footballNamedGvizUrl(sheetName, outKind) {
    const q = new URLSearchParams({
      tqx: 'out:' + outKind,
      t: String(Date.now()),
      sheet: sheetName,
    });
    if (outKind === 'json') q.set('headers', '1');
    return 'https://docs.google.com/spreadsheets/d/' + FOOTBALL_SHEET_ID + '/gviz/tq?' + q.toString();
  }

  /**
   * gviz returns the first sheet when the name is missing. That sheet has 注數,
   * so a 注數 header means this is not the 穩陣過關 tab.
   */
  function footballStableHeader(rows) {
    for (let i = 0; i < (rows || []).length; i++) {
      const map = footballHeaderMap(rows[i]);
      if (map['注數'] != null) return null;
      if (map['日期'] != null && map['場次'] != null && map['賠率'] != null) return { index: i, map: map };
    }
    return null;
  }

  function footballStableLegFromRow(cols, map, jsonRow, jsonCols) {
    const csv = (name) => footballCsvCell(cols, map, name);
    const json = (name) => footballJsonCell(jsonRow, jsonCols, name);
    const date = footballRowDate(csv('日期'), json('日期'));
    if (!date) return null;
    const match = footballText(csv('場次'), json('場次'));
    const pick = footballText(csv('推介'), json('推介'));
    const line = footballText(csv('買法'), json('買法'));
    const odds = footballOdds(csv('賠率'), json('賠率'));
    if (!match && !pick) return null;
    if (!odds) return null;
    return { date: date, match: match, pick: pick, line: line, odds: odds };
  }

  function footballStableFromSheet(csvRows, table) {
    const csvHeader = csvRows ? footballStableHeader(csvRows) : null;
    const jsonCols = table ? footballJsonCols(table) : null;
    const jsonOk = !!(jsonCols && jsonCols['注數'] == null && jsonCols['日期'] != null &&
      jsonCols['場次'] != null && jsonCols['賠率'] != null);
    if (!csvHeader && !jsonOk) return null;
    const rows = [];
    if (csvHeader) {
      for (let r = csvHeader.index + 1; r < csvRows.length; r++) {
        const jsonRow = jsonOk && csvHeader.index === 0 && table.rows ? table.rows[r - 1] : null;
        const row = footballStableLegFromRow(csvRows[r] || [], csvHeader.map, jsonRow, jsonCols);
        if (row) rows.push(row);
      }
    } else {
      (table.rows || []).forEach((row) => {
        const item = footballStableLegFromRow(null, null, row, jsonCols);
        if (item) rows.push(item);
      });
    }
    return rows;
  }

  /** Optional tab. Missing tab or a gviz fallback to 波盤推介 yields no rows. */
  async function loadFootballStable() {
    try {
      const [csvText, jsonText] = await Promise.all([
        footballFetchText(footballNamedGvizUrl('穩陣過關', 'csv')),
        footballFetchText(footballNamedGvizUrl('穩陣過關', 'json')),
      ]);
      if (csvText == null && jsonText == null) return [];
      let csvRows = null;
      let table = null;
      if (csvText != null) csvRows = parseSimpleCsv(csvText);
      if (jsonText != null) {
        try {
          const data = parseFootballGviz(jsonText);
          if (data && data.status !== 'error' && data.table) table = data.table;
        } catch (err) {
          console.error(err);
        }
      }
      return footballStableFromSheet(csvRows, table) || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  /**
   * gviz returns the first sheet when 當日總結 is missing. That sheet has 注數
   * and no 項目, so it is not this ledger.
   */
  function footballColumnName(map, label) {
    if (!map) return '';
    if (map[label] != null) return label;
    if (map[label + '($)'] != null) return label + '($)';
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(label) === 0) return keys[i];
    }
    return '';
  }

  function footballDayBookHeader(rows) {
    for (let i = 0; i < (rows || []).length; i++) {
      const map = footballHeaderMap(rows[i]);
      if (map['注數'] != null && map['項目'] == null) return null;
      const stakeCol = footballColumnName(map, '投注額');
      const payoutCol = footballColumnName(map, '派彩');
      const profitCol = footballColumnName(map, '盈虧');
      if (map['日期'] != null && map['項目'] != null && stakeCol && payoutCol && profitCol) {
        return {
          index: i,
          map: map,
          stakeCol: stakeCol,
          payoutCol: payoutCol,
          profitCol: profitCol,
          unitsCol: footballColumnName(map, '總注數'),
        };
      }
    }
    return null;
  }

  function footballParseAmount(text, cell) {
    const written = String(text || '').trim();
    if (!written && cell && typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
    const raw = written || (cell ? cellText(cell) : '');
    const t = String(raw).trim().replace(/[$,]/g, '').replace(/^[+＋]/, '');
    if (!t || t === '—' || t === '-' || t === '–') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /** Ledger labels only. The daily-flow table under the cumulative row is not this panel. */
  function footballLedgerKind(item) {
    const text = String(item || '');
    if (text.indexOf('累計總結') >= 0 || text.indexOf('三項每日累積') >= 0) return 'cumulative';
    if (text.indexOf('三項加總') >= 0) return 'day-total';
    if (text.indexOf('單場') >= 0 || text.indexOf('穩陣') >= 0 || text.indexOf('刀仔') >= 0) return 'part';
    return '';
  }

  function footballDayBookFromRow(cols, map, header, jsonRow, jsonCols) {
    const csv = (name) => footballCsvCell(cols, map, name);
    const json = (name) => footballJsonCell(jsonRow, jsonCols, name);
    const date = footballRowDate(csv('日期'), json('日期'));
    const item = footballText(csv('項目'), json('項目'));
    const kind = footballLedgerKind(item);
    if (!kind) return null;
    if (!date && kind !== 'cumulative') return null;
    return {
      date: date,
      item: item,
      kind: kind,
      stake: footballParseAmount(csv(header.stakeCol), json(header.stakeCol)),
      payout: footballParseAmount(csv(header.payoutCol), json(header.payoutCol)),
      profit: footballParseAmount(csv(header.profitCol), json(header.profitCol)),
      units: header.unitsCol ? footballParseAmount(csv(header.unitsCol), json(header.unitsCol)) : null,
    };
  }

  function footballDayBookFromSheet(csvRows, table) {
    const csvHeader = csvRows ? footballDayBookHeader(csvRows) : null;
    const jsonCols = table ? footballJsonCols(table) : null;
    const jsonHeader = jsonCols ? footballDayBookHeader([Object.keys(jsonCols)]) : null;
    if (!csvHeader && !jsonHeader) return [];
    const header = csvHeader || jsonHeader;
    const map = csvHeader ? csvHeader.map : jsonHeader.map;
    const rows = [];
    if (csvHeader) {
      for (let r = csvHeader.index + 1; r < csvRows.length; r++) {
        const jsonRow = jsonHeader && csvHeader.index === 0 && table.rows ? table.rows[r - 1] : null;
        const row = footballDayBookFromRow(csvRows[r] || [], map, header, jsonRow, jsonCols);
        if (row) rows.push(row);
      }
    } else {
      (table.rows || []).forEach((jsonRow) => {
        const row = footballDayBookFromRow(null, map, header, jsonRow, jsonCols);
        if (row) rows.push(row);
      });
    }
    return rows;
  }

  /** Missing tab, or a ledger still labelled 全日分析, yields no rows for the panel. */
  async function loadFootballDayBook() {
    try {
      const [csvText, jsonText] = await Promise.all([
        footballFetchText(footballNamedGvizUrl('當日總結', 'csv')),
        footballFetchText(footballNamedGvizUrl('當日總結', 'json')),
      ]);
      if (csvText == null && jsonText == null) return [];
      let csvRows = null;
      let table = null;
      if (csvText != null) csvRows = parseSimpleCsv(csvText);
      if (jsonText != null) {
        try {
          const data = parseFootballGviz(jsonText);
          if (data && data.status !== 'error' && data.table) table = data.table;
        } catch (err) {
          console.error(err);
        }
      }
      return footballDayBookFromSheet(csvRows, table) || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  function footballDayLabel(day) {
    if (day && day.label) return day.label;
    const matched = day && String(day.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return day && day.date ? day.date : '';
    return Number(matched[2]) + '月' + Number(matched[3]) + '日';
  }

  function formatFbMoney(n) {
    const rounded = Math.round(Math.abs(Number(n) || 0) * 100) / 100;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return '$' + text;
  }

  function formatFbSigned(n) {
    const rounded = Math.round(Number(n) * 100) / 100;
    if (rounded > 0) return '+' + formatFbMoney(rounded);
    if (rounded < 0) return '-' + formatFbMoney(rounded);
    return '$0';
  }

  function formatFbUnits(n) {
    const rounded = Math.round(Number(n) * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return text + '注';
  }

  function formatFbPct(hits, decided) {
    if (!decided) return '—';
    const pct = Math.round((hits / decided) * 1000) / 10;
    const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
    return text + '%（' + hits + '/' + decided + '）';
  }

  /**
   * Same 命中率 as 當日總結: W/WH hit, L/LH miss, P and unfinished left out.
   */
  function footballHitStats(rows) {
    let hits = 0;
    let decided = 0;
    (rows || []).forEach((row) => {
      const code = normalizeFootballWl(row && row.wl);
      if (code === 'W' || code === 'WH') {
        hits += 1;
        decided += 1;
      } else if (code === 'L' || code === 'LH') {
        decided += 1;
      }
    });
    return { hits: hits, decided: decided };
  }

  /** Null until at least one decided row, so the heading omits the chip. */
  function footballHitRate(rows) {
    const stats = footballHitStats(rows);
    if (!stats.decided) return null;
    const pct = Math.round((stats.hits / stats.decided) * 100);
    return '命中 ' + stats.hits + '/' + stats.decided + ' • ' + pct + '%';
  }

  function footballHitFraction(rows) {
    const stats = footballHitStats(rows);
    return stats.hits + '/' + stats.decided;
  }

  function footballHitHtml(rows) {
    const text = footballHitRate(rows);
    if (!text) return '';
    return '<span class="fb-hit">' + escapeHtml(text) + '</span>';
  }

  function footballSectionTitle(titleHtml, updated, rows) {
    return '<h2 class="panel-title fb-title-row"><span class="fb-title-main">' +
      titleHtml + panelUpdatedHtml(updated) + '</span>' +
      footballHitHtml(rows) + '</h2>';
  }

  function formatFbConfidence(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (t.indexOf('%') >= 0 || t.indexOf('％') >= 0) return t.replace(/％/g, '%');
    const n = Number(t);
    if (!Number.isFinite(n)) return t;
    const pct = n > 0 && n <= 1 ? n * 100 : n;
    const rounded = Math.round(pct * 10) / 10;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
  }

  /** Sheet odds stay as written; the card always shows two decimals. */
  function formatFbOdds(text) {
    const t = String(text == null ? '' : text).trim().replace(/倍$/, '');
    if (!t) return '';
    const n = Number(t);
    if (!Number.isFinite(n)) return t;
    return n.toFixed(2);
  }

  /**
   * Team and 買法 use the same green as a winning W. Odds stay the normal value colour.
   * 買法 is the sheet text, including +0.5, +0/0.5, 受半/一, or a parenthetical line.
   * A bare 讓球 主勝 is shown as written; this does not invent a line.
   */
  function footballPickBits(tip) {
    const bits = [];
    if (tip.pick) bits.push('<span class="pl-pos">' + escapeHtml(tip.pick) + '</span>');
    if (tip.line) bits.push('<span class="pl-pos">(' + escapeHtml(tip.line) + ')</span>');
    const odds = formatFbOdds(tip.odds);
    if (odds) bits.push(escapeHtml(odds + '倍'));
    return bits;
  }

  function footballPickHtml(tip) {
    const bits = footballPickBits(tip);
    if (!bits.length) return '';
    return '<div class="fb-field fb-field-wide">' +
      '<span class="fb-k">推介</span>' +
      '<span class="fb-v">' + bits.join(' ') + '</span></div>';
  }

  /**
   * Net odds (under 1.2) convert as 1+odds; longer prices are already decimal.
   */
  function footballParlayFactor(oddsText) {
    const shown = formatFbOdds(oddsText);
    const n = Number(shown);
    if (!shown || !Number.isFinite(n)) return null;
    const rounded = Number(n.toFixed(2));
    if (rounded < 1.2) return { text: '(1+' + rounded.toFixed(2) + ')', value: 1 + rounded };
    return { text: rounded.toFixed(2), value: rounded };
  }

  /** Auto legs only. 讓球主客和 does not match. */
  const FOOTBALL_AUTO_HANDICAP = /^讓球\s*(主勝|客勝)/;
  const FOOTBALL_LOCKED_DAY = '2026-10-17';
  const FOOTBALL_LOCKED_LEGS = [
    { match: '艾華斯堡', pick: '艾華斯堡', line: '讓球 主勝 +0', odds: '0.83' },
    { match: '華倫西亞', pick: '華倫西亞', line: '讓球 主勝 +0/0.5', odds: '0.90' },
  ];

  /**
   * 穩陣過關 legs, first match wins:
   * 1. Tab 穩陣過關 has ≥2 rows for the day → those rows, odds from the tab.
   * 2. Tips column 過關 is Y/是/1 on any row that day → only those rows, sheet odds.
   * 3. 2026-10-17 with no marks → 艾華斯堡 讓球 主勝 +0 at 0.83 and 華倫西亞 讓球 主勝 +0/0.5 at 0.90.
   * 4. Otherwise stake>0 rows whose 買法 matches /^讓球\s*(主勝|客勝)/.
   * Fewer than two priced legs hides the panel.
   */
  function footballStableLegs(tips, date, locks, sheetRows) {
    const fromSheet = (sheetRows || []).filter((row) => row.date === date);
    if (fromSheet.length >= 2) return fromSheet;
    const marked = (locks || []).filter((row) => row.date === date);
    if (marked.length) return marked;
    if (date === FOOTBALL_LOCKED_DAY) {
      return FOOTBALL_LOCKED_LEGS.map((spec) => {
        const hit = (tips || []).find((tip) => String(tip.match || '').indexOf(spec.match) >= 0);
        return {
          date: date,
          match: hit && hit.match ? hit.match : spec.match,
          pick: spec.pick,
          line: spec.line,
          odds: spec.odds,
          result: hit && hit.result ? hit.result : '',
          wl: hit && hit.wl ? hit.wl : '',
        };
      });
    }
    return (tips || []).filter((tip) => {
      if (!(Number(tip.stake) > 0)) return false;
      return FOOTBALL_AUTO_HANDICAP.test(String(tip.line || '').trim());
    });
  }

  /** Fill 賽果 and W/L from the tips sheet when a lock row does not carry them. */
  function footballCopyTipResult(leg, tips) {
    if (!leg) return leg;
    if (String(leg.result || '').trim() || String(leg.wl || '').trim()) return leg;
    const key = footballMatchKey(leg.match);
    if (!key) return leg;
    const hit = (tips || []).find((tip) => {
      return footballMatchKey(tip.match) === key &&
        (String(tip.result || '').trim() || String(tip.wl || '').trim());
    });
    if (!hit) return leg;
    return Object.assign({}, leg, { result: hit.result, wl: hit.wl });
  }

  /** Right-hand mark. Hidden until that 場次 has a 賽果. */
  function footballLegResultHtml(tip) {
    const result = String(tip && tip.result || '').trim();
    if (!result) return '';
    const icon = footballOutcomeIcon(tip.wl, result, tip.line);
    const iconHtml = icon ? '<span class="fb-result-icon">' + icon + '</span>' : '';
    return '<span class="fb-leg-result">' + iconHtml + '賽果 ' + escapeHtml(result) + '</span>';
  }

  function footballRound2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Settlement multiple on the decimal price.
   * W = D, WH = (D+1)/2, P = 1, LH = 0.5, L = 0. Blank W/L is still open.
   */
  function footballResultFactor(decimal, wl) {
    const code = normalizeFootballWl(wl);
    if (code === 'W') return decimal;
    if (code === 'WH') return (decimal + 1) / 2;
    if (code === 'P') return 1;
    if (code === 'LH') return 0.5;
    if (code === 'L') return 0;
    return null;
  }

  /**
   * Product of settled leg factors.
   * A lost leg zeros the parlay even when another leg is still open.
   * Any other open leg leaves the product unknown.
   */
  function footballSettledProduct(legs) {
    let product = 1;
    let open = false;
    for (let i = 0; i < legs.length; i++) {
      const factor = footballResultFactor(legs[i].factor.value, legs[i].tip.wl);
      if (factor === 0) return 0;
      if (factor == null) open = true;
      else product *= factor;
    }
    return open ? null : product;
  }

  /**
   * Sum of the six 五串六 combo returns.
   * A combo that includes a loss is 0. Any other open combo leaves the sum unknown.
   */
  function footballFiveSettledSum(legs) {
    const factors = legs.map((leg) => footballResultFactor(leg.factor.value, leg.tip.wl));
    let sum = 0;
    for (let skip = 0; skip <= factors.length; skip++) {
      let product = 1;
      let open = false;
      let lost = false;
      for (let i = 0; i < factors.length; i++) {
        if (i === skip) continue;
        const factor = factors[i];
        if (factor === 0) lost = true;
        else if (factor == null) open = true;
        else product *= factor;
      }
      if (lost) continue;
      if (open) return null;
      sum += product;
    }
    return sum;
  }

  /** Stake times the factor already rounded to 2 decimals, so the footer matches the money. */
  function footballPackageMoney(stake, settled) {
    if (settled == null) return null;
    const shown = footballRound2(settled);
    const payout = footballRound2(stake * shown);
    const profit = footballRound2(payout - stake);
    return { shown: shown, stake: stake, payout: payout, profit: profit };
  }

  /** Two footer lines. Stake labels are the published text, not derived from leg count. */
  function footballPassFooterHtml(fullText, stakeLabel, stake, settled) {
    const line1 = '全中過關賠率：' + fullText + '倍｜' + stakeLabel;
    const money = footballPackageMoney(stake, settled);
    if (!money) {
      return '<div class="fb-pass-footers">' +
        '<p class="fb-parlay-odds">' + escapeHtml(line1) + '</p>' +
        '<p class="fb-parlay-odds">派彩 — · 盈虧 —</p></div>';
    }
    const netClass = money.profit > 0 ? 'pl-pos' : (money.profit < 0 ? 'pl-neg' : '');
    const line2 = '派彩 ' + formatFbMoney(money.payout) + ' (' + money.shown.toFixed(2) + '倍) · 盈虧 ';
    return '<div class="fb-pass-footers">' +
      '<p class="fb-parlay-odds">' + escapeHtml(line1) + '</p>' +
      '<p class="fb-parlay-odds">' + escapeHtml(line2) +
      '<span class="' + netClass + '">' + escapeHtml(formatFbSigned(money.profit)) + '</span></p></div>';
  }

  function footballParlayHtml(tips, updated) {
    const legs = [];
    (tips || []).forEach((tip) => {
      const factor = footballParlayFactor(tip.odds);
      if (!factor) return;
      legs.push({ tip: tip, factor: factor });
    });
    if (legs.length < 2) return '';
    const product = legs.reduce((total, leg) => total * leg.factor.value, 1);
    const productText = footballRound2(product).toFixed(2);
    const settled = footballSettledProduct(legs);
    const items = legs.map((leg) => {
      return '<li class="fb-parlay-leg"><span class="fb-leg-main">' +
        footballPickBits(leg.tip).join(' ') + '</span>' +
        footballLegResultHtml(leg.tip) + '</li>';
    }).join('');
    return '<section class="panel" id="football-parlay">' +
      footballSectionTitle('穩陣過關', updated, legs.map((leg) => leg.tip)) +
      '<p class="fb-parlay-sub">讓球過關 ' + legs.length + '×1</p>' +
      '<ul class="fb-parlay-list">' + items + '</ul>' +
      footballPassFooterHtml(productText, '注碼2注（$200）', 200, settled) +
      '</section>';
  }

  function footballConfidenceNumber(text) {
    const t = String(text || '').trim().replace(/％/g, '%');
    if (!t) return null;
    const hasPct = t.indexOf('%') >= 0;
    const n = Number(t.replace('%', ''));
    if (!Number.isFinite(n)) return null;
    if (!hasPct && n > 0 && n <= 1) return n * 100;
    return n;
  }

  /**
   * 五串六: five 4-leg parlays plus one 5-leg parlay.
   * Shown only when the day has at least five staked rows. If there are more,
   * the first five in sheet order are used — the same order as the tip cards.
   * Decimal d matches the 讓球 parlay. Footer stake text is the fixed $600 label.
   */
  function footballFiveHtml(tips, updated) {
    const rows = [];
    (tips || []).forEach((tip) => {
      if (!(Number(tip.stake) > 0)) return;
      const factor = footballParlayFactor(tip.odds);
      if (!factor) return;
      rows.push({ tip: tip, factor: factor });
    });
    if (rows.length < 5) return '';
    const chosen = rows.slice(0, 5);
    const values = chosen.map((leg) => leg.factor.value);
    let fourSum = 0;
    for (let skip = 0; skip < values.length; skip++) {
      let product = 1;
      for (let i = 0; i < values.length; i++) if (i !== skip) product *= values[i];
      fourSum += product;
    }
    const five = values.reduce((total, value) => total * value, 1);
    const fullText = footballRound2((fourSum + five) / 6).toFixed(2);
    const settledSum = footballFiveSettledSum(chosen);
    const settled = settledSum == null ? null : settledSum / 6;
    const items = chosen.map((leg) => {
      const match = leg.tip.match
        ? '<span class="fb-five-match">' + escapeHtml(leg.tip.match) + '</span>'
        : '';
      return '<li class="fb-parlay-leg fb-five-leg"><span class="fb-leg-main">' + match +
        '<span class="fb-five-pick">' + footballPickBits(leg.tip).join(' ') + '</span></span>' +
        footballLegResultHtml(leg.tip) + '</li>';
    }).join('');
    return '<section class="panel" id="football-five">' +
      footballSectionTitle('刀仔鋸大樹', updated, chosen.map((leg) => leg.tip)) +
      '<p class="fb-parlay-sub">五串六（5×6）</p>' +
      '<p class="fb-five-note">5×6 = 5 組四串一 + 1 組五串一，共 6 注</p>' +
      '<ul class="fb-parlay-list">' + items + '</ul>' +
      footballPassFooterHtml(fullText, '注碼1注（$600）', 600, settled) +
      '<p class="fb-note">註：最少要中四場先有錢收。</p></section>';
  }

  function footballSinglesBook(tips, unit) {
    const stats = summarizeFootball(tips || [], unit);
    if (!stats.count) return null;
    return {
      item: '單場推介',
      stake: stats.staked,
      payout: stats.profitKnown ? stats.payout : null,
      profit: stats.profitKnown ? stats.profit : null,
    };
  }

  function footballParlayBook(tips) {
    const legs = [];
    (tips || []).forEach((tip) => {
      const factor = footballParlayFactor(tip.odds);
      if (!factor) return;
      legs.push({ tip: tip, factor: factor });
    });
    if (legs.length < 2) return null;
    const money = footballPackageMoney(200, footballSettledProduct(legs));
    return {
      item: '穩陣過關',
      stake: 200,
      payout: money ? money.payout : null,
      profit: money ? money.profit : null,
    };
  }

  function footballFiveBook(tips) {
    const rows = [];
    (tips || []).forEach((tip) => {
      if (!(Number(tip.stake) > 0)) return;
      const factor = footballParlayFactor(tip.odds);
      if (!factor) return;
      rows.push({ tip: tip, factor: factor });
    });
    if (rows.length < 5) return null;
    const chosen = rows.slice(0, 5);
    const settledSum = footballFiveSettledSum(chosen);
    const settled = settledSum == null ? null : settledSum / 6;
    const money = footballPackageMoney(600, settled);
    return {
      item: '刀仔鋸大樹',
      stake: 600,
      payout: money ? money.payout : null,
      profit: money ? money.profit : null,
    };
  }

  function footballSumBooks(parts) {
    let stake = 0;
    let payout = 0;
    let profit = 0;
    let known = true;
    parts.forEach((part) => {
      stake += Number(part.stake) || 0;
      if (part.payout == null || part.profit == null) known = false;
      else {
        payout += part.payout;
        profit += part.profit;
      }
    });
    return {
      stake: footballRound2(stake),
      payout: known ? footballRound2(payout) : null,
      profit: known ? footballRound2(profit) : null,
    };
  }

  /**
   * Public 當日總結 is 單場推介 + 穩陣過關 + 刀仔鋸大樹.
   * A tab still labelled 全日分析 is a different ledger and is not used.
   */
  function footballSheetDayBook(rows, date) {
    const day = (rows || []).filter((row) => row.date === date && row.item);
    if (!day.length) return null;
    if (day.some((row) => row.item.indexOf('全日分析') >= 0)) return null;
    if (!day.some((row) => row.item.indexOf('單場') >= 0)) return null;
    const total = day.find((row) => row.kind === 'day-total');
    const parts = day.filter((row) => row.kind === 'part' && row.stake != null);
    if (total && total.stake != null && total.payout != null && total.profit != null) {
      return { total: total, parts: parts };
    }
    if (!parts.length) return null;
    return { total: footballSumBooks(parts), parts: parts };
  }

  function footballCumulativeBook(rows, model, stableRows) {
    const explicit = (rows || []).find((row) => {
      return row.kind === 'cumulative' &&
        row.stake != null && row.payout != null && row.profit != null;
    });
    if (explicit) return { total: explicit, parts: [] };
    const covered = {};
    const parts = [];
    (rows || []).forEach((row) => {
      if (!row.date || row.kind !== 'day-total') return;
      if (row.stake == null || row.payout == null || row.profit == null) return;
      const dayRows = rows.filter((item) => item.date === row.date);
      if (dayRows.some((item) => item.item.indexOf('全日分析') >= 0)) return;
      covered[row.date] = true;
      parts.push({
        item: footballDayLabel({ date: row.date }),
        stake: row.stake,
        payout: row.payout,
        profit: row.profit,
      });
    });
    ((model && model.days) || []).forEach((day) => {
      if (covered[day.date]) return;
      const computed = footballComputedDayBook(
        day.tips, model.unit, day.date, model.locks || [], stableRows || []
      );
      if (!computed || !computed.total || computed.total.payout == null || computed.total.profit == null) return;
      parts.push({
        item: footballDayLabel(day),
        stake: computed.total.stake,
        payout: computed.total.payout,
        profit: computed.total.profit,
      });
    });
    if (!parts.length) return null;
    return { total: footballSumBooks(parts), parts: parts.length > 1 ? parts : [] };
  }

  function footballComputedDayBook(tips, unit, date, locks, stableRows) {
    const parts = [];
    const singles = footballSinglesBook(tips, unit);
    if (singles) parts.push(singles);
    const stable = footballStableLegs(tips, date, locks, stableRows)
      .map((leg) => footballCopyTipResult(leg, tips));
    const parlay = footballParlayBook(stable);
    if (parlay) parts.push(parlay);
    const five = footballFiveBook(tips);
    if (five) parts.push(five);
    if (!parts.length) return null;
    return { total: footballSumBooks(parts), parts: parts };
  }

  function footballBookAmount(value) {
    return value == null ? '—' : formatFbMoney(value);
  }

  function footballBookSigned(value) {
    return value == null ? '—' : formatFbSigned(value);
  }

  function footballDayBookHtml(book, updated, id, title) {
    if (!book || !book.total) {
      return '<section class="panel" id="' + id + '">' +
        panelTitleHtml(escapeHtml(title), updated) +
        '<p class="fb-pending">未有' + escapeHtml(title) + '</p></section>';
    }
    const total = book.total;
    const profitClass = total.profit > 0 ? 'pl-pos' : (total.profit < 0 ? 'pl-neg' : '');
    const lines = (book.parts || []).map((part) => {
      const cls = part.profit > 0 ? 'pl-pos' : (part.profit < 0 ? 'pl-neg' : '');
      const signed = part.profit == null ? '—' : formatFbSigned(part.profit);
      const signedHtml = part.profit == null
        ? '—'
        : '<span class="' + cls + '">' + escapeHtml(signed) + '</span>';
      return '<li class="fb-day-line"><span class="fb-day-name">' + escapeHtml(part.item) + '</span>' +
        '<span class="fb-day-amt">投注 ' + escapeHtml(footballBookAmount(part.stake)) +
        ' · 派彩 ' + escapeHtml(footballBookAmount(part.payout)) +
        ' · ' + signedHtml + '</span></li>';
    }).join('');
    return '<section class="panel" id="' + id + '">' +
      panelTitleHtml(escapeHtml(title), updated) +
      '<div class="fb-stats">' +
      footballStatHtml('投注額', footballBookAmount(total.stake)) +
      footballStatHtml('派彩', footballBookAmount(total.payout)) +
      footballStatHtml('盈虧', footballBookSigned(total.profit), profitClass, true) +
      (total.units != null ? footballStatHtml('總注數', formatFbUnits(total.units)) : '') +
      '</div>' +
      (lines ? '<ul class="fb-day-lines">' + lines + '</ul>' : '') +
      '</section>';
  }

  function footballPassHtml(tips, updated, date, locks, sheetRows) {
    const legs = footballStableLegs(tips, date, locks, sheetRows)
      .map((leg) => footballCopyTipResult(leg, tips));
    const parlay = footballParlayHtml(legs, updated);
    const five = footballFiveHtml(tips, updated);
    if (!parlay && !five) return '';
    return '<div id="football-pass">' +
      '<h2 class="fb-pass-head">是日過關推介' + panelUpdatedHtml(updated) + '</h2>' +
      parlay + five + '</div>';
  }

  function formatFbStake(stake, unit) {
    return formatFbUnits(stake) + '（' + formatFbMoney(Number(stake) * unit) + '）';
  }

  function summarizeFootball(tips, unit) {
    const out = {
      units: 0,
      staked: 0,
      payout: 0,
      profit: 0,
      profitKnown: 0,
      settledStake: 0,
      hits: 0,
      decided: 0,
      pending: 0,
      count: tips.length,
    };
    tips.forEach((tip) => {
      const units = Number(tip.stake) || 0;
      const amt = units * unit;
      out.units += units;
      out.staked += amt;
      const wl = tip.wl;
      const known = wl === 'W' || wl === 'WH' || wl === 'P' || wl === 'LH' || wl === 'L';
      const hasProfit = tip.profit != null && Number.isFinite(Number(tip.profit));
      if (!known && !hasProfit) {
        out.pending += 1;
        return;
      }
      if (hasProfit) {
        const profit = Number(tip.profit);
        out.profit += profit;
        out.payout += amt + profit;
        out.settledStake += amt;
        out.profitKnown += 1;
      }
      if (wl === 'W' || wl === 'WH') {
        out.hits += 1;
        out.decided += 1;
      } else if (wl === 'L' || wl === 'LH') {
        out.decided += 1;
      }
    });
    return out;
  }

  function footballStatHtml(label, value, valueClass, wide) {
    return '<div class="fb-stat' + (wide ? ' fb-stat-wide' : '') + '">' +
      '<span class="fb-k">' + label + '</span>' +
      '<span class="fb-n' + (valueClass ? ' ' + valueClass : '') + '">' + escapeHtml(value) + '</span></div>';
  }

  function footballSummaryHtml(id, title, tips, unit, updated) {
    const stats = summarizeFootball(tips, unit);
    const payout = stats.profitKnown ? formatFbMoney(stats.payout) : '—';
    const profitText = stats.profitKnown ? formatFbSigned(stats.profit) : '—';
    const profitClass = !stats.profitKnown ? '' : (stats.profit > 0 ? 'pl-pos' : (stats.profit < 0 ? 'pl-neg' : ''));
    let extra = '';
    if (stats.pending && stats.profitKnown) {
      extra = '<p class="fb-note">已結投注 ' + escapeHtml(formatFbMoney(stats.settledStake)) +
        ' · 未結 ' + stats.pending + ' 場</p>';
    } else if (stats.pending) {
      extra = '<p class="fb-note">未結 ' + stats.pending + ' 場</p>';
    }
    return '<section class="panel" id="' + id + '">' + panelTitleHtml(escapeHtml(title), updated) +
      '<div class="fb-stats">' +
      footballStatHtml('總注數', formatFbUnits(stats.units)) +
      footballStatHtml('投注額', formatFbMoney(stats.staked)) +
      footballStatHtml('派彩', payout) +
      footballStatHtml('盈虧', profitText, profitClass) +
      footballStatHtml('命中率', formatFbPct(stats.hits, stats.decided), '', true) +
      '</div>' + extra + '</section>';
  }

  function footballFieldHtml(label, value, wide) {
    if (value == null || String(value).trim() === '') return '';
    return '<div class="fb-field' + (wide ? ' fb-field-wide' : '') + '">' +
      '<span class="fb-k">' + label + '</span>' +
      '<span class="fb-v">' + escapeHtml(String(value)) + '</span></div>';
  }

  function footballMatchKey(name) {
    return String(name || '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  /** Icon from a W/L code only. A bare score does not invent one. */
  function footballWlIcon(wl) {
    const code = normalizeFootballWl(wl);
    if (code === 'W' || code === 'WH') return '✅';
    if (code === 'L' || code === 'LH') return '❌';
    if (code === 'P') return '➖';
    return '';
  }

  /** W/WH ✅, L/LH ❌, P ➖. A bare score can settle a 主客和 pick when W/L is blank. */
  function footballOutcomeIcon(wl, result, line) {
    const fromCode = normalizeFootballWl(wl);
    const fromResult = normalizeFootballWl(result);
    const code = (fromCode === 'W' || fromCode === 'WH' || fromCode === 'L' || fromCode === 'LH' || fromCode === 'P')
      ? fromCode
      : ((fromResult === 'W' || fromResult === 'WH' || fromResult === 'L' || fromResult === 'LH' || fromResult === 'P') ? fromResult : '');
    if (code === 'W' || code === 'WH') return '✅';
    if (code === 'L' || code === 'LH') return '❌';
    if (code === 'P') return '➖';
    const text = String(result || '').trim();
    if (!text) return '';
    if (/走盤|走水|push/i.test(text)) return '➖';
    if (/贏半|赢半/.test(text)) return '✅';
    if (/輸半|输半/.test(text)) return '❌';
    if (/全贏|全赢/.test(text)) return '✅';
    if (/全輸|全输/.test(text)) return '❌';
    const score = text.match(/(\d+)\s*[-:：]\s*(\d+)/);
    if (!score) return '';
    const market = String(line || '');
    if (/讓球|受讓/.test(market)) return '';
    const home = Number(score[1]);
    const away = Number(score[2]);
    const actual = home > away ? 'H' : (home < away ? 'A' : 'D');
    let side = '';
    if (/主勝/.test(market)) side = 'H';
    else if (/客勝/.test(market)) side = 'A';
    else if (/和局|打和|平局/.test(market)) side = 'D';
    if (!side) return '';
    return actual === side ? '✅' : '❌';
  }

  function footballResultHtml(tip) {
    const parts = [];
    const icon = footballOutcomeIcon(tip.wl, tip.result, tip.line);
    const iconHtml = icon ? '<span class="fb-result-icon">' + icon + '</span>' : '';
    if (tip.result) parts.push('<span>' + iconHtml + '賽果 ' + escapeHtml(tip.result) + '</span>');
    else if (icon) parts.push('<span>' + iconHtml + '</span>');
    if (tip.wl) {
      const label = FOOTBALL_WL[tip.wl] ? tip.wl + ' ' + FOOTBALL_WL[tip.wl] : tip.wl;
      const cls = tip.wl === 'W' || tip.wl === 'WH' ? 'pl-pos' : (tip.wl === 'L' || tip.wl === 'LH' ? 'pl-neg' : '');
      parts.push('<span class="' + cls + '">' + escapeHtml(label) + '</span>');
    }
    if (tip.profit != null && Number.isFinite(Number(tip.profit))) {
      const profit = Number(tip.profit);
      const cls = profit > 0 ? 'pl-pos' : (profit < 0 ? 'pl-neg' : '');
      parts.push('<span class="' + cls + '">' + escapeHtml(formatFbSigned(profit)) + '</span>');
    }
    if (!parts.length) return '<p class="fb-pending">未有賽果</p>';
    return '<p class="fb-settled">' + parts.join('<span class="fb-dot"> · </span>') + '</p>';
  }

  function footballCardHtml(tip, unit) {
    const bits = [];
    if (tip.ko) bits.push(tip.ko);
    if (tip.league) bits.push(tip.league);
    const head = bits.length
      ? '<span class="fb-ko">' + escapeHtml(bits.join(' · ')) + '</span>'
      : '<span class="fb-ko"></span>';
    const status = tip.status
      ? '<span class="fb-status ' + (tip.status === '確認' ? 'fb-status-ok' : 'fb-status-wait') + '">' +
        escapeHtml(tip.status) + '</span>'
      : '';
    const conf = formatFbConfidence(tip.confidence);
    let match = '';
    if (tip.match || conf) {
      match = '<p class="fb-match">' +
        (tip.match ? '<span class="fb-match-name">' + escapeHtml(tip.match) + '</span>' : '') +
        (tip.match && conf ? '<span class="fb-conf-sep">｜</span>' : '') +
        (conf ? '<span class="fb-conf">信心 ' + escapeHtml(conf) + '</span>' : '') +
        '</p>';
    }
    return '<article class="fb-card">' +
      '<div class="fb-top">' + head + status + '</div>' +
      match +
      '<div class="fb-fields">' +
      footballPickHtml(tip) +
      footballFieldHtml('注碼', formatFbStake(tip.stake, unit), true) +
      footballFieldHtml('推介原因', tip.reason, true) +
      '</div>' +
      footballResultHtml(tip) +
      '</article>';
  }

  /**
   * ≤52 → 1, 53–54 → 4, 55 → 2, 56 or ≥59 → 3, 57–58 → 5.
   */
  function footballStarCount(confidence) {
    const n = footballConfidenceNumber(confidence);
    if (n == null) return null;
    if (n <= 52) return 1;
    if (n <= 54) return 4;
    if (n < 56) return 2;
    if (n < 57 || n >= 59) return 3;
    return 5;
  }

  function footballStarsHtml(confidence) {
    const n = footballStarCount(confidence);
    const cls = n == null ? 'fb-stars' : 'fb-stars fb-stars-' + n;
    const label = n == null ? '未有星' : n + '星';
    let html = '<span class="' + cls + '" aria-label="' + label + '">';
    for (let i = 1; i <= 5; i++) {
      html += '<span class="fb-star' + (n != null && i <= n ? ' on' : '') + '">★</span>';
    }
    return html + '</span>';
  }

  /** 推介 is the team. 買法 stays verbatim after a leading copy of the team; the line is not stripped. */
  function footballAllDayParts(row) {
    let team = String(row.pick || '').trim();
    let market = String(row.line || '').trim();
    if (team && market) {
      if (market === team) market = '';
      else if (market.indexOf(team) === 0) market = market.slice(team.length).trim();
    }
    if (!team && market && market !== '—' && market !== '-' && market !== '–') {
      const sides = String(row.match || '').split(/\s+(?:vs|VS|對)\s+/);
      const hit = sides.map((side) => side.trim()).filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .find((side) => market.indexOf(side) === 0);
      if (hit) {
        team = hit;
        market = market.slice(hit.length).trim();
      }
    }
    if (market === '—' || market === '-' || market === '–') market = '';
    if (!team && !market) market = '—';
    return { team: team, market: market };
  }

  function footballNameKey(name) {
    return String(name || '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  /** Home or away when the pick name sits inside exactly one side of 場次. */
  function footballSideOf(match, team) {
    const parts = String(match || '').split(/\s+(?:vs|VS|對)\s+/);
    if (parts.length < 2) return '';
    const home = footballNameKey(parts[0]);
    const away = footballNameKey(parts[1]);
    const needle = footballNameKey(team);
    if (needle.length < 2 || !home || !away) return '';
    const homeHit = home.indexOf(needle) >= 0 || needle.indexOf(home) >= 0;
    const awayHit = away.indexOf(needle) >= 0 || needle.indexOf(away) >= 0;
    if (homeHit && !awayHit) return 'H';
    if (awayHit && !homeHit) return 'A';
    return '';
  }

  /**
   * Signed Asian line from the picked team's point of view.
   * 受 is positive, 讓 is negative, 平手 is 0. Null when the line is not explicit.
   */
  function footballAsianLine(text) {
    const src = String(text || '').replace(/\s+/g, '').replace(/／/g, '/');
    const tokens = [
      ['兩球半/三', 2.75], ['兩/兩球半', 2.25], ['球半/兩球', 1.75], ['球半/兩', 1.75],
      ['一/球半', 1.25], ['兩球半', 2.5], ['球半', 1.5], ['半/一', 0.75], ['平/半', 0.25],
      ['三球', 3], ['兩球', 2], ['一球', 1], ['半球', 0.5], ['平手', 0]
    ];
    let at = -1;
    let line = null;
    let token = '';
    tokens.forEach((pair) => {
      const found = src.indexOf(pair[0]);
      if (found < 0) return;
      if (at < 0 || found < at || (found === at && pair[0].length > token.length)) {
        at = found;
        line = pair[1];
        token = pair[0];
      }
    });
    if (at < 0) {
      const num = src.match(/(讓|受)(\d+(?:\.\d+)?)(?!X2)/);
      if (!num || /讓球主客和/.test(src)) return null;
      return (num[1] === '受' ? 1 : -1) * Number(num[2]);
    }
    if (line === 0) return 0;
    const before = src.slice(0, at);
    const receive = /受[^受讓]*$/.test(before) || src.indexOf('受') >= 0 && src.indexOf('讓') < 0;
    const give = /讓[^受讓]*$/.test(before) || src.indexOf('讓') >= 0 && src.indexOf('受') < 0;
    if (receive && !give) return line;
    if (give && !receive) return -line;
    return null;
  }

  function footballSettleMargin(margin, line) {
    const quarters = Math.round(line * 4);
    const split = Math.abs(line * 4 - quarters) < 1e-6 && Math.abs(quarters) % 2 === 1;
    const judge = (adj) => (adj > 1e-9 ? 1 : (adj < -1e-9 ? -1 : 0));
    if (!split) {
      const adj = judge(margin + line);
      if (adj > 0) return 'W';
      if (adj < 0) return 'L';
      return 'P';
    }
    const low = judge(margin + line - 0.25);
    const high = judge(margin + line + 0.25);
    if (low === 1 && high === 1) return 'W';
    if (low === -1 && high === -1) return 'L';
    if (low + high === 1) return 'WH';
    if (low + high === -1) return 'LH';
    return '';
  }

  function footballSettle1x2(home, away, side) {
    const actual = home > away ? 'H' : (home < away ? 'A' : 'D');
    if (actual === side) return 'W';
    return 'L';
  }

  /**
   * Fallback when neither 全日分析 W/L nor the tips sheet has a code.
   * Returns '' when the 買法 cannot be read; the caller then shows ➖.
   */
  function footballDeriveAllDayWl(row) {
    const score = String(row.result || '').match(/(\d+)\s*[-:：]\s*(\d+)/);
    if (!score) return '';
    const homeGoals = Number(score[1]);
    const awayGoals = Number(score[2]);
    const parts = footballAllDayParts(row);
    let team = parts.team;
    if (!team || team === '主客和' || /讓|受|主勝|客勝|平手|和局/.test(team)) team = '';
    const market = (String(row.pick || '') + String(row.line || '') + String(parts.market || '')).replace(/\s+/g, '');
    const hha = market.match(/讓球主客和\(([+-]?\d+(?:\.\d+)?)\)(主|客|和)?/);
    if (hha) {
      const shift = Number(hha[1]);
      const bet = hha[2] === '客' ? 'A' : (hha[2] === '和' ? 'D' : (hha[2] === '主' ? 'H' : ''));
      if (!bet || !Number.isFinite(shift)) return '';
      const home = homeGoals;
      const away = awayGoals + shift;
      return footballSettle1x2(home, away, bet);
    }
    const line = footballAsianLine(market);
    if (line != null) {
      let side = team ? footballSideOf(row.match, team) : '';
      if (!side && /平手客|客勝/.test(market) && !/主勝/.test(market)) side = 'A';
      else if (!side && /主勝/.test(market)) side = 'H';
      if (side !== 'H' && side !== 'A') return '';
      const margin = side === 'H' ? homeGoals - awayGoals : awayGoals - homeGoals;
      return footballSettleMargin(margin, line);
    }
    if (/讓|受/.test(market)) return '';
    if (/和局|打和|平局/.test(market)) return footballSettle1x2(homeGoals, awayGoals, 'D');
    if (/客勝/.test(market)) return footballSettle1x2(homeGoals, awayGoals, 'A');
    if (/主勝/.test(market)) return footballSettle1x2(homeGoals, awayGoals, 'H');
    return '';
  }

  /** Sheet or tips W/L, else the same score reading the icon uses. */
  function footballResolvedWl(row) {
    const code = normalizeFootballWl(row && row.wl);
    if (code === 'W' || code === 'WH' || code === 'L' || code === 'LH' || code === 'P') return code;
    if (!(Number(row && row.stake) > 0)) return '';
    if (!String(row && row.result || '').trim()) return '';
    const derived = normalizeFootballWl(footballDeriveAllDayWl(row));
    if (derived === 'W' || derived === 'WH' || derived === 'L' || derived === 'LH' || derived === 'P') return derived;
    return '';
  }

  /**
   * Icon under the kickoff. Column W/L wins, then the tips sheet, then the
   * score read against 買法. 注數 > 0 with a 賽果 never stays blank.
   */
  function footballAllDayIcon(row) {
    const score = String(row.result || '').trim();
    if (!score) return '';
    const known = footballWlIcon(row.wl);
    if (known) return known;
    if (!(Number(row.stake) > 0)) return '';
    return footballWlIcon(footballDeriveAllDayWl(row)) || '➖';
  }

  function footballAllDayRowHtml(row) {
    const odds = formatFbOdds(row.odds) || '—';
    const stake = row.stake == null || !Number.isFinite(Number(row.stake))
      ? '—'
      : formatFbUnits(row.stake);
    const stars = footballStarCount(row.confidence);
    const parts = footballAllDayParts(row);
    const team = parts.team
      ? '<span class="fb-all-team">' + escapeHtml(parts.team) + '</span>'
      : '';
    const market = parts.market
      ? '<span class="fb-all-market">' + escapeHtml(parts.market) + '</span>'
      : '';
    const score = String(row.result || '').trim();
    const icon = footballAllDayIcon(row);
    const iconHtml = icon ? '<span class="fb-all-icon">' + icon + '</span>' : '';
    const scoreHtml = score ? '<span class="fb-all-score">賽果 ' + escapeHtml(score) + '</span>' : '';
    const stakeNum = Number(row.stake);
    return '<li class="fb-all-row"' +
      (stars == null ? '' : ' data-stars="' + stars + '"') +
      ' data-stake="' + (Number.isFinite(stakeNum) ? stakeNum : '') + '"' +
      ' data-wl="' + escapeAttr(footballResolvedWl(row)) + '">' +
      '<span class="fb-all-time">' + escapeHtml(row.time || '') + '</span>' +
      iconHtml +
      '<span class="fb-all-match">' + escapeHtml(row.match || '—') + '</span>' +
      '<div class="fb-all-bot">' +
      team +
      market +
      '<span class="fb-all-odds">' + escapeHtml(odds) + '</span>' +
      '<span class="fb-all-stake">' + escapeHtml(stake) + '</span>' +
      scoreHtml +
      footballStarsHtml(row.confidence) +
      '</div>' +
      '</li>';
  }

  function footballAttachResults(rows, tips) {
    const byMatch = new Map();
    (tips || []).forEach((tip) => {
      const key = footballMatchKey(tip.match);
      if (key && (tip.wl || tip.result)) byMatch.set(key, tip);
    });
    return (rows || []).map((row) => {
      const hit = byMatch.get(footballMatchKey(row.match));
      const result = String(row.result || '').trim() || (hit ? String(hit.result || '').trim() : '');
      const wl = String(row.wl || '').trim() || (hit ? String(hit.wl || '').trim() : '');
      if (result === String(row.result || '').trim() && wl === String(row.wl || '').trim()) return row;
      return Object.assign({}, row, { result: result, wl: wl });
    });
  }

  function footballStarChipHtml(n) {
    return '<label class="fb-star-chip fb-stars-' + n + '">' +
      '<input type="checkbox" data-fb-star="' + n + '" checked>' +
      '<span class="fb-chip-star" aria-hidden="true">★</span>' +
      '<span>' + n + '星</span></label>';
  }

  function footballAddDays(iso, days) {
    const matched = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return '';
    const dt = new Date(Date.UTC(+matched[1], +matched[2] - 1, +matched[3]));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.getUTCFullYear() + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getUTCDate()).padStart(2, '0');
  }

  /**
   * Minutes after the selected day's midnight. A kickoff before 12:00 rolls to
   * the next morning when 場次/聯賽 says 凌晨, or the row date / a parenthetical
   * date is the next calendar day. Sheet order breaks ties.
   */
  function footballKickoffRank(item, dayIso) {
    const timeText = String(item.time || item.ko || '');
    const blob = timeText + ' ' + String(item.match || '') + ' ' + String(item.league || '');
    const hm = timeText.match(/(\d{1,2})\s*:\s*(\d{2})/);
    const hour = hm ? Number(hm[1]) : null;
    const minute = hm ? Number(hm[2]) : 0;
    const valid = hour != null && hour <= 23 && minute <= 59;
    const nextDay = footballAddDays(dayIso, 1);
    const nextParts = nextDay.match(/-(\d{2})-(\d{2})$/);
    const paren = blob.match(/[（(]\s*(\d{1,2})\s*[/／]\s*(\d{1,2})/);
    const parenNext = !!(paren && nextParts &&
      Number(paren[1]) === Number(nextParts[1]) && Number(paren[2]) === Number(nextParts[2]));
    const roll = valid && hour < 12 && (/凌晨/.test(blob) || parenNext || item.date === nextDay);
    if (!valid) return 3 * 24 * 60;
    return (roll ? 24 * 60 : 0) + hour * 60 + minute;
  }

  function footballByKickoff(items, dayIso) {
    return (items || []).map((item, index) => ({ item: item, index: index }))
      .sort((a, b) => {
        const delta = footballKickoffRank(a.item, dayIso) - footballKickoffRank(b.item, dayIso);
        return delta || a.index - b.index;
      })
      .map((entry) => entry.item);
  }

  function footballAllDayHtml(allday, date, updated, tips) {
    const rows = footballByKickoff(
      footballAttachResults(
        (allday && allday.rows ? allday.rows : []).filter((row) => row.date === date),
        tips
      ),
      date
    );
    const source = allday && allday.source ? allday.source : '';
    const chips = [1, 2, 3, 4, 5].map(footballStarChipHtml).join('');
    const starredHits = rows
      .filter((row) => Number(row.stake) > 0 && footballStarCount(row.confidence) != null)
      .map((row) => ({ wl: footballResolvedWl(row) }));
    const body = rows.length
      ? '<div class="fb-star-filter">' +
        '<div class="fb-star-chips" role="group" aria-label="星級篩選">' + chips + '</div>' +
        '<p class="fb-star-count">' + footballHitFraction(starredHits) + '</p></div>' +
        '<ul class="fb-all-list">' + rows.map(footballAllDayRowHtml).join('') + '</ul>'
      : '<p class="fb-pending">呢日未有全日分析</p>';
    const hitRows = rows
      .filter((row) => Number(row.stake) > 0)
      .map((row) => ({ wl: footballResolvedWl(row) }));
    return '<section class="panel" id="football-allday" data-source="' + escapeAttr(source) + '">' +
      footballSectionTitle('全日分析', updated, hitRows) +
      body +
      '</section>';
  }

  function applyFootballStarFilter() {
    const panel = document.getElementById('football-allday');
    if (!panel) return;
    const selected = {};
    let any = false;
    panel.querySelectorAll('input[data-fb-star]').forEach((input) => {
      if (input.checked) {
        selected[input.getAttribute('data-fb-star')] = true;
        any = true;
      }
    });
    const counted = [];
    panel.querySelectorAll('.fb-all-row').forEach((row) => {
      const show = !!selected[row.getAttribute('data-stars')];
      row.hidden = !show;
      if (any && !show) return;
      if (!(Number(row.getAttribute('data-stake')) > 0)) return;
      counted.push({ wl: row.getAttribute('data-wl') });
    });
    const count = panel.querySelector('.fb-star-count');
    if (count) count.textContent = footballHitFraction(counted);
  }

  function paintFootball(model, source, wanted, allday, stableRows, dayBook) {
    const host = $('#football-body');
    if (!host) return;
    host.dataset.source = source;
    const days = model.days || [];
    const latest = days.reduce((best, day) => (!best || day.date > best.date ? day : best), null);
    const selected = days.find((day) => day.date === wanted) || latest;
    const updated = latest ? latest.date : '';
    pageTitle.textContent = '波盤推介';
    pageSub.classList.remove('subtitle-profit');
    pageSub.hidden = false;
    if (!selected) {
      pageSub.textContent = '暫未有推介';
      host.innerHTML = '<p class="empty">暫未有注數大於 0 的推介</p>';
      return;
    }
    pageSub.textContent = footballDayLabel(selected) + ' · ' + selected.tips.length + '場';
    const ordered = days.slice().sort((a, b) => b.date.localeCompare(a.date));
    const options = ordered.map((day) => {
      const latestMark = latest && day.date === latest.date ? '（最新）' : '';
      return '<option value="' + escapeAttr(day.date) + '"' +
        (day.date === selected.date ? ' selected' : '') + '>' +
        escapeHtml(footballDayLabel(day) + ' ' + day.date + latestMark) + '</option>';
    }).join('');
    host.innerHTML =
      '<section class="panel" id="football-history">' +
      panelTitleHtml('過往日期', updated) +
      '<div class="fb-pad"><label class="fb-date"><span class="sr-only">日期</span>' +
      '<select id="football-date" aria-label="日期">' + options + '</select></label></div></section>' +
      footballPassHtml(selected.tips, updated, selected.date, model.locks || [], stableRows || []) +
      '<section class="panel" id="football-matches">' +
      footballSectionTitle(escapeHtml(footballDayLabel(selected) + '單場推介'), updated, selected.tips) +
      footballByKickoff(selected.tips, selected.date).map((tip) => footballCardHtml(tip, model.unit)).join('') +
      '</section>' +
      '<div id="football-summaries">' +
      footballDayBookHtml(
        footballSheetDayBook(dayBook, selected.date) ||
        footballComputedDayBook(selected.tips, model.unit, selected.date, model.locks || [], stableRows || []),
        updated,
        'football-day-summary',
        '當日總結'
      ) +
      footballDayBookHtml(
        footballCumulativeBook(dayBook, model, stableRows || []),
        updated,
        'football-cumulative',
        '累計總結'
      ) +
      '<p class="fb-note fb-rule">1注=$' + escapeHtml(String(model.unit)) +
      '。命中率計全贏同贏半，走盤唔計。未結場唔計入派彩、盈虧、命中率。</p></div>' +
      footballAllDayHtml(allday, selected.date, updated, selected.tips);
  }

  function bindFootballOnce() {
    if (!viewFootball || viewFootball.dataset.bound === '1') return;
    viewFootball.dataset.bound = '1';
    viewFootball.addEventListener('change', (event) => {
      const target = event.target;
      if (!target) return;
      if (target.matches && target.matches('input[data-fb-star]')) {
        applyFootballStarFilter();
        return;
      }
      if (target.id !== 'football-date') return;
      if (target.value) location.hash = '#/football/' + target.value;
    });
  }

  async function renderFootball(wanted) {
    const token = ++footballLoad;
    viewHome.hidden = true;
    viewDetail.hidden = true;
    viewWind.hidden = true;
    viewFlying.hidden = true;
    viewCombo.hidden = true;
    viewFootball.hidden = false;
    btnBack.hidden = false;
    pageTitle.textContent = '波盤推介';
    pageSub.classList.remove('subtitle-profit');
    pageSub.hidden = false;
    pageSub.textContent = '載入中…';
    const status = $('#football-status');
    const host = $('#football-body');
    if (status) {
      status.hidden = false;
      status.textContent = '載入中…';
    }
    if (host) host.innerHTML = '';
    bindFootballOnce();
    try {
      const loadedPromise = loadFootball();
      const alldayPromise = loadFootballAllDay();
      const stablePromise = loadFootballStable();
      const dayBookPromise = loadFootballDayBook();
      const loaded = await loadedPromise;
      const allday = await alldayPromise;
      const stableRows = await stablePromise;
      const dayBook = await dayBookPromise;
      if (token !== footballLoad || viewFootball.hidden) return;
      if (status) status.hidden = true;
      if (host) host.dataset.alldaySource = allday.source || '';
      paintFootball(loaded.model, loaded.source, wanted || '', allday, stableRows, dayBook);
    } catch (err) {
      console.error(err);
      if (token !== footballLoad) return;
      if (status) {
        status.hidden = false;
        status.textContent = '載入失敗：' + (err.message || err);
      }
    }
  }

  /* ---------- routing ---------- */
  async function route() {
    const hash = location.hash || '#/';
    const footer = document.querySelector('.site-footer');
    if (footer) {
      footer.textContent = /^#\/football(?:\/|$)/.test(hash)
        ? '足球投注有輸錢風險，以上只係分析。'
        : '僅供參考 · 非投注建議';
    }
    const football = hash.match(/^#\/football(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
    if (football) {
      try {
        await renderFootball(football[1] || '');
      } catch (err) {
        console.error(err);
      }
      return;
    }
    if (hash === '#/wind') {
      try {
        await renderWind();
      } catch (err) {
        console.error(err);
      }
      return;
    }
    if (hash === '#/flying') {
      try {
        await renderFlying();
      } catch (err) {
        console.error(err);
      }
      return;
    }
    if (hash === '#/combo') {
      try {
        await renderCombo();
      } catch (err) {
        console.error(err);
      }
      return;
    }
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
