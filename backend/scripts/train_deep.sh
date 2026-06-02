#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash backend/scripts/train_deep.sh [options]

Trains BPR-MF and GRU4Rec with medium default hyperparameters.
Generated model artifacts are ignored by Git.

Options:
  --data-root PATH             Dataset root. Default: ../rec_data from backend.
  --output-dir PATH            Model output root. Default: backend/saved_models.
  --positive-threshold VALUE   Positive rating threshold. Default: 4.0.
  --factors N                  Embedding size. Default: 64.
  --hidden-dim N               GRU hidden size. Default: 64.
  --movielens-max-seq-len N    MovieLens max sequence length. Default: 50.
  --amazon-max-seq-len N       Movies_and_TV max sequence length. Default: 20.
  --epochs N                   Training epochs. Default: 3.
  --batch-size N               Batch size. Default: 1024.
  --lr VALUE                   Learning rate. Default: 0.001.
  --max-train-samples N        Training sample cap. Default: 500000.
  --device VALUE               Torch device. Default: cpu.
  --seed N                     Random seed. Default: 2026.
  --datasets NAME...           Datasets to train. Default: MovieLens Movies_and_TV.
  --models NAME...             Models to train. Default: bpr_mf gru4rec.
  --max-train-rows N           Optional development row limit.
  --max-users N                Optional development user limit.
  -h, --help                   Show this help.

Example:
  bash backend/scripts/train_deep.sh --device cuda --datasets MovieLens --models bpr_mf --epochs 1 --max-train-samples 10000
EOF
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_root="$(cd "$script_dir/.." && pwd)"
python_bin="${PYTHON:-python}"

data_root="$backend_root/../rec_data"
output_dir="$backend_root/saved_models"
positive_threshold="4.0"
factors=64
hidden_dim=64
movielens_max_seq_len=50
amazon_max_seq_len=20
epochs=3
batch_size=1024
learning_rate="0.001"
max_train_samples=500000
device="cpu"
seed=2026
datasets=("MovieLens" "Movies_and_TV")
models=("bpr_mf" "gru4rec")
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
    --factors) factors="$2"; shift 2 ;;
    --hidden-dim) hidden_dim="$2"; shift 2 ;;
    --movielens-max-seq-len) movielens_max_seq_len="$2"; shift 2 ;;
    --amazon-max-seq-len) amazon_max_seq_len="$2"; shift 2 ;;
    --epochs) epochs="$2"; shift 2 ;;
    --batch-size) batch_size="$2"; shift 2 ;;
    --lr) learning_rate="$2"; shift 2 ;;
    --max-train-samples) max_train_samples="$2"; shift 2 ;;
    --device) device="$2"; shift 2 ;;
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
  local seq_len=$movielens_max_seq_len
  if [[ "$dataset" == "Movies_and_TV" ]]; then
    seq_len=$amazon_max_seq_len
  fi

  local args=(
    -m src.train
    --data_dir "$data_root/$dataset"
    --output_dir "$output_dir"
    --models "${models[@]}"
    --positive_threshold "$positive_threshold"
    --seed "$seed"
    --factors "$factors"
    --hidden_dim "$hidden_dim"
    --max_seq_len "$seq_len"
    --epochs "$epochs"
    --batch_size "$batch_size"
    --lr "$learning_rate"
    --max_train_samples "$max_train_samples"
    --device "$device"
  )
  if (( max_train_rows > 0 )); then
    args+=(--max_train_rows "$max_train_rows")
  fi
  if (( max_users > 0 )); then
    args+=(--max_users "$max_users")
  fi

  echo "Training deep models for $dataset"
  (cd "$backend_root" && "$python_bin" "${args[@]}")
}

for dataset in "${datasets[@]}"; do
  run_training "$dataset"
done
