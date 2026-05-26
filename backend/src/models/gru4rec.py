from __future__ import annotations

import random
from typing import Iterable

import torch
import torch.nn as nn

from src.models.base import Recommender


class GRU4RecRecommender(Recommender):
    name = "gru4rec"

    def __init__(
        self,
        embedding_dim: int = 64,
        hidden_dim: int = 64,
        max_seq_len: int = 50,
        epochs: int = 3,
        batch_size: int = 256,
        lr: float = 1e-3,
        positive_threshold: float = 4.0,
        max_train_samples: int = 500000,
        seed: int = 2026,
        device: str = "cpu",
    ) -> None:
        super().__init__()
        self.embedding_dim = embedding_dim
        self.hidden_dim = hidden_dim
        self.max_seq_len = max_seq_len
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr
        self.positive_threshold = positive_threshold
        self.max_train_samples = max_train_samples
        self.seed = seed
        self.device = device
        self.item_to_idx: dict[str, int] = {}
        self.idx_to_item: list[str] = []
        self.user_sequences: dict[str, list[int]] = {}
        self.model = None

    def fit(self, train_histories, item_info: dict[str, str], all_items: Iterable[str]) -> "GRU4RecRecommender":
        import torch.nn.functional as F

        rng = random.Random(self.seed)
        torch.manual_seed(self.seed)
        self.all_items = list(all_items)
        self.idx_to_item = ["<PAD>"] + list(self.all_items)
        self.item_to_idx = {item_id: idx for idx, item_id in enumerate(self.idx_to_item) if idx > 0}

        samples: list[tuple[list[int], int]] = []
        user_sequences: dict[str, list[int]] = {}
        for user_id, rows in train_histories.items():
            seq = [self.item_to_idx[row[1]] for row in rows if row[2] >= self.positive_threshold and row[1] in self.item_to_idx]
            user_sequences[user_id] = seq[-self.max_seq_len :]
            for pos in range(1, len(seq)):
                prefix = seq[max(0, pos - self.max_seq_len) : pos]
                samples.append((prefix, seq[pos]))

        if not samples:
            raise ValueError("No positive next-item samples found for GRU4Rec.")
        if self.max_train_samples and len(samples) > self.max_train_samples:
            samples = rng.sample(samples, self.max_train_samples)
        self.user_sequences = user_sequences

        model = _GRUNet(len(self.idx_to_item), self.embedding_dim, self.hidden_dim).to(self.device)
        optimizer = torch.optim.Adam(model.parameters(), lr=self.lr)

        for _ in range(self.epochs):
            rng.shuffle(samples)
            for start in range(0, len(samples), self.batch_size):
                batch = samples[start : start + self.batch_size]
                seq_tensor, lengths, targets = self._batch_to_tensors(batch)
                seq_tensor = seq_tensor.to(self.device)
                lengths = lengths.to(self.device)
                targets = targets.to(self.device)
                logits = model(seq_tensor, lengths)
                loss = F.cross_entropy(logits, targets)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        self.model = model.cpu()
        self.device = "cpu"
        return self

    def score_items(self, user_id: str, item_ids: Iterable[str]) -> dict[str, float]:
        candidates = list(item_ids)
        scores = {item_id: 0.0 for item_id in candidates}
        if self.model is None:
            return scores
        seq = self.user_sequences.get(user_id, [])
        if not seq:
            return scores
        known = [(item_id, self.item_to_idx[item_id]) for item_id in candidates if item_id in self.item_to_idx]
        if not known:
            return scores
        self.model.eval()
        with torch.no_grad():
            prefix = seq[-self.max_seq_len :]
            seq_tensor, lengths, _ = self._batch_to_tensors([(prefix, 0)])
            logits = self.model(seq_tensor, lengths).squeeze(0).cpu()
        for item_id, item_idx in known:
            scores[item_id] = float(logits[item_idx].item())
        return scores

    def _batch_to_tensors(self, batch):
        max_len = max(1, min(self.max_seq_len, max(len(seq) for seq, _ in batch)))
        padded = []
        lengths = []
        targets = []
        for seq, target in batch:
            seq = seq[-max_len:]
            lengths.append(max(1, len(seq)))
            targets.append(target)
            padded.append(([0] * (max_len - len(seq))) + seq)
        return (
            torch.tensor(padded, dtype=torch.long),
            torch.tensor(lengths, dtype=torch.long),
            torch.tensor(targets, dtype=torch.long),
        )


class _GRUNet(nn.Module):
    def __init__(self, num_items: int, embedding_dim: int, hidden_dim: int) -> None:
        super().__init__()
        self.embedding = nn.Embedding(num_items, embedding_dim, padding_idx=0)
        self.gru = nn.GRU(embedding_dim, hidden_dim, batch_first=True)
        self.output = nn.Linear(hidden_dim, num_items)

    def forward(self, seq, lengths):
        emb = self.embedding(seq)
        packed = nn.utils.rnn.pack_padded_sequence(emb, lengths.cpu(), batch_first=True, enforce_sorted=False)
        _, hidden = self.gru(packed)
        return self.output(hidden[-1])
