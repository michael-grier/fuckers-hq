# Migration runbook

How Drizzle migrations in `drizzle/` reach the production database, and what to do when one
fails. Per-migration notes for risky changes live alongside this file as `NNNN-<name>.md`; keep
writing those for any migration with a backfill, a guard, or a nontrivial rollback.

## Automated path to production

Migrations are applied by CI, not by hand. On every push to `main`, the
[`Deploy Production`](../../.github/workflows/deploy-production.yml) workflow:

1. Confirms `PRODUCTION_DATABASE_URL` points at the configured production Neon endpoint.
2. Runs `bun run db:migrate` against the production database. The migrator logs which
   migrations are pending, applies them, and is safe to re-run — an up-to-date database is a
   no-op.
3. Only if that succeeds, deploys the same commit to Vercel with the CLI. Vercel runs the same
   endpoint check against its pooled `DATABASE_URL` before building.

This enforces the load-bearing ordering: the application version reaches production only after
the schema it expects. A failed or aborting migration fails the workflow run — visible as a red
`Deploy Production` run on `main` — and no deploy happens, so production keeps serving the
previous application version against the previous schema.

`vercel.json` disables Vercel's git-driven deploys of `main` (`git.deploymentEnabled`), so the
workflow is the only production deploy path and cannot race Vercel's own promotion. Pull-request
preview deploys are unaffected.

Concurrent merges are safe: the workflow uses a queued (non-cancelling) concurrency group, so
runs never overlap, and a superseded queued run is dropped in favor of the newer commit, which
already contains the earlier merge's migrations.

The workflow log for each run is the audit trail of which migrations ran against production,
when, and whether they succeeded.

### Required repository secrets

Held only as GitHub Actions secrets — never in a developer shell, `.env` file, or transcript:

| Secret | Value |
| --- | --- |
| `PRODUCTION_DATABASE_URL` | Direct (non-pooled) connection string for the production Neon branch |
| `VERCEL_TOKEN` | Vercel deploy token |
| `VERCEL_ORG_ID` | Vercel team/org ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

The repository variable `PRODUCTION_NEON_ENDPOINT_ID` holds the production branch's non-secret
`ep-...` endpoint ID. Set the same Production-only variable in Vercel. The migration URL may be
direct and the Vercel URL pooled; the guard removes Neon's `-pooler` suffix before comparing them.

The application build runs on Vercel with the project's own environment variables; the CI runner
never holds application secrets beyond the deploy token and the database URL used by the
migrate job.

## When a guarded migration aborts

Some migrations deliberately refuse to guess — `0011_product-subcategories.sql` aborts and names
every product it cannot classify rather than inferring a subcategory. When such a guard fires in
CI:

1. Read the failed `Migrate production database` job log. The guard's error message names the
   offending rows.
2. Do not retry, weaken the guard, or apply the migration by hand. Production is safe: the
   deploy was blocked, so the running application still matches the running schema.
3. Fix forward with a reviewed change — either a data fix for the named rows or a follow-up PR
   extending the migration's explicit mapping, exactly as the preflight section of the
   migration's own doc describes.
4. Once the fix has landed on `main` (or the data fix is applied), re-run the failed run from
   the Actions tab, or dispatch the workflow manually on `main` — the workflow refuses to run
   on any other ref, so a dispatch cannot ship an unmerged branch to production. The migrator
   picks up where it left off.

## Dev branch

The Neon dev branch is not covered by the workflow. It is migrated manually during development
and review, as before — typically against a disposable branch first, then the shared dev branch.
The drift risk that motivated automation ran the other way: dev ahead of production. With
production applied on every merge, the two converge on each merge to `main`.

## Destructive changes: expand/contract across two releases

The automated path removes the human from the loop, so a migration must be compatible with the
application version running *while it applies*. Additive changes (new nullable columns, new
tables, new indexes) always are. Tightening or destructive changes (`NOT NULL`, new check
constraints on existing writes, dropping or renaming columns) generally are not — 0011 broke the
old version's product creates (`23502`) and category-changing updates (`23514`) during the
window between migrating and deploying.

Split such changes across two releases:

1. **Expand.** Add the new column nullable, backfill, and ship the application version that
   writes both shapes. Both the old and new versions work against this schema, so the
   migrate-then-deploy window is harmless.
2. **Contract.** In a later PR, once no version that omits the new shape is running, enforce
   `NOT NULL`, add the constraint, or drop the old column.

The staged rollback documented in
[0011-product-subcategories.md](0011-product-subcategories.md) (relax → deploy → drop) is the
same shape in reverse. A single-release tightening migration like 0011 itself is acceptable only
when the affected writes are admin-only and low volume, the window is kept short, and the
migration doc says so explicitly.
