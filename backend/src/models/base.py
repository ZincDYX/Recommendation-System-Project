from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable


class Recommender(ABC):
    """Common interface for all recommenders."""

    name: str = "base"

    def __init__(self) -> None:
        self.all_items: list[str] = []

    @abstractmethod
    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "Recommender":
        raise NotImplementedError

    @abstractmethod
    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        raise NotImplementedError

    def recommend(
        self,
        user_id: str,
        k: int = 10,
        exclude_items: set[str] | None = None,
        candidate_items: Iterable[str] | None = None,
    ) -> list[tuple[str, float]]:
        candidates = list(candidate_items) if candidate_items is not None else list(self.all_items)
        if exclude_items:
            candidates = [item for item in candidates if item not in exclude_items]
        if not candidates:
            return []
        scores = self.score_items(user_id, candidates)
        return sorted(scores.items(), key=lambda x: (-x[1], x[0]))[:k]

