#!/usr/bin/env python3
"""Builds RFIX/Images/SpaceNodePanel.html: ui/panel.html with the Geist font and the
brand symbol inlined, so the embedded browser needs no file access or network.

Placeholders in panel.html:
  /*__GEIST_FONT__*/   -> data: URI (woff2, base64) for the @font-face src
  <!--__SYMBOL__-->    -> the inline SVG symbol
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "ui" / "panel.html"
# Graphisoft's resource compiler resolves DATA files from RFIX/Images.
OUT = ROOT / "RFIX" / "Images" / "SpaceNodePanel.html"


def main() -> int:
    html = SRC.read_text(encoding="utf-8")
    font = (ROOT / "ui" / "assets" / "geist-latin.woff2").read_bytes()
    symbol = (ROOT / "ui" / "assets" / "symbol.svg").read_text(encoding="utf-8").strip()
    symbol = symbol.replace('fill="#FFFFFF"', 'fill="currentColor"')   # follows the light/dark theme
    font_uri = "data:font/woff2;base64," + base64.b64encode(font).decode("ascii")
    for token in ("/*__GEIST_FONT__*/", "<!--__SYMBOL__-->"):
        if token not in html:
            print("gen_ui: placeholder missing in panel.html: " + token, file=sys.stderr)
            return 1
    html = html.replace("/*__GEIST_FONT__*/", font_uri).replace("<!--__SYMBOL__-->", symbol)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    new = html.encode("utf-8")
    if not OUT.exists() or OUT.read_bytes() != new:
        OUT.write_bytes(new)
    print("gen_ui: %s (%d KB)" % (OUT.relative_to(ROOT), len(new) // 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
