"""Sube las 6 PNGs de displays a Meta como adimages.

Output: assets/meta_ads/image_hashes.json
        { "deadline": {"1080x1920": "<hash>", "1080x1440": "...", "1080x1080": "..."},
          "post-switch": {...} }
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"
ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "meta_ads"
OUT_JSON = ASSETS / "image_hashes.json"

RATIOS = ["1080x1080", "1080x1440", "1080x1920"]
MODES = ["deadline", "post-switch"]


def _load_env() -> None:
    p = ROOT / ".env.local"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()
TOKEN = os.environ.get("META_ACCESS_TOKEN") or os.environ.get("META_ADS_ACCESS_TOKEN")
AD_ACCOUNT = os.environ.get("META_AD_ACCOUNT_ID")
if not TOKEN or not AD_ACCOUNT:
    sys.exit("✗ Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID")


def upload(path: Path) -> str:
    with open(path, "rb") as f:
        files = {"filename": (path.name, f, "image/png")}
        data = {"access_token": TOKEN}
        r = requests.post(
            f"{GRAPH}/{AD_ACCOUNT}/adimages",
            data=data,
            files=files,
            timeout=60,
        )
    body = r.json()
    if r.status_code >= 400:
        print(json.dumps(body, indent=2, ensure_ascii=False))
        r.raise_for_status()
    images = body.get("images") or {}
    if not images:
        sys.exit(f"✗ Respuesta sin 'images': {body}")
    first = next(iter(images.values()))
    return first["hash"]


def main() -> int:
    out = {}
    for mode in MODES:
        out[mode] = {}
        for ratio in RATIOS:
            p = ASSETS / f"metodo_{ratio}_{mode}.png"
            if not p.exists():
                sys.exit(f"✗ Falta {p}")
            print(f"  ↑ {p.name} … ", end="", flush=True)
            h = upload(p)
            out[mode][ratio] = h
            print(h)
    OUT_JSON.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\n✓ Mapping guardado: {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
