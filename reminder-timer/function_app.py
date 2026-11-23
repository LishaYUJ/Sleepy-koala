"""Independent Azure Functions timer: wakes the API even when its App Service is idle."""
import logging
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import azure.functions as func

app = func.FunctionApp()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@app.timer_trigger(schedule="0 * * * * *", arg_name="timer", run_on_startup=False, use_monitor=True)
def dispatch_reminders(timer: func.TimerRequest) -> None:
    endpoint = os.environ["REMINDER_API_URL"].rstrip("/")
    key = os.environ["REMINDER_DISPATCH_KEY"]
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("REMINDER_API_URL must be an HTTPS API origin without credentials or query")
    if len(key) < 32:
        raise ValueError("REMINDER_DISPATCH_KEY must contain at least 32 characters")
    request = urllib.request.Request(
        endpoint + "/api/internal/reminders/dispatch",
        data=b"",
        headers={"X-Reminder-Key": key},
        method="POST",
    )
    # The independent timer fires every minute. The API only catches up within five minutes,
    # so a delayed timer cannot deliver yesterday's reminders. No secrets in logs.
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=100) as response:
            if response.status != 204:
                raise RuntimeError("Unexpected reminder dispatcher response")
    except urllib.error.HTTPError as error:
        logging.error("Reminder dispatcher returned HTTP %s", error.code)
        raise RuntimeError("Reminder dispatch failed; check API health and scheduler configuration") from None
    except urllib.error.URLError:
        raise RuntimeError("Reminder API could not be reached; next timer tick will retry") from None
