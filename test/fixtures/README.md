# Token-count parity fixtures

`token-counts.json` contains reviewed, non-secret fixture text and expected counts for every encoding exposed by the package. Large inputs use deterministic recipes instead of committed text blobs:

- `large-repeated` materializes to 49,152 UTF-8 bytes;
- `large-nonrepeated` materializes to 54,843 UTF-8 bytes;
- all fixtures remain below the documented 64 KiB per-input test bound.

Expected counts were produced and independently rechecked with the official [`openai/tiktoken`](https://github.com/openai/tiktoken) Python package, pinned to `0.14.0` from [PyPI](https://pypi.org/project/tiktoken/). Special-token markers are encoded as ordinary text with `allowed_special=set()` and `disallowed_special=()` to match the public adapter contract.

The reference run used the PyPI CPython 3.9 macOS ARM64 wheel with SHA-256 `aa428a559d5fd02ae619aacaace86c7474a1f2702d2c01fc828908dd60f20f7a`. Other platforms may resolve a different wheel for the same pinned source release.

Reproduce the reference verification without adding Python packages to this project:

```sh
python3 -m venv /tmp/token-counter-reference
/tmp/token-counter-reference/bin/python -m pip install -r test/reference/requirements.txt
/tmp/token-counter-reference/bin/python test/reference/verify_tiktoken.py
```

The verifier reports only fixture identifiers, encodings, and numeric counts when a mismatch occurs. It never prints fixture input text or token arrays.
