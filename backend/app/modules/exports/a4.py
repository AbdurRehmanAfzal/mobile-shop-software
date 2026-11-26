"""A4 report page shared by the long reports (owner 2026-11-15, ADR-084): the shop's header (name,
address, number, the chosen period, who printed it and when), figure boxes, then sections — each a
title, a table and notes. Fits A4 portrait whatever the number of columns: more columns get smaller
type and wrap; table headers repeat on each page; a row is never split; numbers are right-aligned
and signed. The same page prints from the browser and becomes the app's PDF."""

import datetime as dt
import html
from decimal import Decimal

from fastapi.responses import Response

from app.modules.exports import frame, options

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
    # ADR-144: the columns the reader left out, cost and profit when asked
    every = options.labels([sec["header"] for sec in sections])
    o = options.get()
    if o and o.cols:
        return options.fields([sec["header"] for sec in sections])
    stats = options.stats(stats)
    stat_html = "".join(
        f'<div class="st"><span>{e(k)}</span><b class="n{" neg" if isinstance(v, NUM) and v < 0 else ""}">{e(_s(v))}</b></div>'
        for k, v in stats
    )
    parts = []
    for sec in sections:
        notes = "".join(f"<li>{e(str(x))}</li>" for x in sec.get("notes") or [])
        header, rows = options.cut(list(sec["header"]), sec["rows"], every)
        count = sec.get("count")
        parts.append(
            f"<section><h2>{e(sec['title'])}{f' <span>· {count}</span>' if count is not None else ''}</h2>"
            f"{_table(header, rows)}"
            f"{f'<ul class=notes>{notes}</ul>' if notes else ''}</section>"
        )
    out = frame.shell(
        shop,
        title=title,
        period=period,
        who=who,
        ur=ur,
        body=(f'<div class="stats">{stat_html}</div>' if stats else "") + "".join(parts),
    )
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

    every = options.labels([sec["header"] for sec in sections])
    o = options.get()
    if o and o.cols:
        return options.fields([sec["header"] for sec in sections])
    stats = options.stats(stats)
    sections = [
        {
            **sec,
            **dict(
                zip(
                    ("header", "rows"),
                    options.cut(list(sec["header"]), sec["rows"], every),
                    strict=True,
                )
            ),
        }
        for sec in sections
    ]
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
