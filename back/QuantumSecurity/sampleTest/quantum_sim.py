#!/usr/bin/env python3
"""
quantum_sim.py
- writes sample.json (from user's provided JSON string)
- simulates a "quantum-safe" encryption (simulated QKD/PQC)
- writes encrypted payload + metadata into PostgreSQL
- prints status; suggests opening pgAdmin (or runs the open command optionally)
"""

import os
import json
import base64
import hashlib
import secrets
import datetime
import getpass
import subprocess

# Database config (change if needed; will use env vars if provided)
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", 5432))
PG_DB   = os.getenv("PG_DB", "postgres")
PG_USER = os.getenv("PG_USER", getpass.getuser())
PG_PW   = os.getenv("PG_PW", "")  # leave blank for trust/peer auth

SAMPLE_JSON = r'''{"count":10,"items":[{"ts":"2025-10-04T23:07:02.032955+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":0.98,"t2_c":0.0,"volume":1},{"ts":"2025-10-04T23:07:03.070776+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":23.95,"t2_c":28.35,"volume":1},{"ts":"2025-10-04T23:07:04.113706+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":20.04,"t2_c":20.53,"volume":1},{"ts":"2025-10-04T23:07:05.147411+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":1.96,"t2_c":0.98,"volume":1},{"ts":"2025-10-04T23:07:06.187965+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":22.48,"t2_c":25.9,"volume":1},{"ts":"2025-10-04T23:07:07.227996+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":20.53,"t2_c":21.02,"volume":1},{"ts":"2025-10-04T23:07:08.267991+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":1.96,"t2_c":0.0,"volume":1},{"ts":"2025-10-04T23:07:09.304826+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":21.51,"t2_c":24.93,"volume":1},{"ts":"2025-10-04T23:07:10.344896+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":21.51,"t2_c":21.99,"volume":1},{"ts":"2025-10-04T23:07:11.385195+00:00","fsr":[0,0,0,0,0,0,0,0],"t1_c":0.98,"t2_c":0.0,"volume":1}]}'''

# Simple XOR-based encryption using a random key (simulation only)
def xor_encrypt(data_bytes: bytes, key: bytes) -> bytes:
    return bytes([b ^ key[i % len(key)] for i, b in enumerate(data_bytes)])

def fingerprint(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()

def simulate_quantum_key_exchange(success_rate=0.9):
    """
    Simulate a quantum key exchange: returns (success_bool, key_or_None)
    success_rate: probability that QKD succeeded (simulation).
    """
    if secrets.randbelow(100) < int(success_rate * 100):
        # generate a random 32-byte symmetric key (simulation of shared secret)
        return True, secrets.token_bytes(32)
    else:
        return False, None

def ensure_table(conn):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS quantum_secure_store (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL,
        encryption_success BOOLEAN NOT NULL,
        key_fingerprint TEXT,
        encrypted_payload TEXT, -- base64
        notes TEXT
    );
    """)
    conn.commit()
    cur.close()

def store_record(conn, filename, ts, success, key_fp, b64payload, notes):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO quantum_secure_store
        (filename, ts, encryption_success, key_fingerprint, encrypted_payload, notes)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id;
    """, (filename, ts, success, key_fp, b64payload, notes))
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    return new_id

def main():
    # 1) write sample.json to disk
    fname = "sample.json"
    with open(fname, "w", encoding="utf-8") as f:
        f.write(SAMPLE_JSON)
    print(f"[+] wrote sample file: {fname}")

    # 2) simulate quantum key exchange
    success, key = simulate_quantum_key_exchange(success_rate=0.9)
    ts = datetime.datetime.now(datetime.timezone.utc)

    # 3) prepare payload and (maybe) encrypt
    payload_bytes = SAMPLE_JSON.encode("utf-8")
    if success:
        enc = xor_encrypt(payload_bytes, key)
        b64payload = base64.b64encode(enc).decode("ascii")
        key_fp = fingerprint(key)
        notes = "Simulated quantum key exchange OK; XOR-based encryption (simulation)."
        print(f"[+] quantum simulation SUCCESS — key fingerprint: {key_fp[:16]}...")
    else:
        b64payload = None
        key_fp = None
        notes = "Simulated quantum key exchange FAILED; payload not encrypted."
        print("[!] quantum simulation FAILED — no key established.")

    # 4) connect to PostgreSQL and store
    try:
        import psycopg2
        conn_kwargs = {
            "host": PG_HOST,
            "port": PG_PORT,
            "dbname": PG_DB,
            "user": PG_USER,
        }
        if PG_PW:
            conn_kwargs["password"] = PG_PW

        conn = psycopg2.connect(**conn_kwargs)
        ensure_table(conn)
        rec_id = store_record(conn, fname, ts, success, key_fp, b64payload, notes)
        conn.close()
        print(f"[+] stored record id={rec_id} in PostgreSQL ({PG_USER}@{PG_HOST}:{PG_PORT}/{PG_DB})")
    except Exception as e:
        print("[ERROR] Could not connect / write to PostgreSQL:", e)
        print(" - Check that PostgreSQL is running and connection params are correct.")
        return

    # 5) open pgAdmin (optional). This will attempt to open the pgAdmin app on macOS.
    print("\nNow you can open pgAdmin to inspect the table.")
    print("If you want this script to launch pgAdmin automatically, set OPEN_PGADMIN=1 in env.")
    if os.getenv("OPEN_PGADMIN", "") == "1":
        try:
            subprocess.run(['open', '-a', 'pgAdmin 4'], check=False)
            print("[+] launched pgAdmin 4 (macOS 'open -a \"pgAdmin 4\"')")
        except Exception as e:
            print("[!] failed to launch pgAdmin:", e)

if __name__ == "__main__":
    main()
