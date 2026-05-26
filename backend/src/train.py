from __future__ import annotations

import argparse
import json
from pathlib import Path

from src.data import load_dataset_dir, sample_users
from src.model_io import model_path, save_model
from src.model_registry import AVAILABLE_MODELS, build_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train recommendation models.")
    parser.add_argument("--data_dir", required=True, help="Dataset directory containing train/valid/test/info files.")
    parser.add_argument("--output_dir", default="saved_models", help="Directory for saved model files.")
    parser.add_argument("--models", nargs="+", default=AVAILABLE_MODELS, choices=AVAILABLE_MODELS)
    parser.add_argument("--max_train_rows", type=int, default=None, help="Optional dev-only row limit.")
    parser.add_argument("--max_users", type=int, default=None, help="Optional dev-only user limit after loading train.")
    parser.add_argument("--positive_threshold", type=float, default=4.0)
    parser.add_argument("--seed", type=int, default=2026)

    parser.add_argument("--pop_half_life_days", type=float, default=0.0)
    parser.add_argument("--itemcf_max_user_history", type=int, default=200)
    parser.add_argument("--itemcf_topk_neighbors", type=int, default=200)
    parser.add_argument("--itemcf_user_recent_k", type=int, default=50)
    parser.add_argument("--content_max_features", type=int, default=50000)
    parser.add_argument("--content_max_user_history", type=int, default=80)

    parser.add_argument("--factors", type=int, default=64)
    parser.add_argument("--hidden_dim", type=int, default=64)
    parser.add_argument("--max_seq_len", type=int, default=50)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2048)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--max_train_samples", type=int, default=500000)
    parser.add_argument("--device", default="cpu")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_dir = Path(args.data_dir)
    dataset_name = data_dir.name
    output_dir = Path(args.output_dir) / dataset_name
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading dataset from {data_dir}")
    train, valid, test, item_info, all_items = load_dataset_dir(data_dir, max_train_rows=args.max_train_rows)
    train = sample_users(train, args.max_users, seed=args.seed)
    print(f"train_users={len(train):,} all_items={len(all_items):,} item_info={len(item_info):,}")

    metadata = {
        "dataset": dataset_name,
        "data_dir": str(data_dir),
        "models": args.models,
        "positive_threshold": args.positive_threshold,
        "max_train_rows": args.max_train_rows,
        "max_users": args.max_users,
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    for model_name in args.models:
        print(f"\nTraining {model_name}")
        model = build_model(model_name, args)
        model.fit(train, item_info, all_items)
        path = model_path(output_dir, model_name)
        save_model(model, path)
        print(f"Saved {model_name} -> {path}")


if __name__ == "__main__":
    main()

