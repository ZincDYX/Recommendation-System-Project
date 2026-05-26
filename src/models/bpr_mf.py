from __future__ import annotations

import random
from typing import Iterable

import numpy as np
import torch
import torch.nn as nn

from src.models.base import Recommender


class BPRMFRecommender(Recommender):
    name = "bpr_mf"

    def __init__(
        self,
        factors: int = 64,
        epochs: int = 3,
        batch_size: int = 2048,
        lr: float = 1e-3,
        reg: float = 1e-6,
        positive_threshold: float = 4.0,
        max_train_samples: int = 500000,
        seed: int = 2026,
        device: str = "cpu",
    ) -> None:
        super().__init__()
        self.factors = factors
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr
        self.reg = reg
        self.positive_threshold = positive_threshold
        self.max_train_samples = max_train_samples
        self.seed = seed
        self.device = device
        self.user_to_idx: dict[str, int] = {}
        self.item_to_idx: dict[str, int] = {}
        self.idx_to_item: list[str] = []
        self.user_positive: dict[int, set[int]] = {}
        self.model = None

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "BPRMFRecommender":
        import torch.nn.functional as F

        rng = random.Random(self.seed)
        torch.manual_seed(self.seed)
        self.all_items = list(all_items)
        self.idx_to_item = list(self.all_items)
        self.item_to_idx = {item_id: idx for idx, item_id in enumerate(self.idx_to_item)}
        self.user_to_idx = {user_id: idx for idx, user_id in enumerate(train_histories.keys())}

        pairs: list[tuple[int, int]] = []
        user_positive: dict[int, set[int]] = {}
        for user_id, rows in train_histories.items():
            user_idx = self.user_to_idx[user_id]
            positives = {
                self.item_to_idx[row[1]]
                for row in rows
                if row[2] >= self.positive_threshold and row[1] in self.item_to_idx
            }
            if not positives:
                continue
            user_positive[user_idx] = positives
            pairs.extend((user_idx, item_idx) for item_idx in positives)

        if not pairs:
            raise ValueError("No positive interactions found for BPR-MF.")
        if self.max_train_samples and len(pairs) > self.max_train_samples:
            pairs = rng.sample(pairs, self.max_train_samples)
        self.user_positive = user_positive

        model = _MFNet(len(self.user_to_idx), len(self.idx_to_item), self.factors).to(self.device)
        optimizer = torch.optim.Adam(model.parameters(), lr=self.lr)
        all_item_indices = list(range(len(self.idx_to_item)))

        for _ in range(self.epochs):
            rng.shuffle(pairs)
            for start in range(0, len(pairs), self.batch_size):
                batch = pairs[start : start + self.batch_size]
                users = [x[0] for x in batch]
                pos_items = [x[1] for x in batch]
                neg_items = []
                for user_idx in users:
                    positives = user_positive[user_idx]
                    neg = rng.choice(all_item_indices)
                    while neg in positives:
                        neg = rng.choice(all_item_indices)
                    neg_items.append(neg)

                user_tensor = torch.tensor(users, dtype=torch.long, device=self.device)
                pos_tensor = torch.tensor(pos_items, dtype=torch.long, device=self.device)
                neg_tensor = torch.tensor(neg_items, dtype=torch.long, device=self.device)
                pos_scores = model(user_tensor, pos_tensor)
                neg_scores = model(user_tensor, neg_tensor)
                loss = -F.logsigmoid(pos_scores - neg_scores).mean()
                if self.reg > 0:
                    loss = loss + self.reg * model.l2(user_tensor, pos_tensor, neg_tensor)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        self.model = model.cpu()
        self.device = "cpu"
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = list(item_ids)
        scores = {item_id: 0.0 for item_id in candidates}
        if self.model is None or user_id not in self.user_to_idx:
            return scores
        known = [(item_id, self.item_to_idx[item_id]) for item_id in candidates if item_id in self.item_to_idx]
        if not known:
            return scores
        user_idx = self.user_to_idx[user_id]
        self.model.eval()
        with torch.no_grad():
            user_tensor = torch.full((len(known),), user_idx, dtype=torch.long)
            item_tensor = torch.tensor([idx for _, idx in known], dtype=torch.long)
            raw = self.model(user_tensor, item_tensor).cpu().numpy()
        for (item_id, _), score in zip(known, raw):
            scores[item_id] = float(score)
        return scores


class _MFNet(nn.Module):
    def __init__(self, num_users: int, num_items: int, factors: int) -> None:
        super().__init__()
        self.user_emb = nn.Embedding(num_users, factors)
        self.item_emb = nn.Embedding(num_items, factors)
        self.user_bias = nn.Embedding(num_users, 1)
        self.item_bias = nn.Embedding(num_items, 1)
        nn.init.normal_(self.user_emb.weight, std=0.01)
        nn.init.normal_(self.item_emb.weight, std=0.01)
        nn.init.zeros_(self.user_bias.weight)
        nn.init.zeros_(self.item_bias.weight)

    def forward(self, users, items):
        dot = (self.user_emb(users) * self.item_emb(items)).sum(dim=1)
        return dot + self.user_bias(users).squeeze(1) + self.item_bias(items).squeeze(1)

    def l2(self, users, pos_items, neg_items):
        return (
            self.user_emb(users).pow(2).sum()
            + self.item_emb(pos_items).pow(2).sum()
            + self.item_emb(neg_items).pow(2).sum()
        ) / users.shape[0]
