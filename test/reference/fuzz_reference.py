#!/usr/bin/env python3
"""Count a deterministic generated corpus with pinned official tiktoken."""

from __future__ import annotations

import argparse
import json
import sys

import tiktoken


EXPECTED_REFERENCE_VERSION = "0.14.0"
ENCODINGS = (
    "cl100k_base",
    "gpt2",
    "o200k_base",
    "p50k_base",
    "p50k_edit",
    "r50k_base",
)
CATEGORIES = (
    "empty",
    "ascii",
    "whitespace-controls",
    "utf16-code-units",
    "surrogate-patterns",
    "repeated-fragments",
    "high-entropy",
    "mixed",
)
SIZE_BANDS = ((0, 0), (1, 8), (9, 32), (33, 128), (129, 512), (513, 2048))
WHITESPACE_AND_CONTROLS = (
    0x0000, 0x0009, 0x000A, 0x000D, 0x0020, 0x007F, 0x0085,
    0x00A0, 0x200B, 0x2028, 0x2029, 0x202E, 0x2066, 0xFEFF,
)
SURROGATE_PATTERNS = (
    (0xD800,),
    (0xDC00,),
    (0xD800, 0xDC00),
    (0xDBFF, 0xDFFF),
    (0xDC00, 0xD800),
    (0x0041, 0xD800, 0x0042),
    (0xD800, 0xD800, 0xDC00),
)
MIXED_POOLS = (
    (0x0000, 0x0009, 0x000A, 0x000D, 0x0020),
    (0x0030, 0x0041, 0x005A, 0x0061, 0x007A, 0x007E),
    (0x00A0, 0x0301, 0x03A9, 0x0416, 0x4E2D, 0x6587),
    (0x200B, 0x202E, 0x2066, 0xFEFF),
    (0xD800, 0xDBFF, 0xDC00, 0xDFFF),
)
MASK_32 = 0xFFFFFFFF


def mix_seed(seed: int, case_index: int) -> int:
    value = (seed ^ (((case_index + 1) * 0x9E3779B9) & MASK_32)) & MASK_32
    value = ((value ^ (value >> 16)) * 0x85EBCA6B) & MASK_32
    value = ((value ^ (value >> 13)) * 0xC2B2AE35) & MASK_32
    value = (value ^ (value >> 16)) & MASK_32
    return value or 0x6D2B79F5


class XorShift32:
    def __init__(self, seed: int) -> None:
        self.state = seed & MASK_32

    def next(self) -> int:
        self.state = (self.state ^ ((self.state << 13) & MASK_32)) & MASK_32
        self.state = (self.state ^ (self.state >> 17)) & MASK_32
        self.state = (self.state ^ ((self.state << 5) & MASK_32)) & MASK_32
        return self.state


def random_between(random: XorShift32, minimum: int, maximum: int) -> int:
    if minimum == maximum:
        return minimum
    return minimum + (random.next() % (maximum - minimum + 1))


def units_to_string(units: list[int]) -> str:
    return "".join(chr(unit) for unit in units)


def generate_text(category: str, length: int, random: XorShift32) -> str:
    if category == "empty":
        return ""
    if category == "ascii":
        return units_to_string([0x20 + (random.next() % 0x5F) for _ in range(length)])
    if category == "whitespace-controls":
        return units_to_string([
            WHITESPACE_AND_CONTROLS[random.next() % len(WHITESPACE_AND_CONTROLS)]
            for _ in range(length)
        ])
    if category == "utf16-code-units":
        return units_to_string([random.next() & 0xFFFF for _ in range(length)])
    if category == "surrogate-patterns":
        units: list[int] = []
        while len(units) < length:
            units.extend(SURROGATE_PATTERNS[random.next() % len(SURROGATE_PATTERNS)])
        return units_to_string(units[:length])
    if category == "repeated-fragments":
        fragment_length = max(1, min(length, 1 + (random.next() % 24)))
        fragment = units_to_string([
            random.next() & 0xFFFF for _ in range(fragment_length)
        ])
        return (fragment * ((length + len(fragment) - 1) // len(fragment)))[:length]
    if category == "high-entropy":
        units = []
        used: set[int] = set()
        while len(units) < length:
            unit = random.next() & 0xFFFF
            if len(used) < 0x10000 and unit in used:
                continue
            used.add(unit)
            units.append(unit)
        return units_to_string(units)
    if category == "mixed":
        units = []
        for _ in range(length):
            pool = MIXED_POOLS[random.next() % len(MIXED_POOLS)]
            units.append(pool[random.next() % len(pool)])
        return units_to_string(units)
    raise RuntimeError("Unsupported fuzz category.")


def generate_case(seed: int, case_index: int) -> str:
    category = CATEGORIES[case_index % len(CATEGORIES)]
    size_band = (case_index // len(CATEGORIES)) % len(SIZE_BANDS)
    minimum, maximum = SIZE_BANDS[size_band]
    random = XorShift32(mix_seed(seed, case_index))
    length = random_between(random, minimum, maximum)
    return generate_text(category, length, random)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--start-case", required=True, type=int)
    parser.add_argument("--cases", required=True, type=int)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if tiktoken.__version__ != EXPECTED_REFERENCE_VERSION:
        print("fuzz-reference-failed reason=unexpected-version", file=sys.stderr)
        return 1
    if not 0 <= arguments.seed <= MASK_32:
        print("fuzz-reference-failed reason=invalid-seed", file=sys.stderr)
        return 1
    if arguments.start_case < 0 or not 1 <= arguments.cases <= 4096:
        print("fuzz-reference-failed reason=invalid-range", file=sys.stderr)
        return 1

    records: list[dict[str, object]] = []
    encoders = {name: tiktoken.get_encoding(name) for name in ENCODINGS}
    for case_index in range(arguments.start_case, arguments.start_case + arguments.cases):
        text = generate_case(arguments.seed, case_index)
        counts: dict[str, int] = {}
        for encoding, encoder in encoders.items():
            try:
                counts[encoding] = len(
                    encoder.encode(text, allowed_special=set(), disallowed_special=())
                )
            except Exception:
                print(
                    "fuzz-reference-failed "
                    f"seed=0x{arguments.seed:08x} case={case_index} "
                    f"encoding={encoding}",
                    file=sys.stderr,
                )
                return 1
        records.append({"case": case_index, "counts": counts})

    print(json.dumps({
        "version": tiktoken.__version__,
        "seed": arguments.seed,
        "startCase": arguments.start_case,
        "cases": arguments.cases,
        "records": records,
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        print("fuzz-reference-failed reason=internal", file=sys.stderr)
        raise SystemExit(1)
