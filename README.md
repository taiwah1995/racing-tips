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
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail · `#/wind` 收風統計 · `#/flying` 賽日有飛馬
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

## Live sheets

`#/wind` and `#/flying` read Google Sheet `10vr-9Huqp6UyBJMDtRUKmjhMi_0TP0wjlYEv9ZI55co` in the browser on every open (gviz JSON). Those numbers are not copied into the repo. `#/flying` uses tabs `賽日有飛馬` and `A123 分析 26/27`.

## 波盤推介

`#/football` reads Google Sheet `1UdCJnyxAt5XzV0gbY4FCKrDYio_-SPBoyaAqaBBtKXw` (tab `波盤推介`, `gid=0`) live in the browser:

```
/gviz/tq?tqx=out:csv&gid=0&sheet=波盤推介
/gviz/tq?tqx=out:json&gid=0&headers=1&sheet=波盤推介
```

Row 1 headers, exactly: `日期 | 時間 | 聯賽 | 場次 | 推介 | 買法 | 賠率 | 信心% | 注數 | 狀態 | 推介原因 | 賽果 | W/L | 利潤`. An optional `過關` column may be added; `Y`, `是`, or `1` locks that row into 穩陣過關.

- `日期` accepts `yyyy-mm-dd`, `dd/mm/yyyy`, and gviz `Date(y,m,d)` (month is 0-based). A date gviz leaves blank is filled from the CSV text.
- Only rows with `注數` > 0 are shown. Rows are grouped by `日期`. The panel `更新：` date is the latest day.
- `#/football` opens that latest day. The date picker under `過往日期` opens an older day at `#/football/yyyy-mm-dd`.
- Card title is `場次｜信心 N%`. The 推介 row is `推介 (買法) 賠率倍`, with odds forced to two decimals. 注碼, 推介原因, 賽果, and the 暫定/確認 badge stay. `推介原因` is cut at 30 characters.
- 是日過關推介 is the heading above the two pass panels. 穩陣過關 subtitle is `讓球過關 N×1`. 過關賠率 uses `1+odds` when odds are under 1.2, otherwise the odds, and shows the product to 2 decimals. Legs come from the first source that applies: optional tab `穩陣過關` (`日期 | 場次 | 推介 | 買法 | 賠率`) when that day has at least two rows; else rows on `波盤推介` whose optional `過關` cell is `Y`, `是`, or `1`, using those sheet odds; else on 2026-10-17 the locked pair 艾華斯堡 `讓球 主勝` 0.83 and 華倫西亞 `讓球 主勝` 0.90 (product 3.48, even if the sheet odds later change); else stake > 0 rows whose 買法 matches `讓球` then `主勝` or `客勝`. `讓球主客和` is not an auto leg. Fewer than two legs hides the panel.
- 刀仔鋸大樹 is the panel under it. Subtitle is `五串六（5×6）`: five 4-leg combos plus one 5-leg combo, $10 each, stake $60. It needs five rows with 注數 > 0. If there are more, it keeps the first five in sheet order, the same order as the tip cards. It does not re-rank by 信心% or kickoff. 全中派彩 is $10 times the sum of those six decimal products. Net is that payout minus $60.
- 全日分析 sits above the summaries. It reads tab `全日分析` (`gid=986852779`) on the same sheet, headers `日期 | 時間 | 聯賽 | 場次 | 推介 | 買法 | 賠率 | 信心% | 注數 | 來源`, and lists every row for the selected date, including 注數 0, in kickoff order. A time before 12:00 marked 凌晨, or dated the next calendar day, sorts after that evening. Tip cards use the same order. 刀仔鋸大樹 still takes the first five stake>0 rows in sheet order. The pick team sits under the match name, in the same green as a winning W; the market, odds, and stake stay the normal colours. Stars come from 信心%: ≤52 → 1 gray, 53–54 → 4 green, 55 → 2 white, 56 or ≥59 → 3 gold, 57–58 → 5 blue. A settled 賽果 line shows ✅ for W/WH, ❌ for L/LH, and ➖ for P. Chips `1星`–`5星` sit above the list, all selected by default, and filter to any combination. A count shows visible/total. If that tab cannot be fetched or is empty, the page uses `data/football-allday.json` with no extra notice.
- `1注=$100`. 總注數 and 投注額 include every shown row. 派彩, 盈虧, and 命中率 use settled rows only. 命中 is `W` and `WH`; `P` is left out; `LH` and `L` are misses. Empty `W/L` and `利潤` stay `未有賽果`. 當日總結, 累計總結, and that note are the last blocks on the page.
- If both gviz fetches fail, the page uses `data/football-tips.json` with no extra notice. That file is not read when the sheet loads.

### Update the sheet

Append one row per match. Keep row 1 as the headers above. Put `yyyy-mm-dd` in `日期`. After full time, fill `賽果`, `W/L` (`W` / `WH` / `P` / `LH` / `L`), and `利潤` (profit, not the stake returned). Leave those three blank while the match is still open.

### Update the JSON fallback

Used only when the sheet cannot be fetched. Copy the same matches into `data/football-tips.json`:

1. Append a day to `days[]` with `date` (`yyyy-mm-dd`) and `label`.
2. Each tip uses `ko`, `league`, `match`, `pick`, `market` (this is 買法), `odds`, `confidence`, `stake`, `status` (`暫定` or `確認`). Add `reason` when there is a 推介原因. Leave `result`, `wl`, and `profit` empty (`profit: null`) until the match is settled, then set `wl` and the profit number.
3. Tips with `stake` ≤ 0 are hidden. `unit` stays `100`.
4. Bump `APP_DATA_VERSION` in `js/app.js` and the `?v=` on CSS/JS in `index.html` so phones pick up the new file.

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
