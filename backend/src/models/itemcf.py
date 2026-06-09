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
        pair_window: int = 50,
        pair_tau_days: float = 365.0,
        user_tau_days: float = 180.0,
        rating_power: float = 1.0,
    ) -> None:
        super().__init__()
        self.positive_threshold = positive_threshold
        self.max_user_history = max_user_history
        self.topk_neighbors = topk_neighbors
        self.user_recent_k = user_recent_k
        self.pair_window = pair_window
        self.pair_tau_days = pair_tau_days
        self.user_tau_days = user_tau_days
        self.rating_power = rating_power
        self.similar_items: dict[str, list[tuple[str, float]]] = {}
        self.user_items: dict[str, list[tuple[str, float, int]]] = {}
        self.user_latest_ts: dict[str, int] = {}

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "ItemCFRecommender":
        self.all_items = list(all_items)
        item_strength: Counter[str] = Counter()
        co_counts: dict[str, Counter[str]] = defaultdict(Counter)
        user_items: dict[str, list[tuple[str, float, int]]] = {}
        user_latest_ts: dict[str, int] = {}

        for user_id, rows in train_histories.items():
            positives = [row for row in latest_interactions(rows, self.max_user_history) if row[2] >= self.positive_threshold]
            dedup: dict[str, tuple[float, int]] = {}
            for _, item_id, rating, timestamp in positives:
                dedup[item_id] = (rating, timestamp)
            items = sorted(dedup.items(), key=lambda x: x[1][1])
            item_ids = [item_id for item_id, _ in items]
            user_items[user_id] = [
                (item_id, rating_ts[0], rating_ts[1])
                for item_id, rating_ts in items[-self.user_recent_k :]
            ]
            if items:
                user_latest_ts[user_id] = items[-1][1][1]
            if len(item_ids) < 2:
                for item_id, (rating, _) in items:
                    item_strength[item_id] += self._rating_weight(rating)
                continue
            user_norm = 1.0 / math.log2(3.0 + len(items))
            for item_id, (rating, _) in items:
                item_strength[item_id] += self._rating_weight(rating)
            for idx, (item_i, (rating_i, ts_i)) in enumerate(items):
                upper = len(items)
                if self.pair_window > 0:
                    upper = min(upper, idx + self.pair_window + 1)
                for item_j, (rating_j, ts_j) in items[idx + 1 : upper]:
                    pair_decay = self._time_decay(abs(ts_i - ts_j), self.pair_tau_days)
                    pair_weight = (
                        user_norm
                        * self._rating_weight(rating_i)
                        * self._rating_weight(rating_j)
                        * pair_decay
                    )
                    co_counts[item_i][item_j] += pair_weight
                    co_counts[item_j][item_i] += pair_weight

        similar_items: dict[str, list[tuple[str, float]]] = {}
        for item_i, neighbors in co_counts.items():
            scored = []
            freq_i = item_strength[item_i]
            for item_j, cij in neighbors.items():
                denom = math.sqrt(freq_i * item_strength[item_j])
                if denom > 0:
                    scored.append((item_j, cij / denom))
            scored.sort(key=lambda x: (-x[1], x[0]))
            similar_items[item_i] = scored[: self.topk_neighbors]

        self.similar_items = similar_items
        self.user_items = user_items
        self.user_latest_ts = user_latest_ts
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = set(item_ids)
        scores = {item_id: 0.0 for item_id in candidates}
        now_ts = getattr(self, "user_latest_ts", {}).get(user_id, 0)
        for row in self.user_items.get(user_id, []):
            hist_item, rating, timestamp = self._history_row(row)
            rating_weight = self._rating_weight(rating)
            recency_weight = self._time_decay(max(0, now_ts - timestamp), getattr(self, "user_tau_days", 180.0))
            for neighbor, sim in self.similar_items.get(hist_item, []):
                if neighbor in candidates:
                    scores[neighbor] += sim * rating_weight * recency_weight
        return scores

    def _rating_weight(self, rating: float) -> float:
        return math.pow(max(float(rating), 1.0), getattr(self, "rating_power", 1.0))

    @staticmethod
    def _time_decay(delta_seconds: float, tau_days: float) -> float:
        if tau_days <= 0:
            return 1.0
        tau_seconds = tau_days * 86400.0
        return math.exp(-max(delta_seconds, 0.0) / tau_seconds)

    @staticmethod
    def _history_row(row) -> tuple[str, float, int]:
        if len(row) >= 3:
            return row[0], float(row[1]), int(row[2])
        return row[0], float(row[1]), 0

