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

The motion demo follows search, switches, session settings and filter entry using real English interface captures from a separate browser profile. Filter rules and session values are examples. The MP4 is 18 seconds at 1600×900 and 30 fps; the README embeds a GIF preview linking to a native video-player page.

Version 0.5.1 adds packaged icons and store listing materials; runtime behavior is unchanged. Chrome Web Store materials are prepared only, with no submission made.
