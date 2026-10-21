# Pre-publish audit: store policy readiness

Scope: read `src/manifest.json`, `scripts/build.mjs`, `dist/firefox/manifest.json`, `dist/chrome/manifest.json`, `README.md`, `LICENSE`, `package.json`, `.gitignore`, `.gitattributes`, `tsconfig.json`, `docs/SPEC.md` sections 0, 1 and 9, the policy-related parts of `docs/LEDGER.md` (S20, round 0 -> 1, round 0), grepped `PROVIDERS.md` (ToS and rate-limit notes), the provider adapters in `src/providers/` and `src/action/index.ts` for what leaves the browser, and grepped `dist/` for remote-code and page-world patterns. Ran `npm run lint` (exit 0), `git ls-files --eol` on the build inputs, `git archive --format=zip HEAD | wc -c` (archive size only, nothing written) and checked that `web-ext` 10.8.0 knows `--upload-source-code`. Fetched 8 pages: https://extensionworkshop.com/documentation/publish/add-on-policies/ , https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ , https://extensionworkshop.com/documentation/publish/source-code-submission/ , https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/ , https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings , https://developer.chrome.com/docs/webstore/program-policies/policies , https://developer.chrome.com/docs/webstore/cws-dashboard-privacy , https://developer.chrome.com/docs/webstore/review-process . All pages were read through a summarising fetch tool; quotes below are the sentences it returned. Nothing in the repo was changed except this file.

## Findings

### POL-1 (major): data_collection_permissions "none" does not match what the extension transmits

File: `scripts/build.mjs:82` (also `docs/SPEC.md:521` "the extension collects nothing", LEDGER S20).

Claim: the Firefox manifest declares `data_collection_permissions { required: ["none"] }`, but every time the user opens a Twitch channel the extension sends that channel's login, taken from the URL of the page the user is visiting, to four third-party hosts: `src/providers/nightbot.ts:54` (URL path), `src/providers/streamelements.ts:67` (URL path), `src/providers/fossabot.ts:82` (URL path), `src/providers/moobot.ts:59` (POST body). Together with the user's IP address and the request time, each provider learns which channel this browser is viewing (once per channel per hour). That is information about a website the user visits.

Evidence:
- Mozilla defines the category: "Information about the websites users visit, such as specific URLs, domains" (browsingActivity), https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- Transmission is defined broadly: "any data collected, used, transferred, shared, or handled outside the add-on", same URL.
- Add-on Policies 6.2.1: "It must accurately state the data collection practices in the extension manifest", https://extensionworkshop.com/documentation/publish/add-on-policies/
- The fetched consent page lists no exception for public data or for requests needed for the core feature.
- Policy 6.1 allows it as core function: "The transmission of browsing activity is only permitted as part of the add-on's primary function." (same Add-on Policies URL), so declaring it is compatible with the feature.

Counter-reading (why this is major, not critical): the login is public and the request fetches public data, and `web-ext lint` accepts "none". But a reviewer who reads the adapters sees page-URL data going to third parties under a "collects no data" label, which is the inaccuracy 6.2.1 names; all add-ons, unlisted included, can be reviewed later (POL-5).

Fix: change the gecko block to `data_collection_permissions: { required: ["browsingActivity"] }` in `scripts/build.mjs:82`, and correct `docs/SPEC.md` section 9 and the LEDGER S20 wording ("collects nothing"). The built-in install prompt then shows the disclosure. Record the decision in `docs/LEDGER.md` either way; if the owner keeps "none", write down the reasoning (public data, no identity) so a reviewer question has an answer ready.

### POL-2 (major): README privacy section says the extension "sends nothing about you anywhere"

File: `README.md:105-107`.

Claim: the sentence is false as written. The extension sends the name of the channel you are viewing to Nightbot, StreamElements, Fossabot and Moobot servers, which also see your IP address (see POL-1). It does correctly say no login, cookies, tokens or chat messages are involved (`src/providers/merge.ts:129` uses `credentials: 'omit'`).

Evidence: "Prominently disclose what user data will be collected and how it will be used." https://developer.chrome.com/docs/webstore/program-policies/policies ; Mozilla 6.2.1 quoted in POL-1. The README is also the natural text for a privacy policy (POL-3), so an error here propagates.

Fix: replace with a plain statement, e.g. "When you open a channel's chat, the extension asks Nightbot, StreamElements, Fossabot and Moobot for that channel's public command list (at most once per channel per hour per provider). Those requests carry the channel name and, like any web request, your IP address. No Twitch login, cookies or tokens are sent; chat messages are never read or sent. Only the command cache is stored, in the browser."

### POL-3 (major, applies at the later Chrome Web Store step): no privacy policy exists

File: none (no privacy policy file or URL in the repo; `README.md:103-107` is the only privacy text).

Claim: the Chrome Web Store requires a posted privacy policy when user data is handled, and it restricts browsing-activity data to user-facing features. Under the reading in POL-1, sending the visited channel to third parties is such data.

Evidence:
- "If your Product handles any user data" ... "you must post an accurate and up to date privacy policy", https://developer.chrome.com/docs/webstore/program-policies/policies
- "Collection and use of web browsing activity is prohibited" (the tool returned this as an excerpt; the exception clause for user-facing features was not returned verbatim), same URL.
- The dashboard asks for the policy: "Add a link to the privacy policy for your extension." https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

For Firefox: the fetched Add-on Policies page (first 100000 of 100159 characters) and the signing overview did not mention a privacy-policy requirement, so none is shown as required for the unlisted channel here (see Not checked).

Fix: before a Chrome submission, add a short `PRIVACY.md` (the corrected POL-2 text plus "no analytics, no data sold or shared beyond the four provider requests") and use its GitHub URL in the dashboard; in the privacy practices tab tick the category that covers visited pages and describe the feature as the reason. Not needed for the unlisted AMO signing.

### POL-4 (minor): source-code instructions are not enough for a reviewer to rebuild byte-for-byte

File: `README.md:25` and `README.md:48-53`; `package.json` (no `engines`).

Claim: the README correctly says source must be uploaded (esbuild bundles several files into one, which is the "tools that generate a single file from other files" case) and gives a working `git archive` + `--upload-source-code` recipe (flag present in web-ext 10.8.0). What a reviewer still lacks: the OS and Node/npm versions used (this machine runs Node v22.23.3; Mozilla's default build box is Ubuntu 24.04 with Node 24.14.0 and npm 11.9.0), `npm ci` instead of `npm install`, and which output to compare (`dist/firefox`).

Evidence:
- "a list of all the commands to generate an identical copy of the extension" and "There must be no differences.", https://extensionworkshop.com/documentation/publish/source-code-submission/
- Same page: build instructions should state "operating system and environment requirements"; "be sure to include the lockfile".
- In the repo's favour: `package-lock.json`, `src/providers/hosts.json`, `scripts/build.mjs` and `tsconfig.json` are tracked; `.gitattributes` forces LF and the built files have 0 CRLF, so line endings should not differ across OSes; the bundles hold only `src/` modules (no third-party library code). The `git archive` zip is about 18.8 MB, mostly 253 tracked PNGs.

Fix: add a "Building from source (reviewers)" paragraph to README: tested on Windows 11 with Node 22.x and npm (state the versions), commands `npm ci` then `npm run build`, output `dist/firefox`, expected to match the submitted package exactly; optionally add `"engines": { "node": ">=22" }` and mark `docs/critics/**` and `docs/recordings/**` `export-ignore` in `.gitattributes` to shrink the source archive. Not verified here: that a build on Node 24 / Ubuntu reproduces the same bytes.

### POL-5 (minor): README overstates signing speed and omits later review and blocking

File: `README.md:38-39`.

Claim: README says unlisted add-ons "are signed automatically, usually within minutes". The fetched Mozilla page gives no minutes figure and says up to 24 hours; README also does not tell the user that an unlisted version can still be manually reviewed and blocked later.

Evidence:
- "It can take up to 24 hours for your submission to be signed", https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- "including self-distributed ones, are subject to be manually reviewed at any time", same URL.
- "Mozilla may reject or block affected versions or entire add-ons", https://extensionworkshop.com/documentation/publish/add-on-policies/ (8.1)

Fix: "Unlisted add-ons pass automated validation and are signed without being published (Mozilla says this can take up to 24 hours). Any version can still be manually reviewed later, and a version that breaks the Add-on Policies can be rejected or blocked."

### POL-6 (minor): the name and ID lead with a third party's brand ("7tv")

File: `src/manifest.json:3` (`"7tv-cmd: Twitch command autocomplete"`), `src/manifest.json:15` (`default_title`), `scripts/build.mjs:29` (ID `7tv-cmd@example.com`).

Claim: 7TV is an existing, separately published extension on both stores. A name starting with "7tv-" reads as a 7TV product or official add-on; the README explains it is standalone, but the manifest name and description do not. "Twitch" in the description is descriptive use ("for Twitch chat"), which is the lower risk.

Evidence:
- Chrome: "Don't pretend to be someone else" and do not "represent that your product is authorized by, endorsed by, or produced by another company", https://developer.chrome.com/docs/webstore/program-policies/policies
- Mozilla: the fetched Add-on Policies cover Mozilla marks and forks ("If the add-on is a fork of another add-on, the name must clearly distinguish it from the original"); this is not a fork, and the page does not address third-party names directly, so for the unlisted AMO step this is low risk.

Fix: decide before the first signing, because the ID is fixed then (README's statement; see Not checked). Either rename to a descriptive name without the 7TV mark (e.g. "Bot Command Autocomplete for Twitch Chat") with a matching ID, or keep the name and add "Unofficial; not affiliated with 7TV or Twitch." to the manifest description and the README opening.

### POL-7 (minor, applies at the later Chrome Web Store step): no icons

File: `src/manifest.json` (no `icons`, no `action.default_icon`; SPEC section 9 "icons: none in v1").

Claim: AMO signing does not need icons (none required on the fetched signing page; lint is clean). The Chrome Web Store rejects listings without an icon.

Evidence: "If your product has a blank description field or is missing an icon" ... "it will be rejected", https://developer.chrome.com/docs/webstore/program-policies/policies

Fix: before a Chrome submission add a plain PNG icon set (16, 32, 48, 128) in `icons` and `action.default_icon`, plus the store icon and screenshots (the `docs/critics/final/*.png` captures are a starting point after cropping out channel content). Whether CWS also rejects a package with no manifest icon was not fetched.

### POL-8 (minor, applies at the later Chrome Web Store step): content script matches http as well as https; permission justifications not prepared

File: `src/manifest.json:8` (`"*://*.twitch.tv/*"`), `src/manifest.json:5` (`storage`, `activeTab`), `dist/chrome/manifest.json` host_permissions `https://moo.bot/*`.

Claim: Twitch is HTTPS-only, so `*://` grants http access that is never needed. The privacy practices tab asks for a reason per permission and a single-purpose statement; none is drafted. `moo.bot` is one host, and the review-process page only names broad host permissions as a cause of slower review, so it is not expected to be flagged.

Evidence:
- "Request access to the narrowest permissions necessary", https://developer.chrome.com/docs/webstore/program-policies/policies
- "Fill out these fields to tell the reviewers why your extension needs to use each permission.", https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- "Reviews may take longer for extensions that request broad host permissions", https://developer.chrome.com/docs/webstore/review-process
- "An extension must have a single purpose that is narrow and easy to understand.", policies URL above.

Fix: change the match to `https://*.twitch.tv/*` (and re-run the browser tests). Keep ready-to-paste lines: single purpose "Autocomplete a Twitch channel's chat-bot commands in the chat input"; storage "one-hour cache of command lists"; activeTab "the toolbar page reads the active tab's URL to know which channel to show" (`src/action/index.ts:48`); moo.bot "Moobot's public command API only answers requests with its own origin"; twitch.tv content script "adds the popup to the chat input"; remote code "No".

### POL-9 (note): add-on ID format is accepted; example.com is only a placeholder

File: `scripts/build.mjs:29`.

MDN: "any correctly formatted string can be used" and "addons.mozilla.org (AMO) checks that the ID is unique" (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings). No rule against `example.com` was found; MDN's examples use `extensionname@example.org` and recommends the `@string` form. Since the ID cannot be changed after signing (README; not confirmed from a fetched page), consider an `@`-form ID that matches the final name from POL-6.

### POL-10 (note): strict_min_version 140.0 / 142.0 are justified; gecko_android opts into Android

File: `scripts/build.mjs:31-32`, `scripts/build.mjs:83`.

The consent page names exactly this setup: setting strict_min_version to 140 (gecko) and 142 (gecko_android) "prevents the extension from installing or running on Firefox versions that do not support" the built-in consent, and "all new extensions must adopt the Firefox built-in data collection consent system" (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Having a `gecko_android` key makes the add-on available on Firefox for Android (MDN: without it, "Otherwise, the extension is only made available on desktop Firefox."). Android has not been tested (README lists no Android run); either say "desktop only, Android untested" in README or drop the `gecko_android` key and the `strict_min_version` for it.

### POL-11 (note): no remote code found

Files: `dist/firefox/*`, `dist/chrome/*`, `src/manifest.json`.

`dist/` contains no `eval(`, `new Function`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `importScripts`, dynamic `import(`, `wrappedJSObject`, script-element creation, `executeScript` or `postMessage`; the action page loads only the local `index.js`; no `content_security_policy` override and no `web_accessible_resources`. The bundles are unminified, carry only `src/` module comments and no third-party library code. Fetched provider data is data only. Policy: "Add-ons must be self-contained and not load remote code for execution." (https://extensionworkshop.com/documentation/publish/add-on-policies/), and Chrome MV3: "the full functionality of an extension must be easily discernible from its submitted code" (policies URL). No fix needed.

### POL-12 (note): web-ext lint output

`npm run lint` (exit 0) on `dist/firefox`, exact output:

```
> 7tv-cmd@0.1.0 lint
> web-ext lint --source-dir dist/firefox

Validation Summary:

errors          0
notices         0
warnings        0
```

Lint passing does not cover POL-1: the linter checks that the key exists, not that "none" is accurate.

## Not checked

- Whether Mozilla requires a privacy policy for unlisted add-ons that transmit data: the Firefox Add-on Distribution Agreement and any AMO privacy-policy page were not fetched (fetch budget spent); the two fetched Mozilla pages did not mention one.
- Extension Workshop "Extensions and the Add-on ID" (whether the ID can be changed after the first signing): not fetched; README's "becomes permanent" is unverified here.
- What a block does to already-installed unlisted copies (the signing overview links to a separate review-rejection page, not fetched).
- Whether the built-in consent flow alone satisfies Add-on Policies 6.2 "a clear way to control the add-on's data transmission" for a required data type.
- Mozilla's third-party library requirements page (moot today: no library code in the bundles).
- Chrome Web Store data-category definitions (the dashboard page did not define "web history" etc.), the manifest icon requirement for package upload, and the full Limited Use exception sentence.
- Twitch's and 7TV's own trademark or brand guidelines (out of the allowed fetch domains).
- A reproducible build on Ubuntu / Node 24 (build runs were not allowed).
- Whether `activeTab` is needed in Chrome given the twitch.tv content-script host access for reading the tab URL.
- AMO source-archive size limits.
- `npm run sign` itself (not allowed to run).
