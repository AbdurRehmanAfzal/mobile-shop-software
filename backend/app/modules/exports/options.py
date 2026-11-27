"""What the reader chose for a report (shopkeepers 2026-11-26, ADR-144): which columns to leave out
and whether cost and profit are printed. One place for every report that is made by `_file` or
`a4.page`, so each of them takes the same three query parameters without knowing about them:

- `rcols=1`   — answer with the report's columns (JSON) instead of the report, for the app's ticks;
- `rhide=0,3` — leave out these columns (the numbers `rcols` gave);
- `rnocost=1` — leave out every cost / profit column and figure box.

They only ever remove what the login was already given — a login without VIEW_COST gets no cost
column to begin with (each report's own rule), and nothing here can add one."""

import re
from contextvars import ContextVar
from dataclasses import dataclass
from urllib.parse import parse_qs

from fastapi.responses import JSONResponse

# a column or figure that tells what the shop paid or earned (English and Urdu report words)
COSTY = re.compile(
    r"\bcost|profit|margin|\bearn|\bcogs\b|purchase price|bought for|buy price"
    r"|خرید قیمت|خرید کی قیمت|لاگت|منافع|نفع",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Opts:
    cols: bool = False
    hide: frozenset[int] = frozenset()
    nocost: bool = False
    # the dates the report was asked for, for its title bar
    d_from: str = ""
    d_to: str = ""


_OPTS: ContextVar[Opts | None] = ContextVar("report_opts", default=None)


def get() -> Opts | None:
    return _OPTS.get()


class ReportOptionsMiddleware:
    """reads the three parameters into the request's context (pure ASGI, so the value reaches the
    endpoint whatever thread it runs on)"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        qs = scope.get("query_string", b"") if scope["type"] == "http" else b""
        if not any(
            k in qs for k in (b"rcols=", b"rhide=", b"rnocost=", b"date_from=", b"date_to=")
        ):
            return await self.app(scope, receive, send)
        q = parse_qs(qs.decode("latin-1"))
        on = lambda k: (q.get(k) or [""])[0].lower() in ("1", "true", "yes")
        hide = frozenset(
            int(x) for v in q.get("rhide", []) for x in v.split(",") if x.strip().isdigit()
        )
        day = lambda k: (q.get(k) or [""])[0][:10]
        token = _OPTS.set(
            Opts(
                cols=on("rcols"),
                hide=hide,
                nocost=on("rnocost"),
                d_from=day("date_from"),
                d_to=day("date_to"),
            )
        )
        try:
            await self.app(scope, receive, send)
        finally:
            _OPTS.reset(token)


def labels(headers: list[list]) -> list[str]:
    """every column of the report once, in the order met (a report of several tables shares them)"""
    out: list[str] = []
    for h in headers:
        for x in h:
            x = str(x)
            if x not in out:
                out.append(x)
    return out


def is_cost(label) -> bool:
    return bool(COSTY.search(str(label)))


def fields(headers: list[list]) -> JSONResponse:
    return JSONResponse(
        {
            "fields": [
                {"i": i, "label": x, "cost": is_cost(x)} for i, x in enumerate(labels(headers))
            ]
        }
    )


def cut(header: list, rows: list[list], every: list[str] | None = None) -> tuple[list, list[list]]:
    """the table without the columns left out; never an empty table"""
    o = get()
    if not o or not (o.hide or o.nocost):
        return header, rows
    every = every if every is not None else labels([header])
    gone = {x for i, x in enumerate(every) if i in o.hide}
    keep = [i for i, h in enumerate(header) if str(h) not in gone and not (o.nocost and is_cost(h))]
    if not keep:
        keep = [0] if header else []
    if len(keep) == len(header):
        return header, rows
    return [header[i] for i in keep], [[r[i] for i in keep if i < len(r)] for r in rows]


def stats(items: list[tuple]) -> list[tuple]:
    """figure boxes: cost and profit ones are left out when asked"""
    o = get()
    if not o or not o.nocost:
        return items
    return [x for x in items if not is_cost(x[0])]
