from __future__ import annotations

from src.models.bpr_mf import BPRMFRecommender
from src.models.content_tfidf import ContentTFIDFRecommender
from src.models.gru4rec import GRU4RecRecommender
from src.models.itemcf import ItemCFRecommender
from src.models.popularity import PopularityRecommender


def build_model(name: str, args):
    if name == "popularity":
        return PopularityRecommender(half_life_days=args.pop_half_life_days)
    if name == "itemcf":
        return ItemCFRecommender(
            positive_threshold=args.positive_threshold,
            max_user_history=args.itemcf_max_user_history,
            topk_neighbors=args.itemcf_topk_neighbors,
            user_recent_k=args.itemcf_user_recent_k,
            pair_window=args.itemcf_pair_window,
            pair_tau_days=args.itemcf_pair_tau_days,
            user_tau_days=args.itemcf_user_tau_days,
            rating_power=args.itemcf_rating_power,
        )
    if name == "content_tfidf":
        return ContentTFIDFRecommender(
            positive_threshold=args.positive_threshold,
            max_features=args.content_max_features,
            max_user_history=args.content_max_user_history,
        )
    if name == "bpr_mf":
        return BPRMFRecommender(
            factors=args.factors,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            positive_threshold=args.positive_threshold,
            max_train_samples=args.max_train_samples,
            seed=args.seed,
            device=args.device,
        )
    if name == "gru4rec":
        return GRU4RecRecommender(
            embedding_dim=args.factors,
            hidden_dim=args.hidden_dim,
            max_seq_len=args.max_seq_len,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            positive_threshold=args.positive_threshold,
            max_train_samples=args.max_train_samples,
            seed=args.seed,
            device=args.device,
        )
    raise ValueError(f"Unknown model: {name}")


AVAILABLE_MODELS = ["popularity", "itemcf", "content_tfidf", "bpr_mf", "gru4rec"]

