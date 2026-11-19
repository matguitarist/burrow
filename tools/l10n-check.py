#!/usr/bin/env python3
"""Fail when a string the web UI shows has no French.

Finds every literal passed to t('…') or tn(n, '…', '…') under src/ and checks
that src/i18n/fr/*.json has it. Also lists French entries no code uses and
keys given two different French translations. Prints L10N PASS when clean.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
LIT = r"""('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)"""
CALL_T = re.compile(r'\bt\(\s*' + LIT)
CALL_TN = re.compile(r'\btn\(\s*[^,]+?,\s*' + LIT + r'\s*,\s*' + LIT)

def unquote(s):
    body = s[1:-1]
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), body)

used = {}
for f in sorted(SRC.rglob('*.js*')):
    if 'i18n' in f.parts or f.name == 'i18n.js':
        continue
    text = f.read_text(encoding='utf-8')
    for m in CALL_T.finditer(text):
        used.setdefault(unquote(m.group(1)), f.relative_to(ROOT))
    for m in CALL_TN.finditer(text):
        for g in (1, 2):
            used.setdefault(unquote(m.group(g)), f.relative_to(ROOT))

fr, conflicts = {}, []
for f in sorted((SRC / 'i18n' / 'fr').glob('*.json')):
    for k, v in json.loads(f.read_text(encoding='utf-8')).items():
        if k in fr and fr[k] != v:
            conflicts.append((k, fr[k], v, f.name))
        fr[k] = v

missing = sorted(k for k in used if k not in fr or not str(fr[k]).strip())
unused = sorted(k for k in fr if k not in used)
bad_space = sorted(k for k, v in fr.items() if re.search(r'(?<=\S) [;!?:»]|« ', v))

for k in missing:
    print(f'MISSING  {used[k]}: {k!r}')
for k, a, b, name in conflicts:
    print(f'CONFLICT {k!r}: {a!r} vs {b!r} ({name})')
for k in bad_space:
    print(f'SPACING  {k!r}: {fr[k]!r} (use U+202F before ; ! ?, U+00A0 before : and inside « »)')
for k in unused:
    print(f'UNUSED   {k!r}')

print(f'{len(used)} strings, {len(fr)} French, {len(missing)} missing, {len(conflicts)} conflicts, {len(bad_space)} spacing, {len(unused)} unused')
if missing or conflicts or bad_space:
    sys.exit(1)
print('L10N PASS')
