#!/usr/bin/env python3
"""Lint MiniMax H3 long-script unit metadata and Chinese speech budgets in HTML."""

from __future__ import annotations

import argparse
import html
import pathlib
import re
import sys


ARTICLE_RE = re.compile(
    r"<article\b(?P<attrs>[^>]*\bclass\s*=\s*(['\"])[^'\"]*\bh3-unit\b[^'\"]*\2[^>]*)>"
    r"(?P<body>.*?)</article>",
    re.IGNORECASE | re.DOTALL,
)
ATTRIBUTE_RE = re.compile(r"([\w-]+)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
ENGLISH_LABEL_RE = re.compile(r"English submission prompt", re.IGNORECASE)
PROMPT_CONTAINER_RE = re.compile(
    r"<(?:pre\b[^>]*|div\b[^>]*\bclass\s*=\s*(['\"])[^'\"]*\bprompt-block\b[^'\"]*\1[^>]*)>"
    r"(?P<prompt>.*?)</(?:pre|div)>",
    re.IGNORECASE | re.DOTALL,
)
CHINESE_DIALOGUE_RE = re.compile(
    r"<d>\s*\[Chinese\]\s*(?P<text>.*?)</d>", re.IGNORECASE | re.DOTALL
)
EFFECTIVE_CHAR_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9]")
LATER_SHOT_RE = re.compile(
    r"\[Shot\s+(?P<number>[2-9]\d*)\]\s+At\s+(?P<minute>\d{2}):"
    r"(?P<second>\d{2})\.(?P<millisecond>\d{3}),",
    re.IGNORECASE,
)
PACKED_RUNTIME_RE = re.compile(
    r"<(?P<tag>[A-Za-z][\w:-]*)\b(?P<attrs>[^>]*\bdata-h3-packed-runtime-seconds\s*=\s*"
    r"(?P<quote>['\"])(?P<declared>[^'\"]+)(?P=quote)[^>]*)>"
    r"(?P<body>.*?)</(?P=tag)>",
    re.IGNORECASE | re.DOTALL,
)
VISIBLE_RUNTIME_RE = re.compile(r"(?P<value>\d+(?:\.\d+)?)\s*s\b", re.IGNORECASE)


def parse_attributes(raw: str) -> dict[str, str]:
    return {
        name.lower(): html.unescape(value).strip()
        for name, _quote, value in ATTRIBUTE_RE.findall(raw)
    }


def extract_english_prompt(body: str) -> str | None:
    label = ENGLISH_LABEL_RE.search(body)
    if label is None:
        return None
    container = PROMPT_CONTAINER_RE.search(body, label.end())
    if container is None:
        return None
    return html.unescape(container.group("prompt"))


def extract_prompt_blocks(body: str) -> list[str]:
    return [html.unescape(match.group("prompt")) for match in PROMPT_CONTAINER_RE.finditer(body)]


def effective_dialogue_chars(prompt: str) -> int:
    spoken = "".join(match.group("text") for match in CHINESE_DIALOGUE_RE.finditer(prompt))
    return len(EFFECTIVE_CHAR_RE.findall(spoken))


def timestamp_seconds(match: re.Match[str]) -> float:
    return (
        int(match.group("minute")) * 60
        + int(match.group("second"))
        + int(match.group("millisecond")) / 1000
    )


def suggested_max(duration: float) -> int | None:
    if duration < 10:
        return None
    if duration <= 10.5:
        return 24
    if duration <= 13.5:
        return 30
    return 36


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Check H3 unit duration, dialogue budget, relationship/action/state metadata, "
            "and internal cut times in a bilingual shotlist HTML."
        )
    )
    parser.add_argument("html_file", type=pathlib.Path)
    args = parser.parse_args()

    source = args.html_file.read_text(encoding="utf-8")
    units = list(ARTICLE_RE.finditer(source))
    if not units:
        print("FAIL: no <article class=\"h3-unit\"> records found", file=sys.stderr)
        return 1

    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()
    packed_duration = 0.0

    print("unit\tduration\tdialogue_chars\tstatus")
    for index, unit in enumerate(units, start=1):
        attrs = parse_attributes(unit.group("attrs"))
        unit_id = attrs.get("data-h3-unit", "") or f"unit-{index}"
        unit_errors: list[str] = []

        if unit_id in seen_ids:
            unit_errors.append("duplicate unit id")
        seen_ids.add(unit_id)

        for required in (
            "data-h3-unit",
            "data-unit-kind",
            "data-duration-seconds",
            "data-dialogue-effective-chars",
            "data-relationship-turn",
            "data-action-chain",
            "data-opening-state",
            "data-exit-state",
        ):
            if not attrs.get(required, ""):
                unit_errors.append(f"{required} is missing or empty")

        try:
            duration = float(attrs.get("data-duration-seconds", ""))
        except ValueError:
            duration = -1.0
            unit_errors.append("data-duration-seconds is not numeric")
        if duration >= 0:
            packed_duration += duration

        exception_reason = attrs.get("data-duration-exception-reason", "")
        if duration > 15:
            unit_errors.append("duration exceeds the 15-second H3 ceiling")
        elif 0 <= duration < 5:
            unit_errors.append("duration is below the 5-second exception floor")
        elif 5 <= duration < 10 and not exception_reason:
            unit_errors.append("sub-10-second unit lacks data-duration-exception-reason")

        prompt = extract_english_prompt(unit.group("body"))
        if prompt is None:
            computed_chars = -1
            unit_errors.append("English submission prompt container is missing")
        else:
            computed_chars = effective_dialogue_chars(prompt)
            for shot_match in LATER_SHOT_RE.finditer(prompt):
                cut_time = timestamp_seconds(shot_match)
                if duration >= 0 and cut_time >= duration:
                    unit_errors.append(
                        f"Shot {shot_match.group('number')} cut at {cut_time:.3f}s "
                        f"is outside {duration:.3f}s"
                    )

        blocks = extract_prompt_blocks(unit.group("body"))
        if len(blocks) != 2:
            unit_errors.append(
                f"expected exactly two bilingual prompt blocks, found {len(blocks)}"
            )
        else:
            english_dialogue = [
                match.group("text") for match in CHINESE_DIALOGUE_RE.finditer(blocks[0])
            ]
            chinese_dialogue = [
                match.group("text") for match in CHINESE_DIALOGUE_RE.finditer(blocks[1])
            ]
            if english_dialogue != chinese_dialogue:
                unit_errors.append("English/Chinese dialogue payloads differ")

        try:
            declared_chars = int(attrs.get("data-dialogue-effective-chars", ""))
        except ValueError:
            declared_chars = -1
            unit_errors.append("data-dialogue-effective-chars is not an integer")

        if computed_chars >= 0 and declared_chars >= 0 and computed_chars != declared_chars:
            unit_errors.append(
                f"declared dialogue count {declared_chars} != computed {computed_chars}"
            )
        if computed_chars > 40:
            unit_errors.append("Chinese dialogue exceeds the 40-effective-character hard limit")

        recommended = suggested_max(duration)
        if recommended is not None and computed_chars > recommended:
            warnings.append(
                f"{unit_id}: {computed_chars} effective characters exceed the normal "
                f"{duration:g}s recommendation ({recommended}); verify comedy pace or split"
            )

        status = "FAIL" if unit_errors else "PASS"
        print(f"{unit_id}\t{duration:g}\t{computed_chars}\t{status}")
        errors.extend(f"{unit_id}: {message}" for message in unit_errors)

    runtime_markers = list(PACKED_RUNTIME_RE.finditer(source))
    if len(runtime_markers) != 1:
        errors.append(
            "HTML: expected exactly one visible element with "
            f"data-h3-packed-runtime-seconds, found {len(runtime_markers)}"
        )
    else:
        marker = runtime_markers[0]
        try:
            declared_runtime = float(html.unescape(marker.group("declared")).strip())
        except ValueError:
            declared_runtime = -1.0
            errors.append("HTML: data-h3-packed-runtime-seconds is not numeric")
        if declared_runtime >= 0 and abs(declared_runtime - packed_duration) > 1e-6:
            errors.append(
                f"HTML: packed runtime attribute {declared_runtime:g}s != summed unit duration "
                f"{packed_duration:g}s"
            )
        visible = VISIBLE_RUNTIME_RE.search(html.unescape(marker.group("body")))
        if visible is None:
            errors.append(
                "HTML: packed-runtime element does not visibly print the runtime with an 's' suffix"
            )
        else:
            visible_runtime = float(visible.group("value"))
            if abs(visible_runtime - packed_duration) > 1e-6:
                errors.append(
                    f"HTML: visible packed runtime {visible_runtime:g}s != summed unit duration "
                    f"{packed_duration:g}s"
                )

    if warnings:
        print(f"WARN: {len(warnings)} density warning(s)")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print(f"FAIL: {len(errors)} issue(s) in {len(units)} H3 unit(s)")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"PASS: {len(units)} H3 unit(s) satisfy unit and dialogue-budget checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
