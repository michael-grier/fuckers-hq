---
name: visual-qa
description: Visually verify UI work instead of asking the user to smoke test. Use after implementing, fixing, or reviewing anything user-visible — pages, layout, styling, components, copy placement — to capture screenshots at mobile, tablet, laptop, and desktop widths, then view and judge them.
---

# Visual QA

Confirm UI changes by looking at them. A passing render test proves the component mounts; it does
not prove the page looks right. Capture screenshots, read them as images, judge them, fix what you
see, and repeat until clean — then report what you verified with your own eyes.

## Capture

1. Identify every route affected by the change, including pages that merely include a changed
   shared component (nav, footer, cards).
2. Run `bun run visual-check /route-a /route-b ...`. It reuses a dev server already on :3000 or
   boots one on :4310, screenshots each route full-page at mobile (390), tablet (768), laptop
   (1366), and desktop (1920) widths into `.visual-check/`, and prints browser console and page
   errors. The output directory is wiped on each run, so everything in it is current.
3. If Chromium is missing, run `bun x playwright install chromium` once and retry.

## Judge

Read every PNG with the Read tool — actually look at each one; do not skim filenames. At each
breakpoint check:

- **Breakage**: horizontal overflow or scrollbars, clipped or overlapping elements, text
  truncation mid-word, images stretched or squashed, controls pushed off-screen.
- **Alignment and spacing**: edges that should line up, consistent gutters and padding, grid items
  wrapping cleanly, nothing crowding the viewport edge on mobile.
- **Hierarchy and flow**: the most important element reads first; headings, prices, and CTAs keep
  sensible size relationships as the viewport shrinks; reading order still makes sense after
  columns stack.
- **Responsive intent**: layouts actually adapt (columns collapse, nav switches to its mobile
  form) rather than just shrinking; touch targets stay usable at mobile width.
- **Readability**: sufficient contrast, no text over busy imagery without treatment, line lengths
  reasonable on desktop.
- **Console errors** printed by the script — hydration mismatches often show up here before they
  show up visually.

## Fix and re-verify

Fix what you found, re-run the same command, and re-read the images. Only claim a visual check
passed after a run whose screenshots you viewed showed no issues.

## Limits

- Clerk-protected routes (e.g. `/admin/...`) screenshot as the sign-in redirect. To judge those,
  drive an authenticated browser session (T3 Code preview or Playwright MCP tools) — resize,
  screenshot, and judge with the same checklist above.
- The script captures static page loads. For state behind interaction (dialogs, hover, cart
  sidebar, form validation), use the interactive browser tools the same way: perform the
  interaction, resize across the same four widths, screenshot, judge.
- Pages render whatever the current database holds; if a page needs data to be meaningful, seed it
  first (`bun run db:seed`) and consider judging both populated and empty states.

## Report

In your summary, state which routes and breakpoints you inspected and what you concluded, so the
user knows visual verification happened and does not need to smoke test manually. Then delete the
screenshots (`rm -rf .visual-check`) — they have served their purpose, and the next run regenerates
them from scratch anyway.
