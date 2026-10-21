# Integration, round 2 (2026-10-21)

Round 2 had no separate integration agent: the three parts were already wired in round 1 and
the round-2 changes were fixes. This note records what changed, what was checked, and the one
session outside the test profiles.

## Changes (see docs/critics/r2/fix-p3.md, fix-p4.md, fix-p5.md)

| Area | Change | Evidence |
| --- | --- | --- |
| Matcher | default limit 100 -> 1000; "!" on coconutb lists all 227 commands | fix-p4.md, docs/recordings/ours-bang-* |
| Popup look | 1 px frame in the selected-bar colour, 6 px radius (measured on the reference), 8 px row inset, no shadow; empty alias span hidden | fix-p4.md, docs/critics/r2/p4-critic.md |
| Popup mount | host, shadow root, stylesheet and 13 row nodes mount when the input attaches, not on the first "!" | src/content/controller.ts setInput, fix-p4.md timings |
| Recorder | "click outside" probe clicks 10 px above the popup; the Slate placeholder is not a row | tools/pw/record.mjs, docs/critics/r2/rec-p3-probe |
| Firefox evidence | coconutb re-run with per-channel screenshot names and a console heartbeat (content and background) | docs/critics/r2/ff-coconutb-*.png, docs/critics/r2/logs/ff-coconutb.log |
| 7TV Tab completion | tried with and without ours: "ee" + Tab nothing, "d" + Tab completes an emote in both | docs/part3-notes.md "Round 2", docs/critics/r2/p3-7tv-tab-*.png |
| Docs | README claims rewritten to the recorded facts, evidence logs copied into docs/critics/r1/logs with the repo path scrubbed, LICENSE (MIT, "the 7tv-cmd authors") | fix-p5.md |
| Test runner | npm run test:browser builds the fixture page first (scripts/test-browser.mjs); 7TV setups skip without vendor/7tv-patched | package.json, test/browser/harness.ts |
| Hygiene | workflow scripts take root and identity strings from args; no machine path or owner string in the repo | scripts/workflows/*.js |

## Checks (docs/critics/r2/checks.md, re-run by the main loop after the last fix)

typecheck, build, lint (0 errors, 0 warnings), unit (409), zip, 1 minute soaks with and without
7TV (0 extension errors), Firefox live: all exit 0. The round-2 browser run was red on one stale
assertion (keyboard.spec.ts still expected the old 100-row cap); after the assertion moved to
1000 the suite was re-run by the main loop: see docs/critics/r2/logs/test-browser-r3.log.

## Owner session (outside the test profiles)

With the owner's words, the round-1 build was loaded as a temporary add-on in the owner's own
logged-in Firefox (hosted 7TV installed) and used on the owner's own channel: "!" listed the
channel's commands inside 7TV's wrapped input, a short query ranked prefix matches first, Tab
inserted the command, Enter sent it and the channel's bot answered in chat; 7TV's ":" emote list
still opened.
The Browser Console (parent process) held no entry for this add-on. Screenshots show the
owner's channel and stay outside the repo. This was the first test of the hosted 7TV build and
of a logged-in session.

## Not covered in round 2

A 5 minute soak (the final critic runs it), Firefox visual check of the frame, the below-input
fallback, hover selection, a headed browser, a second channel in Chromium (Twitch's logged-out
chat-rules dialog), npm run start:firefox.
