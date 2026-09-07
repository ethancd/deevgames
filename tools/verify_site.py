#!/usr/bin/env python3
"""Check the assembled multi-game site before publishing to Pages."""
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {"src", "href"} and value:
                self.urls.append(value)


root = Path(sys.argv[1]).resolve()
errors = []
required = ["index.html", "404.html", "portfolio/index.html",
            "docs/game-design-dossier.md"]
required += [f"{game}/index.html" for game in ("muju", "forge", "oracle")]
for name in required:
    if not (root / name).is_file():
        errors.append(f"Missing required page: {name}")
for file in root.rglob("*"):
    if not file.is_file():
        continue
    if file.stat().st_size > 25 * 1024 * 1024:
        errors.append(f"Over Pages' 25 MiB file limit: {file.relative_to(root)}")
    if file.name.startswith(".") or file.suffix in {".ts", ".tsx", ".rb", ".py"}:
        errors.append(f"Unexpected source/private file: {file.relative_to(root)}")
    if file.suffix != ".html":
        continue
    parser = Links()
    parser.feed(file.read_text())
    for url in parser.urls:
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        path = unquote(parts.path)
        target = ((root / path.lstrip("/")) if path.startswith("/")
                  else (file.parent / path)).resolve()
        if not target.is_relative_to(root):
            errors.append(f"Link escapes site: {url}")
            continue
        if target.is_dir():
            target /= "index.html"
        if not target.is_file():
            errors.append(f"Broken link in {file.relative_to(root)}: {url}")
if errors:
    sys.exit("\n".join(errors))
print("Site verified: three games, portfolio, local links and asset sizes.")
