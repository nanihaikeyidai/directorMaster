"""Validate a compiled API-format ComfyUI workflow against the live /object_info schema.
Catches: missing node classes, missing required inputs, COMBO values not in list, INT/FLOAT out of range.
"""
import json, io, sys, urllib.request, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = 'http://127.0.0.1:8188'
path = sys.argv[1]
wf = json.load(open(path, encoding='utf-8'))


def info(t):
    try:
        return json.load(urllib.request.urlopen(BASE + '/object_info/' + t, timeout=30)).get(t)
    except Exception:
        return None


cache = {}
errors = []
warn = []

for nid, node in wf.items():
    ct = node.get('class_type')
    if ct not in cache:
        cache[ct] = info(ct)
    schema = cache[ct]
    if schema is None:
        errors.append('节点 %s: 未知 class_type %s' % (nid, ct))
        continue
    req = schema.get('input', {}).get('required', {}) or {}
    opt = schema.get('input', {}).get('optional', {}) or {}
    inputs = node.get('inputs', {}) or {}
    for name, spec in req.items():
        if name not in inputs:
            errors.append('节点 %s (%s): 缺少必填输入 %s' % (nid, ct, name))
            continue
        v = inputs[name]
        if isinstance(v, list) and len(v) == 2 and isinstance(v[0], (str, int)):
            continue  # connection
        t = spec[0] if isinstance(spec, list) and spec else spec
        if isinstance(t, list):  # COMBO
            if v not in t:
                errors.append('节点 %s (%s): %s = %r 不在可选列表' % (nid, ct, name, str(v)[:80]))
        elif t == 'INT':
            if not isinstance(v, int):
                errors.append('节点 %s (%s): %s 应为 INT, 实为 %r' % (nid, ct, name, v))
            else:
                cfg = spec[1] if len(spec) > 1 else {}
                if 'min' in cfg and v < cfg['min']:
                    errors.append('节点 %s (%s): %s=%s < min %s' % (nid, ct, name, v, cfg['min']))
                if 'max' in cfg and v > cfg['max']:
                    errors.append('节点 %s (%s): %s=%s > max %s' % (nid, ct, name, v, cfg['max']))
        elif t == 'FLOAT':
            if not isinstance(v, (int, float)):
                errors.append('节点 %s (%s): %s 应为 FLOAT, 实为 %r' % (nid, ct, name, v))
            else:
                cfg = spec[1] if len(spec) > 1 else {}
                if 'min' in cfg and v < cfg['min'] - 1e-9:
                    errors.append('节点 %s (%s): %s=%s < min %s' % (nid, ct, name, v, cfg['min']))
                if 'max' in cfg and v > cfg['max'] + 1e-9:
                    errors.append('节点 %s (%s): %s=%s > max %s' % (nid, ct, name, v, cfg['max']))
        elif t == 'STRING' and not isinstance(v, str):
            errors.append('节点 %s (%s): %s 应为 STRING, 实为 %r' % (nid, ct, name, type(v).__name__))
        elif t == 'BOOLEAN' and not isinstance(v, bool):
            warn.append('节点 %s (%s): %s 应为 BOOLEAN, 实为 %r' % (nid, ct, name, v))
    for name in inputs:
        if name not in req and name not in opt:
            warn.append('节点 %s (%s): 输入 %s 不在 schema 中（可能被忽略）' % (nid, ct, name))

print('节点数:', len(wf))
print('错误:', len(errors))
for e in errors:
    print('  [ERR]', e)
print('警告:', len(warn))
for w in warn[:20]:
    print('  [WARN]', w)
sys.exit(1 if errors else 0)
