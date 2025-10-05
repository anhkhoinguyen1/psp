"""
SleepState ML (Ensemble-Only): Step 1–3 scaffold
-------------------------------------------------
Goal: You already have four *modalities* prepared by upstream systems:
  1) Graph features: k nodes (default 8) → numeric vector (do **not** model/learn graphs here; just use them as given)
  2) Temperature: a single numeric feature (float or int)
  3) MP3 volume: a single numeric feature in [1, 100]
  4) MP3 content: VTT text → (you build) TF‑IDF features

We build per‑modality classifiers and combine them with an **ensemble** (soft voting + stacking). We also include a synthetic data generator for testing.

Python 3.9+
`pip install scikit-learn pandas numpy scipy`
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix, cohen_kappa_score
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier, StackingClassifier
from sklearn.utils import check_random_state

# ================================
# Config & labels
# ================================

STAGES = np.array(["Wake", "N1", "N2", "N3", "REM"])  # 5 classes

@dataclass
class DataConfig:
    n_samples: int = 4000
    n_graph_nodes: int = 8  # can be changed
    random_state: int = 42

# ================================
# Step 1 — Synthetic dataset (for testing only)
# ================================

def _simulate_text(stage: str, rng: np.random.RandomState) -> str:
    """Stage‑biased token sampler to create VTT‑like content. Replace with real VTT later."""
    lex = {
        "Wake": ["adjust pillow", "uncomfortable", "turning", "talking", "help", "noise"],
        "N1": ["quiet", "drowsy", "settling", "soft breathing"],
        "N2": ["steady", "regular", "snore mild", "calm"],
        "N3": ["deep", "silent", "very still", "slow breath"],
        "REM": ["irregular", "murmur", "dream", "vocalize", "snore loud"],
    }
    base = lex.get(stage, ["quiet"]) + ["room", "ward", "nurse", "bed", "monitor"]
    k = rng.randint(3, 9)
    return " ".join(rng.choice(base, size=k, replace=True))


def _simulate_row(stage: str, cfg: DataConfig, rng: np.random.RandomState) -> Dict:
    """Generate one synthetic sample aligned with physiology‑inspired priors, but **only** at the feature level.
    We do NOT build any model to predict the graph nodes—just produce a vector as if it came from upstream.
    """
    # Stage‑specific means/variances to make the problem learnable
    if stage == "Wake":
        g_mu, g_sigma = 60, 18
        volume_mu, volume_sigma = 35, 15
        temp_mu, temp_sigma = 36.8, 0.5
    elif stage == "N1":
        g_mu, g_sigma = 58, 14
        volume_mu, volume_sigma = 25, 12
        temp_mu, temp_sigma = 36.6, 0.4
    elif stage == "N2":
        g_mu, g_sigma = 55, 10
        volume_mu, volume_sigma = 18, 8
        temp_mu, temp_sigma = 36.4, 0.35
    elif stage == "N3":
        g_mu, g_sigma = 52, 7
        volume_mu, volume_sigma = 15, 6
        temp_mu, temp_sigma = 36.2, 0.3
    else:  # REM
        g_mu, g_sigma = 54, 9
        volume_mu, volume_sigma = 22, 10
        temp_mu, temp_sigma = 36.5, 0.4

    # Graph feature vector (k nodes) — values scaled 0..100 range
    graph_vec = np.clip(rng.normal(g_mu, g_sigma, size=cfg.n_graph_nodes), 0, 100)

    # Single‑feature modalities
    volume = float(np.clip(rng.normal(volume_mu, volume_sigma), 1, 100))
    temp = float(rng.normal(temp_mu, temp_sigma))

    # VTT text
    text = _simulate_text(stage, rng)

    row = {f"g{i}": float(v) for i, v in enumerate(graph_vec)}
    row.update({"temp": temp, "volume": volume, "text": text, "label": stage})
    return row


def generate_synthetic_dataset(cfg: DataConfig = DataConfig()) -> pd.DataFrame:
    rng = check_random_state(cfg.random_state)
    stage_probs = {"Wake": 0.15, "N1": 0.15, "N2": 0.35, "N3": 0.2, "REM": 0.15}
    stages = rng.choice(list(stage_probs.keys()), size=cfg.n_samples, p=list(stage_probs.values()))
    rows = [_simulate_row(s, cfg, rng) for s in stages]
    return pd.DataFrame(rows)

# ==============================================
# Step 2 — Per‑modality baselines + Ensembles
# ==============================================

def build_pipelines(n_graph_nodes: int, text_max_features: int = 5000, C_lr: float = 2.0) -> Dict[str, Pipeline]:
    """Create pipelines: 4 single‑modality models + soft‑voting + stacking ensemble."""
    graph_cols = [f"g{i}" for i in range(n_graph_nodes)]

    # 1) Graph‑only pipeline (k‑dim numeric vector)
    graph_pre = ColumnTransformer([("graph", StandardScaler(), graph_cols)], remainder="drop")
    graph_lr = Pipeline([("pre", graph_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 2) Temp‑only pipeline (single feature)
    temp_pre = ColumnTransformer([("temp", StandardScaler(), ["temp"])], remainder="drop")
    temp_lr = Pipeline([("pre", temp_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 3) Volume‑only pipeline (single feature)
    vol_pre = ColumnTransformer([("vol", StandardScaler(), ["volume"])], remainder="drop")
    vol_lr = Pipeline([("pre", vol_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 4) Text‑only pipeline (TF‑IDF)
    text_pre = ColumnTransformer([("txt", TfidfVectorizer(max_features=text_max_features, ngram_range=(1,2)), "text")])
    text_lr = Pipeline([("pre", text_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # Soft Voting ensemble across the four modalities
    soft_vote = VotingClassifier(
        estimators=[("graph", graph_lr), ("temp", temp_lr), ("volume", vol_lr), ("text", text_lr)],
        voting="soft",
        weights=[2, 1, 1, 2],  # emphasize graph/text slightly; tune later
        flatten_transform=True,
    )

    # Stacking ensemble (meta‑learner on top of modality logits)
    stack = StackingClassifier(
        estimators=[("graph", graph_lr), ("temp", temp_lr), ("volume", vol_lr), ("text", text_lr)],
        final_estimator=LogisticRegression(max_iter=2000, C=1.0, multi_class="multinomial"),
        stack_method="predict_proba",
        passthrough=False,
        n_jobs=None,
    )

    return {
        "graph_only": graph_lr,
        "temp_only": temp_lr,
        "volume_only": vol_lr,
        "text_only": text_lr,
        "ensemble_softvote": soft_vote,
        "ensemble_stack": stack,
    }

# ==================================
# Step 3 — Testing / Evaluation utils
# ==================================

def evaluate_models(models: Dict[str, Pipeline], X: pd.DataFrame, y: pd.Series, *, k_folds: int = 5, random_state: int = 7) -> pd.DataFrame:
    """Cross‑validate each model and return a score table (accuracy, macro‑F1)."""
    skf = StratifiedKFold(n_splits=k_folds, shuffle=True, random_state=random_state)
    scoring = {"acc": "accuracy", "macro_f1": "f1_macro"}
    rows = []
    for name, model in models.items():
        cv = cross_validate(model, X, y, cv=skf, scoring=scoring, n_jobs=-1)
        rows.append({
            "model": name,
            "cv_accuracy_mean": cv["test_acc"].mean(),
            "cv_accuracy_std": cv["test_acc"].std(),
            "cv_macroF1_mean": cv["test_macro_f1"].mean(),
            "cv_macroF1_std": cv["test_macro_f1"].std(),
        })
    out = pd.DataFrame(rows).sort_values(by=["cv_macroF1_mean", "cv_accuracy_mean"], ascending=False)
    return out


def holdout_report(model: Pipeline, X_train: pd.DataFrame, X_test: pd.DataFrame, y_train: pd.Series, y_test: pd.Series) -> Dict:
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    kappa = cohen_kappa_score(y_test, y_pred)
    cm = confusion_matrix(y_test, y_pred, labels=list(STAGES))
    return {
        "accuracy": accuracy_score(y_test, y_pred),
        "macro_f1": f1_score(y_test, y_pred, average="macro"),
        "kappa": kappa,
        "report": pd.DataFrame(report).T,
        "confusion_matrix": pd.DataFrame(cm, index=STAGES, columns=STAGES),
    }

# ======================
# Demo when run directly
# ======================
if __name__ == "__main__":
    cfg = DataConfig(n_samples = 5000, n_graph_nodes=8, random_state=13)
    df = generate_synthetic_dataset(cfg)

    y = df["label"].astype("category")
    X = df.drop(columns=["label"])

    models = build_pipelines(n_graph_nodes=cfg.n_graph_nodes)

    print("=== Cross‑validated performance (5‑fold) ===")
    cv_table = evaluate_models(models, X, y, k_folds=5)
    print(cv_table.to_string(index=False, float_format=lambda v: f"{v:.4f}"))

    # Hold‑out split to inspect confusion matrix & detailed report
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.30, stratify=y, random_state=24)

    best_name = cv_table.iloc[0]["model"]
    best = models[best_name]
    print(f"Training best model on hold‑out: {best_name}")
    res = holdout_report(best, X_tr, X_te, y_tr, y_te)

    print(f"Accuracy: {res['accuracy']:.4f} | Macro‑F1: {res['macro_f1']:.4f} | Cohen's κ: {res['kappa']:.4f}")
    print("Per‑class report:", res["report"].to_string())
    print("Confusion matrix (rows=true, cols=pred):", res["confusion_matrix"].to_string())

    # How to plug in real data later:
    # - Provide a DataFrame with columns: g0..g{k-1}, temp, volume, text, and a target 'label'.
    # - Keep build_pipelines(n_graph_nodes=K) consistent with your graph dimensionality.
    # - You can drop any modality by excluding its estimator from the ensembles.
