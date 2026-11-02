# YFE — YouTube Focus Extension

YFE is a free, open-source UnTrap alternative for Chrome: hide Shorts, recommendations and comments, filter unwanted content, and set focus sessions. Customize the YouTube interface from a persistent side panel, with 296 appearance and behavior settings.

English interface. Local settings. No account, subscription, analytics or backend.

[![YFE motion demo: distraction controls, session limits and content filters](docs/media/yfe-demo.gif)](https://github.com/DefaultPerson/youtube-focus-extension/releases/download/v0.5.0/yfe-demo.mp4)

[Watch the 18-second video](https://github.com/DefaultPerson/youtube-focus-extension/releases/download/v0.5.0/yfe-demo.mp4) · [Download the latest release](https://github.com/DefaultPerson/youtube-focus-extension/releases/latest)

## Features

- **Distraction control:** hide YouTube Shorts, home recommendations, related videos, comments, live chat, topic chips and promotional shelves.
- **Appearance:** customize the home feed, search, subscriptions, channels, video cards, watch page, navigation, embedded player, colors and installed fonts.
- **Focus sessions:** entry pauses, confirmation phrases, session and inactivity limits, breaks, temporary blocking and weekly schedules.
- **Presets:** save layouts, select one when starting a session, switch presets on a schedule and optionally restore the previous layout.
- **Content filters:** hide matching channels, video cards, comments and posts using text, IDs, links or a bounded regular-expression syntax. Add rules from YouTube menus.
- **Settings protection:** require a password or phrase for selected changes, with a single-use or five-minute confirmation.
- **Player controls:** preferred quality, native controls, autoplay prevention and automatic next-video control. Ad skipping and seeking are experimental.
- **One settings interface:** switches, appearance search, JSON import/export, side panel by default and an optional full settings tab.

## Install in Chrome or Chromium

1. Download **`yfe-0.5.0.zip`** from the [latest release](https://github.com/DefaultPerson/youtube-focus-extension/releases/latest) and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing **`manifest.json`**.
4. Reload any open YouTube tabs.
5. Click the extension icon to open its side panel. Use **↗** to open the current section in a full tab.

No build step or package installation is required. The extension targets desktop Chrome/Chromium 120 or later. It is not currently distributed through the Chrome Web Store.

To install from source, clone this repository or use **Code → Download ZIP**, then load its **`extension`** directory instead.

Appearance changes save immediately. Focus, usage limits, protection, filters and player forms have a **Save** button. Controls start with neutral defaults; choose the changes you want. Presets change appearance while filters and usage restrictions remain shared.

An optional toggle shortcut can be assigned at `chrome://extensions/shortcuts`; there is no global off button in the settings interface.

## Privacy and permissions

| Permission or access | Purpose |
| --- | --- |
| `storage` | Save settings, presets, filter rules and session state locally. |
| `alarms` | Apply time limits and scheduled changes. |
| `sidePanel` | Display the settings beside your browser tab. |
| `www.youtube.com` | Apply your chosen appearance, filtering and player changes. |
| `www.youtube-nocookie.com/embed/*` | Apply embedded-player appearance controls. |

There are no accounts, tracking SDKs, remote scripts or external model APIs. Optional thumbnail replacement requests video frames from YouTube's `i.ytimg.com`; YouTube itself continues to make its normal network requests. Fonts are taken from your computer and are not downloaded.

Passwords are stored as salted PBKDF2-SHA256 verification values. Confirmation phrases are intentionally readable. Settings exports exclude protection credentials, active sessions and temporary blocking deadlines. Browser content scripts cannot read extension storage directly.

## Limits

- YouTube changes its markup regularly. Some controls may need selector updates; not every combination has been verified on every layout or language.
- Session limits are not a cumulative daily allowance. Settings protection is a self-control aid, not protection against someone who can uninstall the extension or edit browser data.
- Filters hide matching cards and comments; they do not block the video currently open in the player.
- Regular expressions exclude groups, alternation, unrestricted repetition and backreferences to avoid long-running patterns.
- Ad skipping depends on player state and available controls; it does not guarantee removal of all advertisements.
- Mobile YouTube, summaries, translation and cloud synchronization are not included.
- There is no artificial preset or filter-rule quota; Chrome storage limits still apply. JSON imports are limited to 10 MB.

## Development

The extension uses plain JavaScript, CSS and Manifest V3. There are no runtime dependencies.

```sh
python3 scripts/package.py
```

The packaging script creates a deterministic ZIP and SHA-256 manifest in `dist/`, checks ZIP integrity, and compares every archived file with its source. Generated packages and local browser data are ignored by Git.

For UI changes, reload the extension in `chrome://extensions`, reopen its panel and reload YouTube. Check the home, search and watch pages, including SPA navigation and turning the affected control back off. Keep screenshots limited to the extension and use a clean browser profile.

See [release verification](docs/verification.md) for the checks performed and their limits.

## Contributing

Bug reports should include your Chrome version, the YouTube page type, the setting involved, and steps to reproduce. Remove account names, private channel lists and personal settings before attaching screenshots or exports.

## License

MIT. This is an independent project and is not affiliated with or endorsed by UnTrap, YouTube or Google.
