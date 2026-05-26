from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from src.data import load_dataset_dir, seen_items_for_user
from src.model_io import load_model, model_path
from src.models.ensemble import WeightedEnsemble


st.set_page_config(page_title="Personalized Recommender", layout="wide")


@st.cache_data(show_spinner=False)
def cached_dataset(data_dir: str):
    return load_dataset_dir(data_dir)


@st.cache_resource(show_spinner=False)
def cached_model(path: str):
    return load_model(path)


def available_model_names(model_dir: Path) -> list[str]:
    if not model_dir.exists():
        return []
    return sorted(path.stem for path in model_dir.glob("*.pkl"))


def history_frame(rows, item_info):
    data = []
    for _, item_id, rating, timestamp in rows:
        data.append(
            {
                "item_id": item_id,
                "title": item_info.get(item_id, ""),
                "rating": rating,
                "timestamp": timestamp,
            }
        )
    return pd.DataFrame(data)


def recommendation_frame(recs, item_info):
    return pd.DataFrame(
        [
            {"rank": rank, "item_id": item_id, "title": item_info.get(item_id, ""), "score": score}
            for rank, (item_id, score) in enumerate(recs, start=1)
        ]
    )


st.title("Personalized Recommendation System")

with st.sidebar:
    data_dir = st.text_input("Data directory", value="rec_data/MovieLens")
    model_dir = st.text_input("Model directory", value=f"saved_models/{Path(data_dir).name}")
    topk = st.slider("Top-K", min_value=5, max_value=50, value=10, step=5)

train, valid, test, item_info, all_items = cached_dataset(data_dir)
model_dir_path = Path(model_dir)
model_names = available_model_names(model_dir_path)
if len(model_names) >= 2:
    model_names = ["ensemble"] + model_names

if not model_names:
    st.warning("No trained model files found. Run `python -m src.train --data_dir <path>` first.")
    st.stop()

col_a, col_b = st.columns([2, 1])
with col_a:
    default_user = next(iter(train.keys()), "")
    user_id = st.text_input("User ID", value=default_user)
with col_b:
    model_name = st.selectbox("Model", model_names)

if model_name == "ensemble":
    base_models = [cached_model(str(model_path(model_dir_path, name))) for name in model_names if name != "ensemble"]
    model = WeightedEnsemble(base_models)
else:
    model = cached_model(str(model_path(model_dir_path, model_name)))

seen = seen_items_for_user(train, valid, user_id=user_id)
history_rows = train.get(user_id, [])
st.subheader("Training History")
if history_rows:
    st.dataframe(history_frame(history_rows[-50:], item_info), use_container_width=True, hide_index=True)
else:
    st.info("This user is not in the training set. The model will fall back to non-personalized scores if available.")

st.subheader("Recommendations")
recs = model.recommend(user_id, k=topk, exclude_items=seen)
st.dataframe(recommendation_frame(recs, item_info), use_container_width=True, hide_index=True)

