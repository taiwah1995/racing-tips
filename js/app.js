/**
 * TW賽馬貼士 — hash-routed SPA
 * Routes: #/  |  #/meeting/:id  |  #/wind  |  #/flying
 */
(function () {
  'use strict';

  const DATA_BASE = 'data';
  const APP_DATA_VERSION = '20261007windtab2';
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
    viewFlying.hidden = true;
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
    viewFlying.hidden = true;
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
        loadWindSheet('賽日累計收風統計'),
      ]);
      if (token !== windLoad || viewWind.hidden) return;
      if (host) {
        host.innerHTML =
          windPickHtml(windPickRows(trainers)) +
          windTableHtml('馬房累計收風統計', '馬房', trainerRows(trainers)) +
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
      return '<section class="panel"><h2 class="panel-title">賽日推介</h2>' +
        '<p class="empty">未能讀取賽日有飛馬</p></section>';
    }
    const meetings = flyingMeetings(parseFlyingHorses(table));
    const meeting = meetings[0];
    if (!meeting) {
      return '<section class="panel"><h2 class="panel-title">賽日推介</h2>' +
        '<p class="empty">暫未有飛馬名單</p></section>';
    }
    return '<section class="panel"><h2 class="panel-title">賽日推介</h2>' +
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

  function flyingMeetingPanelHtml(horses) {
    const stats = flyingMeetings(horses)[0];
    const hit = stats ? flyingHitHtml(stats) : '';
    return '<section class="panel" id="meeting-flying">' +
      '<h2 class="panel-title">賽日有飛馬</h2>' +
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
      viewDetail.insertAdjacentHTML('beforeend', flyingMeetingPanelHtml(horses));
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
      '<h2 class="panel-title">賠率啟示錄</h2>' +
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
      const picks = flyResult.status === 'fulfilled'
        ? flyingPicksHtml(flyResult.value)
        : '<section class="panel"><h2 class="panel-title">賽日推介</h2><p class="empty">未能讀取賽日有飛馬</p></section>';
      const trainers = (nowResult.status === 'fulfilled' || prevResult.status === 'fulfilled')
        ? flyingTrainerHtml()
        : '<section class="panel"><h2 class="panel-title">賠率啟示錄</h2><p class="empty">未能讀取賠率啟示錄</p></section>';
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
    if (hash === '#/flying') {
      try {
        await renderFlying();
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
