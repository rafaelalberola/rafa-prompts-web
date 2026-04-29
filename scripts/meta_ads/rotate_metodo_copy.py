"""Rotar la copy de los 3 ads activos de la campaña 'Método Claude · Sales'.

Por qué: Meta no permite editar `body`/`message` de un creative ya activo.
Para cambiar la copy hay que crear creative nuevo (con misma image_hash) y
ad nuevo en el mismo adset, luego pausar el viejo.

Uso:
    python scripts/meta_ads/rotate_metodo_copy.py --mode deadline
    python scripts/meta_ads/rotate_metodo_copy.py --mode post-switch
    python scripts/meta_ads/rotate_metodo_copy.py --mode deadline --dry-run

Modos:
  deadline    — copy con "149€ hasta el domingo, luego 197€" (esta semana).
  post-switch — copy "197€ · pago único · acceso de por vida" (lunes en adelante).

Idempotente: si los ads activos ya tienen copy del modo solicitado
(detectado por description), no hace nada.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"
ROOT = Path(__file__).resolve().parents[2]
CAMPAIGN_NAME_FRAGMENT = "método claude · sales"
IMAGE_HASHES_JSON = ROOT / "assets" / "meta_ads" / "image_hashes.json"


COPY = {
    "deadline": {
        "name": "Claude nivel experto",
        "message": (
            "Llevas meses con Claude. Sigues improvisando.\n\n"
            "El método Claude: 6 módulos, plantillas, pipelines probados. "
            "Lo que necesitas para construir sistemas reales con IA en un fin de semana.\n\n"
            "149€ hasta el domingo 23:59. Después: 197€."
        ),
        "description": "149€ hasta el domingo · luego 197€",
        "link": "https://rafaprompts.com/metodo.html?utm_source=meta&utm_medium=cpc&utm_campaign=metodo_sales_deadline",
    },
    "post-switch": {
        "name": "Claude nivel experto",
        "message": (
            "El método Claude: 6 módulos, plantillas, pipelines probados.\n\n"
            "Lo que necesitas para construir sistemas reales con IA en un fin de semana.\n\n"
            "197€ · pago único · acceso de por vida."
        ),
        "description": "197€ · acceso de por vida",
        "link": "https://rafaprompts.com/metodo.html?utm_source=meta&utm_medium=cpc&utm_campaign=metodo_sales",
    },
}


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
PAGE_ID = os.environ.get("META_PAGE_ID")
INSTAGRAM_ID = os.environ.get("META_INSTAGRAM_ID") or os.environ.get("META_IG_ACCOUNT_ID")

if not TOKEN or not AD_ACCOUNT:
    sys.exit("✗ Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en .env.local o env.")


def get(path: str, params: dict | None = None) -> dict:
    p = {**(params or {}), "access_token": TOKEN}
    r = requests.get(f"{GRAPH}/{path}", params=p, timeout=30)
    r.raise_for_status()
    return r.json()


def post(path: str, data: dict) -> dict:
    d = {**data, "access_token": TOKEN}
    r = requests.post(f"{GRAPH}/{path}", data=d, timeout=30)
    body = r.json()
    if r.status_code >= 400:
        print(json.dumps(body, indent=2, ensure_ascii=False))
        r.raise_for_status()
    return body


def find_metodo_campaign() -> str:
    camps = get(f"{AD_ACCOUNT}/campaigns", {"fields": "id,name", "limit": 50})["data"]
    match = next(
        (c for c in camps if CAMPAIGN_NAME_FRAGMENT in c["name"].lower()),
        None,
    )
    if not match:
        sys.exit(f"✗ No encuentro campaña con '{CAMPAIGN_NAME_FRAGMENT}' en el nombre.")
    return match["id"]


def list_active_ads(campaign_id: str) -> list[dict]:
    res = get(
        f"{campaign_id}/ads",
        {"fields": "id,name,status,effective_status,adset_id,creative{id,name}", "limit": 50},
    )
    return [a for a in res.get("data", []) if a.get("effective_status") == "ACTIVE"]


def get_creative(creative_id: str) -> dict:
    return get(
        creative_id,
        {"fields": "id,name,object_story_spec,asset_feed_spec,image_hash"},
    )


def extract_image_hash(creative: dict) -> str | None:
    oss = creative.get("object_story_spec") or {}
    ld = oss.get("link_data") or {}
    if ld.get("image_hash"):
        return ld["image_hash"]
    afs = creative.get("asset_feed_spec") or {}
    images = afs.get("images") or []
    if images and images[0].get("hash"):
        return images[0]["hash"]
    return creative.get("image_hash")


def load_image_hash_map() -> dict | None:
    """Mapping {mode: {ratio: image_hash}} preferido sobre el hash del ad viejo."""
    if not IMAGE_HASHES_JSON.exists():
        return None
    return json.loads(IMAGE_HASHES_JSON.read_text())


def detect_ratio_from_name(ad_name: str) -> str | None:
    for r in ("1080x1920", "1080x1440", "1080x1080"):
        if r in ad_name:
            return r
    return None


def already_in_target_state(creative: dict, target_description: str) -> bool:
    oss = creative.get("object_story_spec") or {}
    ld = oss.get("link_data") or {}
    return ld.get("description") == target_description


def create_creative(*, name: str, image_hash: str, copy: dict, page_id: str, instagram_id: str | None) -> str:
    link_data = {
        "message": copy["message"],
        "link": copy["link"],
        "name": copy["name"],
        "description": copy["description"],
        "image_hash": image_hash,
        "call_to_action": {
            "type": "LEARN_MORE",
            "value": {"link": copy["link"]},
        },
    }
    object_story_spec: dict = {
        "page_id": page_id,
        "link_data": link_data,
    }
    if instagram_id:
        object_story_spec["instagram_actor_id"] = instagram_id
    res = post(
        f"{AD_ACCOUNT}/adcreatives",
        {
            "name": name,
            "object_story_spec": json.dumps(object_story_spec, ensure_ascii=False),
        },
    )
    return res["id"]


def create_ad(*, name: str, adset_id: str, creative_id: str) -> str:
    res = post(
        f"{AD_ACCOUNT}/ads",
        {
            "name": name,
            "adset_id": adset_id,
            "creative": json.dumps({"creative_id": creative_id}),
            "status": "ACTIVE",
        },
    )
    return res["id"]


def pause_ad(ad_id: str) -> None:
    post(ad_id, {"status": "PAUSED"})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=list(COPY.keys()), required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    copy = COPY[args.mode]
    print(f"\n== Rotando ads de 'Método Claude · Sales' a modo: {args.mode} ==")
    print(f"  description target: {copy['description']!r}")

    if not PAGE_ID:
        sys.exit("✗ Falta META_PAGE_ID")

    campaign_id = find_metodo_campaign()
    print(f"  campaign={campaign_id}")

    active_ads = list_active_ads(campaign_id)
    print(f"  {len(active_ads)} ads activos")
    if not active_ads:
        print("✗ No hay ads activos. Nada que rotar.")
        return 0

    image_map = load_image_hash_map()
    if image_map and args.mode in image_map:
        print(f"  usando image_hash_map[{args.mode}] (creativos nuevos)")
    else:
        print("  sin image_hash_map: reusará image_hash del creative existente")

    rotated = 0
    skipped = 0
    for ad in active_ads:
        ad_id = ad["id"]
        ad_name = ad["name"]
        adset_id = ad["adset_id"]
        creative_summary = ad.get("creative") or {}
        creative_id = creative_summary.get("id")
        print(f"\n  ── ad: {ad_name} ({ad_id})")

        if not creative_id:
            print("     ⚠ sin creative, salto.")
            continue

        creative = get_creative(creative_id)

        ratio = detect_ratio_from_name(ad_name)
        target_hash = None
        if image_map and args.mode in image_map and ratio:
            target_hash = image_map[args.mode].get(ratio)

        # idempotencia: ya tiene la copy del modo Y la imagen target → skip
        current_hash = extract_image_hash(creative)
        if (
            already_in_target_state(creative, copy["description"])
            and (not target_hash or current_hash == target_hash)
        ):
            print(f"     ✓ ya en estado {args.mode!r} con imagen correcta, salto.")
            skipped += 1
            continue

        image_hash = target_hash or current_hash
        if not image_hash:
            print("     ✗ no encuentro image_hash. Salto este ad.")
            continue
        print(f"     image_hash={image_hash[:8]}…  (source={'map' if target_hash else 'old creative'})")

        # nombre limpio: <Método · ratio · mode> sin duplicar el sufijo si ya viene
        base = ad_name
        for suffix in (" · deadline", " · post-switch"):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
        new_creative_name = f"{base} · {args.mode}"
        new_ad_name = f"{base} · {args.mode}"

        if args.dry_run:
            print(f"     [DRY] crearía creative '{new_creative_name}' image_hash={image_hash[:8]}…")
            print(f"     [DRY] crearía ad '{new_ad_name}' en adset {adset_id}")
            print(f"     [DRY] pausaría ad viejo {ad_id}")
            rotated += 1
            continue

        new_creative_id = create_creative(
            name=new_creative_name,
            image_hash=image_hash,
            copy=copy,
            page_id=PAGE_ID,
            instagram_id=INSTAGRAM_ID,
        )
        print(f"     ✓ creative nuevo: {new_creative_id}")

        new_ad_id = create_ad(
            name=new_ad_name,
            adset_id=adset_id,
            creative_id=new_creative_id,
        )
        print(f"     ✓ ad nuevo: {new_ad_id}")

        pause_ad(ad_id)
        print(f"     ✓ ad viejo {ad_id} → PAUSED")
        rotated += 1

    print(f"\n== Resultado: rotados={rotated}, skipped(idempotent)={skipped} ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
