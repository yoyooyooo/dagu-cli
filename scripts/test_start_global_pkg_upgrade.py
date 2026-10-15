import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("handoff", Path(__file__).with_name("start-global-pkg-upgrade.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class HandoffTests(unittest.TestCase):
    def test_lost_ack_and_rerun_create_once(self):
        stored = {}
        posts = []

        def request(method, path, body):
            if method == "POST":
                posts.append(body)
                stored.update(dagRunDetails={"dagRunId": body["dagRunId"],
                                             "name": "global-pkg-upgrade", "params": body["params"]})
                return 0, {}  # The write succeeded but its acknowledgement was lost.
            return (200, stored) if stored else (404, {})

        first = m.start("1.2.3", "example/repo", request, lambda _: None)
        second = m.start("1.2.3", "example/repo", request, lambda _: None)
        self.assertEqual(first, second)
        self.assertEqual(len(posts), 1)

    def test_conflicting_run_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, "identity_mismatch"):
            m.start("1.2.3", "example/repo", lambda *_: (200, {"dagRunDetails": {"params": "{}"}}), lambda _: None)

    def test_unknown_get_does_not_post(self):
        calls = []
        def request(method, *_):
            calls.append(method)
            return 0, {}
        with self.assertRaisesRegex(RuntimeError, "unconfirmed"):
            m.start("1.2.3", "example/repo", request, lambda _: None)
        self.assertEqual(calls, ["GET"] * 5)


if __name__ == "__main__":
    unittest.main()
