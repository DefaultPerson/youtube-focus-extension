# Chrome Web Store submission materials

Status: prepared locally; not submitted or published in the Chrome Web Store.

## Listing fields

- Name: YFE — YouTube Focus Extension
- Version: 0.6.0
- Language: English
- Category: Workflow & Planning
- Price: Free
- Homepage: https://defaultperson.github.io/youtube-focus-extension/
- Privacy policy: https://defaultperson.github.io/youtube-focus-extension/privacy.html
- Support: https://github.com/DefaultPerson/youtube-focus-extension/issues
- Package: `dist/yfe-0.6.0-chrome.zip` (manifest at ZIP root)
- Store icon: `extension/icons/icon-128.png`
- Screenshots: `store/screenshots/` (1280 × 800 PNG)
- Small promotional tile: `store/promo-440x280.png`
- Promotional video: leave empty; the store field accepts a YouTube video URL, not the local MP4 or project player page.

### Short description

Customize YouTube, hide Shorts and distractions, filter content, and manage focus sessions from a Chrome side panel.

### Detailed description

Make YouTube fit your focus. YFE lets you hide distractions, filter unwanted content and choose how YouTube looks from a persistent Chrome side panel.

• Hide Shorts, recommendations, comments, live chat and promotional shelves.
• Customize video cards, feeds, search, channels, navigation and the watch page with 296 appearance and behavior settings.
• Save appearance presets, choose one when starting a session, or switch presets on a schedule.
• Start sessions manually, choose their duration and inactivity timeout, and follow a live timer on YouTube. Set entry pauses, confirmation phrases, breaks and weekly blocking schedules.
• Filter channels, video cards, comments and posts by text, ID, link or a restricted regular expression. Add rules from YouTube menus.
• Adjust player quality and autoplay behavior; experimental ad skipping depends on YouTube's current controls.
• Protect selected settings changes with an optional local password or confirmation phrase.
• Search across every settings section, switch between English and Russian, and export or import JSON settings. Use the side panel or open the same settings in a full tab.

English by default, with Russian available in settings. Desktop Chrome 120 or later. No account, subscription, analytics or developer backend. Settings stay in your browser. YFE locally reads YouTube URLs, page content, player state and recent activity to provide these features. Optional thumbnail replacement loads images from YouTube's i.ytimg.com. See the privacy policy for details.

Settings begin with neutral defaults. Appearance changes save immediately; other forms have a Save button. Filters and usage restrictions are shared across appearance presets.

YouTube changes its layout regularly, so some controls may need updates. Filters hide cards and comments rather than blocking the currently playing video. Session limits are per session, not a daily allowance. Settings protection can be bypassed by uninstalling the extension or editing browser data. Ad skipping is experimental and does not remove every ad. Mobile YouTube and cloud sync are not included.

YFE is free and open source under the MIT license. It is an independent project, not affiliated with or endorsed by YouTube or Google.

## Privacy practices fields

### Single purpose

Help users focus on YouTube by customizing its interface, filtering distracting content and managing local focus sessions from one settings panel.

### Permission justifications

| Permission or site access | Justification |
| --- | --- |
| `storage` | Store appearance settings, presets, filter rules, schedules, session deadlines and optional protection verification data in this browser. Session storage holds temporary authorization state. No Chrome storage sync is used. |
| `alarms` | Reconcile session and inactivity deadlines, breaks, blocking schedules and scheduled appearance presets while the settings panel is closed. |
| `sidePanel` | Show the settings beside the current browser tab when the user clicks the toolbar icon. |
| `https://www.youtube.com/*` | Run packaged content scripts on YouTube pages and frames to apply chosen appearance, navigation, content-filter, focus and player settings. Read relevant page URLs, visible metadata, page content and player/activity state locally. |
| `https://www.youtube-nocookie.com/embed/*` | Run the same packaged content scripts in privacy-enhanced YouTube embeds to apply applicable embedded-player appearance, focus and player settings. |

The site patterns are content-script match patterns, not a separate `host_permissions` entry. No `tabs`, `history`, `cookies`, `webRequest`, `scripting` or all-sites permission is requested.

### Remote code

Select **No, I am not using remote code**. All executable JavaScript and CSS ship in the package. The player bridge is a packaged MAIN-world content script. Thumbnail requests load images, not executable code. No external scripts, dynamic code evaluation or WebAssembly are used.

### Data usage

Disclose local handling; do not select a blanket “no user data” statement. Select the following categories where shown in the dashboard:

| Data category | Scope and purpose |
| --- | --- |
| Personally identifiable information | Public channel/author names and handles in YouTube page content, and names/handles the user saves in filter rules; processed only for local content filtering. No account registration or identity profile. |
| Authentication information | Optional local settings password/phrase. Passwords are stored as salted PBKDF2-SHA256 verifiers; phrases remain readable. No YouTube credentials or cookies are read. |
| Web history | Current YouTube page URLs and linked video/channel identifiers, used locally for page-specific controls, navigation and filtering. No browsing-history log or history API access. |
| User activity | Playback, visibility and timestamps of recent pointer/keyboard/scroll activity, used locally for session inactivity. No keystroke text is recorded. |
| Website content | Titles, public author labels, comment/post text, page structure and player state needed for chosen controls and filters. |

Health information, financial/payment information, personal communications and location are not collected for extension features. Optional thumbnail loads expose normal request metadata, including IP address, to YouTube's image service; YFE does not derive or store location.

Certify: data is not sold or transferred for unrelated purposes; it is used only for the stated focus/customization purpose; it is not used for creditworthiness or lending. No data goes to the developer. Optional YouTube image requests and user-created local JSON exports are disclosed in the policy. Reconcile any changed dashboard wording with this policy before a future submission.

## Reviewer instructions

No login, payment, activation, external service account or developer credentials are required. A signed-out YouTube page is sufficient; dismiss YouTube's own consent prompt if it appears.

1. Install the package in Chrome 120+ and open `https://www.youtube.com/`. Click YFE's toolbar icon; its settings open in the side panel. Use **↗** to open the same section in a full tab.
2. In **All appearance settings**, search for **Hide Shorts link**, enable it and observe the navigation link disappear where present. Turn it off and observe restoration. Appearance saves immediately.
3. In **Content filters**, enable filtering, add a visible card's title or channel handle to the matching rule box, and click **Save filters**. Observe matching cards disappear. Remove the rule and save to restore them.
4. In **Usage limits**, enable **Enable usage limits** and **Limit session time**, set a one-minute session and one-minute break, then click **Save usage limits**. Return to YouTube, complete the start-session prompt and observe the break overlay after the minute. Disable **Enable usage limits** and save to clear the restriction.
5. In **Presets and backup**, export JSON, change an appearance setting, then import the exported file. Confirm the appearance is restored. Exports omit protection credentials and active session state.
6. Optional: in **Settings protection**, enable a password for one scope and save. Attempt a protected change and confirm a password prompt appears. Test passwords are local self-control credentials, not YouTube credentials.

YouTube layouts, consent screens and regional content vary. Ad skipping is experimental and is not an acceptance prerequisite. No remote service needs to be configured.

## Remaining publisher-only fields

- Use the publisher's verified Chrome Web Store account and contact details; none are bundled here.
- Confirm account declarations, distribution choices and final privacy certifications in the actual dashboard before submitting.
- Keep this package unsubmitted until publication is explicitly authorized.

## Sources

- https://developer.chrome.com/docs/webstore/prepare/
- https://developer.chrome.com/docs/webstore/images/
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- https://developer.chrome.com/docs/webstore/best-practices
