#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""轮询 ComfyUI history 直到任务完成/失败"""
import json, subprocess, sys, time, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PID = sys.argv[1]
BASE = 'http://127.0.0.1:8188'
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else r'D:\HermesWorkspace\directorMaster\workspace\outputs\videos'

def get_history():
    r = subprocess.run(['curl', '-s', '--max-time', '10', f'{BASE}/history/{PID}'], capture_output=True, text=True, encoding='utf-8', errors='replace')
    try:
        return json.loads(r.stdout).get(PID)
    except Exception:
        return None

last = ''
for i in range(600):  # 最长 200 分钟
    rec = get_history()
    if rec:
        st = rec.get('status', {})
        status = st.get('status_str', 'running?')
        if status != last:
            print(f'[{i*20}s] status={status} completed={st.get("completed")}', flush=True)
            last = status
        if status == 'success':
            # 列出输出
            for nid, o in (rec.get('outputs') or {}).items():
                for k in ('videos', 'images', 'audio', 'gifs'):
                    for it in (o.get(k) or []):
                        print(f'OUT {k}: {it.get("filename")} sub={it.get("subfolder","")} type={it.get("type","")}', flush=True)
            # 下载所有 mp4
            os.makedirs(OUT_DIR, exist_ok=True)
            for nid, o in (rec.get('outputs') or {}).items():
                for k in ('videos', 'gifs'):
                    for it in (o.get(k) or []):
                        fn = it.get('filename')
                        sub = it.get('subfolder', '')
                        q = f'filename={fn}&subfolder={sub}&type={it.get("type","output")}'
                        dst = os.path.join(OUT_DIR, fn)
                        subprocess.run(['curl', '-s', '-L', '--max-time', '300', '-o', dst, f'{BASE}/view?{q}'], check=False)
                        print(f'SAVED {dst}', flush=True)
            break
        if status == 'error':
            # 打错误信息
            for msg in st.get('messages', []):
                if msg[0] == 'execution_error':
                    e = msg[1]
                    print('ERROR node:', e.get('node_id'), e.get('node_type'), flush=True)
                    print('MSG:', e.get('exception_message'), flush=True)
            break
    time.sleep(20)
print('DONE', flush=True)
