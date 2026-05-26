from __future__ import annotations

import pickle
from pathlib import Path


def save_model(model, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        pickle.dump(model, f)


def load_model(path: str | Path):
    with Path(path).open("rb") as f:
        return pickle.load(f)


def model_path(model_dir: str | Path, model_name: str) -> Path:
    return Path(model_dir) / f"{model_name}.pkl"

