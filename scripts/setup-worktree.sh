#!/usr/bin/env bash
# Prepares a linked worktree: links the main checkout's .env.local, then provisions a
# per-worktree Neon branch database via scripts/worktree-db.ts.
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

# Every linked worktree writes through to this one file, so `cp`, `>`, and `>>` from any of
# them would rewrite the credentials all the others read. Dropping write permission blocks
# that in the kernel, which covers every tool and agent harness rather than just the ones
# that honour a config file. Reads are unaffected, so the dev server and build still work.
harden_shared_env() {
  if [ -w "$source_env" ]; then
    chmod a-w "$source_env" && echo "Made $source_env read-only (chmod +w to rotate credentials)."
  fi
}

link_env() {
  # A link whose target has since been deleted or moved holds no data, and reporting success
  # would leave the worktree with an env the app cannot read. Clear it so the checks below
  # either relink or print how to restore the shared file.
  if [ -L "$target" ] && [ ! -e "$target" ]; then
    echo "Removing dangling symlink $target -> $(readlink "$target")." >&2
    rm "$target"
  fi

  if [ -L "$target" ]; then
    echo "$target is already linked; leaving it unchanged."
    harden_shared_env
    return 0
  fi

  if [ -e "$target" ]; then
    # A real file here is a deliberate per-worktree override, so the shared file is not in play.
    echo "$target already exists as a regular file; leaving it unchanged."
    return 0
  fi

  if [ ! -f "$source_env" ]; then
    echo "No .env.local in the main checkout ($main_root)." >&2
    # Absolute paths matter: a relative copy would land in this worktree, and the
    # already-exists guard above would then skip linking on every later run.
    echo "Create one there first: cp \"$main_root/.env.example\" \"$source_env\"" >&2
    return 1
  fi

  ln -s "$source_env" "$target"
  echo "Linked $target -> $source_env"
  harden_shared_env
}

link_env

# Give this worktree its own Neon branch database so its migration lineage cannot collide
# with other worktrees through the shared DATABASE_URL. Warns and leaves the shared
# behaviour in place when Neon credentials are absent from .env.local.
cd "$worktree_root"
bun scripts/worktree-db.ts setup
