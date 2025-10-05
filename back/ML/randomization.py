from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix, cohen_kappa_score
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import VotingClassifier, StackingClassifier
from sklearn.utils import check_random_state

# ================================
# Labels & configuration
# ================================

STAGES = np.array(["Wake", "N1", "N2", "N3", "REM"])  # 5 classes

# Real field assumptions
# - t1_c: temperature 1 (°C)
# - t2_c: temperature 2 (°C)
# - volume: normalized loudness in [0, 1]
# - text: VTT paragraph (can include dialogue)
# - graph features: g0..g{k-1}

@dataclass
class DataConfig:
    n_samples: int = 4000
    n_graph_nodes: int = 8
    random_state: int = 42

# ================================
# Step 1 — Synthetic dataset (matches your schema)
# ================================

KEY_PHRASES = [
    "adjust pillow", "can't sleep", "deep sleep", "snore mild", "snore loud",
    "slow breath", "talk in sleep", "press button", "calling nurse"
]

def simulate_text(stage: str, rng: np.random.RandomState, *, noise: float = 0.4) -> str:
    """Generate a paragraph that reads like dialogue/transcript, with stage‑biased phrases
    plus bleed‑over and ASR artifacts. TF‑IDF with n‑grams (1–3) will capture cues like
    "adjust pillow", "can't sleep", "deep sleep", etc.
    """
    L = {
        "Wake": ["adjust pillow", "can't sleep", "press button", "calling nurse", "it hurts", "turning"],
        "N1":   ["light sleep", "eyes heavy", "settling down", "soft breathing"],
        "N2":   ["steady breathing", "snore mild", "quiet room", "turn once"],
        "N3":   ["deep sleep", "very still", "slow breath", "no movement"],
        "REM":  ["dreaming", "talk in sleep", "irregular breath", "snore loud"],
    }
    NEUTRAL = ["beeping monitor", "door opens", "footsteps", "blanket rustles", "pager",
               "hallway noise", "[inaudible]", "uh", "um", "okay", "yeah", "hmm"]
    who = ["Nurse", "Patient", "Visitor", "Roommate"]

    n_utts = rng.randint(2, 6)
    lines = []
    for _ in range(n_utts):
        spk = rng.choice(who)
        bleed = rng.choice(sum([v for k, v in L.items() if k != stage], []), size=rng.randint(1, 2), replace=False).tolist()
        pool = L.get(stage, []) + bleed + NEUTRAL
        k = rng.randint(1, 3)
        frags = rng.choice(pool, size=k, replace=True).tolist()
        if rng.rand() < 0.7:
            frags.append(rng.choice(KEY_PHRASES))
        msg = ", ".join(frags)
        lines.append(f"[{rng.randint(0,5):02d}:{rng.randint(0,59):02d}] {spk}: {msg}.")

    paragraph = " ".join(lines)

    # ASR-like noise (token drops/insertions)
    if rng.rand() < noise:
        toks = paragraph.split()
        if len(toks) > 10:
            for _ in range(rng.randint(1, 3)):
                i = rng.randint(0, len(toks))
                if i < len(toks):
                    toks.pop(i)
        if rng.rand() < 0.5 and len(toks) > 0:
            toks.insert(rng.randint(0, len(toks)), rng.choice(["[noise]", "[cough]", "..."]))
        paragraph = " ".join(toks)
    return paragraph


def simulate_row(stage: str, cfg: DataConfig, rng: np.random.RandomState) -> Dict:
    """One synthetic sample aligned with physiology‑inspired priors.
    We do not predict graph nodes here — we just sample a k‑dim vector to represent upstream graph features.
    """
    # Loosely stage‑dependent means/variances (overlap encouraged)
    params = {
        "Wake": (58, 20, 36.7, 0.6),
        "N1":   (57, 16, 36.5, 0.5),
        "N2":   (55, 13, 36.4, 0.45),
        "N3":   (54, 12, 36.3, 0.40),
        "REM":  (55, 14, 36.5, 0.45),
    }[stage]
    g_mu, g_sd, t2_mu, t2_sd = params

    # Graph vector g0..g{k-1} (0..100) with per‑sample shift to create overlap
    shift = rng.normal(0, 5)
    g = np.clip(rng.normal(g_mu + shift, g_sd, size=cfg.n_graph_nodes), 0, 100)

    # Volume in [0,1] via Beta (quiet in deeper NREM on average)
    a, b = (3, 5) if stage in ("N2", "N3") else (2, 3)
    volume = float(rng.beta(a, b))

    # Temperatures (°C): proximal t2_c, distal t1_c via DPG
    t2_c = float(rng.normal(t2_mu, t2_sd))
    dpg_mu = {"Wake": 0.4, "N1": 0.7, "N2": 0.9, "N3": 1.0, "REM": 0.6}[stage]
    t1_c = float(t2_c + rng.normal(dpg_mu, 0.25))

    # Text paragraph
    text = simulate_text(stage, rng, noise=0.5)

    # Synthetic posture/temp meta‑features (normally built from raw FSR streams)
    # Here, derive from g as a stand‑in so the pipeline can be tested end‑to‑end
    p_sum = g.sum() + 1e-6
    p_norm = g / p_sum
    idx = np.arange(cfg.n_graph_nodes)
    cop = float((p_norm * idx).sum())
    cop_std = float(p_norm.std())
    # create consistent feature names used by the posture branch
    posture_feats = {
        'p_sum_mean': float(p_sum / cfg.n_graph_nodes),
        'p_entropy_mean': float(-np.sum(p_norm * np.log(p_norm + 1e-9))),
        'cop_mean': cop,
        'cop_std': cop_std,
        'cop_speed_mean': float(abs(rng.normal(0.02, 0.015))),
        'cop_speed_p95': float(abs(rng.normal(0.05, 0.02))),
        'shift_events': float(max(0, int(rng.normal(0.5 if stage in ("Wake","N1") else 0.2, 0.4)))) ,
        't_mean_mean': float((t1_c + t2_c) / 2.0),
        't_mean_std': float(abs(rng.normal(0.05, 0.02))),
        't_delta_mean': float(t2_c - t1_c),
        't_mean_slope': float(rng.normal(-0.005 if stage in ("N2","N3") else 0.0, 0.01)),
    }
    for j in range(cfg.n_graph_nodes):
        posture_feats[f'fsr{j}_mean'] = float(g[j])
        posture_feats[f'fsr{j}_p95']  = float(min(100.0, g[j] + abs(rng.normal(5, 3))))

    row = {f"g{i}": float(v) for i, v in enumerate(g)}
    row.update({
        "t1_c": t1_c,
        "t2_c": t2_c,
        "dpg": float(t1_c - t2_c),
        "volume": volume,
        "text": text,
        **posture_feats,
        "label": stage,
    })
    return row


def generate_synthetic_dataset(cfg: DataConfig = DataConfig(), *, label_flip: float = 0.03) -> pd.DataFrame:
    rng = check_random_state(cfg.random_state)
    probs = {"Wake": 0.18, "N1": 0.18, "N2": 0.30, "N3": 0.18, "REM": 0.16}
    labels = rng.choice(list(probs), size=cfg.n_samples, p=list(probs.values()))
    rows = [simulate_row(s, cfg, rng) for s in labels]
    df = pd.DataFrame(rows)
    if label_flip > 0:
        flip = rng.rand(len(df)) < label_flip
        df.loc[flip, "label"] = rng.choice(STAGES, size=flip.sum())
    return df

# ================================
# Real data (JSON stream) → posture/temp meta‑features
# ================================


def load_json_stream(path: str) -> pd.DataFrame:
    """
    Read stream JSON and normalize schema:
      - Accepts top-level list OR dict with 'data'/'records'/'rows'/'items'
      - Renames timestamp column to 'ts' (accepts ts/timestamp/time/datetime/date)
      - Parses 'ts' to UTC datetime (handles ISO strings or numeric epoch s/ms)
    Expected fields after normalization: ts (datetime), fsr (list), t1_c, t2_c, volume in [0,1]
    """
    with open(path, "r") as f:
        obj = json.load(f)

    # 1) Extract the array of records
    if isinstance(obj, list):
        data = obj
    elif isinstance(obj, dict):
        for k in ("data", "records", "rows", "items"):
            if k in obj and isinstance(obj[k], list):
                data = obj[k]
                break
        else:
            # If dict-of-scalars per key? Convert to rows if lengths match.
            raise ValueError("JSON is a dict; expected a list under one of ['data','records','rows','items'].")
    else:
        raise ValueError("Unsupported JSON structure; expected list of records or dict containing a list.")

    df = pd.DataFrame(data)

    # 2) Find and normalize the timestamp column → 'ts'
    if "ts" not in df.columns:
        ts_candidates = [c for c in df.columns if str(c).lower() in ("timestamp","time","datetime","date","ts")]
        if not ts_candidates:
            raise KeyError("No timestamp column found. Expected one of: ts, timestamp, time, datetime, date.")
        df = df.rename(columns={ts_candidates[0]: "ts"})

    # 3) Parse timestamps (ISO strings or numeric epoch)
    if np.issubdtype(df["ts"].dtype, np.number):
        # Heuristic for unit
        s = pd.to_numeric(df["ts"], errors="coerce")
        # if values are large (~13 digits) assume ms, else seconds
        unit = "ms" if s.dropna().astype("int64").astype(str).str.len().median() >= 12 else "s"
        df["ts"] = pd.to_datetime(s, unit=unit, utc=True)
    else:
        df["ts"] = pd.to_datetime(df["ts"], errors="coerce", utc=True)

    # 4) Sort and reset index
    df = df.sort_values("ts").reset_index(drop=True)

    return df



def _epoch_groups(df: pd.DataFrame, epoch_s: int = 30):
    t = pd.to_datetime(df["ts"]).view("int64")
    g = t // (epoch_s * 1_000_000_000)
    return df.groupby(g)


def _posture_temp_features_from_stream(df_epoch: pd.DataFrame) -> Dict:
    fsr_mat = np.vstack(df_epoch["fsr"].to_numpy())  # [n,k]
    k = fsr_mat.shape[1]
    p_sum = fsr_mat.sum(axis=1) + 1e-6
    p_norm = fsr_mat / p_sum[:, None]
    idx = np.arange(k)[None, :]
    cop = (p_norm * idx).sum(axis=1)

    out: Dict[str, float] = {}
    out['p_sum_mean'] = float(p_sum.mean())
    out['p_entropy_mean'] = float((-(p_norm * np.log(p_norm + 1e-9)).sum(axis=1)).mean())
    out['cop_mean'] = float(cop.mean())
    out['cop_std']  = float(cop.std())
    if len(cop) > 1:
        speed = np.abs(np.diff(cop))
        out['cop_speed_mean'] = float(speed.mean())
        out['cop_speed_p95']  = float(np.percentile(speed, 95))
        out['shift_events']   = float((speed > (speed.mean() + 2*speed.std() + 1e-6)).sum())
    else:
        out['cop_speed_mean'] = out['cop_speed_p95'] = out['shift_events'] = 0.0

    t1 = df_epoch['t1_c'].to_numpy(dtype=float)
    t2 = df_epoch['t2_c'].to_numpy(dtype=float)
    tmean = (t1 + t2) / 2.0
    out['t_mean_mean']  = float(np.mean(tmean))
    out['t_mean_std']   = float(np.std(tmean))
    out['t_delta_mean'] = float(np.mean(t2 - t1))
    x = np.arange(len(tmean))
    if len(x) > 1:
        A = np.vstack([x, np.ones_like(x)]).T
        slope, _ = np.linalg.lstsq(A, tmean, rcond=None)[0]
        out['t_mean_slope'] = float(slope)
    else:
        out['t_mean_slope'] = 0.0

    for j in range(k):
        out[f'fsr{j}_mean'] = float(fsr_mat[:, j].mean())
        out[f'fsr{j}_p95']  = float(np.percentile(fsr_mat[:, j], 95))
    return out


def build_posture_temp_frame_from_json(path: str, epoch_s: int = 30) -> pd.DataFrame:
    stream = load_json_stream(path)
    rows = []
    for _, ep in _epoch_groups(stream, epoch_s=epoch_s):
        rows.append(_posture_temp_features_from_stream(ep))
    return pd.DataFrame(rows)

# ADD NEW:
# --- Cell A: stream validator + sanitizer + epoch wrapper ---

def validate_stream_df(df: pd.DataFrame, *, k_expected: int = 8) -> None:
    """Light checks; raise AssertionError with helpful message."""
    assert {"ts","fsr","t1_c","t2_c","volume"}.issubset(df.columns), "Missing required fields."
    assert df["ts"].is_monotonic_increasing, "Timestamps must be sorted ascending."
    # FSR length check (allow empty arrays but warn)
    bad_len = [i for i, fsr in enumerate(df["fsr"]) if not isinstance(fsr, (list, np.ndarray)) or len(fsr) != k_expected]
    if bad_len:
        print(f"⚠️ {len(bad_len)} rows have wrong FSR length (expected {k_expected}). First few idx:", bad_len[:5])

def sanitize_stream_df(df: pd.DataFrame, *, k_expected: int = 8) -> pd.DataFrame:
    """Clip/clean obvious glitches; preserve dtype expectations."""
    out = df.copy()
    # Coerce types
    out["t1_c"] = pd.to_numeric(out["t1_c"], errors="coerce")
    out["t2_c"] = pd.to_numeric(out["t2_c"], errors="coerce")
    out["volume"] = pd.to_numeric(out["volume"], errors="coerce")
    # Replace impossible magnitudes (sensor spikes); keep generous ranges
    # Temperature plausible range (°C) for skin/contact sensors
    out.loc[~out["t1_c"].between(10, 50), "t1_c"] = np.nan
    out.loc[~out["t2_c"].between(10, 50), "t2_c"] = np.nan
    # Clip volume to [0,1]
    out["volume"] = out["volume"].clip(lower=0.0, upper=1.0)
    # Forward/back fill short NaN runs (<= 3) to keep continuity
    for col in ["t1_c","t2_c","volume"]:
        out[col] = out[col].interpolate(limit=3, limit_direction="both")
    # Ensure FSR arrays are numeric and non-negative
    def _fix_fsr(a):
        a = np.array(a, dtype=float) if isinstance(a, (list, np.ndarray)) else np.zeros(k_expected, dtype=float)
        if a.size != k_expected:
            b = np.zeros(k_expected, dtype=float)
            m = min(k_expected, a.size)
            b[:m] = np.maximum(a[:m], 0.0)
            return b.tolist()
        return np.maximum(a, 0.0).tolist()
    out["fsr"] = out["fsr"].apply(_fix_fsr)
    return out

def load_and_prepare_stream(path: str, *, k_expected: int = 8) -> pd.DataFrame:
    """Load → sort → validate → sanitize stream."""
    raw = load_json_stream(path)
    validate_stream_df(raw, k_expected=k_expected)
    clean = sanitize_stream_df(raw, k_expected=k_expected)
    return clean

# ADD NEW:
# --- Cell B: clinical rule layers (fever / resp / movement) ---

def add_fever_flags(df_ep: pd.DataFrame, *, abs_thresh_c=38.0, slope_win_epochs=20, epoch_s=30, delta_thresh=1.1) -> pd.DataFrame:
    """Add absolute & trend fever flags using epoch features; expects t_mean_mean."""
    df = df_ep.copy()
    df["t_mean"] = df["t_mean_mean"]
    # Approx rolling slope in °C/min (diff per epoch / minutes per epoch, then smooth)
    minutes_per_epoch = epoch_s / 60.0
    df["t_slope_cpm_raw"] = df["t_mean"].diff() / minutes_per_epoch
    df["t_slope_cpm"] = df["t_slope_cpm_raw"].rolling(slope_win_epochs, min_periods=3).mean()
    df["fever_flag_abs"] = df["t_mean"] >= abs_thresh_c
    # Patient baseline from first hour (or all if shorter)
    base_epochs = min(len(df), int(60*60/epoch_s))
    baseline = df["t_mean"].iloc[:base_epochs].median() if base_epochs > 0 else df["t_mean"].median()
    df["fever_flag_delta"] = (df["t_mean"] - baseline) >= delta_thresh
    # Trend threshold tuned conservatively for contact sensors
    df["fever_flag_trend"] = df["t_slope_cpm"] >= 0.02
    df["fever_status"] = df[["fever_flag_abs","fever_flag_trend","fever_flag_delta"]].any(axis=1)
    return df

def add_resp_estimates(df_ep: pd.DataFrame, *, epoch_s=30, bpm_low=8, bpm_high=24) -> pd.DataFrame:
    """Approx RR from volume oscillations (no raw audio)."""
    df = df_ep.copy()
    v = df.get("volume", pd.Series([np.nan]*len(df)))
    # Smooth (robust) then mean filter
    v_med = v.rolling(5, min_periods=1).median()
    vs = (v - v_med).rolling(5, min_periods=1).mean().fillna(0.0)
    # Count up-crossings of derivative over a short window (~2 min)
    dv = vs.diff()
    up = ((dv.shift(1) <= 0) & (dv > 0)).astype(int)
    win = max(4, int((2*60)/epoch_s))  # ~2 minutes
    crossings = up.rolling(win, min_periods=1).sum()
    minutes = (win * epoch_s) / 60.0
    df["resp_rate_bpm"] = crossings / minutes
    df["resp_flag_low"] = df["resp_rate_bpm"] < bpm_low
    df["resp_flag_high"] = df["resp_rate_bpm"] > bpm_high
    # Simple snore proxy: elevated upper tail relative to baseline
    df["snore_flag"] = v.rolling(20, min_periods=5).quantile(0.95) > (v.median() + 2*v.std(ddof=0))
    return df

def add_movement_flags(df_ep: pd.DataFrame) -> pd.DataFrame:
    """Movement flags from CoP dynamics and shift_events."""
    df = df_ep.copy()
    base_n = min(120, len(df))  # ~60 min baseline if 30s epochs
    base = df.iloc[:base_n] if base_n > 0 else df
    spd_thr = base["cop_speed_mean"].mean() + 2*base["cop_speed_mean"].std(ddof=0)
    df["movement_flag_epoch"] = (df["shift_events"] >= 1) | (df["cop_speed_p95"] > spd_thr)
    df["movement_flag_sustained"] = (
        df["movement_flag_epoch"]
        .rolling(2, min_periods=2)
        .apply(lambda x: bool((x>=0.5).all()))
        .fillna(0)
        .astype(bool)
    )
    # A simple nightly movement index
    df["movement_index"] = df["movement_flag_epoch"].rolling(60, min_periods=1).mean()  # ~30 min window if 30s epoch
    return df


#ADD NEW:

# --- Cell C: stitcher from JSON → epoch table with all flags ready ---

def build_epoch_table_from_json(path: str, *, epoch_s: int = 30) -> pd.DataFrame:
    """
    1) Load+sanitize stream, 2) epoch to posture/temp features (your function),
    3) add fever/resp/movement rule layers.
    """
    stream = load_and_prepare_stream(path, k_expected=8)
    ep = build_posture_temp_frame_from_json(path, epoch_s=epoch_s)  # uses your feature builder
    # If volume wasn't aggregated per epoch in your builder, merge a per-epoch mean volume from raw
    # (epoch grouping identical to _epoch_groups)
    g = _epoch_groups(stream, epoch_s=epoch_s)
    vol_ep = g["volume"].mean().reset_index(drop=True).rename("volume")
    # Merge in volume if missing; else overwrite with ep's volume if you already handled it
    if "volume" not in ep.columns:
        ep = pd.concat([ep.reset_index(drop=True), vol_ep], axis=1)
    # Rule layers
    ep = add_fever_flags(ep, epoch_s=epoch_s)
    ep = add_resp_estimates(ep, epoch_s=epoch_s)
    ep = add_movement_flags(ep)
    return ep

# === PLACE A: Stream generator producing records with keys: ts, fsr(list), t1_c, t2_c, volume ===
import math
from datetime import timedelta

def _stage_params(stage: str):
    base_t2 = {"Wake": 36.6, "N1": 36.4, "N2": 36.3, "N3": 36.2, "REM": 36.45}[stage]
    dpg_mu  = {"Wake": 0.4,  "N1": 0.7,  "N2": 0.9,  "N3": 1.0,  "REM": 0.6}[stage]
    cop_speed = {"Wake": 0.20, "N1": 0.12, "N2": 0.06, "N3": 0.03, "REM": 0.15}[stage]
    rr_bpm = {"Wake": 14, "N1": 13, "N2": 12, "N3": 11, "REM": 15}[stage]
    vol_base = {"Wake": 0.15, "N1": 0.10, "N2": 0.07, "N3": 0.05, "REM": 0.16}[stage]
    return dict(base_t2=base_t2, dpg_mu=dpg_mu, cop_speed=cop_speed, rr_bpm=rr_bpm, vol_base=vol_base)

def _fsr_from_cop(k: int, cop_pos: float, pressure: float, noise_sd: float, rng: np.random.RandomState):
    idx = np.arange(k)
    bump = np.exp(-0.5 * ((idx - cop_pos) / 0.8)**2)
    bump /= bump.sum() + 1e-9
    fsr = pressure * bump + rng.normal(0, noise_sd, size=k)
    return np.maximum(fsr, 0.0).tolist()

# === REPLACE your generate_stream_json with this version (PLACE A) ===
import math
from datetime import timedelta

def _stage_params(stage: str):
    base_t2 = {"Wake": 36.6, "N1": 36.35, "N2": 36.25, "N3": 36.15, "REM": 36.55}[stage]
    dpg_mu  = {"Wake": 0.4,  "N1": 0.7,   "N2": 0.9,   "N3": 1.0,   "REM": 0.6}[stage]
    cop_speed = {"Wake": 0.20, "N1": 0.12, "N2": 0.06, "N3": 0.03, "REM": 0.15}[stage]
    rr_bpm    = {"Wake": 14,   "N1": 13,   "N2": 12,   "N3": 11,   "REM": 15}[stage]
    vol_base  = {"Wake": 0.15, "N1": 0.10, "N2": 0.07, "N3": 0.05, "REM": 0.16}[stage]
    return dict(base_t2=base_t2, dpg_mu=dpg_mu, cop_speed=cop_speed, rr_bpm=rr_bpm, vol_base=vol_base)

def _fsr_from_cop(k: int, cop_pos: float, pressure: float, noise_sd: float, rng: np.random.RandomState):
    idx = np.arange(k)
    bump = np.exp(-0.5 * ((idx - cop_pos) / 0.8)**2)
    bump /= bump.sum() + 1e-9
    fsr = pressure * bump + rng.normal(0, noise_sd, size=k)
    return np.maximum(fsr, 0.0).tolist()

def generate_stream_json(
    out_path: str,
    *,
    start_time: Optional[pd.Timestamp] = None,
    schedule: List[Tuple[str, int]] = None,   # [(stage, minutes), ...]
    sample_hz: float = 1.0,
    k_fsr: int = 8,
    fever_ramp: Optional[Tuple[int, int, float]] = None,  # (start_min, ramp_min, delta_C)
    seed: int = 2025,
    snore_rem: bool = True,
) -> str:
    # start time (always UTC-aware)
    if start_time is None:
        start_time = pd.Timestamp.now(tz="UTC")
    else:
        start_time = pd.to_datetime(start_time)
        start_time = start_time.tz_convert("UTC") if start_time.tzinfo else start_time.tz_localize("UTC")

    if schedule is None:
        schedule = [('Wake',5),('N1',5),('N2',10),('N3',10),('REM',6),('N2',4)]

    rng = np.random.RandomState(seed)
    dt = 1.0 / sample_hz
    rows = []
    t_curr = start_time

    # initial CoP
    cop = float(np.clip(rng.uniform(2.0, 5.0), 0, k_fsr-1))

    # temp stochastic components
    stage_step_bonus = 0.12   # °C jump when stage changes (makes visible steps)
    within_stage_rw_sd = 0.02 # °C random walk per minute

    def fever_offset(minute_from_start: float):
        if not fever_ramp: return 0.0
        start_min, ramp_min, delta_c = fever_ramp
        if minute_from_start <= start_min: return 0.0
        if minute_from_start >= start_min + ramp_min: return delta_c
        return (minute_from_start - start_min) / max(ramp_min, 1e-9) * delta_c

    minute_from_start = 0.0
    prev_stage = None
    temp_rw = 0.0  # random-walk state

    for stage, minutes in schedule:
        p = _stage_params(stage)
        n_samples = int(minutes * 60 * sample_hz)

        # add a visible step at stage boundary
        if prev_stage is not None and prev_stage != stage:
            temp_rw += np.sign(rng.randn()) * stage_step_bonus
        prev_stage = stage

        pressure = {"Wake": 70, "N1": 65, "N2": 60, "N3": 62, "REM": 63}[stage]

        for i in range(n_samples):
            # temperature model = baseline by stage + fever ramp + slow circadian sine + random walk + sensor noise
            temp_rw += rng.normal(0, within_stage_rw_sd / 60.0)  # grow slowly (per second)
            t2 = (
                p["base_t2"]
                + fever_offset(minute_from_start)
                + 0.08*np.sin(2*np.pi*(minute_from_start/8.0))   # slow oscillation
                + temp_rw
                + rng.normal(0, 0.04)                             # sensor short-term noise
            )
            t1 = t2 + p["dpg_mu"] + rng.normal(0, 0.10)

            # movement (CoP random walk)
            cop = float(np.clip(cop + rng.normal(0, p["cop_speed"]), 0, k_fsr-1))
            fsr = _fsr_from_cop(k_fsr, cop, pressure, noise_sd=2.0, rng=rng)

            # respiration → volume oscillation
            rr_hz = p["rr_bpm"] / 60.0
            vol = p["vol_base"] + 0.06*np.sin(2*np.pi*rr_hz*(minute_from_start*60.0 + i*dt)) + rng.normal(0, 0.01)
            if snore_rem and stage == "REM" and rng.rand() < 0.02:
                vol = min(1.0, vol + rng.uniform(0.2, 0.5))
            vol = float(np.clip(vol, 0.0, 1.0))

            rows.append({
                "ts": t_curr.isoformat(),
                "fsr": fsr,
                "t1_c": round(float(t1), 2),
                "t2_c": round(float(t2), 2),
                "volume": round(vol, 3),
                "stage": stage,   # <-- ground-truth stage in the stream
            })
            t_curr += timedelta(seconds=dt)
            minute_from_start += dt/60.0

    with open(out_path, "w") as f:
        json.dump(rows, f)
    print(f"✅ Wrote {len(rows)} samples to {out_path}")
    return out_path



# === PLACE B: write two experimental files into /content ===
# Re-generate with a real fever and varied stages
pathA = generate_stream_json(
    "/content/exp_fsr_nightA.json",
    schedule=[('Wake',5),('N1',5),('N2',8),('N3',7),('REM',6),('N2',4),('REM',4)],
    sample_hz=1.0, k_fsr=8, fever_ramp=None, seed=1001, snore_rem=True,
)

# Fever crosses 38°C after minute 18, ramp +1.6°C over 15 minutes
pathB = generate_stream_json(
    "/content/exp_fsr_nightB_fever.json",
    schedule=[('Wake',6),('N1',5),('N2',8),('N3',6),('REM',6),('N2',5)],
    sample_hz=1.0, k_fsr=8, fever_ramp=(18, 15, 1.6), seed=2025, snore_rem=True,
)
print("Generated:", pathA, pathB)



# ================================
# Step 2 — Baselines + Ensemble
# ================================

def build_pipelines(n_graph_nodes: int, text_max_features: int = 6000, C_lr: float = 2.0) -> Dict[str, Pipeline]:
    graph_cols = [f"g{i}" for i in range(n_graph_nodes)]

    # 1) Graph‑only
    graph_pre = ColumnTransformer([("graph", StandardScaler(), graph_cols)], remainder="drop")
    graph_lr  = Pipeline([("pre", graph_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 2) Temp‑only (t1_c, t2_c, dpg)
    temp_pre = ColumnTransformer([("temp", StandardScaler(), ["t1_c", "t2_c", "dpg"])], remainder="drop")
    temp_lr  = Pipeline([("pre", temp_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 3) Volume‑only (0..1)
    vol_pre = ColumnTransformer([("vol", StandardScaler(), ["volume"])], remainder="drop")
    vol_lr  = Pipeline([("pre", vol_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 4) Text‑only (TF‑IDF)
    text_pre = ColumnTransformer([
        ("txt", TfidfVectorizer(
            max_features=text_max_features,
            ngram_range=(1, 3),
            sublinear_tf=True,
            min_df=1,
            max_df=1.0,
            stop_words="english",
        ), "text")
    ])
    text_lr  = Pipeline([("pre", text_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # 5) Posture+Temp dynamics (engineered features)
    posture_cols = [
        'p_sum_mean','p_entropy_mean','cop_mean','cop_std','cop_speed_mean','cop_speed_p95','shift_events',
        't_mean_mean','t_mean_std','t_delta_mean','t_mean_slope'
    ] + [f'fsr{j}_mean' for j in range(n_graph_nodes)] + [f'fsr{j}_p95' for j in range(n_graph_nodes)]

    posture_pre = ColumnTransformer([("posture", StandardScaler(), posture_cols)], remainder="drop")
    posture_lr  = Pipeline([("pre", posture_pre), ("clf", LogisticRegression(max_iter=2000, C=C_lr, multi_class="multinomial"))])

    # Soft voting ensemble
    soft_vote = VotingClassifier(
        estimators=[
            ("graph", graph_lr), ("temp", temp_lr), ("volume", vol_lr), ("text", text_lr), ("posture_temp", posture_lr)
        ],
        voting="soft",
        weights=[1.5, 0.75, 0.5, 2.0, 2.0],
        flatten_transform=True,
    )

    # Stacking ensemble (meta‑learner on class probabilities)
    stack = StackingClassifier(
        estimators=[
            ("graph", graph_lr), ("temp", temp_lr), ("volume", vol_lr), ("text", text_lr), ("posture_temp", posture_lr)
        ],
        final_estimator=LogisticRegression(max_iter=2000, C=1.0, multi_class="multinomial"),
        stack_method="predict_proba",
        passthrough=False,
    )

    return {
        "graph_only": graph_lr,
        "temp_only": temp_lr,
        "volume_only": vol_lr,
        "text_only": text_lr,
        "posture_temp_only": posture_lr,
        "ensemble_softvote": soft_vote,
        "ensemble_stack": stack,
    }

# ================================
# Step 3 — Evaluation utilities
# ================================

def evaluate_models(models: Dict[str, Pipeline], X: pd.DataFrame, y: pd.Series, *, k_folds: int = 5, random_state: int = 7) -> pd.DataFrame:
    skf = StratifiedKFold(n_splits=k_folds, shuffle=True, random_state=random_state)
    scoring = {"acc": "accuracy", "macro_f1": "f1_macro"}
    rows = []
    for name, model in models.items():
        cv = cross_validate(model, X, y, cv=skf, scoring=scoring, n_jobs=-1)
        rows.append({
            "model": name,
            "cv_accuracy_mean": float(cv["test_acc"].mean()),
            "cv_accuracy_std": float(cv["test_acc"].std()),
            "cv_macroF1_mean": float(cv["test_macro_f1"].mean()),
            "cv_macroF1_std": float(cv["test_macro_f1"].std()),
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

# Optional helper — inspect top n‑grams learned by text‑only LR

def top_text_features(text_pipeline: Pipeline, topn: int = 15) -> Dict[str, List[Tuple[str, float]]]:
    vec: TfidfVectorizer = text_pipeline.named_steps["pre"].transformers_[0][1]
    clf: LogisticRegression = text_pipeline.named_steps["clf"]
    feature_names = np.array(vec.get_feature_names_out())
    tops = {}
    for i, cls in enumerate(STAGES):
        coefs = clf.coef_[i]
        idx = np.argsort(coefs)[-topn:][::-1]
        tops[cls] = list(zip(feature_names[idx], coefs[idx]))
    return tops



# ADD NEW

# --- Cell D: plotting/report helpers (matplotlib, no seaborn) ---

import matplotlib.pyplot as plt
from matplotlib.dates import DateFormatter

def _ensure_ts_index(n_epochs: int, epoch_s: int, start_time: Optional[pd.Timestamp] = None) -> pd.DatetimeIndex:
    if start_time is None:
        start_time = pd.Timestamp.utcnow().floor("S")
    return pd.date_range(start=start_time, periods=n_epochs, freq=f"{epoch_s}S")

def plot_nightly_report(ep: pd.DataFrame, *, epoch_s: int = 30, start_time: Optional[pd.Timestamp] = None):
    """
    Draw 4 panes:
      1) Temperature + fever shading
      2) CoP/shift (posture)
      3) Volume + resp rate + flags
      4) Hypnogram from predictions if 'pred' column present (else placeholder)
    """
    n = len(ep)
    t = _ensure_ts_index(n, epoch_s, start_time)
    fig = plt.figure(figsize=(14, 10))

    # 1) Temperature with fever shading
    ax1 = fig.add_subplot(4, 1, 1)
    ax1.plot(t, ep["t_mean_mean"], label="Temp (mean °C)")
    ax1.plot(t, ep.get("t_slope_cpm", pd.Series([np.nan]*n)), label="Temp slope (°C/min)", linewidth=1)
    # Shade fever
    fever_mask = ep.get("fever_status", pd.Series([False]*n)).astype(bool)
    if fever_mask.any():
        ax1.fill_between(t, ep["t_mean_mean"].min(), ep["t_mean_mean"].max(), where=fever_mask, alpha=0.15, label="Fever window")
    ax1.set_title("Temperature & Fever")
    ax1.set_ylabel("°C")
    ax1.legend(loc="upper left")
    ax1.xaxis.set_major_formatter(DateFormatter('%H:%M'))

    # 2) Posture map: CoP & shift markers
    ax2 = fig.add_subplot(4, 1, 2, sharex=ax1)
    ax2.plot(t, ep["cop_mean"], label="Center of Pressure (index)")
    shifts = ep["shift_events"].fillna(0) > 0
    ax2.scatter(t[shifts], ep["cop_mean"][shifts], marker="x", s=20, label="Shift")
    ax2.set_title("Posture / Pressure")
    ax2.set_ylabel("CoP idx")
    ax2.legend(loc="upper left")

    # 3) Volume & respiration
    ax3 = fig.add_subplot(4, 1, 3, sharex=ax1)
    ax3.plot(t, ep["volume"], label="Volume (0..1)")
    if "resp_rate_bpm" in ep.columns:
        ax3.plot(t, ep["resp_rate_bpm"] / ep["resp_rate_bpm"].max(), linestyle="--", label="Resp (scaled)")
    # Shade abnormal RR or snore
    abn = ep.get("resp_flag_low", False) | ep.get("resp_flag_high", False) | ep.get("snore_flag", False)
    if isinstance(abn, pd.Series) and abn.any():
        ax3.fill_between(t, 0, 1, where=abn, alpha=0.10, label="Resp/Snore alert")
    ax3.set_ylim(-0.05, 1.05)
    ax3.set_title("Voice / Volume & Respiration")
    ax3.set_ylabel("Volume")
    ax3.legend(loc="upper left")

    # 4) Hypnogram (if predictions available)
    ax4 = fig.add_subplot(4, 1, 4, sharex=ax1)
    if "pred" in ep.columns:
        # map stages to numbers
        stage_map = {s:i for i, s in enumerate(STAGES)}
        y = ep["pred"].map(stage_map).fillna(np.nan)
        ax4.step(t, y, where="post")
        ax4.set_yticks(list(stage_map.values()))
        ax4.set_yticklabels(list(stage_map.keys()))
        ax4.set_title("Predicted Sleep Stage")
    else:
        ax4.text(0.5, 0.5, "No predictions yet", transform=ax4.transAxes, ha="center")
        ax4.set_title("Predicted Sleep Stage")
    ax4.set_xlabel("Time (hh:mm)")

    plt.tight_layout()
    return fig
# ====================================================
# Extractor helper – converts CoP (posture curve) to array
# ====================================================

def extract_cop_array(ep: pd.DataFrame) -> np.ndarray:
    """
    Extracts the Center of Pressure (CoP) curve as a NumPy array from the epoch DataFrame.
    """
    if "cop_mean" not in ep.columns:
        raise KeyError("Column 'cop_mean' not found. Run build_epoch_table_from_json() first.")
    return ep["cop_mean"].to_numpy()

# ================================
# Demo – run synthetic end‑to‑end
# ================================
if __name__ == "__main__":
    cfg = DataConfig(n_samples=3000, n_graph_nodes=8, random_state=13)
    df = generate_synthetic_dataset(cfg)

    y = df["label"].astype("category")
    X = df.drop(columns=["label"])  # includes graph, temps, volume, text, and posture_temp_* columns

    models = build_pipelines(n_graph_nodes=cfg.n_graph_nodes)

    print("=== Cross‑validated performance (5‑fold) ===")
    cv_table = evaluate_models(models, X, y, k_folds=5)
    print(cv_table.to_string(index=False, float_format=lambda v: f"{v:.4f}"))

    # Hold‑out to inspect confusion matrix & detailed report
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.30, stratify=y, random_state=24)
    best_name = cv_table.iloc[0]["model"]
    best = models[best_name]
    print(f"\nTraining best model on hold‑out: {best_name}")
    res = holdout_report(best, X_tr, X_te, y_tr, y_te)

    print(f"Accuracy: {res['accuracy']:.4f} | Macro‑F1: {res['macro_f1']:.4f} | Cohen's κ: {res['kappa']:.4f}")
    print("\nPer‑class report:\n", res["report"].to_string())
    print("\nConfusion matrix (rows=true, cols=pred):\n", res["confusion_matrix"].to_string())

    # Example: to ingest a real JSON stream and build posture/temperature meta‑features:
    # real_posture = build_posture_temp_frame_from_json("/path/to/your.json", epoch_s=30)
    # Then merge with your other epoch‑level columns (graph/text/volume/temps) and re‑run the pipelines.

    #ADD NEW
    # --- Cell E: nightly demo (uses your saved .pkl if present) ---

import os

def run_nightly(json_path: str,
                *,
                epoch_s: int = 30,
                model_pkl: str = "sleepstate_best.pkl",
                start_time: Optional[pd.Timestamp] = None):
    # 1) Build epoch table from JSON
    ep = build_epoch_table_from_json(json_path, epoch_s=epoch_s)

    # 2) Predict sleep stages
    # Try to load your best pipeline; if missing, fall back to posture_temp_only trained on synthetic (quick)
    try:
        bundle = load_model_pkl(model_pkl)
        model = bundle["model"]
        needed_cols = getattr(model, "feature_names_in_", None)
        X_pred = ep.copy()
        if needed_cols is not None:
            missing = [c for c in needed_cols if c not in X_pred.columns]
            for m in missing:
                X_pred[m] = 0.0  # safe filler if a branch wasn't used in your JSON features
            X_pred = X_pred[needed_cols]
        y_hat = model.predict(X_pred)
        ep["pred"] = pd.Categorical(y_hat, categories=STAGES)
    except Exception as e:
        print(f"⚠️ Could not load {model_pkl} ({e}). Training a quick posture-only model on synthetic data as fallback...")
        cfg_tmp = DataConfig(n_samples=1200, n_graph_nodes=8, random_state=77)
        df_syn = generate_synthetic_dataset(cfg_tmp)
        y_syn = df_syn["label"].astype("category")
        X_syn = df_syn.drop(columns=["label"])
        models_tmp = build_pipelines(n_graph_nodes=cfg_tmp.n_graph_nodes)
        posture_only = models_tmp["posture_temp_only"].fit(X_syn, y_syn)
        ep["pred"] = posture_only.predict(ep.reindex(columns=posture_only.feature_names_in_, fill_value=0))

    # 3) Plot the nightly 4-pane report
    fig = plot_nightly_report(ep, epoch_s=epoch_s, start_time=start_time)
    out_png = os.path.splitext(os.path.basename(json_path))[0] + "_report.png"
    fig.savefig(out_png, dpi=140)
    print(f"✅ Nightly report saved to {out_png}")
    # Quick textual summary
    fever_pct = 100.0 * ep["fever_status"].mean()
    move_idx = ep["movement_flag_epoch"].mean() if "movement_flag_epoch" in ep.columns else np.nan
    rr = ep.get("resp_rate_bpm", pd.Series(dtype=float))
    print(f"Fever epochs: {fever_pct:.1f}% | Movement index: {move_idx:.2f} | RR (bpm): "
          f"{(rr.min() if len(rr)>0 else np.nan):.1f}–{(rr.max() if len(rr)>0 else np.nan):.1f}")

# === Run the nightly on your uploaded file ===
# === Run the nightly on your uploaded file ===
json_path = "/content/fsr_data (1).json"   # <-- match the exact name shown in the Files pane
run_nightly(json_path, epoch_s=30)

# Extract and print the CoP (posture) curve
ep = build_epoch_table_from_json(json_path, epoch_s=30)
cop_array = extract_cop_array(ep)
print("Center of Pressure array:", cop_array)


