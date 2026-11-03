# Release verification

Version 0.9.0 adds desktop Firefox/Zen support (2026-11-03):

- Both packages contain all 298 appearance/behavior controls and the same feature modules: focus, restrictions, filters, protection/recovery, presets/import/export, player controls, Google Fonts and Channel Play all. Firefox uses its native sidebar and an event-page background. The minimum is Firefox 153; acceptance used Firefox 159, Zen 1.24b (Gecko 159) and Chrome for Testing 156 on Linux. Older supported versions and other operating systems were not run.
- Real Firefox and Zen installations saved/read all 686 accepted control values, parsed 837 generated CSS cases, switched English/Russian, retained settings after extension reload and round-tripped the shared JSON format. Chrome imported the Firefox export unchanged. Final UI checks verified 298 rendered controls with no visible errors; cross-tab preset creation/deletion updated the already-open Zen page. Six additional Firefox UI checks covered native switch clicks, preset confirmation/cancellation/restoration, global search and the 390px panel layout. These counts establish configuration coverage, not visual acceptance of every control on every YouTube layout.
- On real YouTube in both Firefox and Zen, Shorts/search hiding and restoration, extended regex filtering, Google Fonts rendering/removal, Channel Play all, session start/end and temporary blocking passed. In the ordinary Zen profile, actual playback accepted 1.5× and 720p, Play entered fullscreen, Escape exited without reentry on resume, later playback-rate changes persisted, native controls toggled, next-video autoplay switched off, and opening autoplay prevention still allowed explicit Play. Fresh test profiles were playback-gated by YouTube; player acceptance used the ordinary profile and restored its prior YFE player settings.
- Firefox keeps authoritative data in extension-origin IndexedDB because its local storage lacks Chrome's access-level restriction. Thirteen real-browser protection checks covered rejection of unconfirmed edits, per-document grants, resistance to shared-local-storage tampering, cancellation, an actual browser restart, and a real one-minute recovery deadline with visible UI completion and preserved appearance. UI notifications contain changed record names only. No settings/password values enter a page bridge.
- Browser testing found and corrected Firefox's anonymous-CORS font-link creation, missing UI notifications after private storage writes, and a settings-page initialization error. Font links are now created by a narrowly validated, Firefox-only page script; it accepts only the supported Google Fonts CSS URL shape and sends no page text or credentials.
- Fullscreen entry/exit passed, but repeated ordinary-Zen runs sometimes left the video smaller than the fullscreen container. The same sizing issue reproduced using YouTube's own fullscreen button with YFE's player features disabled. One settled run filled the screen correctly; consistent fullscreen sizing in that profile remains unverified. A native-button workaround did not resolve it and was not retained. Preferred 720p was confirmed during playback; YouTube may initially display a lower resolution.
- The committed suite passes 15 Node tests and 3 Python packaging tests. Another 77 existing temporary worker/model regressions passed, including deadlines, restart recovery and scheduling/performance invariants. Generated/full catalog parity covers 298 controls, 114 enum choices, 2,474 validation states, 9,604 CSS comparisons across 14 paths, 996 translations and 445 runtime messages. These model checks do not replace live browser acceptance.
- Packages are deterministic and share 41 byte-identical non-manifest files; Mozilla `web-ext lint` reports zero errors, warnings or notices. Firefox signing, AMO submission and Firefox store screenshots are not completed. Temporary installation ends on browser restart. Real ad skipping, every conditional YouTube element/locale/combination, and a new whole-page CPU/load-time benchmark were not verified; weekly and clock-change scenarios were simulated rather than changing the user's clock. No claim of universal live parity or measured performance improvement is made.

Version 0.8.0 adds delayed password recovery and optional Google Fonts downloads (2026-11-03):

- Recovery defaults to 24 hours and accepts 1–43200 minutes. The worker owns the saved deadline; requests cannot shorten it or authorize protected changes. Cancellation keeps protection enabled. Expiry removes the password verifier and authorization grants while keeping other settings. Changing protection cancels a pending request.
- Fifteen serialized worker checks passed for migration, validation, duplicate/stale requests, cancellation, unauthorized page messages, early alarms, clock changes and restart recovery. All 62 existing worker/model checks passed. Generated catalog/runtime parity covers 298 controls, 114 enum choices, 2,474 validation states and 9,604 CSS comparisons across 14 page paths.
- Fourteen Chromium UI checks passed, including the forgotten-password link, request confirmation/cancellation, English/Russian labels and the 390px layout. A real one-minute wait, including extension reload, ended with automatic reset and a visible completion message; every non-protection storage record stayed equal. Long waits and system-clock transitions were simulated in worker checks, not waited out in the browser.
- Google Fonts is off by default. All 27 catalog families returned valid live CSS2 responses for their requested weights. Ten Chromium fixture checks verified real Google CSS/font requests, Inter glyph rendering, no page referrer or text parameter, SPA reuse, removal, local system fonts, language/search/layout and offline fallback. These use a YouTube-origin DOM fixture, not YouTube's own markup.
- On a real YouTube watch page in the existing Chrome profile, Inter font faces loaded and the visible video title used Inter; turning downloads off removed the stylesheet and downloaded faces. The separate test profile's real YouTube page remained blank, so live page acceptance used the connected profile. All 39 installed files matched 0.8.0, and all 598 previous storage records were restored exactly after the temporary font changes.
- No new permissions or JavaScript dependencies were added. Font requests are documented in the privacy policy and store materials. The README title and centered motion link were updated; the demo itself is unchanged. Chrome Web Store submission was not performed.

Version 0.7.0 adds default playback speed, automatic fullscreen and extended regex filters (2026-11-03):

- Speed choices cover 0.25–4× in 0.25 steps, with a neutral Keep YouTube speed option. Fullscreen starts off, requires Chrome's playback gesture when necessary, and respects exiting for the current video. No new permissions or dependencies were added.
- Regex supports ordinary/noncapturing groups, alternatives and `*`, `+`, `?`, including nested and lazy repetitions. Extended patterns use a nonbacktracking matcher; the previous simple-pattern fast path remains. Patterns are limited to 128 characters and matching input to 8,192. Lookarounds, backreferences, named groups, counted repetitions and Unicode property escapes are unsupported.
- 104,672 temporary regex assertions passed, including native-RegExp comparisons, Unicode/escape cases and pathological inputs. Local Node matching of nested overlapping repetitions took about 1.2 ms for an 8,192-character nonmatch; a 40-alternative pattern took about 7.1 ms. These are matcher measurements, not whole-page performance claims.
- 62 worker/model checks passed for migration, all speed choices, invalid input, import/export, restart recovery and existing session/scheduling behavior. Catalog/runtime parity and deterministic ZIP checks passed.
- 16 Chromium fixture checks covered speed changes, ad transitions, SPA navigation, real fullscreen entry/exit, restoration, and regex filtering. Eight settings checks covered English/Russian, global search and the 390px layout. These scripts are temporary, not a committed test suite.
- The existing Chrome installation loaded the 0.7.0 UI and worker. A real YouTube video played at 1.5×; a Play gesture entered fullscreen, Esc exited, playback resumed without reentry, and a manual 1.25× choice persisted. On a real watch page in an isolated profile, the regex filter hid three matching recommendations and restored all three when disabled. The user's search page remained empty during this check; other extensions were left unchanged.
- All 39 installed source files matched the new version. After temporary settings were restored, all 598 prior storage entries retained their original values; only the two neutral player defaults were added. Chrome Web Store submission was not performed.

Version 0.6.3 adds an optional Channel Play all button (2026-11-03):

- Live Chromium checks on Google and Google for Developers opened regular-video playlists with 2,035 and 4,652 entries. Videos → Shorts → Videos and navigation between channels retained the correct channel ID despite stale HTML metadata.
- The new switch saves immediately, starts off, respects Hide channel Play all buttons, and translates between English and Russian without reloading.
- 34 browser fixture assertions cover late/replaced headers, navigation, channel identity validation, stale metadata, language, click behavior, cleanup and duplicate prevention. The observer disconnects outside channel Videos pages and when disabled.
- Existing worker checks passed (31 scenarios). Full/runtime catalog parity passed for 297 controls, 2,466 validation states, 9,576 CSS comparisons and 970 translation inputs. JavaScript syntax and deterministic ZIP byte checks passed.
- The feature makes no network requests and adds no permissions. A read-only page bridge provides only the current public channel ID and path; settings never cross that bridge.
- The existing Chrome installation was updated and the new switch enabled. Its actual button opened a visible 4,652-entry playlist. All 597 previous storage entries remained unchanged; only the new switch was added. All 39 installed extension files matched the source.
- YouTube owns playlist availability and ordering. Shorts, live streams and unavailable videos are outside this regular-video shortcut; the button always uses newest-first order, independently of the channel's selected sort.

Version 0.5.0 was checked locally in Chromium on 2026-11-02.

- 296 unique appearance/behavior controls retain their types, defaults and accepted values.
- 102 non-default enum values are accounted for; defaults produce no CSS.
- 3,552 option/page isolation checks passed.
- Chromium accepted 1,514 CSS rules across 354 compiled configurations.
- 19 computed-style fixture assertions passed, including selective hiding, embedded-player isolation and combined thumbnail effects.
- All 19 settings routes rendered in English without horizontal overflow at 390px. All 303 checkbox inputs expose switch semantics.
- The settings-page button opened Chrome's actual side panel with all 19 sections and no horizontal overflow at 360px.
- Live YouTube watch-page checks confirmed that logo, comments and related-video controls hide their targets and restore them when switched off.
- Eight worker/model scenarios passed for migration, presets, schedules, sessions, pauses, protected changes and overlapping schedules.
- Older appearance IDs and preset exports remain readable. Current identifiers take precedence, and unknown import keys are rejected.
- Fresh-install prompts and errors are English. Existing custom user text is retained.

The model and fixture checks used temporary test scripts; they are not a committed automated test suite. They do not establish that every control works across all YouTube layouts, languages and combinations. The live test page required sign-in for playback, so video playback and real advertisement skipping were not revalidated for this release.

The motion demo was refreshed from YFE 0.6.3 on 2026-11-03. It combines captures of Chrome's native side panel and a public YouTube channel from an isolated, signed-out profile. The English interface shows global search, hiding the Shorts navigation link, enabling Channel Play all, and opening Focus sessions. The corresponding YouTube changes were checked during capture. The MP4 is 18 seconds at 1600×900 and 30 fps; the README embeds a GIF preview linking to a native video-player page.

Version 0.5.1 adds packaged icons and store listing materials; runtime behavior is unchanged. Chrome Web Store materials are prepared only, with no submission made.

Version 0.6.0 was checked in isolated Chromium and the existing Chrome installation on 2026-11-02:

- All 296 appearance controls accepted a changed value and returned it correctly; original values were restored. This checks saving, not all YouTube visual effects.
- The existing Chrome installation was running a 0.4.0 worker against newer page files. Reloading the complete 0.6.0 package aligned the catalog and worker; a client-version check now rejects stale pages with a reload instruction.
- Migration retained all 296 appearance values, feature settings, custom presets and protection data. Only the two known legacy Russian default prompts were translated to canonical English.
- Global search found session controls outside Appearance and focused the selected field. English/Russian switching, prompts and search placeholders were checked in the installed side panel.
- Built-in preset cancellation kept appearance unchanged; applying and restoring a preset returned the exact previous values.
- On live YouTube, a manually started unlimited session showed elapsed time and ended on request. A one-minute session expired into a one-minute break; the enabled End break action returned to session setup.
- 21 isolated worker scenarios covered deadlines, inactivity, blocks, phrases, schedules, protected changes, presets, restart recovery and protocol versions.
- The installed side panel rendered 20 navigation routes with 16px body text and no horizontal overflow at 463px; the narrow layout and search navigation were also checked at 390px.

The earlier 0.5.x checks above document their respective versions. Chrome Web Store submission remains unperformed.

Version 0.6.1 was checked on 2026-11-02:

- All 296 controls have an implementation; 102 non-default enum values and 3,552 page-isolation checks passed. Chromium accepted 1,539 CSS rules in 354 compiled configurations.
- Selectors for 56 controls were updated for current navigation, header, card, channel, search, Shorts and personal-page markup. Live styling checks observed an effect for 50 of these and 161 of the 258 CSS controls overall. Subscription live indicators, Thanks, Clip, Buy, Join and the personal-page avatar were not present for live verification. Absence of an element was not counted as a broken control.
- All 15 Shorts appearance controls hid their targets and restored them when disabled. Twelve focused fixtures passed 90 assertions for independent metadata fields, separators, legacy markup, action labels and restoration.
- Real settings interactions in isolated Chromium confirmed Explore/Shorts hiding and restoration, logo navigation blocked on Enter only while enabled, navigation dismissal on an outside click, and floating session widget activation/removal. The widget defaults to off, including migration of existing settings; its visibility does not disable session limits.
- Twenty-two isolated worker scenarios passed, including preservation of a scheduled preset and manual override when changing widget visibility.
- The existing Chrome installation loaded the 0.6.1 worker and UI with all 597 stored entries unchanged. Final page verification there was limited by YouTube remaining on its loading skeleton even with YFE fully disabled. YFE was re-enabled; other extensions and browser settings were not changed.

These checks do not establish live behavior for the remaining 97 CSS controls, every conditional YouTube element, or every locale and layout. No Chrome Web Store submission was made.

Version 0.6.2 performance changes were checked on 2026-11-02–03:

- The page-only catalog and translations preserve all 296 controls, 114 enum choices, 2,458 validation cases, 9,548 CSS comparisons across 14 paths, three built-in presets and 964 translation lookups. The settings UI retains the full catalog. Packaging rejects stale generated data.
- Forty isolated worker scenarios cover one-shot deadlines, unchanged snapshot suppression, clock/timezone changes, schedules, sessions, restart recovery, protection and legacy data. Neutral settings leave no boundary alarm; recurring schedules retain a 30-second clock check.
- Eighty-one Chromium DOM checks cover filtering and restoration, delayed menus, watched/recycled/removed cards, responsive row limits, native UI actions, player activation/removal, trusted playback gestures, thumbnail restoration and unchanged settings snapshots.
- Twenty-one checks on two real YouTube tabs cover filter changes, Shorts navigation, English/Russian widgets, exact preset restoration, temporary blocking and a one-minute session followed by a one-minute break. Stopping the isolated extension worker preserved the session and its deadline; both tabs returned to setup after the break.
- Injected JavaScript decreased from 311,847 to 242,201 bytes (22%). CPU sampling on real YouTube search results used the same isolated Chromium profile, 1440×1000 viewport, 20 nonmatching filter rules, watched-video filtering and next-autoplay control. Two runs per version averaged 92.4 → 70.3 ms of extension-attributed CPU samples during a 6.5-second startup window, and 11.1 → 8.0 ms during five seconds idle. Scrolling samples overlapped (23.3–24.4 ms before; 14.9–27.5 ms after), so a repeatable scrolling improvement is not established. Network-dependent load times and whole-page heap measurements do not establish extension-specific latency or memory savings.
- The existing Chrome installation loaded the 0.6.2 UI and worker with all 597 stored entries unchanged. A real YouTube search page rendered 14 video results; the user's enabled Shorts, Explore and Create hiding controls matched existing elements and hid all three targets.

These temporary checks are not a committed automated suite. Player media/API fixtures do not prove real ad skipping or playback quality selection. Weekly schedule and timezone transitions were checked in the worker harness, not by changing the user's system clock. Every YouTube layout and setting combination remains outside this verification.
