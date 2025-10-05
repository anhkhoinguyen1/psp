# PSP-Arduino (v3.1)

End‑to‑end pipeline for **8 FSRs + 2 temps + volume** → local **Flask** server → web dashboard with draggable FSRs → **GitHub JSON dumps**.

This build includes:
- Front‑end **row‑threshold auto‑dump**: the “Rows before dump” input triggers **Dump Now** when the local DB reaches that row count (client‑side).
- **Delete Repo Data**: deletes **all** JSON files in `PSP-Arduino/Data` via GitHub API (recursive).
- “Dump Now” and server auto‑dump both **prune** uploaded rows locally so each JSON contains only new data.
- FSR readings and volume are clamped to **0–100** on the server and shown as **0–100** on the dashboard.
- **Clear Data** resets the DB and the temperature chart and UI state.

## Quickstart
```bash
# 1) Start the server
cd PSP-Arduino/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# GitHub env (classic PAT with repo scope)
export GITHUB_TOKEN='ghp_xxx'                       # required for dump & delete
export GITHUB_REPO='quynhanh726/PSP-Post-Surgery-Pillow-'
export GITHUB_BRANCH='main'
export GITHUB_PATH='PSP-Arduino/Data'

# Optional server auto-dump
export DUMP_ENABLED=true
export DUMP_INTERVAL_SECONDS=60

FLASK_APP=app.py python -m flask run --host 0.0.0.0 --port 5000

# 2) Start the uploader (new shell)
cd ./PSP-Arduino/uploader
source ../server/.venv/bin/activate
pip install -r requirements.txt
python uploader.py

Open http://localhost:5000

### REST (selected)
- `POST /api/data` → `{ "fsr":[8×0..100], "t1_c":float, "t2_c":float, "volume":0..100 }`
- `POST /api/clear` (reset local DB; UI resets chart automatically)
- `GET  /api/export.json` (download all current rows)
- `POST /api/dump-now` (immediate dump to GitHub, then prune)
- `POST /api/dump-delete-all` (delete all JSONs under configured path)
- `GET  /api/dump-config` / `POST /api/dump-config`

### Serial
- Uploader scans `/dev/ttyACM0..9` then `/dev/ttyUSB0..9` @ 115200 (1 Hz). If your Arduino outputs 0–1023, uploader scales to 0–100.
