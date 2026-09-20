# TW賽馬貼士（Hong Kong Racing Tips Archive）

Mobile-first static site that replaces Notion tip pages with a file-based archive.

## Open

Live (GitHub Pages):

```
https://taiwah1995.github.io/racing-tips/?v=20260920w
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

- **Home**: list of tip archives (date + venue 沙田/快活谷 + race count + 馬膽 with place icons 🏆／🥈／🥉／4️⃣). Header subtitle is meeting count plus all-time banker WP P&L from every settled meeting in `data/wp-bets.json` (`{N} 賽馬日 💰 累計盈利 $… 💰 (回報 ±…%)`, white `.subtitle-profit`)
- **馬膽WP投注簿**: heading `馬膽WP投注簿 *馬膽投注 獨贏$100 位置$300` with one horizontal line under the title (outer panel only; no nested inner box). Monthly W / P ledger from `data/wp-bets.json` using fullwidth `｜` only (e.g. `W｜投注 $400｜贏 $1165｜回報 +191.3%`), with TOTAL as two lines (`TOTAL｜投注 $1600｜贏 $2635｜` then `💰 本月盈利 $1035 💰 (回報 +64.7%)`). Outside the bordered card, a muted `.banker-wp-foot` note: `* 以最終賠率派彩金額計算`
- **Day detail**:
  - 「🏆 全日重心馬匹數據表」— 場次｜首選｜次選｜三選｜冷腳
  - 「🏆 全日重心馬推介」— 每日 3 隻
- **Filters**: venue tabs + 賽事月份
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail
- **Cache bust**: `APP_DATA_VERSION` in `js/app.js` (currently `20260920w`) versions data fetches and asset URLs

## Add a new race day

1. Drop a JSON file under `data/meetings/` (copy an existing one as a template).
2. Add an entry to `data/index.json` pointing at that file.
3. Bump `APP_DATA_VERSION` (and `?v=` on CSS/JS in `index.html`) so phones refresh.

No build step — plain HTML + CSS + JS.

## Sample meetings

| File | Date | Venue |
|------|------|-------|
| `data/meetings/2026-09-16-hv.json` | 2026-09-16 | 快活谷 · 8場（含完場結果） |
| `data/meetings/2026-09-12-st.json` | 2026-09-12 | 沙田 |
| `data/meetings/2026-09-09-hv.json` | 2026-09-09 | 快活谷 |
| `data/meetings/2026-09-06-st.json` | 2026-09-06 | 沙田 |

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
