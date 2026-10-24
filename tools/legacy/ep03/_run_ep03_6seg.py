# -*- coding: utf-8 -*-
"""EP03 six-segment runner. Default mode uploads and validates, then stops before /prompt."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(r"D:\HermesWorkspace\directorMaster")
SPEC = ROOT / "workspace" / "production" / "ep03" / "spec-ep03-6seg.json"
API = ROOT / "workspace" / "production" / "ep03" / "ep03-6seg-prepared.api.json"
OUT = ROOT / "workspace" / "outputs" / "videos_ep03_6seg"
LOG = Path(r"D:\HermesWorkspace\out\ep03_run\render_6seg.log")
BASE = "http://127.0.0.1:8188"


def log(message: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()


def load_json(path: Path):
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"BOM detected: {path}")
    return json.loads(raw.decode("utf-8"))


def validate(spec, api) -> list[dict]:
    if len(api) == 0:
        raise ValueError("empty API JSON")
    director = next((n for n in api.values() if n.get("class_type") == "MiniMaxH3Director"), None)
    if not director:
        raise ValueError("MiniMaxH3Director missing")
    timeline = json.loads(director["inputs"]["timeline_data"])
    if len(timeline["segments"]) != 6:
        raise ValueError("API does not contain six segments")
    all_assets = []
    for index, source in enumerate(spec["segments"]):
        pictures = [a for a in source["assets"] if a["mediaType"] != "audio"]
        audios = [a for a in source["assets"] if a["mediaType"] == "audio"]
        prompt = timeline["segments"][index]["prompt"]
        p = sorted({int(x) for x in __import__("re").findall(r"<Picture (\d+)>", prompt)})
        a = sorted({int(x) for x in __import__("re").findall(r"<Audio (\d+)>", prompt)})
        if p != list(range(1, len(pictures) + 1)) or a != list(range(1, len(audios) + 1)):
            raise ValueError(f"segment {index+1}: reference labels mismatch")
        if index and timeline["segments"][index]["continuityFromPrev"] is not True:
            raise ValueError(f"segment {index+1}: continuityFromPrev is not true")
        for asset in source["assets"]:
            path = Path(asset["path"])
            if not path.is_file():
                raise FileNotFoundError(path)
            all_assets.append(asset)
    names = [Path(a["path"]).name for a in all_assets]
    if len(names) != len(set(names)):
        raise ValueError("asset basenames are not unique across segments")
    return all_assets


def upload(asset: dict) -> dict:
    path = Path(asset["path"])
    with path.open("rb") as handle:
        response = requests.post(
            BASE + "/upload/image",
            files={"image": (path.name, handle)},
            data={"type": "input", "overwrite": "true"},
            timeout=180,
        )
    response.raise_for_status()
    receipt = response.json()
    if receipt.get("name") and Path(receipt["name"]).name != path.name:
        raise ValueError(f"upload renamed {path.name} -> {receipt['name']}")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true", help="POST /prompt after upload; not used for this handoff")
    args = parser.parse_args()
    if args.submit:
        raise SystemExit("Refusing --submit in this handoff; remove this guard only at the approved fire time.")
    spec = load_json(SPEC)
    api = load_json(API)
    assets = validate(spec, api)
    log(f"dry-run validation passed: six segments, {len(assets)} unique assets, API={API}")
    receipts = []
    for index, asset in enumerate(assets, 1):
        receipt = upload(asset)
        receipts.append({"path": asset["path"], "receipt": receipt})
        log(f"uploaded [{index}/{len(assets)}] {Path(asset['path']).name} -> {receipt.get('name', '')}")
    log("READY_TO_SUBMIT: uploads complete; /prompt was NOT called")
    log(json.dumps({"api": str(API), "output": str(OUT), "uploadReceipts": receipts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
