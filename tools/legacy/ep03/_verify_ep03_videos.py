# -*- coding: utf-8 -*-
"""EP03 v3 成片验片：ffprobe + 每段四帧拼图 + 段间衔接对比图。

用法: python _verify_ep03_videos.py
"""
import io, os, re, subprocess, sys, glob, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OUT = r'D:\HermesWorkspace\directorMaster\workspace\outputs\videos_ep03_v3'
STAGE = r'D:\HermesWorkspace\_to_user\ep03_v3_验片'
TMP = os.path.join(STAGE, '_frames')


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def probe(f):
    rc, out = run(['ffprobe', '-v', 'error', '-show_entries',
                   'stream=index,codec_name,profile,width,height,r_frame_rate,nb_frames,duration,channels,sample_rate,pix_fmt',
                   '-of', 'json', f])
    try:
        d = json.loads(out)
    except Exception:
        return None
    v = next((s for s in d.get('streams', []) if s.get('width')), None)
    a = next((s for s in d.get('streams', []) if s.get('codec_name') == 'aac'), None)
    return v, a


def frame(video, t, dst):
    run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', video, '-frames:v', '1', dst])


def hstack(imgs, dst):
    args = ['ffmpeg', '-y', '-v', 'error']
    for i in imgs:
        args += ['-i', i]
    w = 792
    fc = ''.join('[%d:v]scale=%d:-2[a%d];' % (i, w, i) for i in range(len(imgs)))
    fc += ''.join('[a%d]' % i for i in range(len(imgs))) + 'hstack'
    args += ['-filter_complex', fc, '-frames:v', '1', dst]
    run(args)


def main():
    os.makedirs(STAGE, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    vids = sorted(glob.glob(os.path.join(OUT, '*.mp4')))
    if not vids:
        print('没有找到 mp4：' + OUT)
        return 1
    print('找到 %d 个成片：' % len(vids))
    for f in vids:
        pr = probe(f)
        if not pr:
            print('  ffprobe 失败 %s' % f)
            continue
        v, a = pr
        print('  %-58s %sx%s %.2fs %s帧 %s%s'
              % (os.path.basename(f), v.get('width'), v.get('height'),
                 float(v.get('duration', 0)), v.get('nb_frames'), v.get('pix_fmt'),
                 ('  音频%sHz/%sch' % (a.get('sample_rate'), a.get('channels'))) if a else '  ⚠️无音轨'))
        base = os.path.splitext(os.path.basename(f))[0]
        dur = float(v.get('duration', 15))
        stamps = [0.5, dur * 0.33, dur * 0.66, max(0.2, dur - 0.5)]
        imgs = []
        for i, t in enumerate(stamps):
            p = os.path.join(TMP, '%s_%d.png' % (base, i))
            frame(f, t, p)
            if os.path.exists(p):
                imgs.append(p)
        if len(imgs) == 4:
            dst = os.path.join(STAGE, '%s_四帧.png' % base)
            hstack(imgs, dst)
            print('     四帧拼图 -> %s' % dst)
    return 0


sys.exit(main())
