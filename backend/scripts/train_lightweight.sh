#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash backend/scripts/train_lightweight.sh [options]

Trains popularity, ItemCF, and content-based TF-IDF recommenders by default.
Generated model artifacts are ignored by Git.

Options:
  --data-root PATH                 Dataset root. Default: ../rec_data from backend.
  --output-dir PATH                Model output root. Default: backend/saved_models.
  --positive-threshold VALUE       Positive rating threshold. Default: 4.0.
  --movielens-itemcf-history N     MovieLens ItemCF history window. Default: 50.
  --amazon-itemcf-history N        Movies_and_TV ItemCF history window. Default: 50.
  --itemcf-topk-neighbors N        ItemCF neighbors per item. Default: 100.
  --itemcf-user-recent-k N         Recent user positives for scoring. Default: 30.
  --content-max-features N         TF-IDF max features. Default: 30000.
  --content-max-user-history N     Content profile history window. Default: 50.
  --seed N                         Random seed. Default: 2026.
  --datasets NAME...               Datasets to train. Default: MovieLens Movies_and_TV.
  --models NAME...                 Models to train. Default: popularity itemcf content_tfidf.
  --max-train-rows N               Optional development row limit.
  --max-users N                    Optional development user limit.
  -h, --help                       Show this help.

Example:
  bash backend/scripts/train_lightweight.sh --datasets MovieLens --models popularity --max-train-rows 5000 --max-users 100
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_root="$(cd "$script_dir/.." && pwd)"
python_bin="${PYTHON:-python}"

data_root="$backend_root/../rec_data"
output_dir="$backend_root/saved_models"
positive_threshold="4.0"
movielens_itemcf_history=50
amazon_itemcf_history=50
itemcf_topk_neighbors=100
itemcf_user_recent_k=30
content_max_features=30000
content_max_user_history=50
seed=2026
datasets=("MovieLens" "Movies_and_TV")
models=("popularity" "itemcf" "content_tfidf")
max_train_rows=0
max_users=0

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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-root) data_root="$2"; shift 2 ;;
    --output-dir) output_dir="$2"; shift 2 ;;
    --positive-threshold) positive_threshold="$2"; shift 2 ;;
    --movielens-itemcf-history) movielens_itemcf_history="$2"; shift 2 ;;
    --amazon-itemcf-history) amazon_itemcf_history="$2"; shift 2 ;;
    --itemcf-topk-neighbors) itemcf_topk_neighbors="$2"; shift 2 ;;
    --itemcf-user-recent-k) itemcf_user_recent_k="$2"; shift 2 ;;
    --content-max-features) content_max_features="$2"; shift 2 ;;
    --content-max-user-history) content_max_user_history="$2"; shift 2 ;;
    --seed) seed="$2"; shift 2 ;;
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
    --max-train-rows) max_train_rows="$2"; shift 2 ;;
    --max-users) max_users="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

run_training() {
  local dataset=$1
  local history_limit=$movielens_itemcf_history
  if [[ "$dataset" == "Movies_and_TV" ]]; then
    history_limit=$amazon_itemcf_history
  fi

  local args=(
    -m src.train
    --data_dir "$data_root/$dataset"
    --output_dir "$output_dir"
    --models "${models[@]}"
    --positive_threshold "$positive_threshold"
    --seed "$seed"
    --itemcf_max_user_history "$history_limit"
    --itemcf_topk_neighbors "$itemcf_topk_neighbors"
    --itemcf_user_recent_k "$itemcf_user_recent_k"
    --content_max_features "$content_max_features"
    --content_max_user_history "$content_max_user_history"
  )
  if (( max_train_rows > 0 )); then
    args+=(--max_train_rows "$max_train_rows")
  fi
  if (( max_users > 0 )); then
    args+=(--max_users "$max_users")
  fi

  echo "Training lightweight models for $dataset"
  (cd "$backend_root" && "$python_bin" "${args[@]}")
}

for dataset in "${datasets[@]}"; do
  run_training "$dataset"
done
