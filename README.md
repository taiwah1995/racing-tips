# TW賽馬貼士（Hong Kong Racing Tips Archive）

Mobile-first static site that replaces Notion tip pages with a file-based archive.

## Open

Live (GitHub Pages):

```
https://taiwah1995.github.io/racing-tips/?v=20260920ac
```

### Local server

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/` (phone width ~390–430px looks best).

## Tip cell format

Four tip columns（首選／次選／三選／冷腳）render each horse as:

```
馬號 馬名 (跑法) 賠率
```

Example: `7 銀亮濠俠 (前) 6.6` — odds (`h.odds`) sit immediately after the closing parenthesis on the same compact line.

## Post-race results schema

Optional per-race top-4 on each `tipsTable` row:

```json
"result": { "w": 7, "2": 11, "3": 5, "4": 2 }
```

- `w` / `2` / `3` / `4` = finishing horse numbers（冠／亞／季／殿）
- When a tip horse `h.no` matches, a place icon is shown（🏆／🥈／🥉／4️⃣）. Data still stores Chinese labels; the UI maps them.
- No `result` → no badges
- If any race has results, a note appears under the table: `已完場 · 命中標示：🏆／🥈／🥉／4️⃣`

Example: `data/meetings/2026-09-16-hv.json` has sample `result` on races 1, 4, and 7.

## Features

- **Home**: list of tip archives (date + venue 沙田/快活谷 + race count + 馬膽 with place icons 🏆／🥈／🥉／4️⃣). Header subtitle is meeting count plus all-time banker WP P&L (`{N} 賽馬日 💰 累計盈利 $… 💰 (回報 ±…%)`), **filtered by the venue tab** (`全部` = all venues; `沙田` = ST; `快活谷` = HV). The profit amount and ROI are neon green when positive (`#39ff14`) and red when negative (`#ff3b30`); zero stays the subtitle’s white. A trailing `.0` is dropped (`+58%`, `-5%`; `+31.3%` stays). N and the profit are computed on load from each meeting JSON: banker is `dailyPicks[0]`, a meeting counts once that race has a `result`, Win pays on 冠 and Place pays 冠／亞／季, payout = final `oddsWin` / `oddsPlace` × stake (獨贏 $100 · 位置 $300). Sep 2026: 全部 `5 賽馬日` `$1160` `+58%`; 沙田 `2 賽馬日` `-$40` `-5%`; 快活谷 `3 賽馬日` `$1200` `+100%`. Settled meeting cards add `💰 盈虧 $125 (+31.3%)` (or `-$400 (-100%)`) right after the date, same colour rule; unsettled cards add nothing.
- **馬膽WP投注簿**: on home, order is venue tabs → month selector → WP book (plus footnote `* 以最終賠率派彩金額計算`) → daily meeting cards. Heading `馬膽WP投注簿 *馬膽投注 獨贏$100 位置$300` with one horizontal line under the title (outer panel only; no nested inner box). The book is the selected month’s single `當月累計投注:` block (W, P, TOTAL, `💰 本月盈利`), computed on load and **filtered by the venue tab** (`全部` / `沙田` ST / `快活谷` HV), using fullwidth `｜` only. Example Sep 2026 全部: `W｜投注 $500｜贏 $1165｜回報 +133%`, `P｜投注 $1500｜贏 $1995｜回報 +33%`, TOTAL `投注 $2000｜贏 $3160` then `💰 本月盈利 $1160 💰 (回報 +58%)`. 沙田: `W｜投注 $200｜贏 $310` / `P｜投注 $600｜贏 $450` / `-$40` `-5%`. W/P `回報` and the 本月盈利 amount + ROI are neon green when positive and red when negative; zero stays the existing colour (white on the profit line). The profit line uses the same `font-size` as the panel title (`clamp(0.8rem, 3.6vw, 0.95rem)`); the rest of that line stays gold. Outside the bordered card, a muted `.banker-wp-foot` note: `* 以最終賠率派彩金額計算`
- **Day detail**:
  - 「🏆 各場馬匹心水貼士」— 場次｜首選｜次選｜三選｜冷腳
  - 「🏆 全日重心馬推介」— 每日 3 隻；`馬號 馬名` then result icon (if any) then `(最終賠率 W：X.x ｜P：X.x)` from `dailyPicks.oddsWin` / `oddsPlace` (on.cc 臨場). No `(跑法)` after the name. Example: `5 櫻花酒杯 🏆 (最終賠率 W：3.1 ｜P：1.5)`
- **Filters**: venue tabs + 賽事月份
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail
- **Cache bust**: `APP_DATA_VERSION` in `js/app.js` (currently `20260925uiv2`) versions data fetches and asset URLs

## Add a new race day

1. Drop a JSON file under `data/meetings/` (copy an existing one as a template).
2. Add an entry to `data/index.json` pointing at that file.
3. After the meeting, add each race `result` and the banker's final `oddsWin` / `oddsPlace` on `dailyPicks[0]`. The header count, cumulative P&L, and the WP book (including the venue tabs) update from that — no separate ledger file.
4. Bump `APP_DATA_VERSION` (and `?v=` on CSS/JS in `index.html`) so phones refresh.

No build step — plain HTML + CSS + JS.

## Sample meetings

| File | Date | Venue |
|------|------|-------|
| `data/meetings/2026-09-23-hv.json` | 2026-09-23 | 快活谷 · 9場（含完場結果） |
| `data/meetings/2026-09-16-hv.json` | 2026-09-16 | 快活谷 · 8場（含完場結果） |
| `data/meetings/2026-09-12-st.json` | 2026-09-12 | 沙田 |
| `data/meetings/2026-09-09-hv.json` | 2026-09-09 | 快活谷 |
| `data/meetings/2026-09-06-st.json` | 2026-09-06 | 沙田 |

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
