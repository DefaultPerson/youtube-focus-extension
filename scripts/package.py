#!/usr/bin/env python3
"""Package only the local extension; verify the archive byte for byte."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
FILES = (
    "manifest.json", "catalog.js", "core.js", "styles.js", "content.js",
    "options.html", "options.css", "options.js", "popup.html",
    "background.js", "feature-model.js", "feature-content.js", "features.html",
    "features.css", "features.js", "protection-ui.js", "filter-rules.js",
    "content-filter.js", "player.js", "player-main.js",
    "focus-content.js", "focus-ui.js", "focus-entry-ui.js",
    "settings-ui.js", "settings-ui.css", "settings-redirect.js",
    "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
)


def main():
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    output = ROOT / "dist" / f"yfe-{manifest['version']}-chrome.zip"
    output.parent.mkdir(exist_ok=True)
    sources = {name: SOURCE / name for name in FILES}
    sources["LICENSE"] = ROOT / "LICENSE"
    hashes = {}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, source in sorted(sources.items()):
            data = source.read_bytes()
            info = zipfile.ZipInfo(name, (2026, 11, 2, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
            hashes[name] = hashlib.sha256(data).hexdigest()
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(sources)
        for name, source in sources.items():
            assert archive.read(name) == source.read_bytes(), name
    report = {"archive": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "files": hashes}
    output.with_suffix(".sha256.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"path": str(output), "files": len(sources), "bytes": output.stat().st_size, "sha256": report["sha256"]}))


if __name__ == "__main__":
    main()
