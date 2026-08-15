#!/usr/bin/env python3
"""Fill missing, statically referenced mobile UI translations.

HelpModal is deliberately excluded. ICU placeholders are protected before
translation so translated values remain valid at runtime.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[1]
LANG_DIR = ROOT / "resources" / "lang"
SOURCE_DIR = ROOT / "src" / "client"
EXCLUDED_FILES = {"HelpModal.ts"}
GOOGLE_CODES = {"he": "iw", "pt-BR": "pt", "zh-CN": "zh-CN", "zh-TW": "zh-TW"}
MARKER = re.compile(r"^\[\[WF(\d{4})\]\]\s?(.*)$")


def flatten(value: dict, prefix: str = "", output: dict[str, str] | None = None) -> dict[str, str]:
    output = {} if output is None else output
    for key, item in value.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(item, dict):
            flatten(item, name, output)
        else:
            output[name] = item
    return output


def set_value(value: dict, dotted_key: str, translated: str) -> None:
    target = value
    *parents, leaf = dotted_key.split(".")
    for parent in parents:
        child = target.get(parent)
        if not isinstance(child, dict):
            child = {}
            target[parent] = child
        target = child
    target[leaf] = translated


def mobile_keys() -> set[str]:
    keys: set[str] = set()
    expressions = [
        re.compile(r"translateText\(\s*[\"']([\w.-]+)[\"']"),
        re.compile(r"data-i18n(?:-[\w-]+)?=[\"']([\w.-]+)[\"']"),
    ]
    for path in SOURCE_DIR.rglob("*.ts"):
        if path.name in EXCLUDED_FILES:
            continue
        source = path.read_text(encoding="utf-8")
        for expression in expressions:
            keys.update(expression.findall(source))
    return keys


def protect_icu(text: str) -> tuple[str, list[str]]:
    """Replace balanced braced expressions with stable tokens."""
    parts: list[str] = []
    protected: list[str] = []
    index = 0
    while index < len(text):
        if text[index] != "{":
            parts.append(text[index])
            index += 1
            continue
        depth = 0
        end = index
        while end < len(text):
            if text[end] == "{":
                depth += 1
            elif text[end] == "}":
                depth -= 1
                if depth == 0:
                    end += 1
                    break
            end += 1
        if depth:
            parts.append(text[index])
            index += 1
            continue
        token = f"⟦WFVAR{len(protected)}⟧"
        protected.append(text[index:end])
        parts.append(token)
        index = end
    return "".join(parts), protected


def restore_icu(text: str, protected: list[str]) -> str:
    for index, original in enumerate(protected):
        text = text.replace(f"⟦WFVAR{index}⟧", original)
        text = text.replace(f"[WFVAR{index}]", original)
    return text


def batches(entries: list[tuple[str, str]], limit: int = 1800):
    batch: list[tuple[str, str]] = []
    size = 0
    for entry in entries:
        line_size = len(entry[1]) + 14
        if batch and size + line_size > limit:
            yield batch
            batch, size = [], 0
        batch.append(entry)
        size += line_size
    if batch:
        yield batch


def translate_entries(code: str, entries: list[tuple[str, str]]) -> dict[str, str]:
    target_code = GOOGLE_CODES.get(code, code)
    translator = GoogleTranslator(source="en", target=target_code)
    results: dict[str, str] = {}
    for batch_number, batch in enumerate(batches(entries), start=1):
        protected: list[list[str]] = []
        lines: list[str] = []
        for index, (_, source) in enumerate(batch):
            value, placeholders = protect_icu(source.replace("\n", " "))
            protected.append(placeholders)
            lines.append(f"[[WF{index:04d}]] {value}")
        try:
            translated = translator.translate("\n".join(lines))
        except Exception:
            # A few language/provider combinations reject a long batch despite
            # staying below the documented character limit. Retry each entry;
            # this is slower but never drops a key or writes a partial file.
            translated = "\n".join(
                f"[[WF{index:04d}]] {translator.translate(value)}"
                for index, value in enumerate(
                    line.split("]] ", 1)[1] for line in lines
                )
            )
        parsed: dict[int, str] = {}
        for line in translated.splitlines():
            match = MARKER.match(line.strip())
            if match:
                parsed[int(match.group(1))] = match.group(2)
        if len(parsed) != len(batch):
            # The provider occasionally rewrites a marker in RTL and CJK
            # output. Retrying individual values avoids accepting a shifted
            # translation and keeps every key correctly paired.
            parsed = {
                index: translator.translate(line.split("]] ", 1)[1])
                for index, line in enumerate(lines)
            }
        for index, (key, _) in enumerate(batch):
            value = restore_icu(parsed[index], protected[index])
            if "⟦WFVAR" in value or "[WFVAR" in value:
                raise RuntimeError(f"{code}: placeholder restore failed for {key}")
            results[key] = value
        print(f"{code}: batch {batch_number} complete ({len(results)}/{len(entries)})", flush=True)
        time.sleep(0.15)
    return results


def main() -> int:
    only = set(sys.argv[1:])
    english = json.loads((LANG_DIR / "en.json").read_text(encoding="utf-8"))
    english_flat = flatten(english)
    # Most mobile labels are referenced statically. Difficulty is dynamically
    # constructed, so add that small group explicitly. This deliberately
    # excludes unused web-only screens and the Help modal.
    keys = set(key for key in mobile_keys() if key in english_flat)
    keys.update(key for key in english_flat if key.startswith("difficulty."))
    keys = sorted(keys)
    language_paths = sorted(path for path in LANG_DIR.glob("*.json") if path.stem not in {"en", "metadata"})
    if only:
        language_paths = [path for path in language_paths if path.stem in only]
    print(f"Mobile non-Help key scope: {len(keys)}")
    for path in language_paths:
        code = path.stem
        document = json.loads(path.read_text(encoding="utf-8"))
        existing = flatten(document)
        missing = [(key, english_flat[key]) for key in keys if key not in existing]
        if not missing:
            print(f"{code}: complete")
            continue
        print(f"{code}: translating {len(missing)} missing keys", flush=True)
        translated = translate_entries(code, missing)
        for key, value in translated.items():
            set_value(document, key, value)
        path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{code}: saved {len(translated)} translations", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
