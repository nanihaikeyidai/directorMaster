#!/usr/bin/env python3
"""Lint canonical invariants in MiniMax H3 English prompt blocks inside HTML."""

from __future__ import annotations

import argparse
import html
import pathlib
import re
import sys


ENGLISH_BLOCK = re.compile(
    r"<b[^>]*>\s*(?:H3 prompt\s+\d+\s*·\s*)?English submission prompt\s*</b>"
    r".*?<(?:pre\b[^>]*|div\b[^>]*\bclass\s*=\s*['\"][^'\"]*\bprompt-block\b[^'\"]*['\"][^>]*)>"
    r"(?P<prompt>.*?)</(?:pre|div)>",
    re.IGNORECASE | re.DOTALL,
)
CHINESE_BLOCK = re.compile(
    r"<b[^>]*>\s*(?:H3\s*提示词\s+\d+\s*·\s*)?中文编辑版\s*</b>"
    r".*?<(?:pre\b[^>]*|div\b[^>]*\bclass\s*=\s*['\"][^'\"]*\bprompt-block\b[^'\"]*['\"][^>]*)>"
    r"(?P<prompt>.*?)</(?:pre|div)>",
    re.IGNORECASE | re.DOTALL,
)
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
SHOT_ONE_TIMESTAMP = re.compile(r"\[Shot\s+1\]\s+At\b", re.IGNORECASE)
LATER_SHOT = re.compile(r"\[Shot\s+(\d+)\](?:\s+At\s+([^,\n]+),)?", re.IGNORECASE)
EXACT_LATER_TIME = re.compile(r"\d{2}:\d{2}\.\d{3}")
DIALOGUE_BLOCK = re.compile(r"<d>.*?</d>", re.IGNORECASE | re.DOTALL)
QUOTED_TEXT = re.compile(r'(["“]).*?(["”])', re.DOTALL)
MAIN_DESCRIPTION = re.compile(
    r"(?:detailed_description|integrated_multimodal_description):\s*"
    r"(.*?)(?=\n\s*overall_soundscape:)",
    re.IGNORECASE | re.DOTALL,
)
BOUNDARY_TAG = re.compile(
    r"<[^>]+\bdata-h3-boundary\s*=\s*(['\"])[^'\"]+\1[^>]*>",
    re.IGNORECASE,
)
ATTRIBUTE = re.compile(r"([\w-]+)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
VALID_BOUNDARY_STRATEGIES = {
    "exact_match_continuation",
    "contrast_cut",
    "neutral_bridge",
    "scene_transition",
}

ENGLISH_AUTHORING_LEAKS = {
    "first decisive action placeholder": re.compile(r"\bfirst decisive action\b", re.IGNORECASE),
    "next source fact placeholder": re.compile(r"\bnext source fact\b", re.IGNORECASE),
    "information-landing placeholder": re.compile(r"\binformation landing\b", re.IGNORECASE),
    "generic holder/orientation checklist": re.compile(
        r"\bexact holder,\s*position,\s*orientation\b", re.IGNORECASE
    ),
    "generic listener-protection instruction": re.compile(
        r"\bprotect the listener(?:'s|’s) triggered reaction\b", re.IGNORECASE
    ),
    "start-from metadata wrapper": re.compile(r"\bStart from\s+(?:the stated|the previous|this unit)", re.IGNORECASE),
    "unresolved framing alternatives": re.compile(
        r"\b(?:wide|medium|close|profile|over-the-shoulder|object-led|rear three-quarter)"
        r"[^.\n]{0,100}\bor\b[^.\n]{0,100}"
        r"(?:wide|medium|close|profile|over-the-shoulder|object-led|rear three-quarter)\b",
        re.IGNORECASE,
    ),
    "cross-unit voice dependency": re.compile(
        r"\b(?:exactly\s+)?(?:the\s+)?same\b[^.\n]{0,120}\b(?:as|from)\s+H3-\d+"
        r"|\bmatch\s+(?:the\s+)?(?:previous|prior)\s+(?:unit|clip)\b[^.\n]{0,80}\bvoice\b",
        re.IGNORECASE,
    ),
}

CHINESE_AUTHORING_LEAKS = {
    "第一决定动作占位": re.compile(r"第一个决定性动作"),
    "下一条原文信息占位": re.compile(r"新增下一条原文信息|下一条原文信息"),
    "信息落地占位": re.compile(r"信息落地或动作结果"),
    "持有人检查表泄漏": re.compile(r"动作开始前先读清持有人"),
    "听者保护说明泄漏": re.compile(r"保护听者被触发的反应"),
    "未完成镜头选择": re.compile(
        r"(?:远景|中景|近景|背面三分之四|道具主导|过肩)[^。\n]{0,80}或[^。\n]{0,80}"
        r"(?:远景|中景|近景|背面三分之四|道具主导|过肩)"
    ),
    "承接占位": re.compile(r"承接上一段|保持同前|根据需要选择镜头"),
    "跨单元音色依赖": re.compile(
        r"以与\s*H3-\d+\s*(?:完全)?一致|与\s*H3-\d+\s*(?:完全)?一致[^。\n]{0,80}(?:声线|音色|嗓音)"
        r"|沿用\s*(?:H3-\d+|上一段|前一单元)[^。\n]{0,80}(?:声线|音色|嗓音)",
    ),
}

SUBJECT_SECTION = re.compile(
    r"subject_definitions:\s*(.*?)(?=\n\s*summary:)", re.IGNORECASE | re.DOTALL
)
SUBJECT_LINE = re.compile(r"<Subject\s+(\d+)>\s*(.*?)(?=\n<Subject\s+\d+>|\Z)", re.DOTALL)
SPEAKER_BEFORE_DIALOGUE = re.compile(
    r"(?:<Subject\s+(?P<subject>\d+)>\s*)?\(S(?P<speaker>\d+)\)", re.IGNORECASE
)
SPEAKER_TO_DIALOGUE = re.compile(
    r"\(S\d+\)(?P<prelude>[\s\S]*?)<d>", re.IGNORECASE
)
NONVOCAL_TERMS = re.compile(
    r"\b(?:environment|street|lane|room|stall|skyline|style|treatment|camera|prop|paper crane|"
    r"cloth|paper|umbrella|phone|hospital)\b|环境|街道|老街|巷道|房间|病房|摊位|天际线|"
    r"风格|摄影处理|道具|纸鹤|宣纸|雨伞|手机",
    re.IGNORECASE,
)
VOCAL_TERMS = re.compile(
    r"\b(?:woman|man|mother|father|girl|boy|child|elderly|keeper|narrator|speaker|actor|creature|dog|cat)\b|"
    r"女性|男性|母亲|父亲|女孩|男孩|孩子|老人|旁白者|说话者|演员|人物|角色",
    re.IGNORECASE,
)
VOICE_BASELINE_EN = re.compile(
    r"Voice baseline \(fixed verbatim across every H3 unit; alter only this line's delivery\):",
    re.IGNORECASE,
)
VOICE_BASELINE_ZH = re.compile(
    r"固定音色画像（每个\s*H3\s*单元逐字复用；只可改变本句语气）："
)


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def strip_allowed_cjk_regions(prompt: str) -> str:
    prompt = DIALOGUE_BLOCK.sub("", prompt)
    return QUOTED_TEXT.sub("", prompt)


def subject_definitions(prompt: str) -> dict[str, str]:
    section = SUBJECT_SECTION.search(prompt)
    if section is None:
        return {}
    return {
        number: text.strip()
        for number, text in SUBJECT_LINE.findall(section.group(1))
    }


def lint_dialogue_bindings(prompt: str, index: int, label: str) -> list[str]:
    errors: list[str] = []
    definitions = subject_definitions(prompt)
    for dialogue in DIALOGUE_BLOCK.finditer(prompt):
        lead = prompt[max(0, dialogue.start() - 240) : dialogue.start()]
        speakers = list(SPEAKER_BEFORE_DIALOGUE.finditer(lead))
        if not speakers:
            errors.append(f"{label} block {index}: <d> lacks an immediately preceding speaker ID")
            continue
        speaker = speakers[-1]
        subject_number = speaker.group("subject")
        if not subject_number:
            continue
        definition = definitions.get(subject_number, "")
        if definition and NONVOCAL_TERMS.search(definition) and not VOCAL_TERMS.search(definition):
            errors.append(
                f"{label} block {index}: non-vocal <Subject {subject_number}> is bound to "
                f"speaker S{speaker.group('speaker')}"
            )
    return errors


def lint_voice_baseline(prompt: str, index: int, label: str) -> list[str]:
    if not DIALOGUE_BLOCK.search(prompt):
        return []
    marker = VOICE_BASELINE_EN if label == "English" else VOICE_BASELINE_ZH
    if marker.search(subject_definitions(prompt).get("1", "")) or marker.search(
        SUBJECT_SECTION.search(prompt).group(1) if SUBJECT_SECTION.search(prompt) else ""
    ):
        return []
    return [
        f"{label} block {index}: audible dialogue/voiceover lacks a fixed voice baseline in subject_definitions"
    ]


def lint_dialogue_tag_isolation(prompt: str, index: int, label: str) -> list[str]:
    errors: list[str] = []
    for match in SPEAKER_TO_DIALOGUE.finditer(prompt):
        prelude = match.group("prelude")
        if prelude.strip():
            excerpt = prelude.strip().replace("\n", " ")[:100]
            errors.append(
                f"{label} block {index}: (Sx) must be followed directly by <d>; "
                f"move non-spoken direction after </d> (found {excerpt!r})"
            )
    return errors


def lint_authoring_leaks(text: str, index: int, label: str, patterns: dict[str, re.Pattern[str]]) -> list[str]:
    errors: list[str] = []
    description = MAIN_DESCRIPTION.search(text)
    if description is None:
        return errors
    prose = description.group(1)
    for name, pattern in patterns.items():
        match = pattern.search(prose)
        if match:
            excerpt = prose[max(0, match.start() - 24) : match.end() + 48].replace("\n", " ")
            errors.append(f"{label} block {index}: authoring-template leakage ({name}): {excerpt!r}")
    return errors


def lint_block(prompt: str, index: int) -> list[str]:
    errors: list[str] = []

    description_match = MAIN_DESCRIPTION.search(prompt)
    if description_match is None:
        errors.append(
            "detailed_description/integrated_multimodal_description is missing "
            "or not followed by overall_soundscape"
        )
        shot_prose = ""
    else:
        shot_prose = description_match.group(1)

    if SHOT_ONE_TIMESTAMP.search(shot_prose):
        errors.append("[Shot 1] must not contain 'At' or a timestamp")

    # Full-reference prompts legitimately cite shot IDs in summary and
    # retention_analysis.  Only the chronological detailed_description owns
    # executable shot tags and timestamps.
    shots = list(LATER_SHOT.finditer(shot_prose))
    if not shots:
        errors.append("no [Shot N] entries found")
    else:
        numbers = [int(match.group(1)) for match in shots]
        if numbers != list(range(1, len(numbers) + 1)):
            errors.append(f"shot numbers are not consecutive from 1: {numbers}")
        for match in shots[1:]:
            stamp = match.group(2)
            if stamp is None or EXACT_LATER_TIME.fullmatch(stamp.strip()) is None:
                errors.append(
                    f"[Shot {match.group(1)}] must use exact 'At MM:SS.mmm,' syntax"
                )

    if prompt.count("non_diegetic_music: N/A") != 1:
        errors.append("non_diegetic_music: N/A must appear exactly once")

    for shot_line in re.findall(r"(?m)^\[Shot[^\n]*", shot_prose):
        if "|" in shot_line:
            errors.append("shot prose contains a table delimiter '|'")
            break

    cjk_check = strip_allowed_cjk_regions(prompt)
    cjk_match = CJK.search(cjk_check)
    if cjk_match:
        excerpt = cjk_check[max(0, cjk_match.start() - 16) : cjk_match.start() + 32]
        errors.append(f"CJK scaffolding remains outside <d> or quoted visible text: {excerpt!r}")

    generic_retention = re.search(
        r"retention_analysis:.*?(?:identity,\s*costume,\s*prop\s+or\s+environment|"
        r"identity,\s*costume,\s*prop,?\s*(?:and|or)\s*environment)",
        prompt,
        re.IGNORECASE | re.DOTALL,
    )
    if generic_retention:
        errors.append("retention_analysis uses generic identity/costume/prop/environment boilerplate")

    generic_sound = re.search(
        r"rain,\s*footsteps,\s*puddles,\s*paper,\s*cloth,\s*breathing,\s*hospital monitor",
        prompt,
        re.IGNORECASE,
    )
    if generic_sound:
        errors.append("overall_soundscape contains the known cross-scene global sound list")

    errors.extend(
        message.removeprefix(f"English block {index}: ")
        for message in lint_authoring_leaks(
            prompt, index, "English", ENGLISH_AUTHORING_LEAKS
        )
    )
    errors.extend(
        message.removeprefix(f"English block {index}: ")
        for message in lint_dialogue_bindings(prompt, index, "English")
    )
    errors.extend(
        message.removeprefix(f"English block {index}: ")
        for message in lint_voice_baseline(prompt, index, "English")
    )
    errors.extend(
        message.removeprefix(f"English block {index}: ")
        for message in lint_dialogue_tag_isolation(prompt, index, "English")
    )

    return [f"block {index}: {message}" for message in errors]


def lint_boundaries(source: str, block_count: int) -> list[str]:
    errors: list[str] = []
    tags = list(BOUNDARY_TAG.finditer(source))
    expected = max(0, block_count - 1)
    if len(tags) != expected:
        errors.append(
            f"HTML: expected {expected} data-h3-boundary record(s) for "
            f"{block_count} ordered H3 clips, found {len(tags)}"
        )

    seen_ids: set[str] = set()
    for index, match in enumerate(tags, start=1):
        attributes = {
            name.lower(): html.unescape(value).strip()
            for name, _quote, value in ATTRIBUTE.findall(match.group(0))
        }
        boundary_id = attributes.get("data-h3-boundary", "")
        if not boundary_id:
            errors.append(f"boundary {index}: data-h3-boundary is empty")
        elif boundary_id in seen_ids:
            errors.append(f"boundary {index}: duplicate boundary id {boundary_id!r}")
        else:
            seen_ids.add(boundary_id)

        strategy = attributes.get("data-boundary-strategy", "")
        if strategy not in VALID_BOUNDARY_STRATEGIES:
            errors.append(
                f"boundary {index}: invalid or missing data-boundary-strategy {strategy!r}"
            )
        for required in (
            "data-outgoing-frame",
            "data-incoming-frame",
            "data-cut-trigger",
        ):
            if not attributes.get(required, ""):
                errors.append(f"boundary {index}: {required} is missing or empty")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Lint MiniMax H3 English submission prompts embedded in an HTML shotlist."
    )
    parser.add_argument("html_file", type=pathlib.Path)
    args = parser.parse_args()

    source = args.html_file.read_text(encoding="utf-8")
    matches = list(ENGLISH_BLOCK.finditer(source))
    if not matches:
        print("FAIL: no English submission prompt blocks found", file=sys.stderr)
        return 1

    errors: list[str] = []
    for index, match in enumerate(matches, start=1):
        prompt = html.unescape(match.group("prompt"))
        errors.extend(lint_block(prompt, index))
    chinese_matches = list(CHINESE_BLOCK.finditer(source))
    if len(chinese_matches) != len(matches):
        errors.append(
            f"HTML: expected {len(matches)} Chinese editing mirror(s), found {len(chinese_matches)}"
        )
    for index, match in enumerate(chinese_matches, start=1):
        prompt = html.unescape(match.group("prompt"))
        errors.extend(
            lint_authoring_leaks(prompt, index, "Chinese", CHINESE_AUTHORING_LEAKS)
        )
        errors.extend(lint_dialogue_bindings(prompt, index, "Chinese"))
        errors.extend(lint_voice_baseline(prompt, index, "Chinese"))
        errors.extend(lint_dialogue_tag_isolation(prompt, index, "Chinese"))
    errors.extend(lint_boundaries(source, len(matches)))

    if errors:
        print(f"FAIL: {len(errors)} issue(s) in {len(matches)} English prompt block(s)")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"PASS: {len(matches)} bilingual H3 prompt pair(s) satisfy canonical, speaker-binding, and director-language lint checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
