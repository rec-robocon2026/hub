// The tooling the hub commits into every season repo: hub.sh, VS Code auto-start, line-ending rules.
// These are "managed" files — the hub rewrites them on sync, so fixes reach everyone.
// (hub.sh is kept free of backticks and "${" so it can live in a String.raw template.)

import type { RepoFile } from "@/lib/scaffold";

const SCRIPT = String.raw`#!/usr/bin/env bash
# Robocon Hub helper. Managed by the hub - edits here are overwritten on the next sync.
#
#   ./hub.sh start               get the latest version (VS Code runs this for you on open)
#   ./hub.sh propose "message"   send your changes to a lead for review
#   ./hub.sh status              see what's waiting and what a lead said
#
set -u
HUB="__HUB_URL__"
KEY_FILE="$HOME/.robocon-hub-key"

say() { printf '%s\n' "$*"; }
die() { printf '\n  x %s\n\n' "$*" >&2; exit 1; }

top=$(git rev-parse --show-toplevel 2>/dev/null) || die "Run this inside the season repo folder (the one VS Code opened)."
cd "$top" || exit 1

key() {  # prints the key; any prompt goes to the screen (stderr), not into the key
  if [ ! -s "$KEY_FILE" ]; then
    say "" >&2
    say "  First time on this computer." >&2
    say "  In the hub: Members -> Your terminal key -> Create, then paste it here." >&2
    printf '  Key: ' >&2
    read -r k
    [ -n "$k" ] || die "No key given."
    printf '%s' "$k" > "$KEY_FILE"
    chmod 600 "$KEY_FILE" 2>/dev/null
  fi
  cat "$KEY_FILE"
}

json() {  # escape a string for JSON
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r//g' | awk 'BEGIN { ORS = "" } NR > 1 { printf "\\n" } { print }'
}

repo_name() { git remote get-url origin 2>/dev/null | sed -E -e 's#\.git$##' -e 's#^.*github\.com[:/]##'; }
here() { pwd -W 2>/dev/null || pwd; }

RESP=""
call() {  # POST a JSON file to the hub; the reply is KEY=VALUE lines
  k=$(key) || exit 1
  RESP=$(curl -sS -X POST "$HUB$1" -H "Authorization: Bearer $k" -H "Content-Type: application/json" --data-binary "@$2") \
    || die "Couldn't reach the hub ($HUB). Check your internet and try again."
  if printf '%s\n' "$RESP" | grep -q '^KEY_INVALID=1'; then
    rm -f "$KEY_FILE"
    die "The hub didn't accept your terminal key. Make a new one in the hub (Members -> Your terminal key), then run this again."
  fi
  if printf '%s\n' "$RESP" | grep -q '^ERROR='; then
    printf '\n' >&2
    printf '%s\n' "$RESP" | sed -n 's/^ERROR=/  x /p' >&2
    printf '\n' >&2
    exit 1
  fi
}
val() { printf '%s\n' "$RESP" | sed -n "s/^$1=//p" | head -n 1; }
tell() { printf '%s\n' "$RESP" | sed -n 's/^SAY=/  /p'; }

tidy_branches() {  # drop local copies of requests that were merged or closed
  git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads 2>/dev/null \
    | awk '$2 == "[gone]" { print $1 }' | while read -r b; do git branch -q -D "$b" 2>/dev/null; done
}

cmd_start() {
  git fetch -q --prune origin || die "Couldn't reach GitHub. Check your internet, then run ./hub.sh start again."
  branch=$(git rev-parse --abbrev-ref HEAD)
  dirty=false
  [ -n "$(git status --porcelain)" ] && dirty=true
  tmp=$(mktemp)
  printf '{"repo":"%s","hostname":"%s","path":"%s","branch":"%s","dirty":%s}' \
    "$(json "$(repo_name)")" "$(json "$(hostname)")" "$(json "$(here)")" "$(json "$branch")" "$dirty" > "$tmp"
  call /api/cli/start "$tmp"
  rm -f "$tmp"

  target=$(val SWITCH)
  if [ -n "$target" ] && [ "$target" != "$branch" ]; then
    if [ "$dirty" = true ]; then
      say ""
      say "  ! You have changes that haven't been proposed yet:"
      git status --short | sed 's/^/      /'
      say "    Send them first:  ./hub.sh propose \"what you did\""
      say "    (staying where you are so nothing is lost)"
    elif git show-ref -q --verify "refs/remotes/origin/$target"; then
      git checkout -q -B "$target" "origin/$target" && git branch -q --set-upstream-to="origin/$target" 2>/dev/null
    fi
  else
    git merge -q --ff-only "@{u}" 2>/dev/null || git pull -q --ff-only --autostash 2>/dev/null || true
  fi
  tidy_branches
  say ""
  tell
  say ""
}

cmd_propose() {
  title="$*"
  [ -n "$title" ] || die 'Say what you did, e.g.  ./hub.sh propose "fix servo limits"'
  branch=$(git rev-parse --abbrev-ref HEAD)
  git fetch -q origin 2>/dev/null
  # Measure from the last commit GitHub also has, so commits made with VS Code's Commit button are included.
  base=$(git merge-base HEAD "@{u}" 2>/dev/null || git merge-base HEAD origin/HEAD 2>/dev/null || git rev-parse HEAD)

  git add -A
  list=$(mktemp)
  git diff --cached --name-status --no-renames -z "$base" > "$list"
  if [ ! -s "$list" ]; then
    rm -f "$list"
    die "Nothing to propose - you haven't changed any files."
  fi

  say ""
  say "  Changes to send:"
  git diff --cached --name-status --no-renames "$base" | sed 's/^/      /'
  printf '  Anything the lead should know? (Enter to skip): '
  read -r notes

  body=$(mktemp)
  printf '{"repo":"%s","branch":"%s","base":"%s","title":"%s","notes":"%s","hostname":"%s","path":"%s","files":[' \
    "$(json "$(repo_name)")" "$(json "$branch")" "$base" "$(json "$title")" "$(json "$notes")" \
    "$(json "$(hostname)")" "$(json "$(here)")" > "$body"
  first=1
  while IFS= read -r -d '' status && IFS= read -r -d '' path; do
    [ $first = 1 ] || printf ',' >> "$body"
    first=0
    if [ "$status" = "D" ]; then
      printf '{"path":"%s","base64":null}' "$(json "$path")" >> "$body"
    else
      printf '{"path":"%s","base64":"' "$(json "$path")" >> "$body"
      git show ":$path" | base64 | tr -d '\n\r' >> "$body"
      printf '"}' >> "$body"
    fi
  done < "$list"
  printf ']}' >> "$body"
  rm -f "$list"

  size=$(wc -c < "$body")
  if [ "$size" -gt 4000000 ]; then
    rm -f "$body"
    git reset -q
    die "That's too big to send through the hub (over 4 MB). Big CAD files belong on the drive - upload STEP/PDF exports on the hub instead."
  fi

  say "  Sending..."
  call /api/cli/propose "$body"
  rm -f "$body"

  newb=$(val BRANCH)
  git fetch -q origin "$newb" || die "Sent, but couldn't fetch it back. Run ./hub.sh start."
  if [ "$branch" != "$newb" ]; then git checkout -q -b "$newb" 2>/dev/null || git checkout -q "$newb"; fi
  git reset -q "origin/$newb"
  git branch -q --set-upstream-to="origin/$newb" 2>/dev/null
  say ""
  tell
  say ""
}

cmd_status() {
  tmp=$(mktemp)
  printf '{"repo":"%s","branch":"%s"}' "$(json "$(repo_name)")" "$(json "$(git rev-parse --abbrev-ref HEAD)")" > "$tmp"
  call /api/cli/status "$tmp"
  rm -f "$tmp"
  say ""
  tell
  say ""
}

case "\${1:-}" in
  start) cmd_start ;;
  propose) shift; cmd_propose "$@" ;;
  status) cmd_status ;;
  *)
    say ""
    say "  ./hub.sh start               get the latest version"
    say "  ./hub.sh propose \"message\"   send your changes to a lead"
    say "  ./hub.sh status              what's waiting, what a lead said"
    say ""
    ;;
esac
`;

const TASKS = `{
  // Managed by the Robocon Hub: opening this folder runs ./hub.sh start.
  // VS Code asks once to "Allow automatic tasks" — choose Allow.
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Robocon Hub: start",
      "type": "shell",
      "command": "bash ./hub.sh start",
      "windows": {
        "command": "./hub.sh start",
        "options": { "shell": { "executable": "C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe", "args": ["-c"] }, "env": { "CHERE_INVOKING": "1" } }
      },
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "always", "panel": "dedicated", "clear": true },
      "problemMatcher": []
    }
  ]
}
`;

const SETTINGS = `{
  // Managed by the Robocon Hub: new terminals open in Git Bash on Windows, so ./hub.sh works.
  "terminal.integrated.defaultProfile.windows": "Git Bash"
}
`;

const GITATTRIBUTES = `# Managed by the Robocon Hub.
* text=auto
*.sh text eol=lf
`;

export const TOOLING_PATHS = ["hub.sh", ".vscode/tasks.json", ".vscode/settings.json", ".gitattributes"];

export function toolingFiles(hubUrl: string): RepoFile[] {
  return [
    { path: "hub.sh", content: SCRIPT.replace("__HUB_URL__", hubUrl.replace(/\/$/, "")).replace("\\${1:-}", "${1:-}"), executable: true },
    { path: ".vscode/tasks.json", content: TASKS },
    { path: ".vscode/settings.json", content: SETTINGS },
    { path: ".gitattributes", content: GITATTRIBUTES },
  ];
}
