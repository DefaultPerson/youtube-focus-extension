# Release verification

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

The motion demo was refreshed from YFE 0.6.2 on 2026-11-03. It follows global search, the Shorts switch, session defaults and filter entry using real English interface captures from a separate browser profile. Filter rules and session values are examples. The MP4 is 18 seconds at 1600×900 and 30 fps; the README embeds a GIF preview linking to a native video-player page.

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
