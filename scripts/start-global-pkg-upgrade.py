#!/usr/bin/env python3
"""Idempotent release handoff. A lost response is reconciled before another POST."""
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request


def start(version, repository, request, pause=time.sleep):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?", version):
        raise RuntimeError("invalid_package_version")
    params = {"package": "dagu-cli", "manager": "bun", "version": version}
    run_id = "publish-dagu-cli-" + hashlib.sha256(
        f"{repository}:dagu-cli:{version}".encode()).hexdigest()[:32]
    detail = f"/dag-runs/global-pkg-upgrade/{run_id}"
    for attempt in range(5):
        status, body = request("GET", detail, None)
        if status == 200:
            run = body.get("dagRunDetails", {})
            try:
                actual = json.loads(run.get("params", "{}"))
            except (ValueError, TypeError):
                actual = None
            if (run.get("dagRunId") != run_id or
                    run.get("name") != "global-pkg-upgrade" or actual != params):
                raise RuntimeError("existing_run_identity_mismatch")
            print(f"dag_run_id={run_id} handoff=confirmed")
            return run_id
        if status == 404:
            status, body = request("POST", "/dags/global-pkg-upgrade/start",
                                   {"dagRunId": run_id, "params": json.dumps(params)})
            if status not in (0, 200, 409, 429) and status < 500:
                raise RuntimeError(f"dag_start_http_{status}")
            # Even a successful POST must be read back with matching parameters.
        elif status not in (0, 429) and status < 500:
            raise RuntimeError(f"dag_readback_http_{status}")
        pause(min(2 ** attempt, 8))
    raise RuntimeError("dag_handoff_unconfirmed")


def main():
    base = os.environ["DAGU_BASE_URL"].rstrip("/") + "/api/v1"
    key = os.environ["DAGU_API_KEY"]
    if not key:
        raise RuntimeError("dagu_api_key_missing")

    def request(method, path, body):
        req = urllib.request.Request(
            base + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Authorization": "Bearer " + key,
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return res.status, json.load(res)
        except urllib.error.HTTPError as exc:
            return exc.code, {}  # Never print provider response bodies.
        except (OSError, ValueError):
            return 0, {}

    start(os.environ["PACKAGE_VERSION"], os.environ["GITHUB_REPOSITORY"], request)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("global_pkg_upgrade_handoff_failed", file=sys.stderr)
        sys.exit(1)
