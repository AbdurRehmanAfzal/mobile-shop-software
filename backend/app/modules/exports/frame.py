"""The one look of a report page (shopkeepers 2026-11-26, ADR-144): the person's khata report is the
page they asked every report to look like. The shop's own header, a title bar with the period and
when it was made, figure cards, bordered tables with a grey head, the shop's name and a signature
line at the foot.

`PRINT_SAFE` is the part every A4 report page carries, whoever builds it: the table head repeats on
each page and a row, a card or a heading is never split across two pages."""

import datetime as dt
import html

PRINT_SAFE = (
    "thead{display:table-header-group}tfoot{display:table-row-group}"
    "tr,.card,.st,.box,.sign{break-inside:avoid;page-break-inside:avoid}"
    "h2,h3{break-after:avoid;page-break-after:avoid}"
)

WORDS = {
    "made": ("Made on", "بنانے کی تاریخ"),
    "by": ("by", "از"),
    "sign": ("Signature", "دستخط"),
    "rows": ("rows", "سطریں"),
}


def css(ur: bool) -> str:
    side, other = ("right", "left") if ur else ("left", "right")
    font = (
        "'Noto Nastaliq Urdu', Manrope, Arial, sans-serif"
        if ur
        else "Manrope, 'Noto Nastaliq Urdu', Arial, sans-serif"
    )
    return f"""
@page {{ size: A4 portrait; margin: 10mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: {font}; color: #111; background: #fff; margin: 0; font-size: 11px; {"line-height: 1.8;" if ur else ""} }}
.n, .l {{ font-family: Manrope, Arial, sans-serif; font-variant-numeric: tabular-nums; }}
.l {{ direction: ltr; unicode-bidi: isolate; display: inline-block; }}
.ph h1 {{ font-size: 20px; margin: 0; }} .ph small {{ color: #444; font-size: 10.5px; }}
.top {{ display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 6px; margin-top: 8px; }}
.top b.t {{ font-size: 15px; }} .top .r {{ text-align: {other}; font-size: 10.5px; color: #333; }}
.period {{ font-size: 11.5px; font-weight: 700; margin-top: 2px; }}
.stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0 4px; }}
.st {{ border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; }}
.st span {{ font-size: 9.5px; color: #555; }} .st b {{ font-size: 14px; font-weight: 800; }}
h2 {{ font-size: 12.5px; letter-spacing: .04em; text-transform: uppercase; margin: 14px 0 5px; color: #333; }} h2 span {{ color: #666; font-weight: 600; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; text-align: {side}; overflow-wrap: anywhere; line-height: 1.35; }}
th {{ background: #f1f1f1; font-size: 0.92em; font-weight: 800; }}
td.n {{ text-align: {other}; white-space: nowrap; }}
.neg {{ color: #B42318; }}
tbody tr:nth-child(even) td {{ background: #FAFAF8; }}
.notes {{ color: #555; font-size: 9.5px; margin: 4px 0 0; padding-inline-start: 16px; }} .muted {{ color: #666; }}
.sign {{ display: flex; justify-content: space-between; gap: 12px; margin-top: 18px; font-size: 10.5px; color: #444; }}
{PRINT_SAFE}
"""


def shop_head(shop, ur: bool) -> str:
    """the shop's own header as on its bills; a plain name when there is no shop row"""
    from app.modules.auth import profile

    try:
        return profile.header_html(shop, ur)
    except AttributeError:
        name = getattr(shop, "name", "") or ""
        return f'<div class="ph" style="text-align:center"><h1>{html.escape(name)}</h1></div>'


def shell(
    shop,
    *,
    title: str,
    period: str | None,
    who: str | None,
    ur: bool,
    body: str,
    rows: int | None = None,
) -> str:
    e = html.escape
    i = 1 if ur else 0
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    name = (getattr(shop, "name_ur", None) if ur else None) or getattr(shop, "name", "") or ""
    made = f"{e(WORDS['made'][i])}: <span class='l'>{e(now)}</span>"
    if who:
        made += f" · {e(WORDS['by'][i])} {e(who)}"
    if rows is not None:
        made += f"<br><span class='l'>{rows}</span> {e(WORDS['rows'][i])}"
    return f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8">
<title>{e(title)} · {e(name)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>{css(ur)}</style></head><body class="{"ur" if ur else ""}">
{shop_head(shop, ur)}
<div class="top"><div><b class="t">{e(title)}</b>{f'<div class="period">{e(period)}</div>' if period else ""}</div><div class="r">{made}</div></div>
{body}
<div class="sign"><div>{e(name)} · {e(title)} · PKR</div><div>{e(WORDS["sign"][i])}: ____________________</div></div>
</body></html>"""
