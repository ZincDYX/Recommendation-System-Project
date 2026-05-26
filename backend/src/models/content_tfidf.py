from __future__ import annotations

from typing import Iterable

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from src.data import latest_interactions
from src.models.base import Recommender


class ContentTFIDFRecommender(Recommender):
    name = "content_tfidf"

    def __init__(
        self,
        positive_threshold: float = 4.0,
        max_features: int = 50000,
        max_user_history: int = 80,
    ) -> None:
        super().__init__()
        self.positive_threshold = positive_threshold
        self.max_features = max_features
        self.max_user_history = max_user_history
        self.vectorizer: TfidfVectorizer | None = None
        self.item_matrix = None
        self.item_to_idx: dict[str, int] = {}
        self.user_items: dict[str, list[tuple[str, float]]] = {}

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "ContentTFIDFRecommender":
        self.all_items = list(all_items)
        self.item_to_idx = {item_id: idx for idx, item_id in enumerate(self.all_items)}
        titles = [item_info.get(item_id) or item_id for item_id in self.all_items]
        self.vectorizer = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            max_features=self.max_features,
        )
        self.item_matrix = self.vectorizer.fit_transform(titles)

        user_items: dict[str, list[tuple[str, float]]] = {}
        for user_id, rows in train_histories.items():
            positives = [row for row in latest_interactions(rows, self.max_user_history) if row[2] >= self.positive_threshold]
            user_items[user_id] = [(row[1], row[2]) for row in positives if row[1] in self.item_to_idx]
        self.user_items = user_items
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        if self.item_matrix is None:
            raise RuntimeError("Model is not fitted.")
        history = self.user_items.get(user_id, [])
        candidate_ids = list(item_ids)
        candidate_indices = [self.item_to_idx[item_id] for item_id in candidate_ids if item_id in self.item_to_idx]
        candidate_kept = [item_id for item_id in candidate_ids if item_id in self.item_to_idx]
        scores = {item_id: 0.0 for item_id in candidate_ids}
        if not history or not candidate_indices:
            return scores

        hist_indices = [self.item_to_idx[item_id] for item_id, _ in history if item_id in self.item_to_idx]
        weights = np.array([max(rating, 1.0) for item_id, rating in history if item_id in self.item_to_idx], dtype=np.float32)
        if not hist_indices:
            return scores

        profile = self.item_matrix[hist_indices].multiply(weights[:, None]).sum(axis=0)
        candidate_matrix = self.item_matrix[candidate_indices]
        raw_scores = np.asarray(candidate_matrix @ profile.T).ravel()
        for item_id, score in zip(candidate_kept, raw_scores):
            scores[item_id] = float(score)
        return scores

