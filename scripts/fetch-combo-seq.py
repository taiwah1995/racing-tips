#!/usr/bin/env python3
"""Build data/combo-seq.json from HKJC LocalResults for the current season.

Pair key is the wind-sheet trainer short code plus the jockey's full name
(``韋|潘頓``). Trainer full names map through data/trainer-full-to-short.json.
The first character is never used as a guess.

Place → form: 1 → W, 2–3 → P, anything else (including WV and dead-heat
text such as ``2 平頭馬``) → X. ``seq`` is the latest 10 starts, newest first.
``gap`` is the consecutive X count since the most recent W or P across the
whole season, not only those 10. Win-odds min/max use the 獨贏賠率 of W
starts only; both stay null when that pair has no priced win.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
INDEX = DATA / "index.json"
TRAINER_MAP = DATA / "trainer-full-to-short.json"
OUT = DATA / "combo-seq.json"

SEASON_FROM = "2026-09-06"
LOCAL_RESULTS = (
    "https://racing.hkjc.com/racing/information/Chinese/Racing/"
    "LocalResults.aspx?RaceDate={race_date}&Racecourse={course}&RaceNo={race_no}"
)
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
# Tip archive labels 2026-09-12 Sha Tin; HKJC ran that card on 13/09/2026.
# results-source.md. The fetch also tries the next day when a page has no result table.
KNOWN_HKJC_DATE = {("2026-09-12", "ST"): "2026-09-13"}

JOCKEY_ALLOWANCE = re.compile(r"\s*[(（]\s*[-−－]\s*\d+\s*[)）]\s*$")
PLACE_NUM = re.compile(r"\s*(\d+)")
RACE_NO = re.compile(r"RaceNo=(\d+)", re.I)
NON_FINISH = {
    "WV", "PU", "UR", "FE", "DNF", "DISQ", "WX", "WX-A", "TNP", "RR", "BD", "RO",
    "VOID", "NR", "WV-A", "---", "—", "-", "",
}


class TableParser(HTMLParser):
    """Collect each table as a list of rows of cell text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._stack: list[dict] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "table":
            self._stack.append({"rows": [], "row": None, "cell": None})
        elif tag == "tr" and self._stack:
            self._stack[-1]["row"] = []
        elif tag in ("td", "th") and self._stack and self._stack[-1]["row"] is not None:
            self._stack[-1]["cell"] = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        top = self._stack[-1] if self._stack else None
        if tag in ("td", "th") and top and top["cell"] is not None:
            text = re.sub(r"\s+", " ", "".join(top["cell"])).strip()
            top["row"].append(text)
            top["cell"] = None
        elif tag == "tr" and top and top["row"] is not None:
            if any(cell.strip() for cell in top["row"]):
                top["rows"].append(top["row"])
            top["row"] = None
        elif tag == "table" and self._stack:
            table = self._stack.pop()
            self.tables.append(table["rows"])

    def handle_data(self, data: str) -> None:
        if self._stack and self._stack[-1]["cell"] is not None:
            self._stack[-1]["cell"].append(data)


def norm_header(text: str) -> str:
    return re.sub(r"\s+", "", text)


def fetch(url: str) -> str:
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as res:
                raw = res.read()
            return raw.decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            time.sleep(0.5 * (attempt + 1))
    assert last is not None
    raise last


def results_rows(html: str) -> list[dict] | None:
    """Horse rows from the performance table, or None when that table is absent."""
    parser = TableParser()
    parser.feed(html)
    for table in parser.tables:
        header_i = None
        headers: list[str] = []
        for i, row in enumerate(table[:4]):
            headers = [norm_header(cell) for cell in row]
            if "名次" in headers and any("獨贏" in cell and "賠率" in cell for cell in headers):
                header_i = i
                break
        if header_i is None:
            continue
        def find(*names: str) -> int | None:
            for name in names:
                if name in headers:
                    return headers.index(name)
            for i, cell in enumerate(headers):
                if all(part in cell for part in names):
                    return i
            return None
        place_i = find("名次")
        jockey_i = find("騎師")
        trainer_i = find("練馬師")
        odds_i = find("獨贏賠率")
        if None in (place_i, jockey_i, trainer_i, odds_i):
            continue
        need = max(place_i, jockey_i, trainer_i, odds_i)
        out = []
        for row in table[header_i + 1 :]:
            if len(row) <= need:
                continue
            jockey = clean_jockey(row[jockey_i])
            trainer = re.sub(r"\s+", "", row[trainer_i])
            if not jockey or not trainer:
                continue
            out.append({
                "place": row[place_i].strip(),
                "jockey": jockey,
                "trainer": trainer,
                "odds": parse_odds(row[odds_i]),
            })
        return out
    return None


def clean_jockey(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    return JOCKEY_ALLOWANCE.sub("", name).strip()


def parse_odds(text: str) -> float | None:
    raw = text.strip().replace(",", "")
    if not raw or raw in ("---", "—", "-", "N/A", "NA"):
        return None
    try:
        return float(f"{float(raw):.1f}")
    except ValueError:
        match = re.search(r"\d+(?:\.\d+)?", raw)
        if not match:
            return None
        return float(f"{float(match.group(0)):.1f}")


def wpx(place_text: str) -> str:
    match = PLACE_NUM.match(place_text)
    if not match:
        return "X"
    place = int(match.group(1))
    if place == 1:
        return "W"
    if place in (2, 3):
        return "P"
    return "X"


def hkjc_query_date(iso: str) -> str:
    year, month, day = iso.split("-")
    return f"{day}/{month}/{year}"


def iso_add_day(iso: str) -> str:
    return (datetime.strptime(iso, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()


def race_numbers(html: str, race_count: int) -> list[int]:
    found = {int(n) for n in RACE_NO.findall(html) if 1 <= int(n) <= 14}
    found.add(1)
    if race_count and race_count > 0:
        found.update(range(1, int(race_count) + 1))
    return sorted(found)


def load_meetings() -> list[dict]:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    today = date.today().isoformat()
    meetings = []
    for meeting in index.get("meetings") or []:
        iso = str(meeting.get("date") or "")
        course = str(meeting.get("venueCode") or "")
        if not iso or course not in ("ST", "HV"):
            continue
        if iso < SEASON_FROM or iso > today:
            continue
        meetings.append({
            "id": meeting.get("id"),
            "date": iso,
            "course": course,
            "raceCount": int(meeting.get("raceCount") or 0),
        })
    meetings.sort(key=lambda item: item["date"])
    return meetings


def load_trainer_map() -> dict[str, str]:
    data = json.loads(TRAINER_MAP.read_text(encoding="utf-8"))
    table = data.get("full_to_short") or {}
    if not table:
        raise SystemExit(f"missing full_to_short in {TRAINER_MAP}")
    # 賀賢 must not collapse onto 蘇偉賢's 賢.
    if table.get("賀賢") != "賀" or table.get("蘇偉賢") != "賢":
        raise SystemExit("trainer map lost the explicit 賀賢→賀 / 蘇偉賢→賢 pair")
    if table.get("葉楚航") != "航" or table.get("黎昭昇") != "昇" or table.get("方嘉柏") != "方":
        raise SystemExit("trainer map lost 航/昇/方")
    return {str(full): str(short) for full, short in table.items()}


def resolve_meeting(meeting: dict) -> tuple[str, str]:
    """Return the HKJC date and race-1 HTML. Steps forward one day if needed."""
    iso = KNOWN_HKJC_DATE.get((meeting["date"], meeting["course"]), meeting["date"])
    tried = []
    for candidate in (iso, iso_add_day(iso) if iso == meeting["date"] else None):
        if not candidate or candidate in tried:
            continue
        tried.append(candidate)
        url = LOCAL_RESULTS.format(
            race_date=hkjc_query_date(candidate),
            course=meeting["course"],
            race_no=1,
        )
        html = fetch(url)
        rows = results_rows(html)
        if rows:
            if candidate != meeting["date"]:
                print(
                    f"note: {meeting['id']} index {meeting['date']} "
                    f"→ HKJC {candidate} {meeting['course']}",
                    file=sys.stderr,
                )
            return candidate, html
    raise RuntimeError(
        f"no LocalResults for {meeting['id']} ({meeting['date']} {meeting['course']})"
    )


def aggregate(starts: list[dict]) -> dict[str, dict]:
    by_pair: dict[str, list[dict]] = {}
    for start in starts:
        by_pair.setdefault(start["key"], []).append(start)
    pairs = {}
    for key in sorted(by_pair):
        rows = sorted(by_pair[key], key=lambda row: (row["date"], row["race"]), reverse=True)
        codes = [row["code"] for row in rows]
        gap = 0
        for code in codes:
            if code != "X":
                break
            gap += 1
        win_odds = [row["odds"] for row in rows if row["code"] == "W" and row["odds"] is not None]
        wins = sum(1 for code in codes if code == "W")
        top3 = sum(1 for code in codes if code in ("W", "P"))
        pairs[key] = {
            "seq": "".join(codes[:10]),
            "gap": gap,
            "starts": len(rows),
            "wins": wins,
            "places": top3,
            "winOddsMin": min(win_odds) if win_odds else None,
            "winOddsMax": max(win_odds) if win_odds else None,
        }
    return pairs


def check_samples(pairs: dict[str, dict], updated: str) -> None:
    """Frozen against the 2026-10-14 window. Later meetings change the strings."""
    if updated != "2026-10-14":
        print(f"skip frozen samples; updated={updated}")
        return
    expect = {
        "韋|潘頓": {
            "seq": "WWXWW",
            "gap": 0,
            "starts": 5,
            "wins": 4,
            "places": 4,
            "winOddsMin": 3.1,
            "winOddsMax": 7.2,
        },
        "韋|希威森": {
            "seq": "XPPXXXXX",
            "gap": 1,
            "starts": 8,
            "wins": 0,
            "places": 2,
            "winOddsMin": None,
            "winOddsMax": None,
        },
    }
    failed = False
    for key, wanted in expect.items():
        got = pairs.get(key)
        if got != wanted:
            failed = True
            print(f"SAMPLE MISMATCH {key}\n  got    {got}\n  wanted {wanted}", file=sys.stderr)
        else:
            odds = (
                f"{got['winOddsMin']:.1f} - {got['winOddsMax']:.1f}倍"
                if got["winOddsMin"] is not None
                else "no odds range"
            )
            print(f"sample {key} 近10 {got['seq']} 隔{got['gap']} {odds}")
    if failed:
        raise SystemExit(1)


def self_check_helpers() -> None:
    if wpx("1") != "W" or wpx("2 平頭馬") != "P" or wpx("3") != "P":
        raise SystemExit("place mapping failed")
    if wpx("4") != "X" or wpx("WV") != "X" or wpx("10") != "X":
        raise SystemExit("place mapping failed")
    if clean_jockey("希威森 (-2)") != "希威森" or clean_jockey("楊明綸(-10)") != "楊明綸":
        raise SystemExit("jockey allowance strip failed")
    if clean_jockey("潘頓") != "潘頓":
        raise SystemExit("jockey clean failed")
    table = load_trainer_map()
    if table["賀賢"] == table["蘇偉賢"]:
        raise SystemExit("賀賢 collided with 蘇偉賢")


def main() -> None:
    self_check_helpers()
    trainer_map = load_trainer_map()
    meetings = load_meetings()
    if not meetings:
        raise SystemExit(f"no season meetings in {INDEX} from {SEASON_FROM}")

    pages: dict[tuple[str, str, int], str] = {}
    meeting_dates: list[str] = []
    jobs: list[tuple[str, str, int]] = []
    for meeting in meetings:
        hkjc_date, race1 = resolve_meeting(meeting)
        meeting_dates.append(hkjc_date)
        pages[(hkjc_date, meeting["course"], 1)] = race1
        for race_no in race_numbers(race1, meeting["raceCount"]):
            if race_no == 1:
                continue
            jobs.append((hkjc_date, meeting["course"], race_no))

    def job_url(item: tuple[str, str, int]) -> str:
        iso, course, race_no = item
        return LOCAL_RESULTS.format(
            race_date=hkjc_query_date(iso),
            course=course,
            race_no=race_no,
        )

    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        future_map = {pool.submit(fetch, job_url(job)): job for job in jobs}
        for future in as_completed(future_map):
            job = future_map[future]
            try:
                pages[job] = future.result()
            except Exception as exc:  # noqa: BLE001 — keep the meeting in the error list
                errors.append(f"fetch {job[0]} {job[1]} R{job[2]}: {exc}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        raise SystemExit(1)

    starts: list[dict] = []
    unmapped: dict[str, int] = {}
    odd_places: dict[str, int] = {}
    allowance_left: dict[str, int] = {}
    missing_tables: list[str] = []
    for (iso, course, race_no), html in sorted(pages.items()):
        rows = results_rows(html)
        if not rows:
            missing_tables.append(f"{iso} {course} R{race_no}")
            continue
        for row in rows:
            token = norm_header(row["place"])
            if not PLACE_NUM.match(row["place"]) and token not in NON_FINISH:
                odd_places[row["place"]] = odd_places.get(row["place"], 0) + 1
            if "(" in row["jockey"] or "（" in row["jockey"]:
                allowance_left[row["jockey"]] = allowance_left.get(row["jockey"], 0) + 1
            short = trainer_map.get(row["trainer"])
            if not short:
                unmapped[row["trainer"]] = unmapped.get(row["trainer"], 0) + 1
                continue
            starts.append({
                "key": f"{short}|{row['jockey']}",
                "date": iso,
                "race": race_no,
                "code": wpx(row["place"]),
                "odds": row["odds"],
            })

    if missing_tables:
        print("missing result tables:\n" + "\n".join(missing_tables), file=sys.stderr)
        raise SystemExit(1)
    if unmapped:
        print("unmapped trainers (no first-char guess):", unmapped, file=sys.stderr)
        raise SystemExit(1)
    if allowance_left:
        print("jockey allowance suffix still present:", allowance_left, file=sys.stderr)
    if odd_places:
        print("non-numeric places treated as X:", odd_places, file=sys.stderr)

    pairs = aggregate(starts)
    updated = max(meeting_dates) if meeting_dates else ""
    check_samples(pairs, updated)
    payload = {"updated": updated, "pairs": pairs}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    priced = sum(1 for row in pairs.values() if row["winOddsMin"] is not None)
    print(
        f"wrote {OUT.relative_to(ROOT)} updated={updated} "
        f"meetings={len(meeting_dates)} starts={len(starts)} pairs={len(pairs)} "
        f"withWinOdds={priced}"
    )


if __name__ == "__main__":
    main()
