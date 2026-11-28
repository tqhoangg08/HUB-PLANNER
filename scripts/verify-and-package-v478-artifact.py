"""Validate the owner-reviewed v478 capsule before any artifact extraction."""
import hashlib
import http.client
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
REPO = "tqhoangg08/HUB-PLANNER"
REPO_ID = 1126820605
OWNER_ID = 252552483
PUBLISH_WORKFLOW = ".github/workflows/prepare-v478-assets-artifact.yml"
CAPSULE = "v478-frontend-assets.zip"
OUTER_LIMIT = 8 * 1024 * 1024
INNER_LIMIT = 7 * 1024 * 1024
EXPANDED_LIMIT = 12 * 1024 * 1024
MEMBER_LIMIT = 4 * 1024 * 1024
PIN = ROOT / "docs/public-release-assets-v478.json"
HASH = re.compile(r"[a-f0-9]{64}", re.ASCII)
ASSET = re.compile(r"assets/[\w.@+-]+-[A-Za-z0-9_-]{8}\.(?:m?js|css|woff2?)", re.ASCII)


def require(ok, code):
    if not ok:
        raise ValueError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def decode_json(raw):
    return json.loads(raw, object_pairs_hook=unique_object)


def positive_id(raw):
    require(isinstance(raw, str) and re.fullmatch(r"[1-9][0-9]{0,18}", raw)
            and int(raw) < 2**63, "INVALID_GITHUB_ID")
    return int(raw)


def sha_pin(raw):
    require(isinstance(raw, str) and HASH.fullmatch(raw), "INVALID_SHA256_PIN")
    return raw


def regular_zip_entry(entry):
    unix_type = stat.S_IFMT(entry.external_attr >> 16)
    # DOS archives may have no Unix mode. No directories, devices or reparse points.
    if entry.external_attr & (0x10 | 0x40 | 0x400):
        return False
    return ((entry.create_system == 3 and unix_type == stat.S_IFREG)
            or (entry.create_system == 0 and unix_type in (0, stat.S_IFREG)))


def read_zip(raw, name_allowed, max_entries, expanded_limit, member_limit=MEMBER_LIMIT):
    files = {}
    seen = set()
    with ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        require(0 < len(entries) <= max_entries, "ZIP_ENTRY_COUNT")
        require(sum(entry.file_size for entry in entries) <= expanded_limit, "ZIP_EXPANDED_LIMIT")
        for entry in entries:
            name = entry.filename
            require(entry.orig_filename == name and name_allowed(name), "ZIP_PATH_NOT_ALLOWED")
            require(name.casefold() not in seen, "DUPLICATE_ZIP_ENTRY")
            seen.add(name.casefold())
            require(regular_zip_entry(entry), "ZIP_ENTRY_NOT_REGULAR")
            require(0 < entry.file_size <= member_limit and not entry.flag_bits & 1
                    and entry.compress_type in (ZIP_STORED, ZIP_DEFLATED), "ZIP_MEMBER_LIMIT")
        for entry in entries:
            with archive.open(entry) as stream:
                body = stream.read(entry.file_size + 1)
            require(len(body) == entry.file_size, "ZIP_SIZE_MISMATCH")
            files[entry.filename] = body
    return files


def inspect_capsule(raw, pin):
    # Header and inventory validation remains explicit after an independently pinned
    # digest, including when a future approved capsule is malformed.
    require(0 < len(raw) <= INNER_LIMIT and digest(raw) == pin["capsuleSha256"], "CAPSULE_DIGEST_MISMATCH")
    auxiliary = pin["auxiliaryAssets"]
    files = read_zip(raw, lambda name: name == "manifest.json" or name in auxiliary or ASSET.fullmatch(name),
                     pin["assetCount"] + len(auxiliary) + 8, EXPANDED_LIMIT)
    raw_manifest = files.get("manifest.json", b"")
    require(digest(raw_manifest) == pin["manifestSha256"], "MANIFEST_DIGEST_MISMATCH")
    manifest = decode_json(raw_manifest)
    identity = pin["servingRelease"]
    require(set(manifest) == {"assets", "schema", *identity} and manifest["schema"] == 1
            and all(manifest[key] == val for key, val in identity.items()), "CAPSULE_RELEASE_MISMATCH")
    assets = manifest["assets"]
    require(isinstance(assets, dict) and len(assets) == pin["assetCount"]
            and set(files) == {"manifest.json", *assets, *auxiliary}
            and all(ASSET.fullmatch(path) for path in assets), "CAPSULE_INVENTORY_MISMATCH")
    for name, expected in {**assets, **auxiliary}.items():
        require(digest(files[name]) == sha_pin(expected), "ASSET_DIGEST_MISMATCH")
    return files


def inspect_outer(raw, expected_digest, pin):
    require(0 < len(raw) <= OUTER_LIMIT and digest(raw) == expected_digest, "GITHUB_ZIP_DIGEST_MISMATCH")
    entries = read_zip(raw, lambda name: name == CAPSULE, 3, INNER_LIMIT, INNER_LIMIT)
    require(set(entries) == {CAPSULE}, "GITHUB_ZIP_INVENTORY_MISMATCH")
    return inspect_capsule(entries[CAPSULE], pin)


def read_response(host, path, headers, cap, timeout=30):
    conn = http.client.HTTPSConnection(host, 443, timeout=timeout)
    try:
        conn.request("GET", path, headers={**headers, "Accept-Encoding": "identity", "User-Agent": "HUB-Planner-v478-artifact"})
        response = conn.getresponse()
        location = response.getheader("Location")
        if response.status == 302:
            return response.status, location, b""
        require(response.getheader("Content-Encoding", "identity") == "identity", "HTTP_UNEXPECTED_ENCODING")
        length = response.getheader("Content-Length")
        require(length is None or (length.isdecimal() and int(length) <= cap), "HTTP_SIZE_LIMIT")
        data = response.read(cap + 1)
        require(len(data) <= cap and (length is None or int(length) == len(data)), "HTTP_SIZE_LIMIT")
        return response.status, None, data
    finally:
        conn.close()


class GitHub:
    def __init__(self, token, transport=read_response):
        require(bool(token) and not re.search(r"\s", token), "GITHUB_READ_TOKEN_REQUIRED")
        self.headers = {"Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28"}
        self.transport = transport

    def get_json(self, path):
        status, _, body = self.transport("api.github.com", "/repos/" + REPO + path,
                                         {**self.headers, "Accept": "application/vnd.github+json"}, 256 * 1024)
        require(status == 200, "GITHUB_METADATA_UNAVAILABLE")
        return decode_json(body)

    def get_zip(self, path, limit, release_asset=False):
        accept = "application/octet-stream" if release_asset else "application/vnd.github+json"
        status, redirect, raw = self.transport("api.github.com", "/repos/" + REPO + path,
                                               {**self.headers, "Accept": accept}, limit)
        if release_asset and status == 200:
            return raw
        require(status == 302 and isinstance(redirect, str), "GITHUB_ARCHIVE_REDIRECT_REQUIRED")
        url = urlsplit(redirect)
        host = url.hostname or ""
        allowed = (host in {"release-assets.githubusercontent.com", "objects.githubusercontent.com"} if release_asset
                   else host.endswith(".blob.core.windows.net") or host.endswith(".actions.githubusercontent.com"))
        require(url.scheme == "https" and allowed and url.username is None and url.password is None
                and url.port in (None, 443) and not url.fragment and url.path.startswith("/"), "GITHUB_ARCHIVE_REDIRECT_UNTRUSTED")
        target = url.path + ("?" + url.query if url.query else "")
        status, _, raw = self.transport(host, target, {"Accept": "application/octet-stream"}, limit)
        require(status == 200, "GITHUB_ARCHIVE_UNAVAILABLE")
        return raw


def consume(github, artifact_id, run_id, zip_sha, manifest_sha, pin, now=None):
    require(manifest_sha == pin["manifestSha256"], "MANIFEST_PIN_MISMATCH")
    meta = github.get_json(f"/actions/artifacts/{artifact_id}")
    require(meta.get("id") == artifact_id and meta.get("name") == "v478-frontend-assets"
            and meta.get("expired") is False and 0 < meta.get("size_in_bytes", 0) <= OUTER_LIMIT
            and meta.get("digest") == "sha256:" + zip_sha, "ARTIFACT_METADATA_MISMATCH")
    now = now or datetime.now(timezone.utc)
    require(datetime.fromisoformat(meta["expires_at"].replace("Z", "+00:00")) > now, "ARTIFACT_EXPIRED")
    linked = meta.get("workflow_run") or {}
    require(linked.get("id") == run_id and linked.get("repository_id") == REPO_ID
            and linked.get("head_repository_id") == REPO_ID and linked.get("head_branch") == "main",
            "ARTIFACT_RUN_MISMATCH")
    run = github.get_json(f"/actions/runs/{run_id}")
    require(run.get("id") == run_id and run.get("path") == PUBLISH_WORKFLOW
            and run.get("head_branch") == "main" and run.get("head_sha") == linked.get("head_sha")
            and re.fullmatch(r"[a-f0-9]{40}", run.get("head_sha", ""))
            and run.get("event") == "workflow_dispatch" and run.get("run_attempt") == 1
            and run.get("status") == "completed" and run.get("conclusion") == "success"
            and (run.get("repository") or {}).get("id") == REPO_ID
            and (run.get("head_repository") or {}).get("id") == REPO_ID
            and all((run.get(actor) or {}).get("id") == OWNER_ID for actor in ("actor", "triggering_actor")),
            "ARTIFACT_SOURCE_UNVERIFIED")
    raw = github.get_zip(f"/actions/artifacts/{artifact_id}/zip", OUTER_LIMIT)
    require(len(raw) == meta["size_in_bytes"], "GITHUB_ZIP_SIZE_MISMATCH")
    return inspect_outer(raw, zip_sha, pin)


def stage_release_asset(github, asset_id, pin, output):
    meta = github.get_json(f"/releases/assets/{asset_id}")
    require(meta.get("id") == asset_id and meta.get("name") == CAPSULE and meta.get("state") == "uploaded"
            and (meta.get("uploader") or {}).get("id") == OWNER_ID
            and meta.get("digest") == "sha256:" + pin["capsuleSha256"]
            and 0 < meta.get("size", 0) <= INNER_LIMIT, "CAPSULE_SOURCE_ASSET_UNVERIFIED")
    raw = github.get_zip(f"/releases/assets/{asset_id}", INNER_LIMIT, release_asset=True)
    require(len(raw) == meta["size"], "CAPSULE_SOURCE_SIZE_MISMATCH")
    inspect_capsule(raw, pin)
    with output.open("xb") as stream:
        stream.write(raw)


def package_dist(files, pin, dist):
    require(dist.is_dir() and not dist.is_symlink() and dist.resolve() == dist.absolute(), "DIST_NOT_REGULAR")
    missing = {}
    for name in pin["auxiliaryAssets"]:
        dest = dist / name
        if not dest.exists() and not dest.is_symlink():
            missing[dest] = files[name]
        else:
            require(not dest.is_symlink() and dest.is_file() and digest(dest.read_bytes()) == digest(files[name]),
                    "AUXILIARY_ASSET_COLLISION")
    with tempfile.TemporaryDirectory(prefix="hub-v478-verified-") as tmp:
        archive = Path(tmp)
        (archive / "assets").mkdir()
        for name, body in files.items():
            if name not in pin["auxiliaryAssets"]:
                with (archive / name).open("xb") as stream:
                    stream.write(body)
        subprocess.run(["node", str(ROOT / "scripts/package-s1-release-assets.mjs"), str(archive), str(dist),
                        pin["manifestSha256"]], check=True)
        for dest, body in missing.items():
            with dest.open("xb") as stream:
                stream.write(body)
    return len(missing)


def main(args, env):
    github = GitHub(env.get("GH_TOKEN", ""))
    pin = decode_json(PIN.read_bytes())
    require(env.get("GITHUB_REPOSITORY") == REPO, "GITHUB_REPOSITORY_MISMATCH")
    if len(args) == 2 and args[0] == "consume":
        artifact_id = positive_id(env.get("ASSET_ARTIFACT_ID"))
        run_id = positive_id(env.get("ASSET_RUN_ID"))
        zip_sha = sha_pin(env.get("ASSET_GITHUB_ZIP_SHA256"))
        manifest_sha = sha_pin(env.get("ASSET_MANIFEST_SHA256"))
        files = consume(github, artifact_id, run_id, zip_sha, manifest_sha, pin)
        copied = package_dist(files, pin, Path(args[1]))
        print(json.dumps({"artifactId": artifact_id, "sourceRunId": run_id, "githubZipSha256": zip_sha,
                          "capsuleSha256": pin["capsuleSha256"], "manifestSha256": manifest_sha, "auxiliaryCopied": copied}))
    elif len(args) == 2 and args[0] == "stage":
        require(env.get("GITHUB_ACTOR_ID") == str(OWNER_ID) and bool(env.get("GITHUB_ACTOR"))
                and env.get("GITHUB_ACTOR") == env.get("GITHUB_TRIGGERING_ACTOR")
                and env.get("GITHUB_RUN_ATTEMPT") == "1" and env.get("GITHUB_REF") == "refs/heads/main"
                and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "CAPSULE_UPLOAD_OWNER_REQUIRED")
        stage_release_asset(github, positive_id(env.get("CAPSULE_RELEASE_ASSET_ID")), pin, Path(args[1]))
        print(json.dumps({"capsuleSha256": pin["capsuleSha256"], "manifestSha256": pin["manifestSha256"]}))
    else:
        raise ValueError("INVALID_PACKAGING_COMMAND")


if __name__ == "__main__":
    try:
        main(sys.argv[1:], os.environ)
    except Exception as error:
        # No signed redirect URL, token, headers, response body or traceback in runner logs.
        code = str(error)
        print(code if re.fullmatch(r"[A-Z0-9_]+", code) else "V478_PACKAGING_UNVERIFIED", file=sys.stderr)
        sys.exit(1)
