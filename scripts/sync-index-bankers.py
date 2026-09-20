#!/usr/bin/env python3
"""Enrich data/index.json meetings with banker + bankerPlace from meeting JSON files.

banker = first dailyPicks item (全日心水).
bankerPlace = 冠/亞/季/殿 if that horse finished top-4 in banker.race, else null
             (also null when the race has no result yet).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
INDEX = DATA / "index.json"
PLACE = {"w": "冠", "2": "亞", "3": "季", "4": "殿"}


def banker_place(meeting: dict, banker: dict) -> str | None:
    race = next(
        (r for r in meeting.get("tipsTable") or [] if Number(r.get("race")) == Number(banker.get("race"))),
        None,
    )
    if not race:
        return None
    result = race.get("result")
    if not result:
        return None
    no = Number(banker.get("no"))
    for key, label in PLACE.items():
        fin = result.get(key)
        if fin is not None and Number(fin) == no:
            return label
    return None


def Number(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def enrich_meeting_entry(entry: dict) -> dict:
    path = DATA / entry["file"]
    meeting = json.loads(path.read_text(encoding="utf-8"))
    picks = meeting.get("dailyPicks") or []
    if not picks:
        entry.pop("banker", None)
        entry.pop("bankerPlace", None)
        return entry

    p0 = picks[0]
    banker = {
        "race": p0.get("race"),
        "no": p0.get("no"),
        "name": p0.get("name"),
        "odds": p0.get("odds"),
    }
    entry["banker"] = banker
    entry["bankerPlace"] = banker_place(meeting, banker)
    return entry


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    index["meetings"] = [enrich_meeting_entry(dict(m)) for m in index["meetings"]]
    INDEX.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    for m in index["meetings"]:
        b = m.get("banker")
        if not b:
            print(f"{m['id']}: (no dailyPicks)")
            continue
        place = m.get("bankerPlace")
        suffix = f" {place}" if place else ""
        print(
            f"{m['id']}: {m['raceCount']}場賽事 | 馬膽 : {b['name']} {b['odds']}{suffix}"
        )


if __name__ == "__main__":
    main()
