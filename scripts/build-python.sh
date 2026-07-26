#!/bin/bash
set -e

# Build a standalone Python runtime with all TTS dependencies installed.
# Uses python-build-standalone for a portable, self-contained Python.

PYTHON_VERSION="3.11"
DIST_DIR="dist-python"
REQUIREMENTS_FILE="api/requirements.txt"
REQUIREMENTS_HASH_FILE="${DIST_DIR}/.requirements.sha256"
REQUIREMENTS_HASH="$(shasum -a 256 "${REQUIREMENTS_FILE}" | awk '{print $1}')"

if [ -f "${DIST_DIR}/bin/python3.11" ]; then
  CACHED_REQUIREMENTS_HASH="$(sed -n '1p' "${REQUIREMENTS_HASH_FILE}" 2>/dev/null || true)"
  if [ "${CACHED_REQUIREMENTS_HASH}" = "${REQUIREMENTS_HASH}" ]; then
    echo "[build-python] Python runtime already exists at ${DIST_DIR}/"
    ${DIST_DIR}/bin/python3.11 --version
    echo "[build-python] To rebuild, delete ${DIST_DIR}/ and re-run."
    exit 0
  fi

  echo "[build-python] Python requirements changed; rebuilding ${DIST_DIR}/..."
  rm -rf "${DIST_DIR}"
fi

echo "[build-python] Downloading python-build-standalone ${PYTHON_VERSION}..."
mkdir -p "${DIST_DIR}"

# Find the latest release for Python 3.11 macOS arm64
# Using the install_only_stripped variant (smallest, no debug symbols)
RELEASE_TAG="20250317"
PY_TARBALL="cpython-${PYTHON_VERSION}.11+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz"
PY_URL="https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/${PY_TARBALL}"

echo "[build-python] URL: ${PY_URL}"
curl -fsSL "${PY_URL}" -o "/tmp/${PY_TARBALL}"

echo "[build-python] Extracting..."
# python-build-standalone tarballs extract to python/ directory
tar xzf "/tmp/${PY_TARBALL}" -C "${DIST_DIR}" --strip-components=1
rm "/tmp/${PY_TARBALL}"

echo "[build-python] Installing TTS dependencies..."
# Use the standalone Python's pip to install into itself
${DIST_DIR}/bin/pip3.11 install --no-cache-dir -r "${REQUIREMENTS_FILE}"

echo "[build-python] Cleaning up unnecessary files..."
# Remove test directories, __pycache__, etc. to save space
find "${DIST_DIR}" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find "${DIST_DIR}" -type d -name tests -exec rm -rf {} + 2>/dev/null || true
find "${DIST_DIR}" -type d -name test -exec rm -rf {} + 2>/dev/null || true
rm -rf "${DIST_DIR}/share" "${DIST_DIR}/include"
printf '%s\n' "${REQUIREMENTS_HASH}" > "${REQUIREMENTS_HASH_FILE}"

echo "[build-python] Done."
${DIST_DIR}/bin/python3.11 --version
du -sh "${DIST_DIR}"
