# -*- coding: utf-8 -*-
"""分段验片：每段四帧 + 段间衔接对比（上段末帧 vs 下段首帧）。"""
import io, os, subprocess, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
SRC = r'D:\HermesWorkspace\directorMaster\workspace\outputs\videos_ep03_v3\MiniMaxH3_Director_00034_.mp4'
OUT = r'D:\HermesWorkspace\_to_user\ep03_v3_验片'
TMP = os.path.join(OUT, '_f')


def run(cmd):
    subprocess.run(cmd, capture_output=True)


def f(t, name):
    p = os.path.join(TMP, name)
    run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', SRC, '-frames:v', '1', p])
    return p if os.path.exists(p) else None


def grid(imgs, dst, cols=2, w=792):
    args = ['ffmpeg', '-y', '-v', 'error']
    for i in imgs:
        args += ['-i', i]
    n = len(imgs)
    rows = (n + cols - 1) // cols
    fc = ''.join('[%d:v]scale=%d:-2[a%d];' % (i, w, i) for i in range(n))
    parts = []
    for r in range(rows):
        row = [i for i in range(r * cols, min(n, (r + 1) * cols))]
        fc += ''.join('[a%d]' % i for i in row) + 'hstack[r%d];' % r
        parts.append('[r%d]' % r)
    fc += ''.join(parts) + 'vstack'
    args += ['-filter_complex', fc, '-frames:v', '1', dst]
    run(args)


def row(imgs, dst, w=792):
    args = ['ffmpeg', '-y', '-v', 'error']
    for i in imgs:
        args += ['-i', i]
    fc = ''.join('[%d:v]scale=%d:-2[a%d];' % (i, w, i) for i in range(len(imgs)))
    fc += ''.join('[a%d]' % i for i in range(len(imgs))) + 'hstack'
    args += ['-filter_complex', fc, '-frames:v', '1', dst]
    run(args)


os.makedirs(TMP, exist_ok=True)
SEG = [('P01_校门开学', 0.0, 15.0), ('P02_下一组自由泳', 15.0, 30.0), ('P03_红杉菲尔普斯', 30.0, 45.04)]

for name, a, b in SEG:
    span = b - a
    ts = [a + 0.5, a + span * 0.34, a + span * 0.67, b - 0.6]
    imgs = [f(round(t, 2), 'seg_%s_%d.png' % (name[:3], i)) for i, t in enumerate(ts)]
    imgs = [i for i in imgs if i]
    if len(imgs) == 4:
        d = os.path.join(OUT, '%s_四帧.png' % name)
        grid(imgs, d, cols=2)
        print('  四帧 -> %s' % d)

# 段间衔接：上段末帧 vs 下段首帧
for tag, t_prev, t_next in [('P01→P02', 14.4, 15.5), ('P02→P03', 29.4, 30.5)]:
    a = f(t_prev, 'seam_%s_a.png' % tag)
    b = f(t_next, 'seam_%s_b.png' % tag)
    if a and b:
        d = os.path.join(OUT, '衔接_%s_末帧vs首帧.png' % tag)
        row([a, b], d, w=900)
        print('  衔接 -> %s' % d)

print('输出目录:', OUT)
