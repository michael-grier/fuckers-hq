#!/usr/bin/env bash
# Links the main checkout's .env.local into a linked worktree.
#
# .env.local is gitignored, so `git worktree add` produces a checkout with no local
# environment. Next.js only loads env files from its own project root, so without this
# the app boots with an empty NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and ClerkProvider throws
# "Missing publishableKey".
set -euo pipefail

worktree_root=$(git rev-parse --show-toplevel)
# The common dir is always inside the main checkout, even when run from a linked worktree.
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

if [ "$worktree_root" = "$main_root" ]; then
  echo "Already in the main checkout; nothing to link."
  exit 0
fi

target="$worktree_root/.env.local"
source_env="$main_root/.env.local"

if [ -e "$target" ] || [ -L "$target" ]; then
  echo "$target already exists; leaving it unchanged."
  exit 0
fi

if [ ! -f "$source_env" ]; then
  echo "No .env.local in the main checkout ($main_root)." >&2
  echo "Create one there first: cp .env.example .env.local" >&2
  exit 1
fi

ln -s "$source_env" "$target"
echo "Linked $target -> $source_env"
