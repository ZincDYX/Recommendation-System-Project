from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from src.data import Histories, load_dataset_dir, seen_items_for_user
from src.evaluate import parse_ensemble_weights
from src.model_io import load_model, model_path
from src.model_registry import AVAILABLE_MODELS
from src.models.ensemble import WeightedEnsemble


# Default paths match the repository layout; environment variables make server
# deployment on lab machines possible without editing source code.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
DATA_ROOT = Path(os.getenv("RECSYS_DATA_ROOT", PROJECT_ROOT / "rec_data"))
MODEL_ROOT = Path(os.getenv("RECSYS_MODEL_ROOT", BACKEND_ROOT / "saved_models"))
RESULTS_ROOT = Path(os.getenv("RECSYS_RESULTS_ROOT", BACKEND_ROOT / "results"))
MOVIE_CACHE_PATH = Path(os.getenv("RECSYS_MOVIE_CACHE_PATH", BACKEND_ROOT / "cache" / "movie_details.json"))
MOVIE_DETAIL_VERSION = 4
WIKI_USER_AGENT = os.getenv("RECSYS_WIKI_USER_AGENT", "recomsys-course-demo/1.0")
ALL_CATEGORY = "All"
GENRE_KEYWORDS = [
    (
        "Action",
        [
            "action",
            "adventure",
            "avengers",
            "batman",
            "battle",
            "bond",
            "bourne",
            "captain america",
            "die hard",
            "dragon",
            "fast furious",
            "fight",
            "iron man",
            "john wick",
            "mission impossible",
            "police",
            "rambo",
            "spider man",
            "superman",
            "thor",
            "war",
            "x men",
        ],
    ),
    (
        "Comedy",
        [
            "comedy",
            "borat",
            "bride",
            "dumb",
            "funny",
            "grand budapest hotel",
            "hangover",
            "meet the",
            "monty python",
            "naked gun",
            "school of rock",
            "vacation",
            "wedding",
        ],
    ),
    (
        "Drama",
        [
            "drama",
            "beautiful mind",
            "casablanca",
            "citizen kane",
            "forrest gump",
            "godfather",
            "green mile",
            "parasite",
            "pianist",
            "professional",
            "redemption",
            "schindler",
            "shawshank",
        ],
    ),
    (
        "Romance",
        [
            "romance",
            "before sunrise",
            "before sunset",
            "kiss",
            "love",
            "notting hill",
            "pretty woman",
            "titanic",
            "valentine",
        ],
    ),
    (
        "Sci-Fi",
        [
            "sci fi",
            "science fiction",
            "alien",
            "avatar",
            "blade runner",
            "dune",
            "future",
            "galaxy",
            "interstellar",
            "jurassic",
            "matrix",
            "planet",
            "robot",
            "space",
            "star trek",
            "star wars",
            "terminator",
            "time travel",
        ],
    ),
    (
        "Animation",
        [
            "animation",
            "animated",
            "anime",
            "cartoon",
            "disney",
            "finding nemo",
            "frozen",
            "lion king",
            "pixar",
            "pokemon",
            "shrek",
            "toy story",
            "wall e",
        ],
    ),
    (
        "Documentary",
        [
            "documentary",
            "docu",
            "history of",
            "inside job",
            "journey",
            "planet earth",
            "truth",
        ],
    ),
    (
        "Horror",
        [
            "horror",
            "conjuring",
            "dead",
            "dracula",
            "evil",
            "exorcist",
            "frankenstein",
            "ghost",
            "halloween",
            "nightmare",
            "psycho",
            "saw",
            "scream",
            "shining",
            "vampire",
            "zombie",
        ],
    ),
    (
        "Thriller",
        [
            "thriller",
            "crime",
            "detective",
            "fugitive",
            "gone girl",
            "killer",
            "murder",
            "mystery",
            "se7en",
            "shutter island",
            "silence of the lambs",
            "spy",
            "usual suspects",
        ],
    ),
    (
        "Family",
        [
            "family",
            "christmas",
            "children",
            "home alone",
            "jumanji",
            "muppets",
            "sesame street",
            "wizard of oz",
        ],
    ),
]
CATALOG_CATEGORIES = [ALL_CATEGORY, *[genre for genre, _ in GENRE_KEYWORDS], "Other"]
GENRE_CATEGORY_RULES = [
    ("Action", ["action", "adventure", "martial arts", "superhero", "spy", "war", "western"]),
    ("Comedy", ["comedy", "comic", "satire", "parody"]),
    ("Drama", ["drama", "melodrama", "biographical", "historical", "coming-of-age", "prison", "剧情", "劇情"]),
    ("Romance", ["romance", "romantic"]),
    ("Sci-Fi", ["science fiction", "sci-fi", "cyberpunk", "space opera", "dystopian"]),
    ("Animation", ["animation", "animated", "anime", "动画", "動畫"]),
    ("Documentary", ["documentary", "docudrama"]),
    ("Horror", ["horror", "slasher", "supernatural"]),
    ("Thriller", ["thriller", "mystery", "suspense", "psychological", "惊悚", "驚悚"]),
    ("Family", ["family", "children", "children's", "musical"]),
]
EXTERNAL_GENRE_CATEGORY_RULES = [
    ("Animation", ["animation", "animated", "anime", "动画", "動畫"]),
    ("Documentary", ["documentary", "docudrama", "纪录", "紀錄"]),
    ("Horror", ["horror", "slasher", "supernatural", "恐怖"]),
    ("Sci-Fi", ["science fiction", "sci-fi", "cyberpunk", "space opera", "dystopian", "科幻"]),
    ("Comedy", ["comedy", "comic", "satire", "parody", "喜劇", "喜剧", "幽默"]),
    ("Romance", ["romance", "romantic", "爱情", "愛情"]),
    ("Drama", ["drama", "melodrama", "biographical", "historical", "coming-of-age", "prison", "剧情", "劇情"]),
    ("Thriller", ["thriller", "mystery", "suspense", "psychological", "惊悚", "驚悚"]),
    ("Action", ["action", "adventure", "martial arts", "superhero", "spy", "war", "western", "冒险", "冒險"]),
    ("Family", ["family", "children", "children's", "家庭", "兒童", "儿童"]),
]

app = FastAPI(title="Recommendation System API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("RECSYS_CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def dataset_dir(dataset: str) -> Path:
    path = DATA_ROOT / dataset
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset}")
    return path


def dataset_model_dir(dataset: str) -> Path:
    return MODEL_ROOT / dataset


@lru_cache(maxsize=8)
def cached_dataset(data_dir: str):
    """Load a dataset once per process and reuse it across API calls."""
    return load_dataset_dir(data_dir)


@lru_cache(maxsize=64)
def cached_model(path: str):
    """Load trained pickle models lazily and keep them in memory."""
    return load_model(path)


def load_dataset(dataset: str):
    return cached_dataset(str(dataset_dir(dataset)))


def read_movie_cache() -> dict[str, Any]:
    if not MOVIE_CACHE_PATH.exists():
        return {}
    try:
        with MOVIE_CACHE_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_movie_cache(cache: dict[str, Any]) -> None:
    MOVIE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MOVIE_CACHE_PATH.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def http_json(url: str, params: dict[str, Any] | None = None, timeout: int = 10) -> dict[str, Any]:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": WIKI_USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8")
    data = json.loads(payload)
    return data if isinstance(data, dict) else {}


def normalize_movie_title(title: str) -> tuple[str, str]:
    year_match = re.search(r"\((\d{4})\)", title)
    year = year_match.group(1) if year_match else ""
    clean_title = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()
    for article in ("The", "A", "An"):
        suffix = f", {article}"
        if clean_title.endswith(suffix):
            clean_title = f"{article} {clean_title[:-len(suffix)]}".strip()
            break
    return clean_title, year


def likely_non_movie_page(page_title: str) -> bool:
    normalized = page_title.lower()
    blocked_terms = [
        "soundtrack",
        "franchise",
        "characters",
        "list of",
        "accolades",
        "video game",
        "(novel)",
    ]
    return any(term in normalized for term in blocked_terms)


def likely_movie_summary(summary: dict[str, Any]) -> bool:
    extract = str(summary.get("extract") or "").lower()
    if summary.get("type") == "disambiguation":
        return False
    return " film" in extract or " movie" in extract or "animated" in extract


def wikipedia_search_title(title: str, year: str) -> str | None:
    search_terms = [f'intitle:"{title}" film', title]
    if year:
        search_terms.insert(1, f"{title} {year} film")
    for search_term in search_terms:
        data = http_json(
            "https://en.wikipedia.org/w/api.php",
            {
                "action": "query",
                "list": "search",
                "srsearch": search_term,
                "format": "json",
                "srlimit": 5,
            },
        )
        rows = data.get("query", {}).get("search", [])
        fallback_title = None
        for row in rows:
            page_title = row.get("title")
            if not page_title or likely_non_movie_page(page_title):
                continue
            fallback_title = fallback_title or page_title
            try:
                summary = wikipedia_summary("en", page_title)
            except Exception:
                continue
            if likely_movie_summary(summary):
                return page_title
        if fallback_title:
            return fallback_title
    return None


def wikipedia_summary(language: str, page_title: str) -> dict[str, Any]:
    encoded_title = urllib.parse.quote(page_title.replace(" ", "_"))
    return http_json(f"https://{language}.wikipedia.org/api/rest_v1/page/summary/{encoded_title}")


def wikidata_entity(qid: str) -> dict[str, Any]:
    data = http_json(
        "https://www.wikidata.org/w/api.php",
        {
            "action": "wbgetentities",
            "ids": qid,
            "props": "claims|labels|sitelinks",
            "languages": "zh|en",
            "languagefallback": 1,
            "format": "json",
        },
    )
    return data.get("entities", {}).get(qid, {})


def wikidata_label_entities(qids: list[str]) -> dict[str, dict[str, str]]:
    if not qids:
        return {}
    data = http_json(
        "https://www.wikidata.org/w/api.php",
        {
            "action": "wbgetentities",
            "ids": "|".join(qids),
            "props": "labels",
            "languages": "zh|en",
            "languagefallback": 1,
            "format": "json",
        },
    )
    labels: dict[str, dict[str, str]] = {}
    for qid, entity in data.get("entities", {}).items():
        entity_labels = entity.get("labels", {})
        labels[qid] = {
            "zh": entity_labels.get("zh", {}).get("value", ""),
            "en": entity_labels.get("en", {}).get("value", ""),
        }
    return labels


def wikidata_genres(entity: dict[str, Any]) -> list[dict[str, str]]:
    claims = entity.get("claims", {}).get("P136", [])
    genre_qids = []
    for claim in claims:
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        genre_qid = value.get("id") if isinstance(value, dict) else None
        if genre_qid:
            genre_qids.append(genre_qid)
    labels = wikidata_label_entities(genre_qids[:12])
    return [
        {
            "qid": qid,
            "label": labels.get(qid, {}).get("zh") or labels.get(qid, {}).get("en") or qid,
            "label_en": labels.get(qid, {}).get("en") or labels.get(qid, {}).get("zh") or qid,
        }
        for qid in genre_qids[:12]
    ]


def category_from_external_genres(genres: list[dict[str, str]], fallback_title: str, summary: str = "") -> str:
    genre_text = " ".join(
        f"{genre.get('label', '')} {genre.get('label_en', '')}".lower()
        for genre in genres
    )
    genre_text = f"{genre_text} {summary.lower()}"
    for category, keywords in EXTERNAL_GENRE_CATEGORY_RULES:
        if any(keyword in genre_text for keyword in keywords):
            return category
    return item_category(fallback_title)


def movie_detail_fallback(dataset: str, item_id: str, item_info: dict[str, str]) -> dict[str, Any]:
    payload = item_payload(dataset, item_id, item_info)
    return {
        **payload,
        "metadata_version": MOVIE_DETAIL_VERSION,
        "genres": [payload["category"]],
        "summary": "暂时没有可用的外部电影简介。当前本地数据只包含 item id 和标题。",
        "source": "Local dataset fallback",
        "source_url": "",
        "source_language": "en",
        "external_found": False,
    }


def fetch_movie_detail(dataset: str, item_id: str, item_info: dict[str, str]) -> dict[str, Any]:
    title = item_info.get(item_id) or f"Item {item_id}"
    clean_title, year = normalize_movie_title(title)
    page_title = wikipedia_search_title(clean_title, year)
    if not page_title:
        return movie_detail_fallback(dataset, item_id, item_info)

    en_summary = wikipedia_summary("en", page_title)
    if en_summary.get("type") == "disambiguation":
        return movie_detail_fallback(dataset, item_id, item_info)

    qid = en_summary.get("wikibase_item", "")
    entity = wikidata_entity(qid) if qid else {}
    genres = wikidata_genres(entity)
    source_summary = en_summary
    source_language = "en"
    zh_title = entity.get("sitelinks", {}).get("zhwiki", {}).get("title")
    if zh_title:
        try:
            zh_summary = wikipedia_summary("zh", zh_title)
            if zh_summary.get("extract"):
                source_summary = zh_summary
                source_language = "zh"
        except Exception:
            source_summary = en_summary

    source_url = (
        source_summary.get("content_urls", {})
        .get("desktop", {})
        .get("page", "")
    )
    summary_text = source_summary.get("extract") or en_summary.get("extract") or ""
    category = category_from_external_genres(genres, title, summary_text) if genres else item_category(title)
    return {
        **item_payload(dataset, item_id, item_info),
        "metadata_version": MOVIE_DETAIL_VERSION,
        "category": category,
        "genres": [genre["label"] for genre in genres] or [category],
        "genre_source": "Wikidata" if genres else "title fallback",
        "summary": summary_text,
        "source": "Wikipedia / Wikidata",
        "source_title": source_summary.get("title") or en_summary.get("title") or page_title,
        "source_url": source_url,
        "source_language": source_language,
        "wikidata_id": qid,
        "external_found": True,
        "match_query": f"{clean_title} {year}".strip(),
    }


def cached_movie_detail(dataset: str, item_id: str, item_info: dict[str, str]) -> dict[str, Any]:
    cache_key = f"{dataset}:{item_id}"
    cache = read_movie_cache()
    cached = cache.get(cache_key)
    if isinstance(cached, dict) and cached.get("metadata_version") == MOVIE_DETAIL_VERSION:
        return cached
    try:
        detail = fetch_movie_detail(dataset, item_id, item_info)
    except Exception:
        detail = movie_detail_fallback(dataset, item_id, item_info)
    if detail.get("external_found"):
        cache[cache_key] = detail
        write_movie_cache(cache)
    return detail


def available_base_models(dataset: str) -> list[str]:
    model_dir = dataset_model_dir(dataset)
    if not model_dir.exists():
        return []
    existing = {path.stem for path in model_dir.glob("*.pkl")}
    return [name for name in AVAILABLE_MODELS if name in existing]


def load_recommender(dataset: str, model_name: str, raw_weights: str | None = None):
    """Resolve a single trained model or build an in-memory weighted ensemble."""
    model_dir = dataset_model_dir(dataset)
    base_model_names = available_base_models(dataset)
    if model_name == "ensemble":
        if len(base_model_names) < 2:
            raise HTTPException(status_code=404, detail="At least two trained models are required for ensemble.")
        weights = parse_ensemble_weights(raw_weights)
        models = [cached_model(str(model_path(model_dir, name))) for name in base_model_names]
        return WeightedEnsemble(models, weights=weights)
    if model_name not in base_model_names:
        raise HTTPException(status_code=404, detail=f"Model is not available: {model_name}")
    return cached_model(str(model_path(model_dir, model_name)))


def tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[A-Za-z0-9]+", text.lower()) if len(token) >= 2}


def parse_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def stable_price(item_id: str) -> int:
    """Generate deterministic display prices for dataset items without prices."""
    digest = hashlib.md5(item_id.encode("utf-8"), usedforsecurity=False).hexdigest()
    return 20 + int(digest[:4], 16) % 480


def normalize_for_genre(text: str) -> str:
    return f" {re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()} "


def item_category(title: str) -> str:
    """Infer a display genre from title keywords when metadata has no genre."""
    normalized_title = normalize_for_genre(title)
    for genre, keywords in GENRE_KEYWORDS:
        for keyword in keywords:
            if normalize_for_genre(keyword) in normalized_title:
                return genre
    return "Other"


def item_payload(dataset: str, item_id: str, item_info: dict[str, str], score: float | None = None) -> dict[str, Any]:
    """Convert a dataset item into the product shape expected by the frontend."""
    title = item_info.get(item_id) or f"Item {item_id}"
    payload: dict[str, Any] = {
        "id": item_id,
        "item_id": item_id,
        "name": title,
        "title": title,
        "category": item_category(title),
        "dataset": dataset,
        "price": stable_price(item_id),
        "description": f"{dataset} item {item_id}",
        "image": "",
    }
    if score is not None:
        payload["score"] = score
    return payload


def recent_history(train: Histories, user_id: str, limit: int):
    return train.get(user_id, [])[-limit:]


def search_item_ids(item_info: dict[str, str], query: str, limit: int) -> list[str]:
    """Find items whose titles share tokens with the search query."""
    query_tokens = tokenize(query)
    if not query_tokens:
        return []
    scored = []
    for item_id, title in item_info.items():
        title_tokens = tokenize(title)
        overlap = len(query_tokens & title_tokens)
        if overlap:
            scored.append((overlap, title.lower().find(query.lower()), item_id))
    scored.sort(key=lambda row: (-row[0], row[1] if row[1] >= 0 else 9999, row[2]))
    return [item_id for _, _, item_id in scored[:limit]]


def catalog_item_ids(
    item_info: dict[str, str],
    all_items: list[str],
    category: str,
    query: str,
    popularity_scores: dict[str, float] | None = None,
) -> list[str]:
    """Return catalog item ids after display-category and title filters."""
    query_tokens = tokenize(query)
    popularity_scores = popularity_scores or {}
    rows = []
    for item_id in all_items:
        title = item_info.get(item_id)
        if not title:
            continue
        display_category = item_category(title)
        if category != ALL_CATEGORY and display_category != category:
            continue
        title_tokens = tokenize(title)
        popularity = float(popularity_scores.get(item_id, 0.0))
        if query_tokens:
            overlap = len(query_tokens & title_tokens)
            if not overlap:
                continue
            rows.append((-overlap, -popularity, catalog_sort_title(title), item_id))
        else:
            rows.append((-popularity, 0, catalog_sort_title(title), item_id))
    rows.sort(key=lambda row: (row[0], row[1], row[2], row[3]))
    return [item_id for *_, item_id in rows]


def catalog_sort_title(title: str) -> str:
    """Sort catalog titles by readable words instead of leading symbols."""
    normalized = title.lower().strip()
    normalized = re.sub(r"^[^a-z0-9]+", "", normalized).strip()
    normalized = re.sub(r"^(the|a|an)\s+", "", normalized).strip()
    normalized = re.sub(r"^[^a-z0-9]+", "", normalized).strip()
    if not normalized:
        return f"2:{title.lower()}"
    prefix = "0" if normalized[0].isalpha() else "1"
    return f"{prefix}:{normalized}"


def context_tokens(item_info: dict[str, str], query: str | None, context_items: list[str]) -> set[str]:
    """Collect lightweight session context from search text and cart items."""
    tokens = tokenize(query or "")
    for item_id in context_items:
        tokens.update(tokenize(item_info.get(item_id, "")))
    return tokens


def rerank_with_context(
    recommendations: list[tuple[str, float]],
    item_info: dict[str, str],
    tokens: set[str],
) -> list[tuple[str, float]]:
    """Boost recommendations that match the current search/cart context."""
    if not tokens:
        return recommendations
    reranked = []
    for item_id, score in recommendations:
        overlap = len(tokens & tokenize(item_info.get(item_id, "")))
        reranked.append((item_id, score + overlap * 0.05))
    return sorted(reranked, key=lambda row: (-row[1], row[0]))


def normalized_component(scores: dict[str, float], candidates: set[str]) -> dict[str, float]:
    values = [scores.get(item_id, 0.0) for item_id in candidates]
    if not values:
        return {}
    min_score = min(values)
    max_score = max(values)
    denom = max_score - min_score
    if denom <= 1e-12:
        return {item_id: 0.0 for item_id in candidates}
    return {item_id: (scores.get(item_id, 0.0) - min_score) / denom for item_id in candidates}


def collect_session_candidates(
    dataset: str,
    item_info: dict[str, str],
    all_items: list[str],
    context_item_ids: list[str],
    query: str,
) -> set[str]:
    candidates: set[str] = set()
    model_dir = dataset_model_dir(dataset)

    if query.strip():
        candidates.update(search_item_ids(item_info, query, limit=1500))

    itemcf_path = model_path(model_dir, "itemcf")
    if itemcf_path.exists():
        itemcf = cached_model(str(itemcf_path))
        for item_id in context_item_ids:
            candidates.update(neighbor for neighbor, _ in getattr(itemcf, "similar_items", {}).get(item_id, [])[:600])

    for item_id in context_item_ids:
        title = item_info.get(item_id, "")
        if title:
            candidates.update(search_item_ids(item_info, title, limit=300))

    popularity_path = model_path(model_dir, "popularity")
    if popularity_path.exists():
        popularity = cached_model(str(popularity_path))
        popular_items = sorted(
            getattr(popularity, "item_scores", {}).items(),
            key=lambda row: (-row[1], row[0]),
        )
        candidates.update(item_id for item_id, _ in popular_items[:800])

    if not candidates:
        candidates.update(all_items[:1000])
    return {item_id for item_id in candidates if item_id in item_info and item_id not in context_item_ids}


def content_session_scores(dataset: str, context_item_ids: list[str], candidate_ids: set[str]) -> dict[str, float]:
    content_path = model_path(dataset_model_dir(dataset), "content_tfidf")
    if not content_path.exists() or not context_item_ids:
        return {}
    content_model = cached_model(str(content_path))
    if getattr(content_model, "item_matrix", None) is None:
        return {}
    item_to_idx = getattr(content_model, "item_to_idx", {})
    hist_indices = [item_to_idx[item_id] for item_id in context_item_ids if item_id in item_to_idx]
    if not hist_indices:
        return {}
    known = [(item_id, item_to_idx[item_id]) for item_id in candidate_ids if item_id in item_to_idx]
    if not known:
        return {}

    import numpy as np

    profile = content_model.item_matrix[hist_indices].sum(axis=0)
    candidate_matrix = content_model.item_matrix[[idx for _, idx in known]]
    raw_scores = np.asarray(candidate_matrix @ profile.T).ravel()
    return {item_id: float(score) for (item_id, _), score in zip(known, raw_scores)}


def itemcf_session_scores(dataset: str, context_item_ids: list[str], candidate_ids: set[str]) -> dict[str, float]:
    itemcf_path = model_path(dataset_model_dir(dataset), "itemcf")
    if not itemcf_path.exists() or not context_item_ids:
        return {}
    itemcf = cached_model(str(itemcf_path))
    scores = {item_id: 0.0 for item_id in candidate_ids}
    for context_item_id in context_item_ids:
        for neighbor, score in getattr(itemcf, "similar_items", {}).get(context_item_id, []):
            if neighbor in candidate_ids:
                scores[neighbor] += float(score)
    return scores


def popularity_session_scores(dataset: str, candidate_ids: set[str]) -> dict[str, float]:
    popularity_path = model_path(dataset_model_dir(dataset), "popularity")
    if not popularity_path.exists():
        return {}
    popularity = cached_model(str(popularity_path))
    item_scores = getattr(popularity, "item_scores", {})
    return {item_id: float(item_scores.get(item_id, 0.0)) for item_id in candidate_ids}


def title_session_scores(item_info: dict[str, str], context_item_ids: list[str], query: str, candidate_ids: set[str]) -> dict[str, float]:
    tokens = context_tokens(item_info, query, context_item_ids)
    if not tokens:
        return {}
    return {
        item_id: float(len(tokens & tokenize(item_info.get(item_id, ""))))
        for item_id in candidate_ids
    }


def session_recommend_items(
    dataset: str,
    item_info: dict[str, str],
    all_items: list[str],
    context_item_ids: list[str],
    query: str,
    topk: int,
) -> list[tuple[str, float]]:
    """Recommend for a brand-new guest from current-session item signals."""
    if not context_item_ids and not query.strip():
        return []
    candidate_ids = collect_session_candidates(dataset, item_info, all_items, context_item_ids, query)
    components = [
        (1.0, content_session_scores(dataset, context_item_ids, candidate_ids)),
        (0.9, itemcf_session_scores(dataset, context_item_ids, candidate_ids)),
        (0.35, title_session_scores(item_info, context_item_ids, query, candidate_ids)),
        (0.2, popularity_session_scores(dataset, candidate_ids)),
    ]
    combined = {item_id: 0.0 for item_id in candidate_ids}
    for weight, raw_scores in components:
        for item_id, score in normalized_component(raw_scores, candidate_ids).items():
            combined[item_id] += weight * score
    ranked = sorted(combined.items(), key=lambda row: (-row[1], catalog_sort_title(item_info.get(row[0], row[0])), row[0]))
    return ranked[:topk]


def model_reason(model_name: str) -> str:
    reasons = {
        "popularity": "推荐证据：该物品在训练集中整体热度较高，适合作为热门推荐结果。",
        "itemcf": "推荐证据：物品协同过滤发现它与用户历史交互物品存在相似的共现模式。",
        "content_tfidf": "推荐证据：内容 TF-IDF 发现它的标题词项与用户历史兴趣更接近。",
        "bpr_mf": "推荐证据：BPR 矩阵分解模型预测该用户对该物品的隐式偏好得分较高。",
        "gru4rec": "推荐证据：GRU4Rec 根据用户近期行为序列预测该物品可能符合下一步兴趣。",
        "ensemble": "推荐证据：融合模型综合热门度、协同过滤、内容相似和深度模型信号后给出较高排序。",
        "session": "推荐证据：该物品由本次会话中的点击、加购和搜索信号实时触发；genre 只用于页面浏览。",
    }
    return reasons.get(model_name, "推荐证据：该物品在当前算法排序中得分较高，因此被推荐。")


def explanation_for_item(
    model_name: str,
    item_id: str,
    item_info: dict[str, str],
    train: Histories,
    user_id: str,
    query: str | None,
    context_item_ids: list[str],
) -> str:
    """Build a lightweight display explanation for one recommendation."""
    title_tokens = tokenize(item_info.get(item_id, ""))
    query_value = (query or "").strip()
    if query_value and title_tokens & tokenize(query_value):
        return f"推荐证据：当前搜索词“{query_value}”与该标题存在词项匹配，因此被优先展示；genre 只用于页面浏览。"

    for context_item_id in context_item_ids:
        context_title = item_info.get(context_item_id, "")
        if title_tokens & tokenize(context_title):
            return f"推荐证据：你本次点击或加购过“{context_title or context_item_id}”，该结果与它存在标题词项或物品共现相似；genre 只用于页面浏览。"

    for _, history_item_id, _, _ in reversed(recent_history(train, user_id, 10)):
        history_title = item_info.get(history_item_id, "")
        if title_tokens & tokenize(history_title):
            return f"推荐证据：该结果与用户近期历史行为中的“{history_title or history_item_id}”存在内容相似性。"

    return model_reason(model_name)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/datasets")
def datasets() -> dict[str, list[str]]:
    if not DATA_ROOT.exists():
        return {"datasets": []}
    names = [path.name for path in DATA_ROOT.iterdir() if (path / "train.txt").exists()]
    return {"datasets": sorted(names)}


@app.get("/catalog_categories")
def catalog_categories() -> dict[str, list[str]]:
    return {"categories": CATALOG_CATEGORIES}


@app.get("/items")
def items(
    dataset: str = Query("MovieLens"),
    category: str = Query(ALL_CATEGORY),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    query: str = "",
):
    """Return a paginated real catalog from dataset item metadata."""
    if category not in CATALOG_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown catalog category: {category}")
    _, _, _, item_info, all_items = load_dataset(dataset)
    popularity_scores = {}
    popularity_path = model_path(dataset_model_dir(dataset), "popularity")
    if popularity_path.exists():
        popularity_scores = getattr(cached_model(str(popularity_path)), "item_scores", {})
    item_ids = catalog_item_ids(
        item_info,
        all_items,
        category=category,
        query=query,
        popularity_scores=popularity_scores,
    )
    page_ids = item_ids[offset : offset + limit]
    next_offset = offset + len(page_ids)
    return {
        "dataset": dataset,
        "category": category,
        "query": query,
        "limit": limit,
        "offset": offset,
        "next_offset": next_offset,
        "total": len(item_ids),
        "has_more": next_offset < len(item_ids),
        "items": [item_payload(dataset, item_id, item_info) for item_id in page_ids],
    }


@app.get("/models")
def models(dataset: str = Query("MovieLens")) -> dict[str, list[str]]:
    base_models = available_base_models(dataset)
    model_names = ["ensemble", *base_models] if len(base_models) >= 2 else base_models
    return {"models": model_names}


@app.get("/users")
def users(dataset: str = Query("MovieLens"), limit: int = Query(20, ge=1, le=500), query: str = ""):
    train, _, _, _, _ = load_dataset(dataset)
    user_ids = list(train.keys())
    if query:
        user_ids = [user_id for user_id in user_ids if query in user_id]
    return {
        "users": [
            {"user_id": user_id, "history_count": len(train[user_id])}
            for user_id in user_ids[:limit]
        ]
    }


@app.get("/history")
def history(dataset: str = Query("MovieLens"), user_id: str = Query(...), limit: int = Query(20, ge=1, le=200)):
    train, _, _, item_info, _ = load_dataset(dataset)
    rows = recent_history(train, user_id, limit)
    return {
        "dataset": dataset,
        "user_id": user_id,
        "history": [
            {
                **item_payload(dataset, item_id, item_info),
                "rating": rating,
                "timestamp": timestamp,
            }
            for _, item_id, rating, timestamp in rows
        ],
    }


@app.get("/search")
def search(dataset: str = Query("MovieLens"), query: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    _, _, _, item_info, _ = load_dataset(dataset)
    item_ids = search_item_ids(item_info, query, limit)
    return {"results": [item_payload(dataset, item_id, item_info) for item_id in item_ids]}


@app.get("/movie_details")
def movie_details(dataset: str = Query("MovieLens"), item_id: str = Query(...)):
    """Return external movie summary and genres for one dataset item."""
    _, _, _, item_info, _ = load_dataset(dataset)
    if item_id not in item_info:
        raise HTTPException(status_code=404, detail=f"Unknown item id: {item_id}")
    return cached_movie_detail(dataset, item_id, item_info)


@app.get("/session_recommend")
def session_recommend(
    dataset: str = Query("MovieLens"),
    topk: int = Query(10, ge=1, le=50),
    query: str = "",
    context_items: str | None = None,
):
    """Return cold-start guest recommendations from current-session signals."""
    _, _, _, item_info, all_items = load_dataset(dataset)
    context_item_ids = [
        item_id
        for item_id in parse_csv_list(context_items)
        if item_id in item_info
    ]
    recs = session_recommend_items(
        dataset=dataset,
        item_info=item_info,
        all_items=all_items,
        context_item_ids=context_item_ids,
        query=query,
        topk=topk,
    )
    return {
        "dataset": dataset,
        "user_id": "guest",
        "model": "session",
        "recommendations": [
            {
                "rank": rank,
                **item_payload(dataset, item_id, item_info, score),
                "score_label": f"Session score: {score:.4f}",
                "reason": explanation_for_item(
                    model_name="session",
                    item_id=item_id,
                    item_info=item_info,
                    train={},
                    user_id="guest",
                    query=query,
                    context_item_ids=context_item_ids,
                ),
            }
            for rank, (item_id, score) in enumerate(recs, start=1)
        ],
    }


@app.get("/recommend")
def recommend(
    dataset: str = Query("MovieLens"),
    user_id: str = Query(...),
    model: str = Query("ensemble"),
    topk: int = Query(10, ge=1, le=50),
    query: str = "",
    context_items: str | None = None,
    weights: str | None = None,
):
    """Return Top-K recommendations for one user and optional session context."""
    train, valid, _, item_info, _ = load_dataset(dataset)
    recommender = load_recommender(dataset, model, raw_weights=weights)
    context_item_ids = parse_csv_list(context_items)
    excluded = seen_items_for_user(train, valid, user_id=user_id)
    excluded.update(context_item_ids)

    candidate_items = None
    if query:
        candidate_items = search_item_ids(item_info, query, limit=max(topk * 20, 100))
        if not candidate_items:
            candidate_items = None

    recs = recommender.recommend(
        user_id,
        k=max(topk * 5, topk),
        exclude_items=excluded,
        candidate_items=candidate_items,
    )
    recs = rerank_with_context(recs, item_info, context_tokens(item_info, query, context_item_ids))
    recs = recs[:topk]
    return {
        "dataset": dataset,
        "user_id": user_id,
        "model": model,
        "recommendations": [
            {
                "rank": rank,
                **item_payload(dataset, item_id, item_info, score),
                "score_label": f"Algorithm score: {score:.4f}",
                "reason": explanation_for_item(
                    model_name=model,
                    item_id=item_id,
                    item_info=item_info,
                    train=train,
                    user_id=user_id,
                    query=query,
                    context_item_ids=context_item_ids,
                ),
            }
            for rank, (item_id, score) in enumerate(recs, start=1)
        ],
    }


@app.get("/metrics")
def metrics(
    dataset: str = Query("MovieLens"),
    label: str = Query("pos4", pattern="^(all|pos4)$"),
    negative_count: int = Query(100, ge=1),
    k: int = Query(10, ge=1),
):
    """Expose saved offline metrics, including precision and recall, to the UI."""
    dataset_slug = dataset.lower()
    path = RESULTS_ROOT / f"{dataset_slug}_{label}_n{negative_count}.csv"
    if not path.exists():
        return {"metrics": [], "path": str(path)}
    rows = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if int(row["k"]) != k:
                continue
            rows.append(
                {
                    "model": row["model"],
                    "k": k,
                    "hit": float(row["hit"]),
                    "precision": float(row["precision"]),
                    "recall": float(row["recall"]),
                    "ndcg": float(row["ndcg"]),
                    "mrr": float(row["mrr"]),
                }
            )
    rows.sort(key=lambda row: row["ndcg"], reverse=True)
    return {"metrics": rows, "path": str(path)}
