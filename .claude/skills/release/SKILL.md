---
name: release
description: Cut a spotmap-website release (dev → main, tag, GitHub release). Use when the user asks to release, ship to production, merge dev into main, or tag a version. Walks the preflight that keeps the hosted Supabase project, the committed snapshots and the manual hosted settings in step with the code before `main` deploys.
---

# Releasing spotmap-website

Pushing to `main` deploys to GitHub Pages at once, but the hosted Supabase project is **not**
deployed by CI: its schema, data and settings are changed by hand. A release that skips the
preflight ships a site that calls database functions that do not exist yet (the app then quietly
serves the bundled snapshot, so nothing looks broken). v0.3.0 shipped that way; this skill exists
so it cannot happen again.

Run every command from `spotmap-website/` (the app directory) unless it says otherwise. Work in
order. Do not open the release PR until the preflight is fully ticked.

## 1. Scope the release

```bash
git fetch origin --tags
LAST=$(git describe --tags --abbrev=0 origin/main)
git log --format='%s' "$LAST"..origin/dev
git diff --stat "$LAST" origin/dev -- supabase tools data public/spots src/environments
```

- Version: a `feat` in the log means a minor bump, only `fix`/`perf` a patch, a breaking change a
  major. Confirm the number with the user if there is any doubt.
- `dev` must be green: `gh run list --branch dev --limit 3`.

## 2. Preflight: the hosted Supabase project

The project ref is in `supabase/.temp/project-ref`; the API URL and publishable key are in
`src/environments/environment.prod.ts`. The CLI is `npx supabase` and must be logged in
(`npx supabase login`, the user can run it with `! npx supabase login`).

1. **Migrations.** List what the release adds, then compare with the hosted project:

   ```bash
   git diff --name-only "$LAST" origin/dev -- supabase/migrations
   npx supabase link --project-ref "$(cat supabase/.temp/project-ref)"
   npx supabase migration list      # every local row must also have a remote value
   ```

   Read each new migration for `drop`, `delete`, `truncate` or a column rename and tell the user
   what it destroys **before** pushing. Applying one changes production, so the user approves it:
   `npx supabase db push`. It must be done **before** the release PR is merged. New read
   functions sit beside the old ones, so the live site works before and after the push.

2. **Verify, do not trust.** Re-run `migration list`, then call each new public function through
   the REST API with the publishable key (a function the key may not call answers `401`, a missing
   one `404`/`PGRST202`):

   ```bash
   K=$(sed -n "s/.*publishableKey: '\([^']*\)'.*/\1/p" src/environments/environment.prod.ts)
   U=$(sed -n "s/.*const apiUrl = '\([^']*\)'.*/\1/p" src/environments/environment.prod.ts)
   curl -sS -X POST "$U/rest/v1/rpc/<function>" -H "apikey: $K" -H "Content-Type: application/json" -d '{"<param>":"<value>"}'
   ```

3. **Hosted settings a migration depends on.** When a migration adds a table or setting that needs
   data, the README's "The hosted project" steps are part of the release: `public.admins` row for
   the maintainer, Auth site URL and redirect allow-list, signups off, the magic-link email
   template (`supabase/templates/magic-link.html`), the ArcGIS key in `public.admin_settings`.
   Ask the user which are done; never assume.
4. **Data and snapshots.** If the sync tool, `data/spots` or a read function's output changed, run
   `npm run sync:supabase -- --hosted` and then `npm run snapshot:supabase -- --hosted`. The
   snapshots (`public/spots/`, including `index.json`) are committed, so the result goes into
   `dev` through its own PR **before** the release PR.
5. **Environment.** If `src/environments/environment.prod.ts` changed, confirm it points at the
   intended project.

## 3. Release PR

- Branch `dev` → `main`. Title is a Conventional Commit: `feat: release vX.Y.Z with <headline>`.
- Body in the style of PR #31: a `## Release vX.Y.Z` section with one bullet per user-visible
  change (PR numbers in brackets) and a `## Merge` section. List the migrations applied and the
  manual hosted steps done.
- Wait for all checks (`gh pr checks <n> --watch`), then squash-merge with the title as subject:
  `gh pr merge <n> --squash --subject "<title> (#<n>)" --body ""`. The user's permission settings
  may block the merge: if so, stop and ask rather than working around it.

## 4. Tag and publish

```bash
git fetch origin
SHA=$(git rev-parse origin/main)
gh run list --branch main --limit 2        # the Pages deploy must succeed
git tag -a vX.Y.Z "$SHA" -m "vX.Y.Z" && git push origin vX.Y.Z
```

Releases ship the deployed bundle and a checksum file:

```bash
git worktree add <scratchpad>/rel vX.Y.Z
cd <scratchpad>/rel/spotmap-website && npm ci && npm run build:pages
cd ../dist/spotmap-website && tar -czf <scratchpad>/assets/spotmap-website-vX.Y.Z-pages.tar.gz browser
cd <scratchpad>/assets && shasum -a 256 spotmap-website-vX.Y.Z-pages.tar.gz > SHA256SUMS
gh release create vX.Y.Z --draft --verify-tag --title "vX.Y.Z: <headline>" \
  --notes-file <notes.md> spotmap-website-vX.Y.Z-pages.tar.gz SHA256SUMS
gh release edit vX.Y.Z --draft=false --latest
gh release view vX.Y.Z --json isImmutable -q .isImmutable     # must print true
git worktree remove --force <scratchpad>/rel
```

Notes follow the v0.2.0 style: a one-line summary, `## What's in it` bullets, the live-site link,
and how to verify the tarball. If `isImmutable` prints `false`, the repository's "immutable
releases" setting is off (`gh api repos/KonstantinRoehrl/spotmap-website/immutable-releases`):
tell the user to enable it under Settings → General → Releases. It only applies to releases
published afterwards; never move or recreate a published tag.

## 5. Merge `main` back into `dev`

A direct push to `dev` is rejected by a repository rule, so use a PR with a **merge commit**:

```bash
gh pr create --base dev --head main --title "chore: merge main back into dev after vX.Y.Z" --body "<one line>"
gh pr checks <n> --watch
gh pr merge <n> --merge --subject "chore: merge main back into dev after vX.Y.Z (#<n>)" --body ""
```

Afterwards `git rev-list --count origin/dev..origin/main` must print `0`.

## Pitfalls seen

- A formatting check that exits non-zero must stop the chain: do not `;`-chain `prettier --check`
  before a commit.
- The Karma suite is slower on CI than locally; a per-city spec can hit Jasmine's 5 s default.
- Subject lines of every merge, squash and PR title must parse as Conventional Commits.
