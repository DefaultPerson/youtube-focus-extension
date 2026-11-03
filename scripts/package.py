#!/usr/bin/env python3
"""Create deterministic Chrome or unsigned Firefox test packages."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from urllib.parse import urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
FILES = (
    "manifest.json", "platform.js", "private-storage.js", "catalog.js", "core.js", "styles.js", "content.js",
    "options.html", "options.css", "options.js", "popup.html",
    "background.js", "feature-model.js", "feature-content.js", "features.html",
    "features.css", "features.js", "protection-ui.js", "filter-rules.js",
    "content-filter.js", "player.js", "player-main.js", "font-main.js",
    "focus-content.js", "channel-play-all.js", "channel-identity-main.js", "focus-ui.js", "focus-entry-ui.js",
    "settings-ui.js", "settings-ui.css", "settings-redirect.js",
    "locales.js", "i18n.js", "ui-icons.js", "global-search.js",
    "runtime-catalog.js", "runtime-locales.js",
    "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
)
FIREFOX_BACKGROUND = (
    "platform.js", "private-storage.js", "catalog.js", "core.js",
    "filter-rules.js", "feature-model.js", "background.js",
)


def browser_manifest(source, browser):
    manifest = copy.deepcopy(source)
    if browser == "firefox":
        manifest.pop("minimum_chrome_version")
        manifest["permissions"].remove("sidePanel")
        manifest.pop("side_panel")
        manifest["background"] = {"scripts": list(FIREFOX_BACKGROUND)}
        for entry in manifest["content_scripts"]:
            if entry.get("world") == "MAIN":
                entry["js"].append("font-main.js")
        manifest["sidebar_action"] = {
            "default_title": manifest["name"],
            "default_panel": "options.html?panel=1",
            "default_icon": manifest["icons"],
            "open_at_install": False,
        }
        manifest["browser_specific_settings"] = {"gecko": {
            "id": "yfe@defaultperson.github.io",
            "strict_min_version": "153.0",
            "data_collection_permissions": {"required": ["none"]},
        }}
    return manifest


def validate_manifest(manifest, browser, files):
    references = set(manifest["icons"].values())
    references.update(manifest["action"].get("default_icon", {}).values())
    references.add(manifest["options_ui"]["page"])
    for entry in manifest["content_scripts"]:
        references.update(entry.get("js", []))
        references.update(entry.get("css", []))
        if entry.get("world", "ISOLATED") == "ISOLATED":
            assert entry["js"][0] == "platform.js", "Platform adapter must load first"
        else:
            assert "platform.js" not in entry["js"], "MAIN-world scripts cannot use the platform adapter"
    if browser == "firefox":
        assert not {"minimum_chrome_version", "side_panel"} & manifest.keys()
        assert "sidePanel" not in manifest["permissions"]
        assert manifest["background"] == {"scripts": list(FIREFOX_BACKGROUND)}
        references.update(manifest["background"]["scripts"])
        references.add(manifest["sidebar_action"]["default_panel"])
    else:
        assert manifest["background"] == {"service_worker": "background.js"}
        references.add(manifest["background"]["service_worker"])
        references.add(manifest["side_panel"]["default_path"])
    for name in references:
        assert urlsplit(name).path in files, f"Unpackaged manifest resource: {name}"
    for name, data in files.items():
        if name.endswith(".html"):
            for ref in re.findall(r'(?:src|href)=[\'"]([^\'"]+)[\'"]', data.decode("utf-8")):
                path = urlsplit(ref)
                if path.path and not path.scheme:
                    assert path.path in files, f"Unpackaged HTML resource in {name}: {ref}"


def package(source_manifest, browser):
    manifest = browser_manifest(source_manifest, browser)
    output = ROOT / "dist" / f"yfe-{manifest['version']}-{browser}.zip"
    output.parent.mkdir(exist_ok=True)
    files = {name: (SOURCE / name).read_bytes() for name in FILES}
    files["LICENSE"] = (ROOT / "LICENSE").read_bytes()
    if browser == "firefox":
        files["manifest.json"] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    validate_manifest(manifest, browser, files)
    hashes = {}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 11, 2, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
            hashes[name] = hashlib.sha256(data).hexdigest()
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(files)
        for name, data in files.items():
            assert archive.read(name) == data, name
    report = {"archive": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "files": hashes}
    output.with_suffix(".sha256.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"path": str(output), "browser": browser, "files": len(files), "bytes": output.stat().st_size, "sha256": report["sha256"]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser", nargs="?", choices=("chrome", "firefox", "all"), default="chrome")
    args = parser.parse_args()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build-runtime.py"), "--check"], check=True)
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    assert f"const clientVersion = '{manifest['version']}';" in (SOURCE / "core.js").read_text(), "Client protocol and manifest versions differ"
    for browser in ("chrome", "firefox") if args.browser == "all" else (args.browser,):
        package(manifest, browser)


if __name__ == "__main__":
    main()
