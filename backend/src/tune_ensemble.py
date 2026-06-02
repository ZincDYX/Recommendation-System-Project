from __future__ import annotations

import argparse
import csv
import random
from datetime import datetime
from pathlib import Path

from src.data import load_dataset_dir
from src.evaluate import evaluate_model, iter_test_cases, parse_ensemble_weights
from src.model_io import load_model, model_path
from src.model_registry import AVAILABLE_MODELS
from src.models.ensemble import WeightedEnsemble


METRIC_NAMES = ("hit", "precision", "recall", "ndcg", "mrr")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tune weighted ensemble combinations for trained recommenders.")
    parser.add_argument("--data_dir", required=True)
    parser.add_argument("--model_dir", required=True)
    parser.add_argument("--models", nargs="+", default=AVAILABLE_MODELS, choices=AVAILABLE_MODELS)
    parser.add_argument("--ks", nargs="+", type=int, default=[5, 10, 20])
    parser.add_argument("--target_k", type=int, default=10)
    parser.add_argument("--target_metric", choices=METRIC_NAMES, default="ndcg")
    parser.add_argument("--num_negatives", type=int, default=100)
    parser.add_argument("--max_eval_users", type=int, default=None)
    parser.add_argument("--positive_threshold", type=float, default=0.0)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--grid_step", type=float, default=0.2)
    parser.add_argument("--no_grid", action="store_true")
    parser.add_argument("--max_candidates", type=int, default=None)
    parser.add_argument(
        "--candidate_weights",
        action="append",
        default=[],
        help="Manual model weights. May be repeated. Missing loaded models receive 0 weight.",
    )
    parser.add_argument("--output", default=None)
    return parser.parse_args()


def validate_grid_step(step: float) -> int:
    if step <= 0 or step > 1:
        raise ValueError("--grid_step must be in the interval (0, 1].")
    slots = round(1.0 / step)
    if abs((1.0 / slots) - step) > 1e-9:
        raise ValueError("--grid_step must evenly divide 1.0, for example 0.5, 0.25, 0.2, or 0.1.")
    return slots


def compositions(total: int, parts: int):
    if parts == 1:
        yield (total,)
        return
    for value in range(total + 1):
        for rest in compositions(total - value, parts - 1):
            yield (value, *rest)


def format_weights(weights: dict[str, float], model_names: list[str]) -> str:
    return ",".join(f"{name}={weights[name]:.6g}" for name in model_names)


def threshold_label(threshold: float) -> str:
    if threshold <= 0:
        return "all"
    return f"pos{threshold:g}".replace(".", "p")


def default_output_path(args: argparse.Namespace, dataset_name: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    label = threshold_label(args.positive_threshold)
    return Path("results") / "tuning" / (
        f"{dataset_name.lower()}_{label}_n{args.num_negatives}_"
        f"{args.target_metric}{args.target_k}_{timestamp}.csv"
    )


def complete_weights(raw_weights: dict[str, float], model_names: list[str]) -> dict[str, float]:
    unknown = sorted(set(raw_weights) - set(model_names))
    if unknown:
        raise ValueError(f"Candidate weights reference unloaded models: {', '.join(unknown)}")
    return {name: raw_weights.get(name, 0.0) for name in model_names}


def add_candidate(
    candidates: list[tuple[str, dict[str, float]]],
    seen: set[tuple[float, ...]],
    source: str,
    weights: dict[str, float],
    model_names: list[str],
) -> None:
    key = tuple(round(weights[name], 10) for name in model_names)
    if key in seen:
        return
    seen.add(key)
    candidates.append((source, weights))


def build_candidates(args: argparse.Namespace, model_names: list[str]) -> list[tuple[str, dict[str, float]]]:
    candidates: list[tuple[str, dict[str, float]]] = []
    seen: set[tuple[float, ...]] = set()

    equal_weight = 1.0 / len(model_names)
    add_candidate(
        candidates,
        seen,
        "equal",
        {name: equal_weight for name in model_names},
        model_names,
    )

    for raw_candidate in args.candidate_weights:
        weights = complete_weights(parse_ensemble_weights(raw_candidate) or {}, model_names)
        add_candidate(candidates, seen, "manual", weights, model_names)

    if not args.no_grid:
        slots = validate_grid_step(args.grid_step)
        for allocation in compositions(slots, len(model_names)):
            weights = {name: value / slots for name, value in zip(model_names, allocation)}
            add_candidate(candidates, seen, "grid", weights, model_names)

    if args.max_candidates is not None:
        candidates = candidates[: args.max_candidates]
    if not candidates:
        raise ValueError("No ensemble candidates were generated.")
    return candidates


def load_trained_models(model_dir: Path, model_names: list[str]):
    models = []
    for name in model_names:
        path = model_path(model_dir, name)
        if not path.exists():
            print(f"Skip missing model: {path}")
            continue
        models.append(load_model(path))
    if len(models) < 2:
        raise ValueError("At least two trained models are required for ensemble tuning.")
    return models


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    data_dir = Path(args.data_dir)
    model_dir = Path(args.model_dir)
    output = Path(args.output) if args.output else default_output_path(args, data_dir.name)
    ks = sorted(set(args.ks + [args.target_k]))

    print(f"Loading dataset from {data_dir}")
    train, valid, test, _, all_items = load_dataset_dir(data_dir)
    test_cases = list(iter_test_cases(test, args.positive_threshold))
    if args.max_eval_users is not None:
        rng.shuffle(test_cases)
        test_cases = test_cases[: args.max_eval_users]
    if not test_cases:
        raise ValueError("No test cases matched the requested positive threshold.")
    print(f"eval_cases={len(test_cases):,} all_items={len(all_items):,}")

    base_models = load_trained_models(model_dir, args.models)
    model_names = [model.name for model in base_models]
    candidates = build_candidates(args, model_names)
    print(f"loaded_models={','.join(model_names)} candidates={len(candidates):,}")

    results = []
    for idx, (source, weights) in enumerate(candidates, start=1):
        ensemble = WeightedEnsemble(list(base_models), weights=weights)
        metrics_by_k = evaluate_model(
            model=ensemble,
            train=train,
            valid=valid,
            test_cases=test_cases,
            all_items=all_items,
            ks=ks,
            num_negatives=args.num_negatives,
            rng=random.Random(args.seed),
        )
        target_score = metrics_by_k[args.target_k][args.target_metric]
        results.append(
            {
                "candidate_id": idx,
                "source": source,
                "weights": weights,
                "target_score": target_score,
                "metrics_by_k": metrics_by_k,
            }
        )
        print(
            f"candidate={idx}/{len(candidates)} source={source} "
            f"{args.target_metric}@{args.target_k}={target_score:.6f} "
            f"weights={format_weights(weights, model_names)}"
        )

    results.sort(key=lambda row: row["target_score"], reverse=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "rank",
        "candidate_id",
        "source",
        "dataset",
        "models",
        "weights",
        "target_metric",
        "target_k",
        "target_score",
        "k",
        "hit",
        "precision",
        "recall",
        "ndcg",
        "mrr",
        "num_negatives",
        "positive_threshold",
        "max_eval_users",
        "seed",
        "grid_step",
    ]
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for rank, row in enumerate(results, start=1):
            for k in ks:
                metrics = row["metrics_by_k"][k]
                writer.writerow(
                    {
                        "rank": rank,
                        "candidate_id": row["candidate_id"],
                        "source": row["source"],
                        "dataset": data_dir.name,
                        "models": " ".join(model_names),
                        "weights": format_weights(row["weights"], model_names),
                        "target_metric": args.target_metric,
                        "target_k": args.target_k,
                        "target_score": row["target_score"],
                        "k": k,
                        "hit": metrics.get("hit", 0.0),
                        "precision": metrics.get("precision", 0.0),
                        "recall": metrics.get("recall", 0.0),
                        "ndcg": metrics.get("ndcg", 0.0),
                        "mrr": metrics.get("mrr", 0.0),
                        "num_negatives": args.num_negatives,
                        "positive_threshold": args.positive_threshold,
                        "max_eval_users": args.max_eval_users or "",
                        "seed": args.seed,
                        "grid_step": "" if args.no_grid else args.grid_step,
                    }
                )

    best = results[0]
    print(f"Saved tuning results -> {output}")
    print(
        f"Best {args.target_metric}@{args.target_k}={best['target_score']:.6f} "
        f"weights={format_weights(best['weights'], model_names)}"
    )


if __name__ == "__main__":
    main()
