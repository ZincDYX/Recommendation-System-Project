from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from src.data import load_dataset_dir, seen_items_for_user
from src.metrics import average_metric_rows, ranking_metrics
from src.model_io import load_model, model_path
from src.models.ensemble import WeightedEnsemble


def parse_ensemble_weights(raw_weights: str | None) -> dict[str, float] | None:
    """Parse CLI weights written as comma-separated model=weight pairs."""
    if not raw_weights:
        return None
    weights: dict[str, float] = {}
    for chunk in raw_weights.split(","):
        if not chunk.strip():
            continue
        if "=" not in chunk:
            raise ValueError(f"Invalid ensemble weight '{chunk}'. Expected format: model=weight.")
        model_name, value = chunk.split("=", 1)
        model_name = model_name.strip()
        if not model_name:
            raise ValueError(f"Invalid ensemble weight '{chunk}'. Model name is empty.")
        weight = float(value)
        if weight < 0:
            raise ValueError(f"Invalid ensemble weight for '{model_name}'. Weight must be non-negative.")
        weights[model_name] = weight
    if not weights:
        raise ValueError("No valid ensemble weights were provided.")
    return weights


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate recommenders with sampled leave-one-out ranking.")
    parser.add_argument("--data_dir", required=True)
    parser.add_argument("--model_dir", required=True)
    parser.add_argument("--models", nargs="+", default=["popularity", "itemcf", "content_tfidf", "bpr_mf", "gru4rec"])
    parser.add_argument("--ks", nargs="+", type=int, default=[5, 10, 20])
    parser.add_argument("--num_negatives", type=int, default=100)
    parser.add_argument("--max_eval_users", type=int, default=None)
    parser.add_argument("--positive_threshold", type=float, default=0.0)
    parser.add_argument("--output", default="results/metrics.csv")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--include_ensemble", action="store_true")
    parser.add_argument(
        "--ensemble_weights",
        default=None,
        help="Comma-separated model weights, for example: itemcf=0.35,bpr_mf=0.25,gru4rec=0.1.",
    )
    return parser.parse_args()


def iter_test_cases(test, positive_threshold: float):
    for user_id, rows in test.items():
        for _, item_id, rating, _ in rows:
            if rating >= positive_threshold:
                yield user_id, item_id


def evaluate_model(model, train, valid, test_cases, all_items, ks, num_negatives, rng):
    """Evaluate one model with sampled negatives for leave-one-out ranking."""
    max_k = max(ks)
    item_pool = list(all_items)
    metric_rows_by_k = {k: [] for k in ks}
    for user_id, target_item in test_cases:
        seen = seen_items_for_user(train, valid, user_id=user_id)
        excluded_for_sampling = set(seen)
        excluded_for_sampling.add(target_item)
        candidates = [target_item]
        attempts = 0
        while len(candidates) < num_negatives + 1 and attempts < (num_negatives + 1) * 20:
            neg = rng.choice(item_pool)
            attempts += 1
            if neg not in excluded_for_sampling and neg not in candidates:
                candidates.append(neg)
        exclude_for_ranking = set(seen)
        exclude_for_ranking.discard(target_item)
        ranked = [
            item
            for item, _ in model.recommend(
                user_id,
                k=max_k,
                exclude_items=exclude_for_ranking,
                candidate_items=candidates,
            )
        ]
        for k in ks:
            metric_rows_by_k[k].append(ranking_metrics(ranked, {target_item}, k))
    return {k: average_metric_rows(rows) for k, rows in metric_rows_by_k.items()}


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    data_dir = Path(args.data_dir)
    model_dir = Path(args.model_dir)
    print(f"Loading dataset from {data_dir}")
    train, valid, test, item_info, all_items = load_dataset_dir(data_dir)
    test_cases = list(iter_test_cases(test, args.positive_threshold))
    if args.max_eval_users is not None:
        rng.shuffle(test_cases)
        test_cases = test_cases[: args.max_eval_users]
    print(f"eval_cases={len(test_cases):,} all_items={len(all_items):,}")

    models = []
    for name in args.models:
        path = model_path(model_dir, name)
        if not path.exists():
            print(f"Skip missing model: {path}")
            continue
        models.append(load_model(path))
    if args.include_ensemble and len(models) >= 2:
        weights = parse_ensemble_weights(args.ensemble_weights)
        if weights:
            missing = sorted(set(weights) - {model.name for model in models})
            if missing:
                raise ValueError(f"Ensemble weights reference unloaded models: {', '.join(missing)}")
        models.append(WeightedEnsemble(list(models), weights=weights))

    rows = []
    for model in models:
        print(f"Evaluating {model.name}")
        metrics_by_k = evaluate_model(
            model=model,
            train=train,
            valid=valid,
            test_cases=test_cases,
            all_items=all_items,
            ks=args.ks,
            num_negatives=args.num_negatives,
            rng=rng,
        )
        for k, metrics in metrics_by_k.items():
            row = {"model": model.name, "k": k, **metrics}
            rows.append(row)
            print(row)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["model", "k", "hit", "precision", "recall", "ndcg", "mrr"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved metrics -> {output}")


if __name__ == "__main__":
    main()
