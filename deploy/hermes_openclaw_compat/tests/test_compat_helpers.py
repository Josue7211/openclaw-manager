import importlib.util
import os
import pathlib
import tempfile
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

    def test_password_falls_back_for_http_bearer(self):
        old_api_key = os.environ.get("OPENCLAW_API_KEY")
        old_password = os.environ.get("OPENCLAW_PASSWORD")
        try:
            os.environ.pop("OPENCLAW_API_KEY", None)
            os.environ["OPENCLAW_PASSWORD"] = "legacy-token"
            service = self.mod.CompatService()
            self.assertTrue(service._compare_bearer("Bearer legacy-token"))
            self.assertTrue(service._compare_ws_token("legacy-token"))
            self.assertFalse(service._compare_bearer("Bearer wrong-token"))

            os.environ["OPENCLAW_API_KEY"] = "api-token"
            service = self.mod.CompatService()
            self.assertTrue(service._compare_bearer("Bearer api-token"))
            self.assertFalse(service._compare_bearer("Bearer legacy-token"))
            self.assertTrue(service._compare_ws_token("legacy-token"))
        finally:
            if old_api_key is None:
                os.environ.pop("OPENCLAW_API_KEY", None)
            else:
                os.environ["OPENCLAW_API_KEY"] = old_api_key
            if old_password is None:
                os.environ.pop("OPENCLAW_PASSWORD", None)
            else:
                os.environ["OPENCLAW_PASSWORD"] = old_password

    def test_auth_fails_closed_when_public_tokens_missing(self):
        old_api_key = os.environ.get("OPENCLAW_API_KEY")
        old_password = os.environ.get("OPENCLAW_PASSWORD")
        try:
            os.environ.pop("OPENCLAW_API_KEY", None)
            os.environ.pop("OPENCLAW_PASSWORD", None)
            service = self.mod.CompatService()
            self.assertFalse(service._compare_bearer(""))
            self.assertFalse(service._compare_bearer("Bearer anything"))
            self.assertFalse(service._compare_ws_token(""))
            self.assertFalse(service._compare_ws_token("anything"))
        finally:
            if old_api_key is None:
                os.environ.pop("OPENCLAW_API_KEY", None)
            else:
                os.environ["OPENCLAW_API_KEY"] = old_api_key
            if old_password is None:
                os.environ.pop("OPENCLAW_PASSWORD", None)
            else:
                os.environ["OPENCLAW_PASSWORD"] = old_password

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
                    {"id": "gpt-5.5"},
                ]
            },
            current_model="gpt-5.5",
            favorite_models=["gpt-5.5", "gpt-5.4"],
        )
        self.assertEqual(payload["currentModel"], "gpt-5.5")
        self.assertEqual(payload["agentLabel"], "Hermes Agent")
        self.assertEqual(
            [item["id"] for item in payload["models"]],
            ["gpt-5.4", "gpt-5.5"],
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

    def test_workspace_files_include_hermes_memd_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            old_home = os.environ.get("HERMES_HOME")
            old_runtime = os.environ.get("COMPAT_RUNTIME_DIR")
            os.environ["HERMES_HOME"] = str(root)
            os.environ["COMPAT_RUNTIME_DIR"] = str(root / ".compat")
            try:
                (root / "SOUL.md").write_text("soul", encoding="utf-8")
                (root / "memories").mkdir()
                (root / "memories" / "MEMORY.md").write_text("memory", encoding="utf-8")
                (root / "memories" / "USER.md").write_text("user", encoding="utf-8")
                (root / "AGENTS.md").write_text("agents", encoding="utf-8")
                (root / "hermes-agent").mkdir()
                (root / "hermes-agent" / "README.md").write_text("readme", encoding="utf-8")
                (root / ".memd" / "compiled" / "memory").mkdir(parents=True)
                (root / ".memd" / "wake.md").write_text("wake", encoding="utf-8")
                (root / ".memd" / "mem.md").write_text("mem", encoding="utf-8")
                (root / ".memd" / "compiled" / "memory" / "working.md").write_text("working", encoding="utf-8")

                service = self.mod.CompatService()
                files = service.list_workspace_files()

                self.assertIn({"name": "SOUL.md", "path": "SOUL.md"}, files["coreFiles"])
                self.assertIn({"name": "MEMORY.md", "path": "memories/MEMORY.md"}, files["coreFiles"])
                self.assertIn({"name": "USER.md", "path": "memories/USER.md"}, files["coreFiles"])
                self.assertIn({"name": "AGENTS.md", "path": "AGENTS.md"}, files["coreFiles"])
                self.assertNotIn({"name": "README.md", "path": "hermes-agent/README.md"}, files["coreFiles"])
                self.assertIn({"name": "wake.md", "path": ".memd/wake.md"}, files["memdFiles"])
                self.assertIn({"name": "working.md", "path": ".memd/compiled/memory/working.md"}, files["memdFiles"])
                self.assertEqual(files["memoryFiles"], [])
            finally:
                if old_home is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = old_home
                if old_runtime is None:
                    os.environ.pop("COMPAT_RUNTIME_DIR", None)
                else:
                    os.environ["COMPAT_RUNTIME_DIR"] = old_runtime

    def test_workspace_files_can_use_hermes_parent_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            hermes_code = root / ".hermes" / "hermes-agent"
            workspace = root / ".hermes"
            old_home = os.environ.get("HERMES_HOME")
            old_workspace = os.environ.get("HERMES_WORKSPACE_HOME")
            old_runtime = os.environ.get("COMPAT_RUNTIME_DIR")
            os.environ["HERMES_HOME"] = str(hermes_code)
            os.environ["COMPAT_RUNTIME_DIR"] = str(root / ".compat")
            os.environ.pop("HERMES_WORKSPACE_HOME", None)
            try:
                hermes_code.mkdir(parents=True)
                (workspace / ".memd").mkdir()
                (workspace / "SOUL.md").write_text("soul", encoding="utf-8")
                (workspace / "memories").mkdir()
                (workspace / "memories" / "MEMORY.md").write_text("memory", encoding="utf-8")
                (workspace / "memories" / "USER.md").write_text("user", encoding="utf-8")
                (workspace / ".memd" / "wake.md").write_text("wake", encoding="utf-8")

                service = self.mod.CompatService()
                files = service.list_workspace_files()

                self.assertIn({"name": "SOUL.md", "path": "SOUL.md"}, files["coreFiles"])
                self.assertIn({"name": "MEMORY.md", "path": "memories/MEMORY.md"}, files["coreFiles"])
                self.assertIn({"name": "USER.md", "path": "memories/USER.md"}, files["coreFiles"])
                self.assertIn({"name": "wake.md", "path": ".memd/wake.md"}, files["memdFiles"])
            finally:
                if old_home is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = old_home
                if old_workspace is None:
                    os.environ.pop("HERMES_WORKSPACE_HOME", None)
                else:
                    os.environ["HERMES_WORKSPACE_HOME"] = old_workspace
                if old_runtime is None:
                    os.environ.pop("COMPAT_RUNTIME_DIR", None)
                else:
                    os.environ["COMPAT_RUNTIME_DIR"] = old_runtime

    def test_legacy_hermes_home_keeps_code_root_separate_from_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            hermes_code = root / ".hermes" / "hermes-agent"
            workspace = root / ".hermes"
            old_home = os.environ.get("HERMES_HOME")
            old_runtime = os.environ.get("COMPAT_RUNTIME_DIR")
            os.environ["HERMES_HOME"] = str(hermes_code)
            os.environ["COMPAT_RUNTIME_DIR"] = str(root / ".compat")
            try:
                hermes_code.mkdir(parents=True)
                (workspace / "SOUL.md").write_text("soul", encoding="utf-8")

                service = self.mod.CompatService()

                self.assertEqual(service.hermes_code_home, hermes_code)
                self.assertEqual(service.hermes_home, workspace)
                self.assertEqual(service.workspace_home, workspace)
            finally:
                if old_home is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = old_home
                if old_runtime is None:
                    os.environ.pop("COMPAT_RUNTIME_DIR", None)
                else:
                    os.environ["COMPAT_RUNTIME_DIR"] = old_runtime

    def test_workspace_file_read_write_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            old_home = os.environ.get("HERMES_HOME")
            old_runtime = os.environ.get("COMPAT_RUNTIME_DIR")
            os.environ["HERMES_HOME"] = str(root)
            os.environ["COMPAT_RUNTIME_DIR"] = str(root / ".compat")
            try:
                service = self.mod.CompatService()
                service.write_workspace_file(".memd/mem.md", "memory")

                self.assertEqual(service.read_workspace_file(".memd/mem.md"), "memory")
                with self.assertRaises(ValueError):
                    service.read_workspace_file("../outside.md")
            finally:
                if old_home is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = old_home
                if old_runtime is None:
                    os.environ.pop("COMPAT_RUNTIME_DIR", None)
                else:
                    os.environ["COMPAT_RUNTIME_DIR"] = old_runtime


if __name__ == "__main__":
    unittest.main()
