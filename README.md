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
- Card title is `場次｜信心 N%`, with 1–5 stars on the same nowrap line as `信心`. A tip uses its `stars` field when that value is an integer from 1 to 5, including when the sheet loads and the file supplies it. Otherwise the card uses the backtest table: ≤52 → 1, 53–54 → 4, 55 → 2, 56 or ≥59 → 3, 57–58 → 5. Lit stars on a tip card and on every 全日分析 row use the filter colours: 1 grey, 2 white, 3 gold, 4 green, 5 blue. 全日分析 does not read `stars`. The 推介 row is `推介 (買法) 賠率倍`, with odds forced to two decimals. 買法 is shown as written, including `+0.25`, `+0/0.5`, `+0.5/1`, `受半/一`, or a parenthetical line. A bare `讓球 主勝` stays bare until the sheet includes the line. On a tip card, `讓球 主勝` / `讓球 客勝` and labels such as `主讓評判` / `受讓評判` are left off when the handicap itself remains (`+0.5`, `一球`, `受平/半`). A reason clause that only repeats that line (`受平/半`, `主+1.5`, `客+1`) is left off too. 注碼, 賽果, and the 暫定/確認 badge stay. `推介原因` is not a line on the card. A positive midweek or European phrase (`上週歐聯`, `上週歐霸`, `上週歐協`, `週中歐霸`, `週中有賽事`, `回補・…` when that prefix is still in the cell, or `歐戰`) puts a red `*` beside the related team and that phrase in red under the team name. The footnote is the phrase from the cell. Each clause marks its own side, so `利華上週歐霸；弗賴上週歐協` marks 利華古遜 with `上週歐霸` and 弗賴堡 with `上週歐協`. A short name matches when it sits inside the side or its characters stay in order (`皇馬` → 皇家馬德里, `蘇斯達` → 皇家蘇斯達, `利華` → 利華古遜). 馬拉加 vs 皇家蘇斯達 marks 蘇斯達 with `上週歐霸`. A tip with `eu_teams` marks only those sides, even when the sheet loads. 2026-10-18 皇家馬德里 vs 西維爾 has `eu_teams` `["皇家馬德里"]` and reason `皇家馬德里上週歐聯`, so the red `*` and `上週歐聯` sit on 皇家馬德里 only. A clause that names both sides marks both. A clause that names nobody uses the pick's side. An empty note, `無週中`, `無週中戰`, `無週中歐戰`, and every other reason leave the `*` and the footnote off. A trailing `（M/D凌晨）` or `(M/D凌晨)` on 場次, full-width or half-width parentheses, is left off the team names and shown on the gold meta line after the time and league, for example `00:30 · 西甲 · 10/19凌晨`. A `ko_note` field is used when it is present, and that same trailing note is still removed so it is not printed twice. The stored match string is not rewritten. 穩陣過關 and 刀仔鋸大樹 do the same on each leg: the note leaves the match or team text and sits on that leg's kickoff.
- 是日過關推介 is the heading above the two pass panels. 穩陣過關 subtitle is `讓球過關 N×1`. Decimal prices use `1+odds` when odds are under 1.2, otherwise the odds. The footer is two lines. Line 1 is the theoretical full-hit product, labelled `全中過關賠率：3.48倍（理論全中）`, with the fixed stake text `注碼2注（$200）`. Line 2 is the settled rate, labelled `實際派彩率`. `W` keeps the decimal, `WH` is `(D+1)/2`, `P` is 1, `LH` is 0.5, `L` is 0. 派彩 is the stake times that full product, then rounded to cents, so a trailing zero stays (`$530.70`). Odds come from the lock legs. For the 2026-10-17 lock those odds are 0.83 and 0.9, the product is 2.6535, 派彩 is `$530.70`, and 盈虧 is `+$330.70`. A lost leg zeros the parlay. Any other open leg shows `實際派彩率：— · 派彩 — · 盈虧 —`. On a locked day the frozen list is the only source. On an unlocked day, legs come from the first source that applies: optional tab `穩陣過關` (`日期 | 時間 | 場次 | 推介 | 買法 | 賠率 | 賽果 | W/L | 過關結果 | 備註`) when that day has at least two rows; else rows on `波盤推介` whose optional `過關` cell is `Y`, `是`, or `1`, using those sheet odds; else the day's `stable` or `stable_lock` legs, using those odds (2026-10-17 is 艾華斯堡 0.83 and 華倫西亞 0.9); else stake > 0 rows whose 買法 matches `讓球` then `主勝` or `客勝`. `讓球主客和` is not an auto leg. Fewer than two legs hides the panel. Each leg shows the tab's `時間`, the column after `日期`, before the pick. A trailing `（M/D凌晨）` on the leg, or on the matching tip when the lock omits it, is added after that time (`03:00 · 10/18凌晨`) and is not left on the team text. That time is not copied from `波盤推介`. When the tab does not supply the day, the 2026-10-17 lock uses `21:30` for 艾華斯堡 and `03:00` for 華倫西亞. An unlocked day lists legs by kickoff, earliest first. A locked day keeps the frozen order. The kickoff is 0.78em, smaller than the pick. A time before 12:00 is the next morning, so 21:30 comes before 03:00. Sheet order breaks a tie. 信心% does not. A leg with a 賽果 shows `✅賽果 4-3` on the right (✅ W/WH, ❌ L/LH, ➖ P). No 賽果 hides that mark.
- 穩陣過關 and 刀仔鋸大樹 follow one rule: show candidates, wait until the user confirms, then lock. A locked day keeps that frozen list. Do not change its legs or reorder them unless the user gives a new explicit instruction. Kickoff sort, including `footballByKickoff`, is only for an unlocked day. A day with `daozi_lock` in `data/football-tips.json` uses that frozen five even when the sheet loads. The footer does not print `user_footer` or the file's `$60` line. A `page_footer` that says `注碼1注（$600）` is the old ledger, not the public stake. Otherwise numeric `stake` / `payout` / `profit`, then `page_footer`, supply the 刀仔 money. With the current file the public line stays 每注 `$40`，投注 `$240`，派彩 `$365.15`，盈虧 `+$125.15`. An unlocked day still uses the stake table: 3串4 is 每注 `$50`, 投注 `$200`; 4串5 is 每注 `$40`, 投注 `$200`; 5串6 is 每注 `$40`, 投注 `$240`. A day with `stable_lock` uses those frozen 穩陣 legs the same way. 2026-10-18 穩陣過關 is the locked 二串一 萊切 `讓球 客勝 +0.5/+1` 1.74 and 桑坦德 `讓球 客勝 +0/+0.5` 2.00. 白禮頓 vs 水晶宮 is stake 0, status `擋住`, and stays off the tip cards. 刀仔鋸大樹 is the panel under 穩陣過關. Subtitle is `五串六（5×6）`: five 4-leg combos plus one 5-leg combo. It needs five rows with 注數 > 0. A settled day in the lock keeps that published set and is not re-sorted. 2026-10-17 is 艾華斯堡 `讓球 主勝 +0` 0.83 W 4-3, 布里斯托城 `主客和 主勝` 2.04 L 0-1, 史篤城 `主客和 客勝` 2.27 W 0-1, 域斯咸 `主客和 主勝` 1.50 W 4-1, 華倫西亞 `讓球 主勝 +0/0.5` 0.93 WH 0-0, in that order. 布里斯托 is a loss, so only the 四串一 of the other four pays. 華倫西亞 0-0 on `+0/0.5` is a half-win: decimal `1.93`, return `(1.93+1)/2` = `1.465`. The formula is `1.83×2.27×1.50×1.465 × $40`. That is 實際派彩率 `9.1286`倍, 派彩 `$365.15`, 盈虧 `+$125.15`. An unlocked day sorts staked rows by kickoff first, the same order as the tip cards, and the first five of that list are the legs. A sheet later ordered by 信心% still yields those five earliest kickoffs. It does not re-rank by 信心%. A time before 12:00 marked 凌晨, or dated the next calendar day, sorts after that evening. Sheet order breaks a tie. 2026-10-17 穩陣過關 is not re-sorted. The footer separates the theoretical full-hit average from the settled cash. Line 1 is `全中過關賠率`, the six decimal products summed and divided by 6, labelled `（理論全中）`. The next line is the stake, `每注 $40，投注 $240` for 五串六. `實際派彩率` is the sum of the combo returns that survived, shown to 4 decimals, times the unit stake. 派彩 is that product rounded to cents. 盈虧 is 派彩 minus the package total. A combo that includes a loss returns 0. Any other open combo shows dashes. Net odds under 1.2 convert as `1+odds`. A quarter line such as `+0/0.5` at a draw is a half-win. The theoretical average is not multiplied by the package stake. Each leg uses the same right-hand 賽果 mark as 穩陣過關, and shows that tip's `時間` before the match name, in the same smaller kickoff size.
- 全日分析 is the last block on the page, after 累計總結. The risk line stays under it. It reads tab `全日分析` (`gid=986852779`) on the same sheet, headers `日期 | 時間 | 聯賽 | 場次 | 推介 | 買法 | 賠率 | 信心% | 注數 | 來源 | 賽果`, and lists every row for the selected date, including 注數 0, from daytime through the next morning. The betting day runs 08:00 to 07:59. A kickoff before 08:00 sorts after that evening and is labelled `10/19凌晨 03:00`. A later kickoff the sheet marks 凌晨, or with the next day's date, gets the same label. Tip cards keep their own order. An unlocked 刀仔 day sorts stake>0 rows by kickoff, then takes the first five. 2026-10-17 刀仔 stays on its frozen list. The pick team sits under the match name, in the same green as a winning W; the market, odds, and stake stay the normal colours. Stars come from 信心%: ≤52 → 1 gray, 53–54 → 4 green, 55 → 2 white, 56 or ≥59 → 3 gold, 57–58 → 5 blue. Column `賽果` is shown on every row that has one, including 注數 0: `賽果 x-x` follows the stake. The icon under the kickoff prefers the 全日分析 `W/L` column (`W`/`WH` ✅, `L`/`LH` ❌, `P` ➖), then the tips-sheet W/L for the same 場次, then the score read against 買法. A row with 注數 > 0 and a 賽果 always shows an icon; ➖ is the fallback. A blank 賽果 stays blank. 注數 0 rows show the score text only. Chips `1星`–`5星` sit above the list, all selected by default, and filter to any combination. The number on the right is hits/settled for the selected stars: `W` and `WH` over `W`, `WH`, `L`, and `LH`, among visible rows with 注數 > 0. `P`, unfinished rows, and 注數 0 stay out. No chip selected uses every 注數 > 0 row. If that tab cannot be fetched or is empty, the page uses `data/football-allday.json` with no extra notice.
- `1注=$100`. 總注數 and 投注額 include every shown row. 派彩, 盈虧, and 命中率 use settled rows only. 命中 is `W` and `WH`; `P` is left out; `LH` and `L` are misses. Empty `W/L` and `利潤` stay `未有賽果`. 當日總結 sits under the tip cards. 累計總結 sits under that, and 全日分析 follows. 當日總結 is 單場推介 plus 穩陣過關 plus 刀仔鋸大樹. The page sums that day's 單場推介, 穩陣過關, and 刀仔鋸大樹 from the tip profits and the two locks. Tab `當日總結` and `data/football-daybook.json` no longer replace that sum. They still hold the older ledger, 10/17 刀仔 `$600` / `$912` / `+$312` and day `$2700` / `$4419` / `+$1719`. 全日分析 stakes are not in that total. 累計總結 adds every day's three-part sum. It does not prefer the tab's 累計 row. 2026-10-17 from the current locks is 單場 `$1900` / `$2977` / `+$1077`, 穩陣 `$200` / `$530.70` / `+$330.70`, 刀仔 `$240` / `$365.15` / `+$125.15`, together `$2340` / `$3872.85` / `+$1532.85`. The sheet's 10/14–16 tip rows are already settled, so 累計 on the live page is `$4440` / `$6541.35` / `+$2101.35`. The JSON file still has blank results for those three days, so a sheet miss leaves 累計 at the 10/17 sum until that file is updated. The sheet ledger tab is still `$2700` / `$4419` / `+$1719` because it books 刀仔 at `$600` / `$912` / `+$312` and rounds 穩陣 to `$530`.
- Title bars: 過往日期, 穩陣過關, 刀仔鋸大樹, `{date}單場推介`, and 全日分析 use gold at 80% opacity. 當日總結 and 累計總結 use green at 80% opacity. Every title, the update stamp, and the hit chip are black. The hit chip is an outline on the gold bar.
- 穩陣過關, the `{date}單場推介` heading, 刀仔鋸大樹, and 全日分析 put `命中 hits/decided • N%` on the right of the title. N is the nearest integer. The count is the same 命中率: `W` and `WH` hit, `L` and `LH` miss, `P` and unfinished rows are left out. The chip stays hidden until one row is decided. 穩陣過關 and 刀仔鋸大樹 count their own legs. `{date}單場推介` counts that day's tip cards. 全日分析 counts 注數 > 0 rows, using the same `W/L` as the icon.
- If both gviz fetches fail, the page uses `data/football-tips.json` with no extra notice. That file is not read when the sheet loads.

### Update the sheet

Append one row per match. Keep row 1 as the headers above. Put `yyyy-mm-dd` in `日期`. After full time, fill `賽果`, `W/L` (`W` / `WH` / `P` / `LH` / `L`), and `利潤` (profit, not the stake returned). Leave those three blank while the match is still open.

### Update the JSON fallback

Used only when the sheet cannot be fetched. Copy the same matches into `data/football-tips.json`:

1. Append a day to `days[]` with `date` (`yyyy-mm-dd`) and `label`.
2. Each tip uses `ko`, `league`, `match`, `pick`, `market` (this is 買法), `odds`, `confidence`, `stake`, `status` (`暫定` or `確認`). Add `reason` when there is a 推介原因. Leave `result`, `wl`, and `profit` empty (`profit: null`) until the match is settled, then set `wl` and the profit number.
3. Tips with `stake` ≤ 0 are hidden. `unit` stays `100`.
4. Copy tab `當日總結` into `data/football-daybook.json` as `rows[]` (`date`, `item`, `kind` of `part` / `day-total` / `cumulative`, `stake`, `payout`, `profit`, `units`). The cumulative row may leave `date` empty. The page uses that file only when the tab cannot be fetched.
5. `data/football-tips.json` also holds the historical tip days 2026-10-14 (10), 2026-10-15 (10), and 2026-10-16 (1). Those rows use status `回填`. The page shows the tip cards and 全日分析, and leaves 穩陣過關 and 刀仔鋸大樹 off unless that day has a lock. 10/15 里昂 vs 水晶宮, 芝加哥火燄 vs 費城聯, and 富明尼斯 vs 彭美拉斯 are away `讓球 客勝 +0`. A day may lock 穩陣 with `stable` or `stable_lock`. 2026-10-17 `stable` is 2注: 艾華斯堡 0.83 and 華倫西亞 0.9, 派彩 `$530.70`, 盈虧 `+$330.70`. `daozi_lock` legs may be objects or `match｜pick｜line｜odds｜W/L score` strings. `user_footer` is never shown. The 刀仔 panel stays 派彩 `$365.15` and 盈虧 `+$125.15` while `page_footer` is still the legacy `$600` line. `data/football-allday.json` lists 217 rows from 2026-10-05 through 2026-10-18. A pick written `隊名｜買法` is split for the row.
6. Bump `APP_DATA_VERSION` in `js/app.js` and the `?v=` on CSS/JS in `index.html` so phones pick up the new file.

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
