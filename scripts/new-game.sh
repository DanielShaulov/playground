#!/usr/bin/env bash
# Scaffold a new game: creates games/<id>/ from the template and registers it
# in games.js so it appears on the launcher.
#
#   scripts/new-game.sh snake "Snake" "🐍" "The classic, with swipe controls."

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

id="${1:-}"
title="${2:-}"
icon="${3:-🎮}"
blurb="${4:-A new game.}"

if [[ -z "$id" || -z "$title" ]]; then
  echo "usage: scripts/new-game.sh <id> <title> [icon] [blurb]" >&2
  echo "  id must be kebab-case, e.g. 'flappy-thing'" >&2
  exit 1
fi

if [[ ! "$id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: id must be kebab-case (lowercase letters, digits, hyphens)" >&2
  exit 1
fi

dir="$ROOT/games/$id"
if [[ -e "$dir" ]]; then
  echo "error: $dir already exists" >&2
  exit 1
fi

mkdir -p "$dir"
sed "s/__TITLE__/$title/g" "$ROOT/scripts/template/index.html" > "$dir/index.html"
sed -e "s/__TITLE__/$title/g" -e "s/__ID__/$id/g" "$ROOT/scripts/template/game.js" > "$dir/game.js"

# Insert a registry entry just before the closing bracket of GAMES.
node - "$ROOT/games.js" "$id" "$title" "$icon" "$blurb" <<'NODE'
const fs = require("fs");
const [file, id, title, icon, blurb] = process.argv.slice(2);
const src = fs.readFileSync(file, "utf8");
const entry =
  `  {\n` +
  `    id: ${JSON.stringify(id)},\n` +
  `    title: ${JSON.stringify(title)},\n` +
  `    blurb: ${JSON.stringify(blurb)},\n` +
  `    icon: ${JSON.stringify(icon)},\n` +
  `  },\n`;
const close = src.lastIndexOf("];");
if (close === -1) throw new Error("could not find the end of GAMES in games.js");
fs.writeFileSync(file, src.slice(0, close) + entry + src.slice(close));
NODE

echo "created games/$id/"
echo "registered in games.js"
echo
echo "next: npm start   →   http://localhost:8000/games/$id/"
