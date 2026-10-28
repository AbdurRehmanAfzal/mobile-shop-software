"""A small clock inside the API process: every minute, queue what is due (night report, reminders)
and send queued WhatsApp messages through the Cloud API. No extra service to run on the VPS; with
two workers both tick, and `job_runs` plus the per-message claim keep every send single."""

import asyncio
import logging

from app.core.config import settings

log = logging.getLogger("notifications")


def _run_once() -> None:
    from app.db.session import SessionLocal
    from app.modules.notifications import jobs

    with SessionLocal() as db:
        ran = jobs.tick(db)
        sent = jobs.dispatch(db)
    if any(ran.values()) or any(sent.values()):
        log.info("scheduler: %s, dispatched %s", ran, sent)


async def loop(every: int = 60) -> None:
    await asyncio.sleep(15)  # let the app finish starting
    while True:
        try:
            await asyncio.to_thread(_run_once)
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(every)


def start() -> asyncio.Task | None:
    if not settings.scheduler_enabled or settings.app_env == "test":
        return None
    return asyncio.get_event_loop().create_task(loop())
