# YouTube Focus Extension[YFE]

[![Release v0.9.0](docs/media/release.svg?v=0.9.0)](https://github.com/DefaultPerson/youtube-focus-extension/releases/latest)
[![Firefox Add-ons: available](docs/media/firefox-addons.svg?v=0.9.0-public)](https://addons.mozilla.org/en-US/firefox/addon/yfe-youtube-focus-extension/)

YFE is a free, open-source **YouTube focus extension and Shorts blocker** for desktop browsers. Hide Shorts, recommendations and comments, filter channels and keywords, and set focus sessions from a persistent settings panel. This independent **UnTrap alternative** includes 298 appearance and behavior settings. Chrome/Chromium and Firefox/Zen share the same feature code; browser acceptance status is recorded in the verification notes.

English by default, with Russian available in settings. Local storage. No account, subscription, analytics or backend.

<p align="center">
  <a href="https://defaultperson.github.io/youtube-focus-extension/#demo"><img src="https://raw.githubusercontent.com/DefaultPerson/youtube-focus-extension/0c658a89e8f85fd2d59e656c9ed14a09f4fc00d1/docs/media/yfe-demo.gif" alt="YFE in action — customize YouTube from the side panel"></a>
</p>

## Features

- **Hide YouTube Shorts and distractions:** remove Shorts, home recommendations, related videos, comments, live chat, topic chips and promotional shelves from the interface.
- **Customize YouTube:** change the home feed, search, subscriptions, channels, video cards, watch page, navigation, embedded player, colors and fonts. Optionally download the selected font from Google Fonts.
- **Focus sessions:** start a session from the panel or YouTube, choose its duration and idle timeout, and track it with a live timer. Entry pauses, confirmation phrases, breaks, temporary blocking and weekly schedules are included.
- **Presets:** save layouts, select one when starting a session, or switch presets on a schedule. Applying a built-in preset requires confirmation and saves the previous appearance for restoration.
- **Channel and keyword filters:** hide matching channels, video cards, comments and posts using text, IDs, links or a bounded regular-expression syntax. Add rules from YouTube menus.
- **Settings protection:** require a password or phrase for selected changes, with a single-use or five-minute confirmation. Request a forgotten-password reset after a configurable delay (24 hours by default), or cancel it before it completes.
- **Player controls:** default playback speed (0.25–4×), automatic fullscreen, preferred quality, native controls, autoplay prevention and automatic next-video control. Ad skipping and seeking are experimental.
- **Channel Play all button:** an optional button on a channel's Videos tab opens its regular-video uploads playlist, newest first, without collecting loaded cards. Shorts and live streams are excluded.
- **One settings interface:** global search across every section, English/Russian switching, SVG navigation, JSON import/export, side panel by default and an optional full settings tab.

## Install in Chrome or Chromium

Chrome/Chromium 120+. No build step. Not yet available in the Chrome Web Store.

1. Download **`yfe-0.9.0-chrome.zip`** from the [latest release](https://github.com/DefaultPerson/youtube-focus-extension/releases/latest) and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing **`manifest.json`**.
4. Reload YouTube and click the extension icon for the side panel; **↗** opens the current section in a full tab.

From source, load **`extension/`**. Appearance saves immediately; other forms use **Save**. Controls start neutral, and presets share filters and restrictions. An optional toggle shortcut is available at `chrome://extensions/shortcuts`.

## Test in Firefox or Zen

Firefox 153+ or desktop Zen based on Firefox 153+. This minimum keeps document-specific message authorization; older engines are not supported. All 298 controls and every Chrome feature module are included, with a native Firefox sidebar. Tested on Firefox 159 and Zen 1.24b; see [verification and limits](docs/verification.md).

1. Download **`yfe-0.9.0-firefox.zip`** from the [latest release](https://github.com/DefaultPerson/youtube-focus-extension/releases/latest) and extract it into a separate folder. From source, build it with **`python3 scripts/package.py firefox`**.
2. Open **`about:debugging#/runtime/this-firefox`**, select **Load Temporary Add-on**, and choose the extracted **`manifest.json`**.
3. Reload YouTube and click YFE's toolbar icon to open its sidebar; **↗** opens the same section in a full tab.

A signed version is available from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/yfe-youtube-focus-extension/). The release ZIP is an unsigned test package; temporary loading lasts until the browser restarts. Do not load the Chrome source manifest in Firefox. Set the optional shortcut in **Manage Extension Shortcuts** in `about:addons`.

## Privacy and permissions

Uses `storage` and `alarms`, plus Chrome's `sidePanel`; Firefox uses its sidebar API. Site access is limited to YouTube and its privacy-enhanced embeds. Page content, activity and settings are processed locally; nothing is sent to the developer. Optional thumbnail replacement requests images from YouTube; optional Google Fonts loads the selected font stylesheet and files from Google. No accounts, analytics or remote scripts. [Full privacy policy](https://defaultperson.github.io/youtube-focus-extension/privacy.html).

## Limits

- YouTube markup changes; not every setting combination, layout or language is verified. Ad skipping is experimental and cannot remove every ad.
- Session limits are per session. Protection can be bypassed by uninstalling YFE or editing browser data. Filters hide cards/comments, not the currently playing video.

<details>
<summary>Other limits</summary>

- Regex rules support groups, alternation and `*`, `+`, `?` with bounded matching; lookarounds, backreferences and `{m,n}` are unsupported.
- Automatic fullscreen may need a Play gesture from the browser and permission from the embedding site. It stays off after you exit for the current video.
- No mobile YouTube, summaries, translation or cloud sync.
- No artificial preset/rule quota; browser storage limits apply. JSON imports: 10 MB maximum.

</details>

## Development

Plain JavaScript/CSS and Manifest V3; no runtime dependencies. Run `python3 scripts/build-runtime.py` after changing generated inputs; `--check` verifies freshness. Run tests with `node --test tests/*.test.cjs` and `python3 -m unittest discover -s tests`. Package with `python3 scripts/package.py chrome`, `firefox` or `all` (default: Chrome). ZIPs and integrity reports go to `dist/`; both browsers share identical source files with different manifests.

Reload YFE and YouTube after changes; check navigation and turning controls back off. [Verification and limits](docs/verification.md).

## Contributing

Bug reports should include your browser and version (including Zen's Firefox base version), the YouTube page type, the setting involved, and steps to reproduce. Remove account names, private channel lists and personal settings before attaching screenshots or exports.

## License

MIT. This is an independent project and is not affiliated with or endorsed by UnTrap, YouTube or Google.
