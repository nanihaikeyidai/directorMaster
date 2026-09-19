# -*- coding: utf-8 -*-
"""Normalize EP03 prompt specs and build the one-job six-segment input spec."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(r"D:\HermesWorkspace\directorMaster")
EP = ROOT / "workspace" / "production" / "ep03"
WORKFLOW = ROOT / "workspace" / "workflows" / "minimax_h3_director_二采_加速.json"
COMBINED = EP / "spec-ep03-6seg.json"


def read_json(path: Path):
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    return json.loads(raw.decode("utf-8"))


def prompt_md(seg: int) -> str:
    directory = EP / f"segment{seg:02d}"
    return next(p for p in directory.glob("*.md") if "[Shot 1]" in p.read_text(encoding="utf-8"))


def spec_path(seg: int) -> Path:
    return EP / f"segment{seg:02d}" / f"spec-ep03-s{seg:02d}.json"


def replace_shots(old: str, current_md: str) -> str:
    start = current_md.index("[Shot 1]")
    end = current_md.index("\noverall_soundscape:")
    current_shots = current_md[start:end].strip()
    old_start = old.index("[Shot 1]")
    marker = "\noverall_soundscape:"
    old_end = old.find(marker, old_start)
    if old_end < 0:
        raise ValueError("finalPrompt has no overall_soundscape boundary")
    return old[:old_start] + current_shots + old[old_end:]


def ensure_picture_labels(prompt: str, seg: int) -> str:
    """Make every image asset addressable without touching any dialogue."""
    additions = {
        1: "<Picture 3> is the swimming-club prop reference; inherit only practical prop shape and material, never readable text.",
        2: "<Picture 3> is the swimming-club prop reference; inherit only practical prop shape and material, never readable text.",
        3: "<Picture 2> is the training-prop reference; inherit only practical prop shape and material.\n<Picture 3> is the poolside waiting-area reference; inherit only its spatial layout and lighting.",
        4: "<Picture 3> is the whistle-and-goggles prop reference; inherit only practical prop shape and continuity, never readable text.",
    }
    if seg in additions and "<Picture 3>" not in prompt:
        marker = "\n<Picture 4>"
        if marker not in prompt:
            raise ValueError(f"segment {seg}: missing Picture 4 insertion point")
        prompt = prompt.replace(marker, "\n" + additions[seg] + marker, 1)
    elif seg == 3 and prompt.count("<Picture 2>") == 1:
        marker = "\n<Picture 4>"
        prompt = prompt.replace(marker, "\n" + additions[3] + marker, 1)
    return prompt


def ensure_audio_labels(prompt: str, seg: int) -> str:
    additions = {
        4: "<Audio 1> is the Li Xiang voice-timbre reference; use only timbre and delivery, never copy source words.",
        5: "<Audio 1> is the Li Xiang voice-timbre reference; use only timbre and delivery, never copy source words.",
        6: "<Audio 1> is the Anna voice-timbre reference; use only timbre and delivery, never copy source words.\n<Audio 2> is the Li Xiang voice-timbre reference; use only timbre and delivery, never copy source words.",
    }
    needed = {4: 1, 5: 1, 6: 2}.get(seg, 0)
    found = {int(x) for x in re.findall(r"<Audio (\d+)>", prompt)}
    if needed and found != set(range(1, needed + 1)):
        marker = "\n<Picture 4>"
        prompt = prompt.replace(marker, "\n" + additions[seg] + marker, 1)
    return prompt


def main() -> None:
    segments = []
    for number in range(1, 7):
        path = spec_path(number)
        backup = path.with_suffix(path.suffix + ".bak")
        if not backup.exists():
            shutil.copy2(path, backup)
        spec = read_json(path)
        seg = spec["segments"][0]
        md = prompt_md(number).read_text(encoding="utf-8")
        seg["finalPrompt"] = ensure_audio_labels(ensure_picture_labels(replace_shots(seg["finalPrompt"], md), number), number)
        seg["continuityFromPrev"] = number > 1
        # Keep the approved dialogue and references; only prompt alignment/state is changed.
        path.write_text(json.dumps(spec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
        segments.append(seg)

    combined = {
        "jobId": "redstring-ep03-6seg",
        "workflow": str(WORKFLOW),
        "negativePrompt": "subtitles, captions, on-screen text, readable Chinese characters, title cards, speech bubbles, UI, watermark, logo, storyboard grid lines, storyboard numbers, arrows, production annotations, identity drift, face swap, teleportation, axis reversal, unstable camera, sudden zoom, focus hunting, flicker, photorealism, live action, 3D rendering, western comic, chibi, oil painting, sexualized framing, changing clothes, magic effects, water magic, background music, non-diegetic score",
        "settings": {"fps": 24, "width": 1056, "height": 608, "megapixels": 0.6, "steps": 8, "seed": 666, "cfg": 1},
        "outputDir": str(ROOT / "workspace" / "outputs" / "videos_ep03_6seg"),
        "segments": segments,
    }
    COMBINED.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(COMBINED)


if __name__ == "__main__":
    main()
