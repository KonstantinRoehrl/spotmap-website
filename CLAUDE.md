# spotmap-website — project instructions

The Angular app lives in `spotmap-website/` (nested under the repo root). Run app
commands (`npm`, `ng`, tests) from there; run graphify from the repo root.

## Knowledge graph (graphify)

This repo keeps a **committed** graphify knowledge graph in `graphify-out/`
(`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `manifest.json`, `cache/`). It is
version-controlled on purpose:

- **Do not gitignore the graph.** Only the machine-specific sidecars are ignored
  (see `graphify-out/.gitignore`); the graph outputs are tracked.
- **Reuse it.** Answer questions about the codebase from the existing graph
  (`/graphify query "…"`) instead of rebuilding from scratch.

**Keep it up to date.** After any substantial code change — multi-file edits,
adding/removing components, refactors — regenerate the graph and commit it **in the
same change** so it never goes stale:

1. `/graphify . --update` from the repo root (re-extracts only changed files; a full
   `/graphify .` is fine if no graph exists yet).
2. `git add graphify-out/ && git commit` together with the code change.

Notes:
- **Scope is locked** by `.graphifyignore`: the graph covers the Angular app plus the
  real docs (`DESIGN.md`, `PRODUCT.md`, `README.md`, `docs/`, `public/icon*.png`) and
  excludes process scaffolding (`.superpowers/`, `.claude/`, `.impeccable/`). Keep that
  exclusion — don't re-add scaffolding when regenerating.
- graphify runs under a **dedicated conda env**; `graphify` is not on the base PATH.
  The interpreter path is recorded in `graphify-out/.graphify_python` (git-ignored,
  machine-specific) — activate that env or use the recorded interpreter.
