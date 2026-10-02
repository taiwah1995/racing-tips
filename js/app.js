/**
 * TW賽馬貼士 — hash-routed SPA
 * Routes: #/  |  #/meeting/:id
 */
(function () {
  'use strict';

  const DATA_BASE = 'data';
  const APP_DATA_VERSION = '20261003windcombo';
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

  function renderWpLedger() {
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
      '<h2 class="panel-title">' + heading + '</h2>' +
      summary +
      attackRowsHtml(groups) +
      note +
      '<p class="panel-hint">' + escapeHtml(disclaimer) + '</p>';
  }

  /* ---------- 收風 dashboard (live Google Sheet, nothing stored) ---------- */
  const WIND_SHEET_ID = '10vr-9Huqp6UyBJMDtRUKmjhMi_0TP0wjlYEv9ZI55co';
  const WIND_GROUPS = ['大風', '有風', '位置風', '食糊位', '其他'];
  let windLoad = 0;

  function windSheetUrl(sheetName) {
    const q = new URLSearchParams({
      tqx: 'out:json',
      sheet: sheetName,
      t: String(Date.now()),
    });
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
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name, 'zh-HK');
    });
    return picks;
  }

  function windPickHtml(picks) {
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
        '<td>' + escapeHtml(pick.kind) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.total)) + '</td>' +
        '<td>' + escapeHtml(hitText) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.win)) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.place)) + '</td>' +
        '<td>' + escapeHtml(formatWindCount(pick.lose)) + '</td>' +
        '<td>' + rateCellHtml(formatWindRate(pick.rate)) + '</td>' +
        '</tr>';
    }).join('');
    return '<section class="panel" id="wind-picks">' +
      '<h2 class="panel-title">風向組合推介</h2>' +
      '<div class="wind-scroll">' +
      '<table class="wind-pick">' +
      '<thead><tr><th>馬房</th><th>風類</th><th>隻數</th><th>命中</th><th>Win</th><th>Place</th><th>Lose</th><th>三甲%</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></section>';
  }

  function windTableHtml(title, nameHeader, rows) {
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
      '<h2 class="panel-title">' + escapeHtml(title) + '</h2>' +
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

  async function renderWind() {
    const token = ++windLoad;
    viewHome.hidden = true;
    viewDetail.hidden = true;
    viewWind.hidden = false;
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
        loadWindSheet('馬房累計收風統計'),
        loadWindSheet('賽日累計收風統計'),
      ]);
      if (token !== windLoad || viewWind.hidden) return;
      if (host) {
        host.innerHTML =
          windTableHtml('馬房累計收風統計', '馬房', trainerRows(trainers)) +
          windPickHtml(windPickRows(trainers)) +
          windTableHtml('賽日累計收風統計', '賽日', meetingRows(days));
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

  /* ---------- routing ---------- */
  async function route() {
    const hash = location.hash || '#/';
    if (hash === '#/wind') {
      try {
        await renderWind();
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
