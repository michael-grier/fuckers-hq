---
name: visual-qa
description: Visually verify user-visible pages, components, responsive layout, copy placement, and interactive states after implementation or review. Capture and inspect screenshots at mobile, tablet, laptop, and desktop widths; use the authenticated mode for Clerk admin pages.
---

# Visual QA

Confirm user-visible work by looking at it. A passing render or browser test proves behavior, not
layout. Capture the affected states, inspect every image, fix visible defects, and repeat until the
latest run is clean.

## Choose the capture path

- Public or static routes: `bun run visual-check /route-a /route-b`.
- Clerk-protected initial page states: `bun run visual-check --auth admin /admin/route`.
- State behind interaction, such as dialogs, dirty forms, pending buttons, and hover: use the T3
  preview first. If it is unavailable, use the authenticated Playwright browser path. Exercise the
  state and capture the same four widths.

The command starts the current worktree on an available loopback port. Pass `--base <url>` only
when deliberately targeting an existing local server. Admin mode uses the configured development
Clerk E2E user and refuses remote targets or live Clerk credentials.

Screenshots land in `.visual-check/` at mobile 390, tablet 768, laptop 1366, and desktop 1920
widths. `report.json` records routes, response status, console errors, screenshots, and failures.
If Chromium is missing, run `bun x playwright install chromium` once and retry.

## Inspect

Read `report.json`, then open every PNG. At each width check:

- horizontal overflow, clipping, overlap, truncation, and distorted images;
- aligned edges, consistent gutters, clean wrapping, and adequate mobile spacing;
- heading, price, action, and reading-order hierarchy;
- responsive changes such as collapsed columns and mobile navigation;
- readable contrast and line lengths;
- browser console and page errors from the report.

Pages render the current worktree database. Seed disposable test data when a populated or empty
state is needed.

## Finish

Fix defects, rerun the same scenarios, and inspect the new images. In the final summary, name the
routes or states and widths inspected. Delete `.visual-check/` after reporting.
