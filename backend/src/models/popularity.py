from __future__ import annotations

import math
from collections import defaultdict
from typing import Iterable

from src.models.base import Recommender


class PopularityRecommender(Recommender):
    name = "popularity"

    def __init__(self, half_life_days: float = 0.0) -> None:
        super().__init__()
        self.half_life_days = half_life_days
        self.item_scores: dict[str, float] = {}

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "PopularityRecommender":
        self.all_items = list(all_items)
        max_ts = 0
        for rows in train_histories.values():
            for _, _, _, timestamp in rows:
                max_ts = max(max_ts, timestamp)

        scores: dict[str, float] = defaultdict(float)
        for rows in train_histories.values():
            for _, item_id, rating, timestamp in rows:
                weight = max(float(rating), 1.0)
                if self.half_life_days > 0 and max_ts > 0:
                    age_days = max(0.0, (max_ts - timestamp) / 86400.0)
                    weight *= math.pow(0.5, age_days / self.half_life_days)
                scores[item_id] += weight
        self.item_scores = dict(scores)
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        return {item_id: self.item_scores.get(item_id, 0.0) for item_id in item_ids}

