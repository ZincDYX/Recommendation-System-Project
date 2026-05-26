from __future__ import annotations

from typing import Iterable

from src.models.base import Recommender


class WeightedEnsemble(Recommender):
    name = "ensemble"

    def __init__(self, models: list[Recommender], weights: dict[str, float] | None = None) -> None:
        super().__init__()
        self.models = models
        self.weights = weights or {model.name: 1.0 for model in models}
        if models:
            self.all_items = models[0].all_items

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "WeightedEnsemble":
        self.all_items = list(all_items)
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = list(item_ids)
        combined = {item_id: 0.0 for item_id in candidates}
        for model in self.models:
            raw = model.score_items(user_id, candidates)
            values = list(raw.values())
            if not values:
                continue
            min_score = min(values)
            max_score = max(values)
            denom = max_score - min_score
            weight = self.weights.get(model.name, 1.0)
            for item_id, score in raw.items():
                normalized = 0.0 if denom <= 1e-12 else (score - min_score) / denom
                combined[item_id] += weight * normalized
        return combined

