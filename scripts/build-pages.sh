#!/usr/bin/env bash
# Assemble the GitHub Pages site into $1 (default _site): `main` at the root,
# plus every open same-repo PR at pr/<number>/, plus a pr/ index page that
# lists them. Run by .github/workflows/deploy.yml; needs `gh` with a token
# and a full-enough clone to `git fetch` PR heads.
#
# Saves stay apart because shared/storage.js prefixes keys with pr-<n> when
# the page is served from under pr/<n>/ — same origin, separate namespace.
set -euo pipefail

out=${1:-_site}
repo=${GITHUB_REPOSITORY:-DanielShaulov/playground}
rm -rf "$out" && mkdir -p "$out/pr"

git archive HEAD | tar -x -C "$out"

# Only this repo's own branches: a fork's PR would put a stranger's page on
# our origin, next to our saves.
gh api "repos/$repo/pulls?state=open&per_page=100" --jq \
  ".[] | select(.head.repo.full_name == \"$repo\") | [.number, .head.sha, .title] | @tsv" \
  >"$out/pr/.list"

items=""
while IFS=$'\t' read -r num sha title; do
  [ -n "$num" ] || continue
  git fetch -q --depth 1 origin "pull/$num/head"
  mkdir -p "$out/pr/$num"
  git archive FETCH_HEAD | tar -x -C "$out/pr/$num"
  # A branch cut before previews existed has the old storage.js, which would
  # read and write main's saves. Give it main's.
  st="$out/pr/$num/shared/storage.js"
  if [ -f "$st" ] && ! grep -q 'pr-\$' "$st"; then cp shared/storage.js "$st"; fi
  title=$(printf '%s' "$title" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
  items+="<li><a href=\"$num/\"><b>#$num</b> $title</a> <small>${sha:0:7}</small></li>"
  echo "pr/$num <- $sha"
done <"$out/pr/.list"
rm "$out/pr/.list"

[ -n "$items" ] || items="<li>No open PRs.</li>"
cat >"$out/pr/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PR previews</title>
<style>
  body { font: 17px/1.4 system-ui, sans-serif; margin: 0; padding: 20px 16px; background: #15130f; color: #eee; }
  ul { list-style: none; padding: 0; }
  li { margin: 0 0 10px; }
  a { display: block; padding: 14px; border-radius: 10px; background: #2a251d; color: inherit; text-decoration: none; }
  small { opacity: .5; }
</style>
</head>
<body>
<h1>PR previews</h1>
<p>Each one keeps its own saves. <a href="../" style="display:inline;padding:0;background:none;text-decoration:underline">main</a></p>
<ul>$items</ul>
</body>
</html>
HTML
