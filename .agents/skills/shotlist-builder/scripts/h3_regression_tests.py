#!/usr/bin/env python3
"""Regression tests for H3 authoring-leak, speaker-binding, and runtime-sum failures."""

from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile


SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
PROMPT_LINT = SCRIPT_DIR / "h3_prompt_lint.py"
UNIT_LINT = SCRIPT_DIR / "h3_unit_lint.py"


def prompt(
    human: bool = True,
    leaked: bool = False,
    chinese_mirror_dialogue: str = "我会回来。",
) -> tuple[str, str]:
    en_subject = (
        "<Subject 1> is Su Wan, a young Chinese woman in a beige trench coat. "
        "Voice baseline (fixed verbatim across every H3 unit; alter only this line's delivery): "
        "a young Chinese woman in a low-mid register with light chest-led resonance."
        if human
        else "<Subject 1> is a deserted rain-soaked old street with closed shutters."
    )
    zh_subject = (
        "<Subject 1> 是苏晚：年轻中国女性，穿浅米色风衣。"
        "固定音色画像（每个 H3 单元逐字复用；只可改变本句语气）："
        "年轻中国女性，低中音，轻薄胸腔共鸣。"
        if human
        else "<Subject 1> 是雨夜老街：无人巷道与关闭的卷帘门。"
    )
    en_shot = (
        "[Shot 1] A fixed 50 mm medium profile holds <Subject 1> on screen left. "
        "<Subject 1> (S1) <d>[Chinese] 我会回来。</d> After the tagged dialogue, non-spoken direction: "
        "she speaks softly, closes her mouth, and holds still."
    )
    zh_shot = (
        "[Shot 1] 50 毫米固定侧面中景将 <Subject 1> 放在画面左侧。"
        f"<Subject 1> (S1) <d>[Chinese] {chinese_mirror_dialogue}</d> After the tagged dialogue, non-spoken direction: 她轻声说、闭口并保持静止。"
    )
    if leaked:
        en_shot += (
            "\n\n[Shot 2] At 00:05.000, cut on the first decisive action to a medium or close "
            "view that adds the next source fact."
        )
        zh_shot += (
            "\n\n[Shot 2] At 00:05.000, 在第一个决定性动作上切至中景或近景，"
            "新增下一条原文信息。"
        )
    en = f"""subject_definitions:
{en_subject}

summary:
[reference generation] A restrained dialogue beat.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - preserve the defined identity and clothing.

detailed_description:
{en_shot}

overall_soundscape:
Quiet room tone.

non_diegetic_music: N/A"""
    zh = f"""subject_definitions:
{zh_subject}

summary:
[reference generation] 克制的对白节拍。

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - 保持已定义身份与服装。

detailed_description:
{zh_shot}

overall_soundscape:
安静室内底噪。

non_diegetic_music: N/A"""
    return en, zh


def html_document(
    *,
    human: bool,
    leaked: bool,
    displayed_runtime: int,
    chinese_mirror_dialogue: str = "我会回来。",
) -> str:
    en, zh = prompt(
        human=human,
        leaked=leaked,
        chinese_mirror_dialogue=chinese_mirror_dialogue,
    )
    return f"""<!doctype html><html><body>
<div data-h3-packed-runtime-seconds="{displayed_runtime}"><b>{displayed_runtime}s</b> packed runtime</div>
<article class="h3-unit" data-h3-unit="H3-001" data-unit-kind="dialogue"
 data-duration-seconds="12" data-dialogue-effective-chars="4"
 data-relationship-turn="承诺" data-action-chain="开口到闭口"
 data-opening-state="人物静止" data-exit-state="人物闭口" data-duration-exception-reason="">
<b>English submission prompt</b><pre class="prompt-block">{en.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</pre>
<b>中文编辑版</b><pre class="prompt-block">{zh.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</pre>
</article></body></html>"""


def run(script: pathlib.Path, source: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as tmp:
        fixture = pathlib.Path(tmp) / "fixture.html"
        fixture.write_text(source, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(script), str(fixture)],
            text=True,
            capture_output=True,
            check=False,
        )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    valid = html_document(human=True, leaked=False, displayed_runtime=12)
    valid_prompt = run(PROMPT_LINT, valid)
    valid_unit = run(UNIT_LINT, valid)
    require(valid_prompt.returncode == 0, valid_prompt.stdout + valid_prompt.stderr)
    require(valid_unit.returncode == 0, valid_unit.stdout + valid_unit.stderr)

    invalid_prompt = html_document(human=False, leaked=True, displayed_runtime=12)
    bad_prompt = run(PROMPT_LINT, invalid_prompt)
    require(bad_prompt.returncode != 0, "authoring leak and non-vocal speaker were not rejected")
    require("authoring-template leakage" in bad_prompt.stdout, bad_prompt.stdout)
    require("non-vocal <Subject 1>" in bad_prompt.stdout, bad_prompt.stdout)

    invalid_runtime = html_document(human=True, leaked=False, displayed_runtime=405)
    bad_runtime = run(UNIT_LINT, invalid_runtime)
    require(bad_runtime.returncode != 0, "incorrect packed runtime was not rejected")
    require("405s != summed unit duration 12s" in bad_runtime.stdout, bad_runtime.stdout)

    voice_dependency = valid.replace(
        "After the tagged dialogue, non-spoken direction: she speaks softly, closes her mouth, and holds still.",
        "After the tagged dialogue, non-spoken direction: use exactly the same low-mid voice as H3-001; "
        "she speaks softly, closes her mouth, and holds still.",
    )
    bad_voice_dependency = run(PROMPT_LINT, voice_dependency)
    require(bad_voice_dependency.returncode != 0, "cross-unit voice dependency was not rejected")
    require("cross-unit voice dependency" in bad_voice_dependency.stdout, bad_voice_dependency.stdout)

    missing_voice_baseline = valid.replace(
        "Voice baseline (fixed verbatim across every H3 unit; alter only this line's delivery): "
        "a young Chinese woman in a low-mid register with light chest-led resonance.",
        "",
    ).replace(
        "固定音色画像（每个 H3 单元逐字复用；只可改变本句语气）：年轻中国女性，低中音，轻薄胸腔共鸣。",
        "",
    )
    bad_missing_voice_baseline = run(PROMPT_LINT, missing_voice_baseline)
    require(bad_missing_voice_baseline.returncode != 0, "missing voice baseline was not rejected")
    require("lacks a fixed voice baseline" in bad_missing_voice_baseline.stdout, bad_missing_voice_baseline.stdout)

    contaminated_dialogue_prelude = valid.replace(
        "&lt;Subject 1&gt; (S1) &lt;d&gt;",
        "&lt;Subject 1&gt; (S1) 不是夸张讽刺，&lt;d&gt;",
    )
    bad_contaminated_dialogue_prelude = run(PROMPT_LINT, contaminated_dialogue_prelude)
    require(bad_contaminated_dialogue_prelude.returncode != 0, "spoken-direction prelude was not rejected")
    require("must be followed directly by <d>" in bad_contaminated_dialogue_prelude.stdout, bad_contaminated_dialogue_prelude.stdout)

    voice_dependency_zh = valid.replace(
        "After the tagged dialogue, non-spoken direction: 她轻声说、闭口并保持静止。",
        "After the tagged dialogue, non-spoken direction: 以与 H3-001 完全一致的低中音说话。她轻声说、闭口并保持静止。",
    )
    bad_voice_dependency_zh = run(PROMPT_LINT, voice_dependency_zh)
    require(bad_voice_dependency_zh.returncode != 0, "Chinese cross-unit voice dependency was not rejected")
    require("跨单元音色依赖" in bad_voice_dependency_zh.stdout, bad_voice_dependency_zh.stdout)

    invalid_mirror = html_document(
        human=True,
        leaked=False,
        displayed_runtime=12,
        chinese_mirror_dialogue="我不会回来。",
    )
    bad_mirror = run(UNIT_LINT, invalid_mirror)
    require(bad_mirror.returncode != 0, "bilingual dialogue drift was not rejected")
    require("English/Chinese dialogue payloads differ" in bad_mirror.stdout, bad_mirror.stdout)

    print(
        "PASS: H3 regression tests reject template leakage, cross-unit voice dependencies, "
        "non-vocal speakers, bilingual dialogue drift, and false runtime totals"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
