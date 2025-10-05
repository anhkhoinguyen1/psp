#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <project_root>"
  exit 1
fi

ROOT="$1"
TMP_DIR="$(mktemp -d)"
REPO="${GITHUB_REPO:-quynhanh726/PSP-Post-Surgery-Pillow-}"
BRANCH="${GITHUB_BRANCH:-main}"

echo "[i] Cloning repo to ${TMP_DIR}"
git clone -b "${BRANCH}" "https://github.com/${REPO}.git" "${TMP_DIR}"
cd "${TMP_DIR}"

echo "[i] Copying project into PSP-Arduino/"
rm -rf PSP-Arduino || true
mkdir -p PSP-Arduino
cp -a "${ROOT}/." PSP-Arduino/

git add -A
git commit -m "Add/update PSP-Arduino project (auto)"
git push origin "${BRANCH}"
echo "[i] Pushed to https://github.com/${REPO} (branch: ${BRANCH})"
