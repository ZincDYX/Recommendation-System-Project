#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash backend/scripts/evaluate_recommenders.sh [options]

Runs batched offline evaluation across datasets, label definitions, and
negative-sampling sizes. CSV outputs are ignored by Git.

Options:
  --data-root PATH              Dataset root. Default: ../rec_data from backend.
  --model-root PATH             Model root. Default: backend/saved_models.
  --results-dir PATH            Results output root. Default: backend/results.
  --datasets NAME...            Datasets to evaluate. Default: MovieLens Movies_and_TV.
  --models NAME...              Models to evaluate. Default: all implemented models.
  --k-values N...               Ranking cutoffs. Default: 5 10 20.
  --negative-counts N...        Sampled negatives. Default: 100 1000.
  --positive-thresholds V...    Positive labels. Default: 0 4.
  --max-eval-users N            Optional development eval case cap.
  --seed N                      Random seed. Default: 2026.
  --no-ensemble                 Disable ensemble evaluation.
  --ensemble-weights VALUE      Comma-separated model=weight pairs.
  -h, --help                    Show this help.

Example:
  bash backend/scripts/evaluate_recommenders.sh --datasets MovieLens --models popularity --negative-counts 20 --positive-thresholds 0 --max-eval-users 100 --no-ensemble
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_root="$(cd "$script_dir/.." && pwd)"
python_bin="${PYTHON:-python}"

data_root="$backend_root/../rec_data"
model_root="$backend_root/saved_models"
results_dir="$backend_root/results"
datasets=("MovieLens" "Movies_and_TV")
models=("popularity" "itemcf" "content_tfidf" "bpr_mf" "gru4rec")
k_values=(5 10 20)
negative_counts=(100 1000)
positive_thresholds=(0 4)
max_eval_users=0
seed=2026
include_ensemble=1
ensemble_weights=""

collected_values=()
consumed_count=0

collect_values() {
  collected_values=()
  consumed_count=0
  while [[ $# -gt 0 && $1 != --* ]]; do
    collected_values+=("$1")
    consumed_count=$((consumed_count + 1))
    shift
  done
  if (( consumed_count == 0 )); then
    echo "Expected at least one value." >&2
    exit 1
  fi
}

threshold_label() {
  local threshold=$1
  if [[ "$threshold" == "0" || "$threshold" == "0.0" ]]; then
    echo "all"
  else
    echo "pos${threshold//./p}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-root) data_root="$2"; shift 2 ;;
    --model-root) model_root="$2"; shift 2 ;;
    --results-dir) results_dir="$2"; shift 2 ;;
    --datasets)
      collect_values "${@:2}"
      datasets=("${collected_values[@]}")
      shift $((1 + consumed_count))
      ;;
    --models)
      collect_values "${@:2}"
      models=("${collected_values[@]}")
      shift $((1 + consumed_count))
      ;;
    --k-values)
      collect_values "${@:2}"
      k_values=("${collected_values[@]}")
      shift $((1 + consumed_count))
      ;;
    --negative-counts)
      collect_values "${@:2}"
      negative_counts=("${collected_values[@]}")
      shift $((1 + consumed_count))
      ;;
    --positive-thresholds)
      collect_values "${@:2}"
      positive_thresholds=("${collected_values[@]}")
      shift $((1 + consumed_count))
      ;;
    --max-eval-users) max_eval_users="$2"; shift 2 ;;
    --seed) seed="$2"; shift 2 ;;
    --no-ensemble) include_ensemble=0; shift ;;
    --ensemble-weights) ensemble_weights="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

run_evaluation() {
  local dataset=$1
  local negative_count=$2
  local positive_threshold=$3
  local label
  local dataset_slug
  label=$(threshold_label "$positive_threshold")
  dataset_slug="$(printf '%s' "$dataset" | tr '[:upper:]' '[:lower:]')"
  mkdir -p "$results_dir"

  local args=(
    -m src.evaluate
    --data_dir "$data_root/$dataset"
    --model_dir "$model_root/$dataset"
    --models "${models[@]}"
    --ks "${k_values[@]}"
    --num_negatives "$negative_count"
    --positive_threshold "$positive_threshold"
    --output "$results_dir/${dataset_slug}_${label}_n${negative_count}.csv"
    --seed "$seed"
  )
  if (( max_eval_users > 0 )); then
    args+=(--max_eval_users "$max_eval_users")
  fi
  if (( include_ensemble )); then
    args+=(--include_ensemble)
  fi
  if [[ -n "$ensemble_weights" ]]; then
    args+=(--ensemble_weights "$ensemble_weights")
  fi

  echo "Evaluating $dataset threshold=$positive_threshold negatives=$negative_count"
  (cd "$backend_root" && "$python_bin" "${args[@]}")
}

for dataset in "${datasets[@]}"; do
  for threshold in "${positive_thresholds[@]}"; do
    for negative_count in "${negative_counts[@]}"; do
      run_evaluation "$dataset" "$negative_count" "$threshold"
    done
  done
done
