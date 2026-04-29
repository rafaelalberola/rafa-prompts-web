"""Reconfigura targeting del adset 'Método Claude · Sales' al ICP correcto.

ICP (CAMPAIGNS_STRATEGY.md + CLAUDE.md):
  - Geo:    ES (mercado primario), PT opcional
  - Edad:   28-45
  - Sexo:   todos
  - Locale: Spanish (Spain) (6) + Spanish (24=LatAm) por completitud
  - Intereses: ChatGPT, OpenAI, Notion, Productivity, Entrepreneurship,
              Small business, Marketing automation, SaaS, Make
  - Job titles: Founder, CEO, CTO, COO, Head of Operations,
                Operations Manager, Marketing Director, Content Strategist
  - Exclusiones: connections (Page followers IG/FB)
  - Placements: IG Reels, IG Feed, IG Explore, IG Stories, FB Feed
                (manuales — el script NO los toca; ya configurados aparte)

Idempotente: PATCH del adset reemplaza el targeting completo.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"
ROOT = Path(__file__).resolve().parents[2]
CAMPAIGN_NAME_FRAGMENT = "método claude · sales"


# --- ICP definition (source of truth en código) ---
# Cada item: (query, [aliases válidos como contención sub-string en el nombre devuelto]).
# Si ningún alias matchea, descartar el resultado (evita falsos positivos como
# 'OpenAI' → 'Festivales de música').
INTEREST_QUERIES: list[tuple[str, list[str]]] = [
    ("Artificial intelligence", ["artificial intelligence", "inteligencia artificial"]),
    ("Generative artificial intelligence", ["generative", "generativ"]),
    ("Machine learning", ["machine learning", "aprendizaje automático", "aprendizaje automatico"]),
    ("Entrepreneurship", ["entrepreneurship", "empresariado", "emprend"]),
    ("Small business", ["small business", "pequeña empresa", "pyme"]),
    ("Marketing automation", ["marketing automation", "automatización de marketing", "automatizacion de marketing"]),
    ("Software as a service", ["saas", "software como servicio", "software as a service"]),
    ("Online advertising", ["online advertising", "publicidad en línea", "publicidad en linea"]),
    ("Digital marketing", ["digital marketing", "marketing digital"]),
]

WORK_POSITION_QUERIES = [
    "Founder",
    "Chief Executive Officer",
    "Chief Technology Officer",
    "Chief Operating Officer",
    "Head of Operations",
    "Operations Manager",
    "Marketing Director",
    "Content Strategist",
]


def _load_env() -> None:
    p = ROOT / ".env.local"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()
TOKEN = os.environ.get("META_ACCESS_TOKEN")
AD_ACCOUNT = os.environ.get("META_AD_ACCOUNT_ID")
if not TOKEN or not AD_ACCOUNT:
    sys.exit("✗ Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID")


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


def search_interest(q: str, aliases: list[str]) -> dict | None:
    """Busca interés y valida que el nombre contenga alguno de los aliases."""
    res = get("search", {"type": "adinterest", "q": q, "limit": 10})
    items = res.get("data") or []
    if not items:
        return None
    # filtrar items cuyo nombre contenga al menos un alias (case-insensitive)
    valid = []
    for it in items:
        name_lc = (it.get("name") or "").lower()
        if any(a.lower() in name_lc for a in aliases):
            valid.append(it)
    if not valid:
        return None
    # entre los válidos, el de mayor audiencia
    valid.sort(key=lambda x: int(x.get("audience_size_lower_bound") or 0), reverse=True)
    top = valid[0]
    return {"id": top["id"], "name": top.get("name", q)}


def search_work_position(q: str) -> dict | None:
    res = get("search", {"type": "adworkposition", "q": q, "limit": 5})
    items = res.get("data") or []
    if not items:
        return None
    return {"id": items[0]["id"], "name": items[0].get("name", q)}


def find_metodo_adset() -> str:
    camps = get(f"{AD_ACCOUNT}/campaigns", {"fields": "id,name", "limit": 50})["data"]
    camp = next((c for c in camps if CAMPAIGN_NAME_FRAGMENT in c["name"].lower()), None)
    if not camp:
        sys.exit("✗ No encuentro campaña.")
    sets = get(f"{camp['id']}/adsets", {"fields": "id,name"})["data"]
    if not sets:
        sys.exit("✗ Campaña sin adsets.")
    return sets[0]["id"]


def main() -> int:
    print("== Resolver adset 'Método Claude · Sales' ==")
    adset_id = find_metodo_adset()
    print(f"  adset_id: {adset_id}")

    print("\n== Resolver intereses (con verificación de nombre) ==")
    interests = []
    for q, aliases in INTEREST_QUERIES:
        m = search_interest(q, aliases)
        if m:
            interests.append(m)
            print(f"  ✓ {q!r} → {m['name']!r} ({m['id']})")
        else:
            print(f"  ✗ {q!r} no validado (sin match con aliases {aliases})")

    print("\n== Resolver work positions ==")
    work_positions = []
    for q in WORK_POSITION_QUERIES:
        m = search_work_position(q)
        if m:
            work_positions.append(m)
            print(f"  ✓ {q!r} → {m['name']!r} ({m['id']})")
        else:
            print(f"  ✗ {q!r} no encontrado")

    targeting = {
        "geo_locations": {"countries": ["ES"]},
        "age_min": 28,
        "age_max": 45,
        "locales": [6, 24],
        # flexible_spec: cada bloque es un "AND" agrupado por OR entre bloques.
        # Aquí dos bloques: (interests) OR (work_positions).
        "flexible_spec": [
            {"interests": interests},
            {"work_positions": work_positions},
        ],
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed"],
        "instagram_positions": ["stream", "story", "reels", "explore"],
        "device_platforms": ["mobile", "desktop"],
        "targeting_relaxation_types": {
            "lookalike": 0,
            "custom_audience": 0,
        },
    }

    print("\n== Targeting nuevo (resumen) ==")
    print(f"  geo: ES")
    print(f"  edad: 28-45")
    print(f"  locales: Spanish (Spain) + Spanish (LatAm)")
    print(f"  intereses: {len(interests)}")
    print(f"  work positions: {len(work_positions)}")
    print(f"  placements: FB Feed + IG (Feed, Stories, Reels, Explore)")

    print("\n== PATCH adset ==")
    res = post(adset_id, {"targeting": json.dumps(targeting, ensure_ascii=False)})
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
