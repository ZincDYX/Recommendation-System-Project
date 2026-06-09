from __future__ import annotations

import math
from typing import Iterable

from src.models.base import Recommender


class WeightedEnsemble(Recommender):
    """Combine recommender scores with optional user-adaptive weights."""

    name = "ensemble"

    def __init__(
        self,
        models: list[Recommender],
        weights: dict[str, float] | None = None,
        adaptive: bool = True,
        session_context_strength: float = 0.0,
    ) -> None:
        super().__init__()
        self.models = models
        model_names = {model.name for model in models}
        self.weights = (
            {name: weight for name, weight in weights.items() if name in model_names}
            if weights
            else {model.name: 1.0 for model in models}
        )
        self.adaptive = adaptive
        self.session_context_strength = session_context_strength
        if models:
            self.all_items = models[0].all_items

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "WeightedEnsemble":
        self.all_items = list(all_items)
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = list(item_ids)
        combined = {item_id: 0.0 for item_id in candidates}
        weights = self._weights_for_user(user_id)
        for model in self.models:
            raw = model.score_items(user_id, candidates)
            values = list(raw.values())
            if not values:
                continue
            min_score = min(values)
            max_score = max(values)
            denom = max_score - min_score
            weight = weights.get(model.name, 0.0)
            for item_id, score in raw.items():
                normalized = 0.0 if denom <= 1e-12 else (score - min_score) / denom
                combined[item_id] += weight * normalized
        return combined

    def _weights_for_user(self, user_id: str) -> dict[str, float]:
        weights = self._normalized_weights(self.weights)
        if not self.adaptive:
            return weights

        history_count = self._history_count(user_id)
        sequence_count = self._sequence_count(user_id)
        recent_compactness = self._recent_compactness(user_id)
        adjusted = dict(weights)

        if history_count == 0:
            self._add(adjusted, "popularity", 0.35)
            self._add(adjusted, "content_tfidf", 0.20)
            self._add(adjusted, "itemcf", -0.10)
            self._add(adjusted, "bpr_mf", -0.15)
            self._add(adjusted, "gru4rec", -0.15)
        elif history_count < 10:
            self._add(adjusted, "popularity", 0.15)
            self._add(adjusted, "content_tfidf", 0.12)
            self._add(adjusted, "bpr_mf", -0.08)
            self._add(adjusted, "gru4rec", -0.08)
        elif history_count >= 50:
            self._add(adjusted, "itemcf", 0.08)
            self._add(adjusted, "bpr_mf", 0.10)
            self._add(adjusted, "popularity", -0.10)

        if sequence_count >= 20:
            self._add(adjusted, "gru4rec", 0.12)
            self._add(adjusted, "popularity", -0.06)
        elif 0 < sequence_count < 5:
            self._add(adjusted, "content_tfidf", 0.08)
            self._add(adjusted, "gru4rec", -0.06)

        if recent_compactness >= 0.6:
            self._add(adjusted, "itemcf", 0.08)
            self._add(adjusted, "gru4rec", 0.08)
            self._add(adjusted, "content_tfidf", -0.04)

        session_strength = min(max(getattr(self, "session_context_strength", 0.0), 0.0), 1.0)
        if session_strength > 0:
            self._add(adjusted, "itemcf", 0.16 * session_strength)
            self._add(adjusted, "content_tfidf", 0.14 * session_strength)
            self._add(adjusted, "popularity", -0.08 * session_strength)
            self._add(adjusted, "bpr_mf", -0.04 * session_strength)

        return self._normalized_weights(adjusted)

    def _history_count(self, user_id: str) -> int:
        counts = []
        for model in self.models:
            user_items = getattr(model, "user_items", None)
            if isinstance(user_items, dict) and user_id in user_items:
                counts.append(len(user_items[user_id]))
            user_sequences = getattr(model, "user_sequences", None)
            if isinstance(user_sequences, dict) and user_id in user_sequences:
                counts.append(len(user_sequences[user_id]))
        return max(counts) if counts else 0

    def _sequence_count(self, user_id: str) -> int:
        for model in self.models:
            user_sequences = getattr(model, "user_sequences", None)
            if isinstance(user_sequences, dict):
                return len(user_sequences.get(user_id, []))
        return 0

    def _recent_compactness(self, user_id: str) -> float:
        for model in self.models:
            if model.name != "itemcf":
                continue
            rows = getattr(model, "user_items", {}).get(user_id, [])
            timestamps = [self._timestamp(row) for row in rows if self._timestamp(row) > 0]
            if len(timestamps) < 2:
                return 0.0
            span_days = (max(timestamps) - min(timestamps)) / 86400.0
            return 1.0 / (1.0 + math.log1p(max(span_days, 0.0)))
        return 0.0

    @staticmethod
    def _timestamp(row) -> int:
        return int(row[2]) if len(row) >= 3 else 0

    @staticmethod
    def _add(weights: dict[str, float], model_name: str, delta: float) -> None:
        if model_name in weights:
            weights[model_name] = weights.get(model_name, 0.0) + delta

    @staticmethod
    def _normalized_weights(weights: dict[str, float]) -> dict[str, float]:
        clipped = {name: max(float(value), 0.0) for name, value in weights.items()}
        total = sum(clipped.values())
        if total <= 1e-12:
            if not clipped:
                return {}
            equal = 1.0 / len(clipped)
            return {name: equal for name in clipped}
        return {name: value / total for name, value in clipped.items()}
