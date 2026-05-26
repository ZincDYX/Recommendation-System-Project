from __future__ import annotations

import argparse
from pathlib import Path

from src.data import load_dataset_dir, seen_items_for_user
from src.model_io import load_model, model_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recommend items for one user.")
    parser.add_argument("--data_dir", required=True)
    parser.add_argument("--model_dir", required=True)
    parser.add_argument("--model", default="itemcf")
    parser.add_argument("--user_id", required=True)
    parser.add_argument("--topk", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train, valid, test, item_info, all_items = load_dataset_dir(args.data_dir)
    model = load_model(model_path(args.model_dir, args.model))
    seen = seen_items_for_user(train, valid, user_id=args.user_id)

    print("History:")
    for _, item_id, rating, timestamp in train.get(args.user_id, [])[-20:]:
        print(f"{item_id}\t{rating}\t{timestamp}\t{item_info.get(item_id, '')}")

    print("\nRecommendations:")
    recs = model.recommend(args.user_id, k=args.topk, exclude_items=seen)
    for rank, (item_id, score) in enumerate(recs, start=1):
        print(f"{rank}\t{item_id}\t{score:.6f}\t{item_info.get(item_id, '')}")


if __name__ == "__main__":
    main()

