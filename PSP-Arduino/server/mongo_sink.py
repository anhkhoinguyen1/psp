# server/mongo_sink.py
import os
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# --- Configuration via environment variables ---
MONGO_URI = os.getenv("MONGO_URI", "").strip()   # leave default = ""
MONGO_DB  = os.getenv("MONGO_DB", "psp")
MONGO_COLL = os.getenv("MONGO_COLLECTION", "livedata")
MONGO_ENABLED = bool(MONGO_URI) and os.getenv("MONGO_ENABLED", "true").lower() == "true"


_client: Optional[MongoClient] = None
_coll = None
_init_lock = threading.Lock()
_initialized = False


def mongo_enabled() -> bool:
    return MONGO_ENABLED


def _ensure_indexes():
    # Index on timestamp for fast time-range queries; not unique
    _coll.create_index([("ts", ASCENDING)], background=True)
    # Optional helper indexes
    _coll.create_index([("volume", ASCENDING)], background=True)
    _coll.create_index([("ts_iso", ASCENDING)], background=True)


def init_mongo():
    """Lazily initialize Mongo client/collection and ensure indexes."""
    global _client, _coll, _initialized
    if not MONGO_ENABLED or _initialized:
        return
    with _init_lock:
        if _initialized or not MONGO_ENABLED:
            return
        _client = MongoClient(MONGO_URI, appname="psp-arduino-app")
        db = _client[MONGO_DB]
        _coll = db[MONGO_COLL]
        _ensure_indexes()
        _initialized = True
        print(f"[mongo] connected: db={MONGO_DB}, coll={MONGO_COLL}", flush=True)


def _as_dt(ts_iso: str):
    # Store a real datetime in Mongo for proper querying
    # Python 3.11: datetime.fromisoformat handles "+00:00"
    try:
        return datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    except Exception:
        return None

def clear_collection() -> int:
    """Delete all docs from the active collection. Returns deleted count (best effort)."""
    if not MONGO_ENABLED:
        return 0
    if not _initialized:
        init_mongo()
    try:
        res = _coll.delete_many({})  # keeps indexes; only removes data
        return getattr(res, "deleted_count", 0)
    except PyMongoError as e:
        print(f"[mongo] clear error: {e}", flush=True)
        return 0

def insert_one_sample(doc: Dict[str, Any]) -> bool:
    """
    Insert ONE sample document.
    Expected keys: ts_iso (str), fsr (list[int]), t1_c (float), t2_c (float), volume (int)
    Automatically adds:
      - ts (datetime) parsed from ts_iso (if parseable)
      - created_at (datetime.utcnow())
    """
    if not MONGO_ENABLED:
        return False
    if not _initialized:
        init_mongo()
    try:
        d = dict(doc)  # shallow copy
        d["created_at"] = datetime.utcnow()
        if "ts_iso" in d and "ts" not in d:
            ts_dt = _as_dt(d["ts_iso"])
            if ts_dt:
                d["ts"] = ts_dt
        _coll.insert_one(d)
        return True
    except PyMongoError as e:
        print(f"[mongo] insert error: {e}", flush=True)
        return False


def insert_many_samples(docs: List[Dict[str, Any]]) -> int:
    """Bulk insert many (used by optional backfill). Returns number inserted."""
    if not MONGO_ENABLED or not docs:
        return 0
    if not _initialized:
        init_mongo()
    prepared = []
    for x in docs:
        d = dict(x)
        d.setdefault("created_at", datetime.utcnow())
        if "ts_iso" in d and "ts" not in d:
            ts_dt = _as_dt(d["ts_iso"])
            if ts_dt:
                d["ts"] = ts_dt
        prepared.append(d)
    try:
        res = _coll.insert_many(prepared, ordered=False)
        return len(res.inserted_ids)
    except PyMongoError as e:
        print(f"[mongo] bulk insert error: {e}", flush=True)
        return 0
