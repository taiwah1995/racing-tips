# 賽馬貼士 DEMO（Hong Kong Racing Tips Archive）

Mobile-first static demo that replaces Notion tip pages with a file-based archive.

## Open the demo

Live (GitHub Pages):

```
https://taiwah1995.github.io/racing-tips/
```

### Local server

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/` in a browser (phone width ~390–430px looks best).

## Features

- **Home**: list of tip archives (date + venue 沙田/快活谷 + race count)
- **Day detail**:
  - 「🏆 全日重心馬匹數據表」— 場次（班次路程）｜首選｜次選｜三選｜冷腳；cell = 馬號 馬名 (跑法)（不顯示評分）
  - 「🏆 全日重心馬推介」— 每日 3 隻（場次 + 班次路程 + 馬號馬名）
- **Filters**: venue tabs (全部 / 沙田 / 快活谷) + horse-name search
- **Hash routes**: `#/` home · `#/meeting/<id>` day detail
- **Footer**: DEMO · 僅供參考 · 非投注建議

## Add a new race day

1. Drop a JSON file under `data/meetings/` (copy an existing one as a template).
2. Add an entry to `data/index.json` pointing at that file.

No build step — plain HTML + CSS + JS.

## Meetings

Newest first:

| File | Date | Venue |
|------|------|-------|
| `data/meetings/2026-09-16-hv.json` | 2026-09-16 | 快活谷 · 8場 |
| `data/meetings/2026-09-12-st.json` | 2026-09-12 | 沙田 · 10場 |
| `data/meetings/2026-09-09-hv.json` | 2026-09-09 | 快活谷 · 8場 |
| `data/meetings/2026-09-06-st.json` | 2026-09-06 | 沙田 · 開鑼日 · 10場 |

## Tech

Static site only. Zero dependencies.
