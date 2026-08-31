# Token-count parity fixtures

`token-counts.json` contains 34 reviewed, non-secret fixture recipes and expected
counts for every encoding exposed by the package. Large inputs use deterministic
recipes instead of committed text blobs:

- `large-repeated` materializes to 49,152 UTF-8 bytes;
- `large-nonrepeated` materializes to 54,843 UTF-8 bytes;
- all fixtures remain below the documented 64 KiB per-input test bound.

Twenty-two `pathological-*` fixtures cover NUL and embedded NUL, BOM, distinct
CR/LF/CRLF sequences, whitespace and non-breaking spaces, distinct precomposed
and combining normalization forms, emoji composition, regional indicators,
zero-width and bidi controls, source and transport-like text, and long-token
and newline-heavy recipes. Lone and embedded UTF-16 surrogates use the
`utf16-code-units` recipe so their exact JavaScript code units remain
reviewable; in particular, the corpus contains `[55296]`, `[56320]`, and
`[65, 55296, 66]` for `\uD800`, `\uDC00`, and `A\uD800B`.

The package does not normalize, reject, sanitize, or repair these inputs as a
public policy. Canonically equivalent precomposed and combining strings remain
separate cases and are checked against the tokenizer oracle's behavior.

Expected counts were produced and independently rechecked with the official [`openai/tiktoken`](https://github.com/openai/tiktoken) Python package, pinned to `0.14.0` from [PyPI](https://pypi.org/project/tiktoken/). Special-token markers are encoded as ordinary text with `allowed_special=set()` and `disallowed_special=()` to match the public adapter contract.

The reference run used the PyPI CPython 3.9 macOS ARM64 wheel with SHA-256 `aa428a559d5fd02ae619aacaace86c7474a1f2702d2c01fc828908dd60f20f7a`. Other platforms may resolve a different wheel for the same pinned source release.

Reproduce the reference verification without adding Python packages to this project:

```sh
python3 -m venv /tmp/token-counter-reference
/tmp/token-counter-reference/bin/python -m pip install -r test/reference/requirements.txt
/tmp/token-counter-reference/bin/python test/reference/verify_tiktoken.py
```

The verifier performs 204 checks and reports only fixture identifiers,
encodings, and numeric expected/actual counts when a mismatch occurs. It never
prints fixture input text or token arrays.
