import os, json, base64, threading, time, sqlite3, urllib.parse
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, Response, g, send_from_directory
import requests
from mongo_sink import mongo_enabled, init_mongo, insert_one_sample, clear_collection
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

DB_PATH = os.path.join(os.path.dirname(__file__), "data.sqlite")
STATE_PATH = os.path.join(os.path.dirname(__file__), "dump_state.json")
app = Flask(__name__, static_folder="static", static_url_path="/static")

DUMP_ENABLED = os.getenv("DUMP_ENABLED", "true").lower() == "true"
DUMP_INTERVAL_SECONDS = int(os.getenv("DUMP_INTERVAL_SECONDS", "60"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "quynhanh726/PSP-Post-Surgery-Pillow-")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
GITHUB_PATH = os.getenv("GITHUB_PATH", "PSP-Arduino/Data")

FSR_COUNT = 8

LAST_DUMP = {"when": None, "type": None, "ok": None, "message": None, "filename": None, "rows": 0, "deleted": 0}

def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()

def init_db():
    db = get_db()
    db.execute("""
CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  fsr1 INTEGER NOT NULL,
  fsr2 INTEGER NOT NULL,
  fsr3 INTEGER NOT NULL,
  fsr4 INTEGER NOT NULL,
  fsr5 INTEGER NOT NULL,
  fsr6 INTEGER NOT NULL,
  fsr7 INTEGER NOT NULL,
  fsr8 INTEGER NOT NULL,
  t1_c REAL NOT NULL,
  t2_c REAL NOT NULL,
  volume INTEGER NOT NULL
);
""")
    db.commit()

with app.app_context():
    init_db()
    # Try to init Mongo (safe no-op if MONGO_URI not configured)
    try:
        init_mongo()
    except Exception as e:
        print(f"[mongo] init failed (non-fatal): {e}", flush=True)

if os.getenv("MONGO_CLEAR_ON_START", "false").lower() == "true":
    try:
        deleted = clear_collection()
        print(f"[mongo] cleared collection on start: deleted={deleted}", flush=True)
    except Exception as e:
        print(f"[mongo] clear on start failed: {e}", flush=True)

def clamp(v, lo, hi): return max(lo, min(hi, v))

def fsr_to_pct_already(pcts):
    if not isinstance(pcts, list) or len(pcts) != FSR_COUNT:
        raise ValueError(f"fsr must be a list of {FSR_COUNT} numbers (0–100)")
    return [int(clamp(float(v), 0, 100)) for v in pcts]

def compute_volume_from_fsr(fsr_pct_list):
    p = fsr_to_pct_already(fsr_pct_list)
    return int(round(sum(p) / float(len(p))))

def log_dump(msg): print(f"[dump] {msg}", flush=True)

def _gh_headers():
    if not GITHUB_TOKEN:
        raise RuntimeError("Missing GITHUB_TOKEN")
    return {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "psp-arduino-app"
    }

@app.route("/")
def index(): return send_from_directory(app.static_folder, "index.html")

@app.route("/api/data", methods=["POST"])
def api_data():
    try:
        payload = request.get_json(force=True, silent=False)
        fsr = fsr_to_pct_already(payload.get("fsr", []))
        t1_c = float(payload["t1_c"]); t2_c = float(payload["t2_c"])
        vol = payload.get("volume", None)
        vol = compute_volume_from_fsr(fsr) if vol is None else int(clamp(float(vol), 0, 100))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Invalid JSON: {e}"}), 400

    ts = datetime.now(timezone.utc).isoformat()

    # --- SQLite (existing) ---
    db = get_db()
    db.execute(
        "INSERT INTO samples (ts, fsr1, fsr2, fsr3, fsr4, fsr5, fsr6, fsr7, fsr8, t1_c, t2_c, volume) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (ts, *fsr, t1_c, t2_c, vol),
    )
    db.commit()

    # --- Mongo (new, optional) ---
    try:
        insert_one_sample({
            "ts_iso": ts,
            "fsr": fsr,
            "t1_c": float(t1_c),
            "t2_c": float(t2_c),
            "volume": int(vol),
            # You can add anything else you want to query later, e.g. device_id
        })
    except Exception as e:
        # Non-fatal: keep your pipeline up even if Mongo is briefly unavailable
        print(f"[mongo] insert_one_sample failed: {e}", flush=True)

    return jsonify({"ok": True, "ts": ts})

@app.route("/api/mongo/clear", methods=["POST"])
def api_mongo_clear():
    if not mongo_enabled():
        return jsonify({"ok": False, "message": "Mongo disabled"}), 400
    deleted = clear_collection()
    return jsonify({"ok": True, "deleted": int(deleted)})

@app.route("/api/latest")
def api_latest():
    db = get_db()
    row = db.execute("SELECT * FROM samples ORDER BY id DESC LIMIT 1").fetchone()
    if not row: return jsonify({"ready": False, "message": "No data yet"})
    fsr = [row[f"fsr{i}"] for i in range(1, FSR_COUNT+1)]
    resp = jsonify({
        "ready": True, "ts": row["ts"],
        "fsr_pct": fsr_to_pct_already(fsr),
        "t1_c": float(row["t1_c"]), "t2_c": float(row["t2_c"]),
        "volume": int(row["volume"])
    })
    resp.headers["Cache-Control"] = "no-store"
    return resp

@app.route("/api/history")
def api_history():
    try: limit = int(request.args.get("limit", "3600"))
    except: limit = 3600
    limit = clamp(limit, 1, 50000)
    db = get_db()
    rows = db.execute("SELECT * FROM samples ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    items = []
    for r in rows:
        fsr = [r[f"fsr{i}"] for i in range(1, FSR_COUNT+1)]
        items.append({
            "ts": r["ts"], "fsr": fsr_to_pct_already(fsr),
            "t1_c": float(r["t1_c"]), "t2_c": float(r["t2_c"]),
            "volume": int(r["volume"])
        })
    from flask import jsonify as _jsonify
    resp = _jsonify({"count": len(items), "items": items})
    resp.headers["Cache-Control"] = "no-store"
    return resp

@app.route("/api/export.json")
def api_export_json():
    db = get_db()
    rows = db.execute("SELECT * FROM samples ORDER BY id ASC").fetchall()
    items = []
    for r in rows:
        fsr = [r[f"fsr{i}"] for i in range(1, FSR_COUNT+1)]
        items.append({
            "ts": r["ts"], "fsr": fsr_to_pct_already(fsr),
            "t1_c": float(r["t1_c"]), "t2_c": float(r["t2_c"]),
            "volume": int(r["volume"])
        })
    from flask import json as _flask_json
    payload = _flask_json.dumps({"count": len(items), "items": items})
    return Response(payload, mimetype="application/json",
                    headers={"Content-Disposition": "attachment; filename=fsr_data.json",
                             "Cache-Control":"no-store"})

@app.route("/api/stats")
def api_stats():
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS c, MAX(ts) AS last_ts FROM samples").fetchone()
    total = int(row["c"]) if row and row["c"] is not None else 0
    last_ts = row["last_ts"] if row and row["last_ts"] is not None else None
    resp = jsonify({"total": total, "last_ts": last_ts})
    resp.headers["Cache-Control"] = "no-store"
    return resp

@app.route("/api/clear", methods=["POST"])
def api_clear():
    db = get_db()
    count = db.execute("SELECT COUNT(*) AS c FROM samples").fetchone()["c"]
    db.execute("DELETE FROM samples"); db.commit()
    try: db.execute("VACUUM")
    except Exception: pass
    try:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump({"last_ts": None}, f)
    except Exception: pass
    return jsonify({"ok": True, "deleted": int(count)})

@app.route("/api/dump-config", methods=["GET","POST"])
def api_dump_config():
    global DUMP_ENABLED, DUMP_INTERVAL_SECONDS, GITHUB_PATH, GITHUB_REPO, GITHUB_BRANCH
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        if "enabled" in data:  DUMP_ENABLED = bool(data["enabled"])
        if "interval_seconds" in data:
            try: DUMP_INTERVAL_SECONDS = max(1, int(data["interval_seconds"]))
            except: pass
        if "path" in data:     GITHUB_PATH = str(data["path"]).strip().strip("/")
        if "repo" in data:     GITHUB_REPO = str(data["repo"])
        if "branch" in data:   GITHUB_BRANCH = str(data["branch"])
        log_dump(f"config updated: enabled={DUMP_ENABLED}, interval={DUMP_INTERVAL_SECONDS}s, repo={GITHUB_REPO}, branch={GITHUB_BRANCH}, path={GITHUB_PATH}")
    return jsonify({"enabled": DUMP_ENABLED, "interval_seconds": DUMP_INTERVAL_SECONDS, "repo": GITHUB_REPO, "branch": GITHUB_BRANCH, "path": GITHUB_PATH, "has_token": bool(GITHUB_TOKEN)})

@app.route("/api/dump-status")
def api_dump_status():
    return jsonify({"enabled": DUMP_ENABLED, "interval_seconds": DUMP_INTERVAL_SECONDS, "has_token": bool(GITHUB_TOKEN), "last": LAST_DUMP})

@app.route("/api/dump-now", methods=["POST"])
def api_dump_now():
    try:
        ok, msg, deleted, filename, rows = perform_dump_once(trigger="manual")
        code = 200 if ok else 500
        return jsonify({"ok": ok, "message": msg, "deleted": deleted, "filename": filename, "rows": rows}), code
    except Exception as e:
        log_dump(f"manual dump failed: {e}")
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route("/api/dump-delete-all", methods=["POST"])
def api_dump_delete_all():
    if not GITHUB_TOKEN:
        return jsonify({"ok": False, "message": "Missing GITHUB_TOKEN (needs classic PAT with 'repo' scope)."}), 400
    try:
        folder = GITHUB_PATH.strip("/")
        log_dump(f"[dump-delete] start (repo={GITHUB_REPO}, branch={GITHUB_BRANCH}, path={folder})")
        deleted, errors = github_delete_all_in_path_recursive(folder)
        msg = f"Deleted {deleted} file(s) in {folder}."
        if errors:
            log_dump(f"[dump-delete] completed with {len(errors)} error(s)")
            return jsonify({"ok": False, "deleted": deleted, "errors": errors, "message": msg}), 207
        log_dump(f"[dump-delete] success: {msg}")
        return jsonify({"ok": True, "deleted": deleted, "message": msg})
    except Exception as e:
        log_dump(f"[dump-delete] failed: {e}")
        return jsonify({"ok": False, "message": str(e)}), 500

def load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"last_ts": None}

def save_state(state):
    try:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception:
        pass

def fetch_rows_since(ts_iso):
    db = get_db()
    if ts_iso:
        rows = db.execute("SELECT * FROM samples WHERE ts > ? ORDER BY ts ASC", (ts_iso,)).fetchall()
    else:
        since = (datetime.now(timezone.utc) - timedelta(seconds=max(1, DUMP_INTERVAL_SECONDS))).isoformat()
        rows = db.execute("SELECT * FROM samples WHERE ts >= ? ORDER BY ts ASC", (since,)).fetchall()
    items = []
    for r in rows:
        fsr = [r[f"fsr{i}"] for i in range(1, 9)]
        items.append({"ts": r["ts"], "fsr": fsr_to_pct_already(fsr), "t1_c": float(r["t1_c"]), "t2_c": float(r["t2_c"]), "volume": int(r["volume"])})
    return items

def github_put_file(path_in_repo, content_bytes, message):
    if not GITHUB_TOKEN:
        raise RuntimeError("Missing GITHUB_TOKEN")
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{urllib.parse.quote(path_in_repo)}"
    headers = _gh_headers()
    data = {"message": message, "content": base64.b64encode(content_bytes).decode("utf-8"), "branch": GITHUB_BRANCH}
    log_dump(f"PUT {path_in_repo} (repo={GITHUB_REPO}, branch={GITHUB_BRANCH}, token={'yes' if GITHUB_TOKEN else 'no'})")
    r = requests.put(url, headers=headers, json=data, timeout=30)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"GitHub upload failed {r.status_code}: {r.text}")
    return r.json()

def github_get_branch_commit_sha(branch=None):
    branch = branch or GITHUB_BRANCH
    url = f"https://api.github.com/repos/{GITHUB_REPO}/git/refs/heads/{branch}"
    r = requests.get(url, headers=_gh_headers(), timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"Get ref failed {r.status_code}: {r.text}")
    return r.json()["object"]["sha"]

def github_list_files_recursive(folder):
    folder = folder.strip("/")
    commit_sha = github_get_branch_commit_sha()
    url = f"https://api.github.com/repos/{GITHUB_REPO}/git/trees/{commit_sha}?recursive=1"
    r = requests.get(url, headers=_gh_headers(), timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Trees list failed {r.status_code}: {r.text}")
    data = r.json()
    tree = data.get("tree", [])
    prefix = folder + "/"
    files = []
    for entry in tree:
        if entry.get("type") == "blob" and entry.get("path", "").startswith(prefix):
            files.append({"path": entry["path"], "sha": entry["sha"]})
    return files

def github_delete_file_via_contents(path_in_repo, sha, message):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{urllib.parse.quote(path_in_repo)}"
    data = {"message": message, "sha": sha, "branch": GITHUB_BRANCH}
    r = requests.delete(url, headers=_gh_headers(), json=data, timeout=30)
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Delete {path_in_repo} failed {r.status_code}: {r.text}")

def github_delete_all_in_path_recursive(folder):
    files = github_list_files_recursive(folder)
    deleted = 0
    errors = []
    if not files:
        return deleted, errors
    log_dump(f"[dump-delete] found {len(files)} file(s) under {folder}")
    for f in files:
        try:
            log_dump(f"[dump-delete] DELETE {f['path']}")
            github_delete_file_via_contents(f["path"], f["sha"], f"Delete {os.path.basename(f['path'])}")
            deleted += 1
        except Exception as e:
            errors.append({"path": f["path"], "error": str(e)})
    return deleted, errors

def record_last_dump(dump_type, ok, message, filename=None, rows=0, deleted=0):
    LAST_DUMP.update({"when": datetime.now(timezone.utc).isoformat(), "type": dump_type, "ok": bool(ok), "message": message, "filename": filename, "rows": int(rows), "deleted": int(deleted)})

def perform_dump_once(trigger="auto"):
    state = load_state()
    log_dump(f"{trigger} attempt (enabled={DUMP_ENABLED}, interval={DUMP_INTERVAL_SECONDS}s, repo={GITHUB_REPO}, branch={GITHUB_BRANCH}, path={GITHUB_PATH}, token={'yes' if GITHUB_TOKEN else 'no'})")
    with app.app_context():
        items = fetch_rows_since(state.get("last_ts"))
    rows = len(items)
    log_dump(f"fetched {rows} rows since last_ts={state.get('last_ts')}")
    if rows == 0:
        msg = "No new rows to dump."
        record_last_dump(trigger, True, msg, filename=None, rows=0, deleted=0)
        return True, msg, 0, None, 0

    payload = json.dumps({"count": rows, "items": items}, separators=(",", ":")).encode("utf-8")
    ts_label = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    folder = GITHUB_PATH.strip("/")
    filename = f"{folder}/dump_{ts_label}.json"
    github_put_file(filename, payload, f"Automated dump {ts_label} ({rows} rows)")
    log_dump(f"upload success → {filename}")

    last_ts_uploaded = items[-1]["ts"]
    with app.app_context():
        db = get_db()
        row = db.execute("SELECT COUNT(*) AS c FROM samples WHERE ts <= ?", (last_ts_uploaded,)).fetchone()
        deleted = int(row["c"]) if row and row["c"] is not None else 0
        db.execute("DELETE FROM samples WHERE ts <= ?", (last_ts_uploaded,))
        db.commit()
        try: db.execute("VACUUM")
        except Exception: pass

    log_dump(f"pruned {deleted} rows locally (<= {last_ts_uploaded})")
    state["last_ts"] = None
    save_state(state)
    msg = f"Uploaded {rows} rows to {filename}. Pruned {deleted} rows locally."
    record_last_dump(trigger, True, msg, filename=filename, rows=rows, deleted=deleted)
    return True, msg, deleted, filename, rows

def dump_loop():
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return
    while True:
        try:
            if DUMP_ENABLED and GITHUB_TOKEN and GITHUB_REPO and GITHUB_PATH:
                perform_dump_once(trigger="auto")
        except Exception as e:
            log_dump(f"auto dump failed: {e}")
            record_last_dump("auto", False, str(e))
        time.sleep(max(1, int(DUMP_INTERVAL_SECONDS)))

threading.Thread(target=dump_loop, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
