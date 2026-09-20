# 賽馬貼士 DEMO（Hong Kong Racing Tips Archive）

Mobile-first static demo that replaces Notion tip pages with a file-based archive.

## Open the demo

Live (GitHub Pages):

```
https://taiwah1995.github.io/racing-tips/?v=20260920e
```

### Local server

```bash
cd /workspace/racing-tips-demo
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/` (phone width ~390–430px looks best).

## Tip cell format

Four tip columns（首選／次選／三選／冷腳）render each horse on **two lines**:

```
Line 1: 馬號 馬名 (跑法) [badge]
Line 2: 賠率
```

Example:

```
7 銀亮濠俠 (前) 冠
6.6
```

Odds (`h.odds`) always sit on the second line. The optional place badge（冠／亞／季／殿）stays on line 1 after the running style.

## Post-race results schema

Optional per-race top-4 on each `tipsTable` row:

```json
"result": { "w": 7, "2": 11, "3": 5, "4": 2 }
```

- `w` / `2` / `3` / `4` = finishing horse numbers（冠／亞／季／殿）
- When a tip horse `h.no` matches, a small pill badge（冠／亞／季／殿）is shown on that cell
- No `result` → no badges
- If any race has results, a note appears under the table: `已完場 · 命中標示：冠／亞／季／殿`

Demo: `data/meetings/2026-09-16-hv.json` has sample `result` on races 1, 4, and 7.

## Features

- **Home**: list of tip archives (date + venue 沙田/快活谷 + race count)
- **Day detail**:
  - 「🏆 全日重心馬匹數據表」— 場次｜首選｜次選｜三選｜冷腳
  - 「🏆 全日重心馬推介」— 每日 3 隻
- **Filters**: venue tabs + horse-name search
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail
- **Cache bust**: `APP_DATA_VERSION` in `js/app.js` (currently `20260920e`) versions data fetches and asset URLs

## Add a new race day

1. Drop a JSON file under `data/meetings/` (copy an existing one as a template).
2. Add an entry to `data/index.json` pointing at that file.
3. Bump `APP_DATA_VERSION` (and `?v=` on CSS/JS in `index.html`) so phones refresh.

No build step — plain HTML + CSS + JS.

## Sample meetings

| File | Date | Venue |
|------|------|-------|
| `data/meetings/2026-09-16-hv.json` | 2026-09-16 | 快活谷 · 8場（含完場 demo） |
| `data/meetings/2026-09-12-st.json` | 2026-09-12 | 沙田 |
| `data/meetings/2026-09-09-hv.json` | 2026-09-09 | 快活谷 |
| `data/meetings/2026-09-06-st.json` | 2026-09-06 | 沙田 |

## Tech

Static site only. Zero dependencies. Served with `python3 -m http.server`.
