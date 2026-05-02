import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "hermes_openclaw_compat.py"


def load_module():
    spec = importlib.util.spec_from_file_location("hermes_openclaw_compat", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CompatHelpersTest(unittest.TestCase):
    def setUp(self):
        self.mod = load_module()

    def test_convert_every_schedule_to_human_interval(self):
        self.assertEqual(
            self.mod.schedule_to_hermes({"kind": "every", "everyMs": 30 * 60 * 1000}),
            "every 30m",
        )
        self.assertEqual(
            self.mod.schedule_to_hermes({"kind": "every", "everyMs": 2 * 60 * 60 * 1000}),
            "every 2h",
        )

    def test_convert_cron_schedule_expr_passthrough(self):
        self.assertEqual(
            self.mod.schedule_to_hermes({"kind": "cron", "expr": "0 9 * * *"}),
            "0 9 * * *",
        )

    def test_map_session_row_to_openclaw_shape(self):
        session = self.mod.session_to_openclaw(
            {
                "id": "sess-123",
                "title": "Hermes Session",
                "message_count": 4,
                "last_active": 1710000000,
            }
        )
        self.assertEqual(session["key"], "sess-123")
        self.assertEqual(session["label"], "Hermes Session")
        self.assertEqual(session["agentKey"], "hermes")
        self.assertEqual(session["messageCount"], 4)
        self.assertTrue(session["lastActivity"].endswith("Z"))

    def test_map_messages_to_chat_history_shape(self):
        messages = self.mod.messages_to_chat_history(
            [
                {"id": 1, "role": "user", "content": "hello", "timestamp": 1710000000},
                {"id": 2, "role": "assistant", "content": "world", "timestamp": 1710000001},
                {"id": 3, "role": "tool", "content": "ignore", "timestamp": 1710000002},
            ]
        )
        self.assertEqual(
            messages,
            [
                {
                    "id": "1",
                    "role": "user",
                    "text": "hello",
                    "timestamp": "2024-03-09T16:00:00Z",
                },
                {
                    "id": "2",
                    "role": "assistant",
                    "text": "world",
                    "timestamp": "2024-03-09T16:00:01Z",
                },
            ],
        )

    def test_map_models_and_current_selection(self):
        payload = self.mod.models_to_chat_payload(
            {
                "data": [
                    {"id": "hermes-agent", "name": "Hermes Agent"},
                    {"id": "gpt-5.3-codex"},
                ]
            },
            current_model="gpt-5.4",
            favorite_models=["gpt-5.4", "gpt-5.4-mini"],
        )
        self.assertEqual(payload["currentModel"], "gpt-5.4")
        self.assertEqual(payload["agentLabel"], "Hermes Agent")
        self.assertEqual(
            [item["id"] for item in payload["models"]],
            ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
        )
        self.assertEqual(payload["models"][0]["provider"], "hermes")
        self.assertFalse(payload["models"][0]["local"])

    def test_map_job_to_openclaw_shape(self):
        job = self.mod.job_to_openclaw(
            {
                "id": "job-1",
                "name": "Daily",
                "schedule": "every 1d",
                "enabled": True,
                "created_at": "2026-04-17T12:00:00Z",
                "next_run_at": "2026-04-18T12:00:00Z",
                "last_run_at": "2026-04-17T12:30:00Z",
                "last_run_status": "ok",
            }
        )
        self.assertEqual(job["schedule"], {"kind": "every", "everyMs": 86400000})
        self.assertEqual(job["state"]["lastRunStatus"], "ok")
        self.assertEqual(job["createdAt"], "2026-04-17T12:00:00Z")


if __name__ == "__main__":
    unittest.main()
