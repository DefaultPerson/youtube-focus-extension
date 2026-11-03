# Reproduce YFE 0.9.0 for Mozilla review

Requirements: Python 3.9 or later, standard library only. The release was built on Linux with Python 3.13.6. Node.js and npm are not needed to build the package.

From the extracted source archive's root, run:

```sh
python3 scripts/build-runtime.py
python3 scripts/package.py firefox
```

The result is `dist/yfe-0.9.0-firefox.zip`. Compare its extracted files with the uploaded extension; Mozilla's signature files are added after signing.

- `extension/catalog.js` and `extension/locales.js` are the readable canonical data. `build-runtime.py` produces the compact `runtime-catalog.js` and `runtime-locales.js` files.
- `extension/manifest.json` is the Chrome manifest. `package.py` generates the Firefox manifest, keeping all shared feature files unchanged.
- All executable code and assets are included. There are no dependency downloads, remote scripts, proprietary build tools or required accounts/API keys.
- Optional Google Fonts downloads load font stylesheets/files. Optional thumbnail replacement loads YouTube images. Both are disabled by default; no page text, settings or protection credentials are sent.

Reviewer checks: temporarily load the extracted Firefox package, open YouTube, open the YFE sidebar, toggle Hide Shorts link, save a keyword filter, and start/end a session. Appearance saves immediately; other forms use Save. YouTube may require sign-in for playback in a fresh profile; YFE itself needs no login.

For a quick recovery check, configure a local test password with a one-minute recovery delay, request a reset, and wait for protection to turn off while appearance settings remain. Do not use a personal password.

The package targets desktop Firefox 153+ because authorization grants rely on document-specific message identities. It was tested on Firefox 159 and Zen 1.24b. In the ordinary Zen profile, fullscreen sometimes retained a smaller video image; the same behavior occurred with YFE player features disabled. Ad skipping remains experimental.
