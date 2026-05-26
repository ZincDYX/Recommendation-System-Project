from __future__ import annotations

import html
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Iterable

Interaction = tuple[str, str, float, int]
Histories = dict[str, list[Interaction]]


def parse_interaction(line: str) -> Interaction:
    user_id, item_id, rating, timestamp = line.strip().split()
    return str(user_id), str(item_id), float(rating), int(timestamp)


def read_histories(path: str | Path, max_rows: int | None = None) -> Histories:
    histories: dict[str, list[Interaction]] = defaultdict(list)
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        for row_idx, line in enumerate(f):
            if max_rows is not None and row_idx >= max_rows:
                break
            if not line.strip():
                continue
            user_id, item_id, rating, timestamp = parse_interaction(line)
            histories[user_id].append((user_id, item_id, rating, timestamp))
    sort_histories(histories)
    return dict(histories)


def read_interactions(path: str | Path, max_rows: int | None = None) -> list[Interaction]:
    rows: list[Interaction] = []
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        for row_idx, line in enumerate(f):
            if max_rows is not None and row_idx >= max_rows:
                break
            if line.strip():
                rows.append(parse_interaction(line))
    return rows


def read_item_info(path: str | Path) -> dict[str, str]:
    """Load item titles. Duplicate ids keep the first non-empty title."""
    info: dict[str, str] = {}
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj = json.loads(line)
            item_id = str(obj.get("item_id", ""))
            title = html.unescape(str(obj.get("title") or "")).strip()
            if not item_id:
                continue
            if item_id not in info or (not info[item_id] and title):
                info[item_id] = title
    return info


def sort_histories(histories: Histories) -> None:
    for rows in histories.values():
        rows.sort(key=lambda x: x[3])


def collect_items(*histories: Histories, item_info: dict[str, str] | None = None) -> list[str]:
    items: set[str] = set()
    for history in histories:
        for rows in history.values():
            items.update(row[1] for row in rows)
    if item_info:
        items.update(item_info.keys())
    return sorted(items)


def seen_items_for_user(*histories: Histories, user_id: str) -> set[str]:
    seen: set[str] = set()
    for history in histories:
        seen.update(row[1] for row in history.get(user_id, []))
    return seen


def filter_positive_items(rows: Iterable[Interaction], positive_threshold: float = 0.0) -> list[Interaction]:
    return [row for row in rows if row[2] >= positive_threshold]


def sample_users(histories: Histories, max_users: int | None, seed: int = 2026) -> Histories:
    if max_users is None or max_users >= len(histories):
        return histories
    rng = random.Random(seed)
    users = rng.sample(list(histories.keys()), max_users)
    return {user_id: histories[user_id] for user_id in users}


def load_dataset_dir(
    data_dir: str | Path,
    max_train_rows: int | None = None,
    max_eval_rows: int | None = None,
) -> tuple[Histories, Histories, Histories, dict[str, str], list[str]]:
    data_dir = Path(data_dir)
    train = read_histories(data_dir / "train.txt", max_train_rows)
    valid = read_histories(data_dir / "valid.txt", max_eval_rows)
    test = read_histories(data_dir / "test.txt", max_eval_rows)
    item_info = read_item_info(data_dir / "info.jsonl")
    all_items = collect_items(train, valid, test, item_info=item_info)
    return train, valid, test, item_info, all_items


def latest_interactions(rows: list[Interaction], limit: int) -> list[Interaction]:
    if limit <= 0:
        return []
    return sorted(rows, key=lambda x: x[3])[-limit:]

