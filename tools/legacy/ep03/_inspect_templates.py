import json, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

paths = {
    'LOCAL': r'D:\HermesWorkspace\directorMaster\workspace\workflows\minimax_h3_director_二采_加速.json',
    'F_二采': r'F:\Work-Fisher纯净包2026.8.7\ComfyUI\user\default\workflows\minimax_h3_director_二采_加速.json',
    'F_红绳': r'F:\Work-Fisher纯净包2026.8.7\ComfyUI\user\default\workflows\minimax_h3_director_二采_加速_红绳.json',
}
keys = ['task_type', 'global_prompt', 'bd_grp_sample', 'cfg', 'seed', 'seedmode', 'frame_rate', 'width', 'height',
        'ref_max_size', 'total_frames', 'timeline_data', 'bd_grp_adv', 'steps', 'sampler', 'scheduler',
        'shift_video', 'shift_audio', 'bd_grp_perf', 'clear_vram', 'export_src']

for k, p in paths.items():
    if not os.path.exists(p):
        print('=' * 20, k, '不存在', p)
        continue
    d = json.load(open(p, encoding='utf-8'))
    print('=' * 20, k, 'size', os.path.getsize(p))
    types = {}
    for n in d.get('nodes', []):
        types[n.get('type')] = types.get(n.get('type'), 0) + 1
    for t in ['MiniMaxH3Director', 'MiniMaxH3DirectorRefine', 'MiniMaxH3DirectorRefineUpscale',
              'MiniMaxH3DirectorRefineLatent', 'TESpeedMiniMaxH3', 'MiniMaxH3MemoryEfficientSageAttentionPatch',
              'VHS_VideoCombine', 'LoraLoaderModelOnly', 'CLIPLoader', 'UNETLoader']:
        if t in types:
            print('  node:', t, 'x', types[t])
    for n in d.get('nodes', []):
        t = n.get('type', '')
        if t == 'MiniMaxH3Director':
            wv = n.get('widgets_values') or []
            print('  --- Director node', n['id'], 'widgets', len(wv))
            for i, v in enumerate(wv):
                nm = keys[i] if i < len(keys) else ('w%d' % i)
                s = str(v)
                if nm == 'timeline_data':
                    tl = json.loads(v)
                    print('   ', nm, '-> v', tl.get('version'), 'segs', len(tl.get('segments', [])),
                          'totalFrames', tl.get('totalFrames'), 'w/h', tl.get('width'), tl.get('height'),
                          'output', json.dumps(tl.get('output'), ensure_ascii=False)[:220])
                elif nm == 'global_prompt':
                    print('   ', nm, 'len', len(s))
                else:
                    print('   ', nm, '=', s[:140])
        elif 'Refine' in t:
            print('  [REFINE]', n['id'], t, str(n.get('widgets_values'))[:300])
        elif t in ('LoraLoaderModelOnly',):
            print('  [LORA]', n['id'], str(n.get('widgets_values'))[:200])
        elif t in ('CLIPLoader',):
            print('  [CLIP]', n['id'], str(n.get('widgets_values'))[:200])
        elif t in ('UNETLoader',):
            print('  [UNET]', n['id'], str(n.get('widgets_values'))[:200])
