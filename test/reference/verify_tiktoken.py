#!/usr/bin/env python3
"""Verify committed counts with the pinned official tiktoken reference."""

from __future__ import annotations

import json
from pathlib import Path

import tiktoken


EXPECTED_REFERENCE_VERSION = "0.14.0"
FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "token-counts.json"


def materialize(input_recipe: dict[str, object]) -> str:
    kind = input_recipe["kind"]
    if kind == "literal":
        return str(input_recipe["text"])
    if kind == "repeat":
        return str(input_recipe["text"]) * int(input_recipe["repetitions"])
    if kind == "utf16-code-units":
        return "".join(chr(int(code_unit)) for code_unit in input_recipe["codeUnits"])
    if kind == "numbered-lines":
        lines = int(input_recipe["lines"])
        return "".join(
            f"row-{index}: alpha-{index % 17}, beta-{(index * 7) % 101}\n"
            for index in range(lines)
        )
    raise RuntimeError("Unsupported fixture input recipe.")


def main() -> None:
    if tiktoken.__version__ != EXPECTED_REFERENCE_VERSION:
        raise RuntimeError("Unexpected tiktoken reference version.")

    fixture_data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    mismatches: list[str] = []
    checked = 0

    for fixture in fixture_data["fixtures"]:
        text = materialize(fixture["input"])
        for encoding_name in fixture_data["encodings"]:
            encoder = tiktoken.get_encoding(encoding_name)
            actual = len(
                encoder.encode(
                    text,
                    allowed_special=set(),
                    disallowed_special=(),
                )
            )
            expected = fixture["expected"][encoding_name]
            checked += 1
            if actual != expected:
                mismatches.append(
                    f"{fixture['id']}/{encoding_name}: expected={expected} actual={actual}"
                )

    if mismatches:
        raise RuntimeError("Reference mismatches:\n" + "\n".join(mismatches))

    print(
        f"reference-parity-ok version={tiktoken.__version__} checks={checked}"
    )


if __name__ == "__main__":
    main()
