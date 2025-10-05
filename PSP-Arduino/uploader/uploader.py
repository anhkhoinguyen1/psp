#!/usr/bin/env python3
"""
Reads CSV lines from Arduino at 115200 and POSTs JSON to the Flask server.

CSV format (1 Hz from your sketch):
  fsr1,fsr2,fsr3,fsr4,fsr5,fsr6,fsr7,fsr8,t1_c,t2_c,volume

POST body to /api/data:
{
  "fsr": [8 values 0..100],
  "t1_c": float,
  "t2_c": float,
  "volume": 0..100
}

Env overrides:
  API_URL      (default http://localhost:5000/api/data)
  BAUD_RATE    (default 115200)
  SERIAL_PORT  (skip auto-scan and force a port)
"""

import os
import time
import requests
import serial
from serial.tools import list_ports

API_URL   = os.environ.get("API_URL", "http://localhost:5000/api/data")
BAUD      = int(os.environ.get("BAUD_RATE", "115200"))
PORT_ENV  = os.environ.get("SERIAL_PORT")


def find_port():
    """Find a usable serial port: env → /dev/ttyACM* → /dev/ttyUSB* → first detected."""
    if PORT_ENV:
        return PORT_ENV
    # common Linux Arduino device names
    for prefix in ("/dev/ttyACM", "/dev/ttyUSB"):
        for i in range(0, 10):
            path = f"{prefix}{i}"
            try:
                with serial.Serial(path, BAUD, timeout=0.3) as _s:
                    return path
            except Exception:
                pass
    # fallback to first enumerated port
    ports = list(list_ports.comports())
    if ports:
        return ports[0].device
    return None


def scale_to_100(v):
    """Accept 0..100 (pass-through) or 0..1023 (scale). Non-numeric → 0."""
    try:
        v = float(v)
    except Exception:
        return 0
    if v <= 100:
        return max(0, min(100, int(round(v))))
    return max(0, min(100, int(round((v / 1023.0) * 100))))  # 10-bit to percent


def parse_csv_line(line):
    """
    Parse one CSV line into the expected JSON payload.
    Raises on malformed input.
    """
    parts = [p.strip() for p in line.strip().split(",")]
    if len(parts) < 11:
        raise ValueError(f"expected 11 values (got {len(parts)}): {parts!r}")
    fsr = [scale_to_100(parts[i]) for i in range(8)]
    t1  = float(parts[8])
    t2  = float(parts[9])
    vol = scale_to_100(parts[10])
    return {"fsr": fsr, "t1_c": t1, "t2_c": t2, "volume": vol}


def main():
    while True:
        port = find_port()
        if not port:
            print("[uploader] no serial port found; retrying in 5s...", flush=True)
            time.sleep(5)
            continue

        print(f"[uploader] using {port} @ {BAUD}, POST → {API_URL}", flush=True)

        try:
            with serial.Serial(port, BAUD, timeout=2) as ser:
                while True:
                    raw = ser.readline()
                    if not raw:
                        continue
                    try:
                        line = raw.decode(errors="ignore")
                        payload = parse_csv_line(line)
                    except Exception as e:
                        print(f"[uploader] bad line: {raw!r} ({e})", flush=True)
                        continue

                    try:
                        r = requests.post(API_URL, json=payload, timeout=5)
                        if r.status_code == 200:
                            print(f"[uploader] posted: {payload}", flush=True)
                        else:
                            print(f"[uploader] post failed {r.status_code}: {r.text}", flush=True)
                    except Exception as e:
                        print(f"[uploader] post error: {e}", flush=True)

                    # your sketch emits ~1 Hz; this keeps client pace if data arrives faster
                    time.sleep(1)

        except serial.SerialException as se:
            print(f"[uploader] serial error on {port}: {se} → re-scan in 3s", flush=True)
            time.sleep(3)
            continue
        except Exception as e:
            print(f"[uploader] error: {e} → retry in 2s", flush=True)
            time.sleep(2)


if __name__ == "__main__":
    main()