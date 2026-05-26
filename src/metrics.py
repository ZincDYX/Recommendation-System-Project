from __future__ import annotations

import math
from collections import defaultdict


def ranking_metrics(ranked_items: list[str], relevant_items: set[str], k: int) -> dict[str, float]:
    if not relevant_items:
        return {"hit": 0.0, "precision": 0.0, "recall": 0.0, "ndcg": 0.0, "mrr": 0.0}
    topk = ranked_items[:k]
    hits = [1 if item in relevant_items else 0 for item in topk]
    hit_count = sum(hits)
    dcg = sum(hit / math.log2(rank + 2) for rank, hit in enumerate(hits))
    ideal_hits = min(len(relevant_items), k)
    idcg = sum(1.0 / math.log2(rank + 2) for rank in range(ideal_hits))
    mrr = 0.0
    for rank, hit in enumerate(hits, start=1):
        if hit:
            mrr = 1.0 / rank
            break
    return {
        "hit": 1.0 if hit_count > 0 else 0.0,
        "precision": hit_count / k,
        "recall": hit_count / len(relevant_items),
        "ndcg": dcg / idcg if idcg > 0 else 0.0,
        "mrr": mrr,
    }


def average_metric_rows(rows: list[dict[str, float]]) -> dict[str, float]:
    sums: dict[str, float] = defaultdict(float)
    if not rows:
        return {}
    for row in rows:
        for key, value in row.items():
            sums[key] += value
    return {key: value / len(rows) for key, value in sums.items()}

