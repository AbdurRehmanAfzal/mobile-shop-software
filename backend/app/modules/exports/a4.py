"""A4 report page shared by the long reports (owner 2026-11-15, ADR-084): the shop's header (name,
address, number, the chosen period, who printed it and when), figure boxes, then sections — each a
title, a table and notes. Fits A4 portrait whatever the number of columns: more columns get smaller
type and wrap; table headers repeat on each page; a row is never split; numbers are right-aligned
and signed. The same page prints from the browser and becomes the app's PDF."""

import datetime as dt
import html
from decimal import Decimal

from fastapi.responses import Response

NUM = (int, float, Decimal)


def _s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "✓" if v else ""
    if isinstance(v, Decimal | float):
        return f"{v:,.0f}" if v == int(v) else f"{v:,.2f}"
    if isinstance(v, int):
        return f"{v:,}"
    if isinstance(v, dt.datetime):
        return v.strftime("%d-%m-%Y %I:%M %p")
    if isinstance(v, dt.date):
        return v.strftime("%d-%m-%Y")
    return str(v)


def _table(header: list, rows: list[list]) -> str:
    e = html.escape
    n = max(1, len(header))
    fs, pad = (10.5, "4px 6px") if n <= 5 else (9.5, "3px 5px") if n <= 8 else (8.5, "2px 3px")
    head = "".join(f"<th>{e(str(h))}</th>" for h in header)
    body = (
        "".join(
            "<tr>"
            + "".join(
                f'<td class="{"n neg" if isinstance(v, NUM) and v < 0 else "n" if isinstance(v, NUM) else ""}" dir="auto">{e(_s(v))}</td>'
                for v in r
            )
            + "</tr>"
            for r in rows
        )
        or f'<tr><td colspan="{n}" class="muted">—</td></tr>'
    )
    return f'<table style="font-size:{fs}px" data-pad="{pad}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def page(
    *,
    shop,
    title: str,
    period: str,
    who: str | None,
    stats: list[tuple[str, object]],
    sections: list[dict],
    ur: bool = False,
) -> Response:
    """sections: [{"title", "header": [...], "rows": [[...]], "notes": [...] (optional)}]"""
    e = html.escape
    addr = " · ".join(
        x
        for x in (
            getattr(shop, "address", None),
            getattr(shop, "city", None),
            getattr(shop, "phone", None),
            f"NTN {shop.ntn}" if getattr(shop, "ntn", None) else None,
        )
        if x
    )
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    stat_html = "".join(
        f'<div class="st"><span>{e(k)}</span><b class="n{" neg" if isinstance(v, NUM) and v < 0 else ""}">{e(_s(v))}</b></div>'
        for k, v in stats
    )
    parts = []
    for sec in sections:
        notes = "".join(f"<li>{e(str(x))}</li>" for x in sec.get("notes") or [])
        count = sec.get("count")
        parts.append(
            f"<section><h2>{e(sec['title'])}{f' <span>· {count}</span>' if count is not None else ''}</h2>"
            f"{_table(sec['header'], sec['rows'])}"
            f"{f'<ul class=notes>{notes}</ul>' if notes else ''}</section>"
        )
    css = """
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Manrope, 'Noto Nastaliq Urdu', Arial, sans-serif; color: #111; margin: 0; font-size: 10.5px; }
body.ur { font-family: 'Noto Nastaliq Urdu', Manrope, Arial, sans-serif; line-height: 1.8; }
.n { font-family: Manrope, Arial, sans-serif; font-variant-numeric: tabular-nums; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 6px; }
.top h1 { font-size: 18px; margin: 0; } .top .sub { color: #444; font-size: 10.5px; margin-top: 2px; }
.top .right { text-align: end; font-size: 10.5px; } .top .right b { font-size: 14px; display: block; }
.period { margin: 6px 0 0; font-size: 11.5px; font-weight: 700; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 8px 0 4px; }
.st { border: 1px solid #999; border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; break-inside: avoid; }
.st span { font-size: 9px; color: #333; } .st b { font-size: 13px; }
h2 { font-size: 13px; margin: 12px 0 4px; break-after: avoid; } h2 span { color: #555; font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; } tr { break-inside: avoid; }
th, td { border: 1px solid #aaa; padding: 3px 5px; vertical-align: top; text-align: start; overflow-wrap: anywhere; line-height: 1.3; }
th { background: #eee; font-size: 0.92em; }
td.n { text-align: end; white-space: nowrap; }
.neg { color: #B42318; }
tbody tr:nth-child(even) td { background: #FAFAF8; }
.notes { color: #555; font-size: 9.5px; margin: 4px 0 0; padding-inline-start: 16px; } .muted { color: #666; }
.foot { margin-top: 14px; color: #666; font-size: 9px; border-top: 1px solid #ccc; padding-top: 4px; }
"""
    shop_name = (
        getattr(shop, "name_ur", None)
        if ur and getattr(shop, "name_ur", None)
        else getattr(shop, "name", "")
    )
    out = f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8">
<title>{e(title)} · {e(shop_name or "")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>{css}</style></head><body class="{"ur" if ur else ""}">
<div class="top"><div><h1>{e(shop_name or "")}</h1><div class="sub">{e(addr)}</div></div>
<div class="right"><b>{e(title)}</b>{e(now)}{(" · " + e(who)) if who else ""}</div></div>
<div class="period">{e(period)}</div>
{f'<div class="stats">{stat_html}</div>' if stats else ""}
{"".join(parts)}
<div class="foot">{e(shop_name or "")} · {e(title)} · {e(period)} · PKR</div>
</body></html>"""
    return Response(content=out, media_type="text/html; charset=utf-8")


def workbook(
    name: str, title: str, period: str, stats: list[tuple[str, object]], sections: list[dict]
) -> Response:
    """the same report as Excel: a Summary sheet (figures) and a sheet per section, set for A4"""
    import io

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.properties import PageSetupProperties

    def num(v):
        return float(v) if isinstance(v, Decimal) else v

    def setup(ws, cols: int):
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.orientation = "landscape" if cols > 6 else "portrait"
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0

    wb = Workbook()
    s = wb.active
    s.title = "Summary"
    s.append([title])
    s["A1"].font = Font(bold=True, size=14)
    s.append([period])
    s.append([])
    for k, v in stats:
        s.append([k, num(v)])
        s.cell(row=s.max_row, column=1).font = Font(bold=True)
    s.column_dimensions["A"].width = 34
    s.column_dimensions["B"].width = 18
    setup(s, 2)
    used: set[str] = {"Summary"}
    for sec in sections:
        base = "".join(ch for ch in sec["title"] if ch not in "[]:*?/\\")[:28] or "Sheet"
        nm, k = base, 2
        while nm in used:
            nm, k = f"{base[:25]} {k}", k + 1
        used.add(nm)
        ws = wb.create_sheet(nm)
        ws.append(list(sec["header"]))
        for c in ws[1]:
            c.font = Font(bold=True)
            c.fill = PatternFill("solid", fgColor="E6E2DA")
        for r in sec["rows"]:
            ws.append([num(v) for v in r])
        ws.freeze_panes = "A2"
        ws.print_title_rows = "1:1"
        for i, col in enumerate(zip(sec["header"], *sec["rows"], strict=False), start=1):
            width = max(len(_s(v)) for v in col) + 2
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(
                max(width, 8), 40
            )
        setup(ws, len(sec["header"]))
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'},
    )
