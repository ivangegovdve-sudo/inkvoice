#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Building InkVoice Electron app...${NC}"

# Step 1: Download Node.js binary
echo -e "\n${YELLOW}[1/5] Downloading Node.js binary...${NC}"
bash scripts/download-node.sh

# Step 2: Build Python runtime
echo -e "\n${YELLOW}[2/5] Building Python runtime (this may take a while)...${NC}"
bash scripts/build-python.sh

# Step 3: Build Next.js standalone
echo -e "\n${YELLOW}[3/5] Building Next.js...${NC}"
pnpm db:generate

# Nuke all caches and prior build outputs before building.
# Without this, Next.js output file tracing picks up the previous dist-nextjs/
# and bundles it recursively, nesting the entire build inside itself each run.
rm -rf .next dist-nextjs dist

pnpm build

# Prepare the standalone output with static files
# Use rsync -aL to dereference pnpm symlinks (critical for portable node_modules)
echo -e "${YELLOW}       Preparing standalone bundle...${NC}"
rsync -aL --ignore-errors .next/standalone/ dist-nextjs/ 2>/dev/null || true
rsync -aL .next/static/ dist-nextjs/.next/static/
rsync -aL public/ dist-nextjs/public/
rm -rf dist-nextjs/data

# Flatten pnpm's .pnpm/ structure into top-level node_modules.
# Phase 1+2 (inline): hoist a single version of each package to top level —
#   first from top-level packages' .pnpm entries (their dep versions win),
#   then everything else to fill gaps.
# Phase 3 (scripts/nest-pnpm-deps.js): for every top-level package, copy its
#   specific siblings into {pkg}/node_modules/ when the hoisted version doesn't
#   match — fixes version-conflicting transitives (e.g. parse5@8 needs entities@8
#   but the hoisted entities may be @6 from another path).
echo -e "${YELLOW}       Flattening pnpm node_modules...${NC}"
node -e "
const fs = require('fs');
const path = require('path');
const pnpmDir = 'dist-nextjs/node_modules/.pnpm';
const topLevel = 'dist-nextjs/node_modules';
let count = 0;

function hoistFrom(nmDir) {
  if (!fs.existsSync(nmDir)) return;
  for (const pkg of fs.readdirSync(nmDir)) {
    if (pkg.startsWith('.')) continue;
    if (pkg.startsWith('@')) {
      const scopeDir = path.join(nmDir, pkg);
      if (!fs.statSync(scopeDir).isDirectory()) continue;
      for (const sub of fs.readdirSync(scopeDir)) {
        const dest = path.join(topLevel, pkg, sub);
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.cpSync(path.join(scopeDir, sub), dest, { recursive: true });
          count++;
        }
      }
    } else {
      const dest = path.join(topLevel, pkg);
      if (!fs.existsSync(dest)) {
        fs.cpSync(path.join(nmDir, pkg), dest, { recursive: true });
        count++;
      }
    }
  }
}

// Phase 1: hoist from top-level packages first (their dep versions take priority)
const topPkgs = fs.readdirSync(topLevel).filter(p => !p.startsWith('.'));
for (const pkg of topPkgs) {
  // Find this package's .pnpm entry and hoist its siblings
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith(pkg + '@')) continue;
    hoistFrom(path.join(pnpmDir, entry, 'node_modules'));
    break;
  }
}

// Phase 2: hoist everything else (fills gaps)
for (const entry of fs.readdirSync(pnpmDir)) {
  hoistFrom(path.join(pnpmDir, entry, 'node_modules'));
}

console.log('         Hoisted ' + count + ' packages');
"

node scripts/nest-pnpm-deps.js

# Next.js traces native modules from the host install, whose Node ABI may differ
# from the Node runtime bundled with the desktop app.
BETTER_SQLITE3_SOURCE_DIR="$(dirname "$(node -p "require.resolve('better-sqlite3/package.json')")")"
PREBUILD_INSTALL_BIN="$(realpath "$BETTER_SQLITE3_SOURCE_DIR/../prebuild-install/bin.js")"
STAGED_BETTER_SQLITE3_DIR="$PROJECT_DIR/dist-nextjs/node_modules/better-sqlite3"

(
  cd "$STAGED_BETTER_SQLITE3_DIR"
  "$PROJECT_DIR/dist-node/bin/node" "$PREBUILD_INSTALL_BIN"
)

STAGED_BETTER_SQLITE3_BINARY="$STAGED_BETTER_SQLITE3_DIR/build/Release/better_sqlite3.node"
while IFS= read -r traced_binary; do
  if [ "$traced_binary" != "$STAGED_BETTER_SQLITE3_BINARY" ]; then
    cp "$STAGED_BETTER_SQLITE3_BINARY" "$traced_binary"
  fi
done < <(
  find "$PROJECT_DIR/dist-nextjs" \
    -type f \
    -path '*/better-sqlite3*/build/Release/better_sqlite3.node'
)

"$PROJECT_DIR/dist-node/bin/node" -e "
const Database = require('$STAGED_BETTER_SQLITE3_DIR');
const database = new Database(':memory:');
database.prepare('SELECT 1').get();
database.close();
"

# Step 4: Compile Electron TypeScript
echo -e "\n${YELLOW}[4/5] Compiling Electron...${NC}"
pnpm run build:electron

# Step 5: Package with electron-builder
echo -e "\n${YELLOW}[5/5] Packaging with electron-builder...${NC}"
rm -rf dist

if [ "$1" = "--no-dmg" ]; then
  npx electron-builder --mac --arm64 --dir
else
  npx electron-builder --mac --arm64
fi

echo -e "\n${GREEN}Build complete!${NC}"
echo -e "App: ${YELLOW}dist/mac-arm64/InkVoice.app${NC}"
ls -lh dist/*.dmg 2>/dev/null || true
