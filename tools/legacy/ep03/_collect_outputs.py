"""Wait for a ComfyUI prompt to finish, then download its outputs to a target dir."""
import json, io, sys, os, time, urllib.request, urllib.parse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
BASE = 'http://127.0.0.1:8188'
PROMPT_ID = sys.argv[1]
OUTDIR = sys.argv[2]
os.makedirs(OUTDIR, exist_ok=True)

t0 = time.time()
while True:
    try:
        rec = json.load(urllib.request.urlopen(BASE + '/history/' + PROMPT_ID, timeout=30)).get(PROMPT_ID)
    except Exception as e:
        print('[poll err]', e, flush=True)
        rec = None
    if rec:
        status = rec.get('status', {})
        print('STATUS:', status.get('status_str'), '| completed:', status.get('completed'), flush=True)
        msgs = status.get('messages', [])
        for m in msgs:
            if m[0] == 'execution_error':
                print('EXECUTION_ERROR:', json.dumps(m[1], ensure_ascii=False)[:1500], flush=True)
        saved = []
        for nid, out in (rec.get('outputs') or {}).items():
            for key in ('videos', 'gifs', 'images', 'audio'):
                for item in out.get(key) or []:
                    if not item.get('filename'):
                        continue
                    q = urllib.parse.urlencode({'filename': item['filename'],
                                                'subfolder': item.get('subfolder', ''),
                                                'type': item.get('type', 'output')})
                    try:
                        data = urllib.request.urlopen(BASE + '/view?' + q, timeout=120).read()
                    except Exception as e:
                        print('  download fail', item['filename'], e, flush=True)
                        continue
                    tgt = os.path.join(OUTDIR, os.path.basename(item['filename']))
                    open(tgt, 'wb').write(data)
                    saved.append(tgt)
                    print('  saved', tgt, len(data), 'bytes', flush=True)
        print('ELAPSED_SEC', round(time.time() - t0, 1), flush=True)
        print('DONE', len(saved), 'files', flush=True)
        break
    print('[wait %4ds] still running' % (time.time() - t0), flush=True)
    time.sleep(15)
