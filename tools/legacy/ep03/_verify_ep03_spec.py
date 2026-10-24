# -*- coding: utf-8 -*-
import json, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

P = r'D:\HermesWorkspace\directorMaster\workspace\production\ep03_v3\ep03-p01p03-api.json'
d = json.load(open(P, encoding='utf-8'))
print('总节点数:', len(d))

# 1) 有没有 refine 节点（要"不要二采"）
ref = [k for k, v in d.items() if 'Refine' in v.get('class_type', '') or 'Upscale' in v.get('class_type', '')]
print('Refine/Upscale 节点:', ref if ref else '无 ✅（单遍）')

dr = [(k, v) for k, v in d.items() if v.get('class_type') == 'MiniMaxH3Director']
print('Director 节点:', dr[0][0])
ins = dr[0][1]['inputs']
for k in ['task_type', 'cfg', 'seed', 'frame_rate', 'width', 'height', 'ref_max_size', 'total_frames',
          'steps', 'sampler', 'scheduler', 'shift_video', 'shift_audio', 'clear_vram_between_segments']:
    print('  %-26s %s' % (k, ins.get(k)))

tl = json.loads(ins['timeline_data'])
print()
print('timeline: version=%s fps=%s %sx%s totalFrames=%s 段数=%d'
      % (tl.get('version'), tl.get('frameRate'), tl.get('width'), tl.get('height'), tl.get('totalFrames'), len(tl['segments'])))
o = tl.get('output', {})
print('output: mode=%s megapixels=%s continuityEnabled=%s continuityOverlapFrames=%s'
      % (o.get('mode'), o.get('megapixels'), o.get('continuityEnabled'), o.get('continuityOverlapFrames')))
print('global.taskType:', tl.get('global', {}).get('taskType'))
print()
for i, s in enumerate(tl['segments']):
    print('--- 段 %d  id=%s' % (i + 1, s['id']))
    print('    title=%s  start=%s length=%s frameCount=%s durationSec=%s' % (s.get('title', s.get('id')), s['start'], s['length'], s['frameCount'], s.get('durationSec')))
    print('    continuityFromPrev=%s  selected=%s' % (s['continuityFromPrev'], s['selected']))
    print('    refs(图)=%s' % [r['fileName'] for r in s['refs']])
    print('    refAudios=%s' % [r['fileName'] for r in s['refAudios']])
    print('    prompt 首行: %s' % s['prompt'].split('\n')[0])
    print('    prompt 长度=%d  negativePrompt 长度=%d' % (len(s['prompt']), len(s.get('negativePrompt', ''))))

# 2) 检查模型加载器
print()
for k, v in d.items():
    if v.get('class_type') in ('UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'TESpeedMiniMaxH3'):
        print('  %-22s %s' % (v['class_type'], {kk: vv for kk, vv in v['inputs'].items() if not isinstance(vv, list)}))
