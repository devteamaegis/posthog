"""Tracked `requests.Session` factory.

`make_tracked_session(...)` returns a `requests.Session` whose adapters
intercept every dispatched request to feed the observer. Vendor SDKs that
accept a `requests.Session` (Stripe via `stripe.RequestsClient`, gspread,
hubspot-api-client, etc.) can be handed the result of this factory.

The intercept point is the adapter's `send()` rather than a `Session`
subclass, because some SDKs construct their own `Session` and we still
want the metering — they only need to mount the tracked adapter:

    session.mount("https://", make_tracked_adapter(...))
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

import requests
from requests import PreparedRequest, Response
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from posthog.temporal.data_imports.sources.common.http.observer import record_request
from posthog.temporal.data_imports.sources.common.mixins import _is_host_safe

DEFAULT_RETRY = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "HEAD", "OPTIONS"]),
    raise_on_status=False,
)


class TrackedHTTPAdapter(HTTPAdapter):
    """`HTTPAdapter` that records every dispatched request via the observer.

    `send()` is the lowest synchronous hook in the requests stack — it sees
    the fully-prepared request and the raw response, exception or not, with
    no SDK-specific framing on top.
    """

    def send(
        self,
        request: PreparedRequest,
        stream: bool = False,
        timeout: float | tuple[float, float] | tuple[float, None] | None = None,
        verify: bool | str = True,
        cert: bytes | str | tuple[bytes | str, bytes | str] | None = None,
        proxies: Mapping[str, str] | None = None,
    ) -> Response:
        started = time.monotonic()
        response: Response | None = None
        exception: BaseException | None = None
        try:
            response = super().send(
                request,
                stream=stream,
                timeout=timeout,
                verify=verify,
                cert=cert,
                proxies=proxies,
            )
            return response
        except BaseException as exc:
            exception = exc
            raise
        finally:
            try:
                record_request(
                    request,
                    response,
                    started_at_monotonic=started,
                    exception=exception,
                )
            except Exception:
                # Belt-and-braces: record_request should never raise, but if
                # something does we never want to mask the real outcome.
                pass


class BlockedHostError(requests.exceptions.RequestException):
    """Raised by `SSRFGuardedHTTPAdapter` when a request targets a host that
    resolves to an internal/private address."""


class SSRFGuardedHTTPAdapter(TrackedHTTPAdapter):
    """`TrackedHTTPAdapter` that rejects requests to internal/private hosts.

    The check runs in `send()`, so it covers *every* request the adapter
    dispatches — including pagination and redirect targets that only appear
    at runtime and so can't be vetted from static config up front. Validating
    the URLs visible in a config is not enough on its own: an upstream
    response can hand back a `next` link pointing anywhere.

    `_is_host_safe` is a no-op outside of PostHog Cloud, so this adds nothing
    for self-hosted instances.

    `team_id` selects the team whose internal-host allowlist applies (see
    `_is_host_safe`); `None` means no team context, so no allowlist exemption
    is granted and the host is checked unconditionally.
    """

    def __init__(self, team_id: int | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._team_id = team_id

    def send(
        self,
        request: PreparedRequest,
        stream: bool = False,
        timeout: float | tuple[float, float] | tuple[float, None] | None = None,
        verify: bool | str = True,
        cert: bytes | str | tuple[bytes | str, bytes | str] | None = None,
        proxies: Mapping[str, str] | None = None,
    ) -> Response:
        host = urlparse(request.url or "").hostname
        if not host:
            raise BlockedHostError(f"Request URL {request.url!r} is missing a hostname")
        ok, err = _is_host_safe(host, self._team_id)
        if not ok:
            raise BlockedHostError(f"Blocked request to host {host!r}: {err or 'host is not allowed'}")
        return super().send(
            request,
            stream=stream,
            timeout=timeout,
            verify=verify,
            cert=cert,
            proxies=proxies,
        )


def make_tracked_adapter(
    retry: Retry | None = None,
    *,
    team_id: int | None = None,
    **kwargs: Any,
) -> SSRFGuardedHTTPAdapter:
    """Construct an `SSRFGuardedHTTPAdapter`.

    Every adapter this factory returns is SSRF-guarded — it rejects requests
    to internal/private hosts on every request, including the runtime
    pagination and redirect targets that static config validation can't see.
    The guard is a no-op outside PostHog Cloud.

    `retry=None` (the default) uses the built-in `DEFAULT_RETRY` policy. To
    truly opt out of retries, pass `retry=Retry(total=0)`. To override with
    different retry settings, pass a custom `Retry` instance. Any extra
    kwargs are forwarded to `HTTPAdapter.__init__`.

    `team_id` is the team whose internal-host allowlist applies. Pass it
    whenever it's known so allowlisted teams keep their exemption; `None`
    just means no team context and no exemption.
    """
    if retry is None:
        retry = DEFAULT_RETRY
    return SSRFGuardedHTTPAdapter(team_id=team_id, max_retries=retry, **kwargs)


def make_tracked_session(
    *,
    retry: Retry | None = None,
    headers: dict[str, str] | None = None,
    team_id: int | None = None,
) -> requests.Session:
    """Return a fresh `requests.Session` with tracked, SSRF-guarded adapters.

    Every session this returns rejects requests to internal/private hosts on
    every request — including runtime pagination and redirect targets. See
    `make_tracked_adapter` for the `retry` parameter semantics — `None` uses
    `DEFAULT_RETRY`; pass `Retry(total=0)` to disable retries.

    `team_id` is the team whose internal-host allowlist applies. Pass it
    whenever it's known; `None` just means no allowlist exemption.
    """
    session = requests.Session()
    adapter = make_tracked_adapter(retry=retry, team_id=team_id)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    if headers:
        session.headers.update(headers)
    return session
