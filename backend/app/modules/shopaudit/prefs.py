"""Shop-level thresholds for the audit (docs/16 §8, §9 — docs/17 P6-2). Stored on
`shops.audit_prefs`; everything has a default, and the UI shows the thresholds next to every
classification so a band is never a mystery."""

DEFAULT_PREFS: dict = {
    # days in stock: ≤15 fresh, ≤30 normal, ≤60 slow, ≤90 attention, beyond that dead
    "age_bands": [15, 30, 60, 90],
    # a phone whose cost is at or above this is "high value" for the slow-stock alert
    "high_value": 50000,
    # expected margin (asking − cost) under this % of cost is "low margin"
    "low_margin_pct": 5,
    # product performance: top = share of units ≥ top_share %, low = units ≤ low_units
    "top_share": 20,
    "low_units": 1,
    # verification bypasses by one person at or above this share of their intakes are flagged
    "bypass_share": 50,
    "bypass_min": 3,
}
BAND_KEYS = ("fresh", "normal", "slow", "attention", "dead")


def clean_prefs(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    out = dict(DEFAULT_PREFS)
    bands = raw.get("age_bands", out["age_bands"])
    if (
        not isinstance(bands, list)
        or len(bands) != 4
        or any(not isinstance(b, int) or b <= 0 for b in bands)
        or any(bands[i] >= bands[i + 1] for i in range(3))
    ):
        raise ValueError("age_bands must be four increasing day counts")
    out["age_bands"] = bands
    for k in (
        "high_value",
        "low_margin_pct",
        "top_share",
        "low_units",
        "bypass_share",
        "bypass_min",
    ):
        v = raw.get(k, out[k])
        if not isinstance(v, int | float) or v < 0:
            raise ValueError(f"{k} must be a number ≥ 0")
        out[k] = int(v) if k != "low_margin_pct" else v
    return out


def prefs_for(shop) -> dict:
    return {**DEFAULT_PREFS, **(shop.audit_prefs or {})}


def band_of(days: int, bands: list[int]) -> str:
    for key, edge in zip(BAND_KEYS, bands, strict=False):
        if days <= edge:
            return key
    return "dead"
