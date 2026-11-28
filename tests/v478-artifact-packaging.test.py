"""Offline ZIP, digest, provenance and transport tests for the v478 packaging gate."""
from datetime import datetime, timezone
from importlib.util import module_from_spec, spec_from_file_location
import io
import json
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
import warnings
from zipfile import ZipFile, ZipInfo, ZIP_STORED

SPEC = spec_from_file_location("v478_artifacts", Path(__file__).resolve().parent.parent / "scripts/verify-and-package-v478-artifact.py")
gate = module_from_spec(SPEC)
SPEC.loader.exec_module(gate)
ASSET = "assets/lazy-AbCd0123.js"
WORKBOX = "workbox-9c191d2f.js"
IDENTITY = {"workerVersion": "v478-fixture", "deploymentId": "lab", "releaseSha": "a" * 40, "releaseRunId": 22}
GIT_SHA = "b" * 40


def archive(entries, create_system=3):
    out = io.BytesIO()
    with warnings.catch_warnings(), ZipFile(out, "w") as z:
        warnings.simplefilter("ignore", UserWarning)
        for name, data, kind in entries:
            info = ZipInfo(name)
            info.create_system = create_system
            info.external_attr = ((kind | 0o644) << 16) if create_system == 3 else 0x20
            info.compress_type = ZIP_STORED
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                z.writestr(info, data)
    return out.getvalue()


class PackagingTest(unittest.TestCase):
    def setUp(self):
        self.asset = b"lazy JS"
        self.workbox = b"Workbench JS"
        self.manifest = json.dumps({"schema": 1, **IDENTITY, "assets": {ASSET: gate.digest(self.asset)}}).encode()
        self.entries = [(ASSET, self.asset, stat.S_IFREG), (WORKBOX, self.workbox, stat.S_IFREG),
                        ("manifest.json", self.manifest, stat.S_IFREG)]

    def pin(self, raw, manifest=None):
        return {"servingRelease": IDENTITY, "assetCount": 1, "capsuleSha256": gate.digest(raw),
                "manifestSha256": gate.digest(self.manifest if manifest is None else manifest),
                "auxiliaryAssets": {WORKBOX: gate.digest(self.workbox)}}

    def rejects(self, entries, code, manifest=None, overrides=None):
        raw = archive(entries)
        with self.assertRaisesRegex(ValueError, "^" + code + "$"):
            gate.inspect_capsule(raw, {**self.pin(raw, manifest), **(overrides or {})})

    def replace(self, name, data, kind=stat.S_IFREG):
        return [(n, b, k) if n != name else (name, data, kind) for n, b, k in self.entries]

    def test_path_traversal(self):
        self.rejects(self.entries + [("assets/../unexpected.txt", b"fixture", stat.S_IFREG)], "ZIP_PATH_NOT_ALLOWED")

    def test_symlink(self):
        self.rejects(self.replace(ASSET, b"fixture", stat.S_IFLNK), "ZIP_ENTRY_NOT_REGULAR")

    def test_duplicate_member(self):
        self.rejects(self.entries + self.entries[:1], "DUPLICATE_ZIP_ENTRY")

    def test_case_collision(self):
        self.rejects(self.entries + [("assets/Lazy-AbCd0123.js", b"x", stat.S_IFREG)], "DUPLICATE_ZIP_ENTRY")

    def test_wrong_asset_digest(self):
        self.rejects(self.replace(ASSET, b"wrong bytes"), "ASSET_DIGEST_MISMATCH")
        self.rejects(self.replace(WORKBOX, b"wrong Workbox"), "ASSET_DIGEST_MISMATCH")

    def test_wrong_manifest_digest(self):
        self.rejects(self.entries, "MANIFEST_DIGEST_MISMATCH", overrides={"manifestSha256": "0" * 64})

    def test_duplicate_manifest_key(self):
        raw = self.manifest.replace(b"{", b'{"schema":1,', 1)
        self.rejects(self.replace("manifest.json", raw), "DUPLICATE_JSON_KEY", manifest=raw)

    def test_wrong_inner_or_outer_digest_and_missing_workbox(self):
        raw = archive(self.entries)
        with self.assertRaisesRegex(ValueError, "CAPSULE_DIGEST_MISMATCH"):
            gate.inspect_capsule(raw, {**self.pin(raw), "capsuleSha256": "0" * 64})
        wrapper = archive([(gate.CAPSULE, raw, stat.S_IFREG)])
        with self.assertRaisesRegex(ValueError, "GITHUB_ZIP_DIGEST_MISMATCH"):
            gate.inspect_outer(wrapper, gate.digest(raw), self.pin(raw))
        self.rejects([e for e in self.entries if e[0] != WORKBOX], "CAPSULE_INVENTORY_MISMATCH")

    def test_limits_and_wrapper_scope(self):
        raw = archive(self.entries)
        with self.assertRaisesRegex(ValueError, "ZIP_EXPANDED_LIMIT"):
            gate.read_zip(raw, lambda _: True, 3, 4)
        with self.assertRaisesRegex(ValueError, "ZIP_MEMBER_LIMIT"):
            gate.read_zip(raw, lambda _: True, 3, 4096, 4)
        for bad in ("elsewhere.zip", "../" + gate.CAPSULE):
            wrapped = archive([(bad, raw, stat.S_IFREG)])
            with self.assertRaisesRegex(ValueError, "ZIP_PATH_NOT_ALLOWED"):
                gate.inspect_outer(wrapped, gate.digest(wrapped), self.pin(raw))
        wrapper = archive([(gate.CAPSULE, raw, stat.S_IFREG)], create_system=0)
        self.assertEqual(gate.inspect_outer(wrapper, gate.digest(wrapper), self.pin(raw))[WORKBOX], self.workbox)

    def test_exact_github_run_artifact_provenance(self):
        raw = archive(self.entries)
        wrapper = archive([(gate.CAPSULE, raw, stat.S_IFREG)])
        inner_pin = self.pin(raw)
        digest = gate.digest(wrapper)
        original = dict(id=33, name="v478-frontend-assets", expired=False, size_in_bytes=len(wrapper),
                        digest="sha256:" + digest, expires_at="2026-12-31T00:00:00Z",
                        workflow_run=dict(id=44, repository_id=gate.REPO_ID, head_repository_id=gate.REPO_ID,
                                          head_branch="main", head_sha=GIT_SHA))
        run = dict(id=44, path=gate.PUBLISH_WORKFLOW, head_branch="main", head_sha=GIT_SHA,
                   event="workflow_dispatch", run_attempt=1, status="completed", conclusion="success",
                   repository=dict(id=gate.REPO_ID), head_repository=dict(id=gate.REPO_ID),
                   actor=dict(id=gate.OWNER_ID), triggering_actor=dict(id=gate.OWNER_ID))
        now = datetime(2026, 11, 28, tzinfo=timezone.utc)
        for meta_delta, run_delta, error in [
            ({}, {}, None), ({"id": 34}, {}, "ARTIFACT_METADATA_MISMATCH"),
            ({"digest": "sha256:" + "0" * 64}, {}, "ARTIFACT_METADATA_MISMATCH"),
            ({"expired": True}, {}, "ARTIFACT_METADATA_MISMATCH"),
            ({"expires_at": "2026-11-01T00:00:00Z"}, {}, "ARTIFACT_EXPIRED"),
            ({"workflow_run": {**original["workflow_run"], "id": 45}}, {}, "ARTIFACT_RUN_MISMATCH"),
            ({}, {"actor": {"id": 7}}, "ARTIFACT_SOURCE_UNVERIFIED"),
            ({}, {"triggering_actor": {"id": 7}}, "ARTIFACT_SOURCE_UNVERIFIED"),
            ({}, {"path": ".github/workflows/untrusted.yml"}, "ARTIFACT_SOURCE_UNVERIFIED"),
            ({}, {"head_sha": "c" * 40}, "ARTIFACT_SOURCE_UNVERIFIED"),
            ({}, {"run_attempt": 2}, "ARTIFACT_SOURCE_UNVERIFIED"),
            ({}, {"conclusion": "failure"}, "ARTIFACT_SOURCE_UNVERIFIED"),
        ]:
            with self.subTest(error=error, meta_delta=meta_delta, run_delta=run_delta):
                gets = []
                def meta(path):
                    gets.append(path)
                    return {**original, **meta_delta} if path.startswith("/actions/artifacts/") else {**run, **run_delta}
                downloads = []
                def download(path, cap):
                    self.assertEqual((path, cap), ("/actions/artifacts/33/zip", gate.OUTER_LIMIT))
                    downloads.append(path)
                    return wrapper
                api = SimpleNamespace(get_json=meta, get_zip=download)
                if error:
                    with self.assertRaisesRegex(ValueError, error):
                        gate.consume(api, 33, 44, digest, inner_pin["manifestSha256"], inner_pin, now)
                    self.assertEqual(downloads, [])
                else:
                    self.assertEqual(gate.consume(api, 33, 44, digest, inner_pin["manifestSha256"], inner_pin, now)[ASSET], self.asset)
                    self.assertEqual(gets, ["/actions/artifacts/33", "/actions/runs/44"])

    def test_signed_redirect_never_receives_token(self):
        for host, ok in [("productionresultssa0.blob.core.windows.net", True), ("example.invalid", False)]:
            calls = []
            def transport(destination, path, headers, cap):
                calls.append(destination)
                if destination == "api.github.com":
                    self.assertEqual(headers["Authorization"], "Bearer synthetic")
                    self.assertTrue(path.endswith("/33/zip"))
                    self.assertEqual(headers["Accept"], "application/vnd.github+json")
                    return 302, "https://" + host + "/artifact?fixture=true", b""
                self.assertNotIn("Authorization", headers)
                self.assertEqual(path, "/artifact?fixture=true")
                return 200, None, b"data"
            gh = gate.GitHub("synthetic", transport=transport)
            if ok:
                self.assertEqual(gh.get_zip("/actions/artifacts/33/zip", 128), b"data")
                self.assertEqual(calls, ["api.github.com", host])
            else:
                with self.assertRaisesRegex(ValueError, "GITHUB_ARCHIVE_REDIRECT_UNTRUSTED"):
                    gh.get_zip("/actions/artifacts/33/zip", 128)
                self.assertEqual(calls, ["api.github.com"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
