# -*- coding: utf-8 -*-
"""提交 directorMaster 编译产物到本地 ComfyUI，并收集输出。

为什么不用 cli/director-master.mjs run：
  该 CLI 的 uiToApi() 把 MiniMaxH3Director 尾部 3 个 widget 的索引错位了一位
  （bd_grp_perf / clear_vram_between_segments / export_source_images），
  导致 clear_vram_between_segments 被赋成字符串 "性能"。
  这里按**字段名**修正后再提交，不动他们的工具。
"""
import json, io, os, sys, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = 'http://127.0.0.1:8188'
API = r'D:\HermesWorkspace\directorMaster\workspace\production\ep03_v3\ep03-p01p03-api.json'
OUT = r'D:\HermesWorkspace\directorMaster\workspace\outputs\videos_ep03_v3'
SPEC = r'D:\HermesWorkspace\directorMaster\workspace\production\ep03_v3\spec-ep03-p01p03.json'


def log(m):
    print('[%s] %s' % (time.strftime('%H:%M:%S'), m), flush=True)


def main():
    wf = json.load(open(API, encoding='utf-8'))
    spec = json.load(open(SPEC, encoding='utf-8'))

    dnode = [v for v in wf.values() if v.get('class_type') == 'MiniMaxH3Director'][0]
    dnode['inputs']['bd_grp_perf'] = '性能'
    dnode['inputs']['clear_vram_between_segments'] = True
    dnode['inputs']['export_source_images'] = False
    dnode['inputs'].pop('sigmas', None)
    log('已修正 Director 尾部字段: bd_grp_perf=性能 clear_vram_between_segments=True export_source_images=False')

    # 1) 上传素材（文件名唯一）
    assets = []
    seen = set()
    for seg in spec['segments']:
        for a in seg['assets']:
            if a['path'] in seen:
                continue
            seen.add(a['path'])
            assets.append(a)
    log('待上传素材 %d 个' % len(assets))
    for i, a in enumerate(assets, 1):
        name = os.path.basename(a['path'])
        with open(a['path'], 'rb') as fh:
            r = requests.post(BASE + '/upload/image',
                              files={'image': (name, fh)},
                              data={'type': 'input', 'overwrite': 'true'}, timeout=180)
        r.raise_for_status()
        rec = r.json()
        if rec.get('name') and os.path.basename(rec['name']) != name:
            raise SystemExit('上传回执文件名不一致 %s -> %s' % (name, rec['name']))
        log('  [%d/%d] %s -> %s' % (i, len(assets), name, rec.get('name')))

    # 2) 提交
    body = {'prompt': wf, 'client_id': 'july-director-ep03v3'}
    r = requests.post(BASE + '/prompt', json=body, timeout=180)
    res = r.json()
    if not r.ok or res.get('error'):
        log('提交失败：')
        print(json.dumps(res, ensure_ascii=False, indent=2)[:4000])
        return 1
    pid = res['prompt_id']
    log('已提交 prompt_id=%s' % pid)

    # 3) 轮询
    t0 = time.time()
    last = ''
    while True:
        time.sleep(10)
        h = requests.get(BASE + '/history/' + pid, timeout=60).json()
        rec = h.get(pid)
        if rec:
            status = rec.get('status', {})
            log('STATUS=%s 用时 %.1f 分钟' % (status.get('status_str'), (time.time() - t0) / 60))
            if status.get('status_str') != 'success':
                msgs = status.get('messages') or []
                for m in msgs:
                    if m[0] in ('execution_error', 'execution_interrupted'):
                        print(json.dumps(m[1], ensure_ascii=False, indent=2)[:3000])
            # 4) 收集输出
            os.makedirs(OUT, exist_ok=True)
            saved = []
            for nid, o in (rec.get('outputs') or {}).items():
                for key in ('videos', 'gifs', 'images', 'audio'):
                    for item in (o.get(key) or []):
                        fn = item.get('filename')
                        if not fn:
                            continue
                        q = {'filename': fn, 'subfolder': item.get('subfolder', ''), 'type': item.get('type', 'output')}
                        rr = requests.get(BASE + '/view', params=q, timeout=300)
                        if rr.ok:
                            tgt = os.path.join(OUT, os.path.basename(fn))
                            open(tgt, 'wb').write(rr.content)
                            saved.append(tgt)
                            log('  收片 %s (%d bytes)' % (os.path.basename(fn), len(rr.content)))
            log('共收 %d 个文件 -> %s' % (len(saved), OUT))
            return 0 if status.get('status_str') == 'success' else 1
        q = requests.get(BASE + '/queue', timeout=30).json()
        cur = (time.time() - t0) / 60
        msg = '… 仍在跑（%.0f 分钟）running=%d pending=%d' % (cur, len(q.get('queue_running') or []), len(q.get('queue_pending') or []))
        if msg != last:
            log(msg)
            last = msg
        if cur > 200:
            log('超时 200 分钟，放弃')
            return 1


sys.exit(main())
