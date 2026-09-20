# 賽馬貼士 DEMO（Hong Kong Racing Tips Archive）

Mobile-first static demo that replaces Notion tip pages with a file-based archive.

## Open the demo

Live (GitHub Pages):

```
https://taiwah1995.github.io/racing-tips/?v=20260920j
```

### Local server

```bash
cd /workspace/racing-tips-demo
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/` (phone width ~390–430px looks best).

## Tip cell format

Four tip columns（首選／次選／三選／冷腳）render each horse as:

```
馬號 馬名 (跑法)
賠率 冠
```

Odds sit on a second line. When a race has official top-4, a colored place-badge pill（冠／亞／季／殿 — gold/silver/bronze/blue）follows the odds.

## Post-race results schema

Optional per-race top-4 on each `tipsTable` row:

```json
"result": { "w": 7, "2": 11, "3": 5, "4": 2 }
```

- `w` / `2` / `3` / `4` = finishing horse numbers（冠／亞／季／殿）
- When a tip horse `h.no` matches, a small pill badge（冠／亞／季／殿）is shown after the odds
- Daily picks cards use the same badges when that horse finished in the top 4
- Home cards show 馬膽 (first daily pick) plus the same colored pill when `bankerPlace` is 冠／亞／季／殿
- No `result` → no badges
- If any race has results, a note appears under the table: `已完場 · 命中標示：冠／亞／季／殿`

All four meetings include official HKJC Local Results top-4. Source notes: `data/results-source.md`.

**9/12 ST:** tip sheet is labeled 9月12日沙田; official results are from **13/09/2026 ST** (12/09/2026 ST had no LocalResults). Tip horse names match the 13/09 meeting. 馬膽「快樂高球」did not finish top-4, so that home card has no place pill.

## Features

- **Home**: list of tip archives (date + venue 沙田/快活谷 + race count + 馬膽)
  - Bottom panel「馬膽WP投注簿」with note「馬膽投注 獨贏$100 位置$300」
- **Day detail**:
  - 「🏆 全日重心馬匹數據表」— 場次｜首選｜次選｜三選｜冷腳
  - 「🏆 全日重心馬推介」— 每日 3 隻（with place badges when hit）
- **Filters**: venue tabs + month selector（賽事月份）
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail
- **Cache bust**: `APP_DATA_VERSION` in `js/app.js` (currently `20260920j`) versions data fetches and asset URLs

## Add a new race day

1. Drop a JSON file under `data/meetings/` (copy an existing one as a template).
2. Add an entry to `data/index.json` pointing at that file.
3. Run `python3 scripts/sync-index-bankers.py` to fill `banker` / `bankerPlace` on the index.
4. Bump `APP_DATA_VERSION` (and `?v=` on CSS/JS in `index.html`) so phones refresh.

No build step — plain HTML + CSS + JS.

## Sample meetings

| File | Date | Venue |
|------|------|-------|
| `data/meetings/2026-09-16-hv.json` | 2026-09-16 | 快活谷 · 8場（官方完場） |
| `data/meetings/2026-09-12-st.json` | 2026-09-12 | 沙田（官方結果用 13/09/2026 ST） |
| `data/meetings/2026-09-09-hv.json` | 2026-09-09 | 快活谷 |
| `data/meetings/2026-09-06-st.json` | 2026-09-06 | 沙田 |

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
