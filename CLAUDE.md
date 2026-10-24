# spotmap-website — project instructions

The Angular app lives in `spotmap-website/` (nested under the repo root). Run app
commands (`npm`, `ng`, tests) from there; run graphify from the repo root.

## Knowledge graph (graphify)

This repo generates a graphify knowledge graph in `graphify-out/` (`graph.json`,
`graph.html`, `GRAPH_REPORT.md`, `manifest.json`, `cache/`), but it is **not
version-controlled**: the whole directory is gitignored, generated locally, and
never committed.

- **Reuse it.** Answer questions about the codebase from the existing local graph
  (`/graphify query "…"`) instead of rebuilding from scratch.
- **Keep it up to date locally.** After any substantial code change — multi-file
  edits, adding/removing components, refactors — regenerate it so it doesn't go
  stale: `/graphify . --update` from the repo root (re-extracts only changed files;
  a full `/graphify .` is fine if no graph exists yet). Do not `git add` or commit
  `graphify-out/`.

Notes:
- **Scope is locked** by `.graphifyignore`: the graph covers the Angular app, its
  spot source registry and per-city reports (`spotmap-website/data/spots/sources.json`
  and `*.report.json`; graphify does not ingest the `.geojson` files), and the real
  docs (`DESIGN.md`, `PRODUCT.md`, `README.md`,
  the tracked notes under `docs/devcycle/maintenance-findings/`, `public/icon*.png`).
  It excludes process scaffolding (`.superpowers/`, `.claude/`, `.impeccable/`,
  `.devcycle/`), planning artifacts (`docs/superpowers/`), local audits
  (`docs/audits/`), per-session on-device notes, the bundled snapshots
  (`spotmap-website/public/spots/`) and the local spot photos
  (`spotmap-website/data/thumbs/` and the city folders under
  `spotmap-website/data/spots/`). The photos need their own entry because git
  ignores them only through the app's nested `.gitignore`, which graphify does not
  read. Keep these exclusions when regenerating.
- graphify runs under a **dedicated conda env**; `graphify` is not on the base PATH.
  The interpreter path is recorded in `graphify-out/.graphify_python` (git-ignored,
  machine-specific) — activate that env or use the recorded interpreter.
