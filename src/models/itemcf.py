from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Iterable

from src.data import latest_interactions
from src.models.base import Recommender


class ItemCFRecommender(Recommender):
    name = "itemcf"

    def __init__(
        self,
        positive_threshold: float = 4.0,
        max_user_history: int = 200,
        topk_neighbors: int = 200,
        user_recent_k: int = 50,
    ) -> None:
        super().__init__()
        self.positive_threshold = positive_threshold
        self.max_user_history = max_user_history
        self.topk_neighbors = topk_neighbors
        self.user_recent_k = user_recent_k
        self.similar_items: dict[str, list[tuple[str, float]]] = {}
        self.user_items: dict[str, list[tuple[str, float]]] = {}

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "ItemCFRecommender":
        self.all_items = list(all_items)
        item_freq: Counter[str] = Counter()
        co_counts: dict[str, Counter[str]] = defaultdict(Counter)
        user_items: dict[str, list[tuple[str, float]]] = {}

        for user_id, rows in train_histories.items():
            positives = [row for row in latest_interactions(rows, self.max_user_history) if row[2] >= self.positive_threshold]
            dedup: dict[str, tuple[float, int]] = {}
            for _, item_id, rating, timestamp in positives:
                dedup[item_id] = (rating, timestamp)
            items = sorted(dedup.items(), key=lambda x: x[1][1])
            item_ids = [item_id for item_id, _ in items]
            user_items[user_id] = [(item_id, rating_ts[0]) for item_id, rating_ts in items[-self.user_recent_k :]]
            if len(item_ids) < 2:
                for item_id in item_ids:
                    item_freq[item_id] += 1
                continue
            weight = 1.0 / math.log2(3.0 + len(item_ids))
            for item_id in item_ids:
                item_freq[item_id] += 1
            for idx, item_i in enumerate(item_ids):
                for item_j in item_ids[idx + 1 :]:
                    co_counts[item_i][item_j] += weight
                    co_counts[item_j][item_i] += weight

        similar_items: dict[str, list[tuple[str, float]]] = {}
        for item_i, neighbors in co_counts.items():
            scored = []
            freq_i = item_freq[item_i]
            for item_j, cij in neighbors.items():
                denom = math.sqrt(freq_i * item_freq[item_j])
                if denom > 0:
                    scored.append((item_j, cij / denom))
            scored.sort(key=lambda x: (-x[1], x[0]))
            similar_items[item_i] = scored[: self.topk_neighbors]

        self.similar_items = similar_items
        self.user_items = user_items
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = set(item_ids)
        scores = {item_id: 0.0 for item_id in candidates}
        for hist_item, rating in self.user_items.get(user_id, []):
            rating_weight = max(rating, 1.0)
            for neighbor, sim in self.similar_items.get(hist_item, []):
                if neighbor in candidates:
                    scores[neighbor] += sim * rating_weight
        return scores

