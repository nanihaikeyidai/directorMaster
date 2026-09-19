# -*- coding: utf-8 -*-
"""从《重构版_分段提示词草案.md》逐字提取 P01-P03，构建 directorMaster spec。

铁律：
- 提示词一字不改，直接从草案原文切块（subject_definitions … non_diegetic_music）
- 素材按 <Picture N>/<Audio M> 顺序绑定；**跨段文件名必须唯一**（CLI 会校验）
- 0.6MP / 1056x608 / steps 8 / 不接 refine = 单遍
- 段间引导：P01 false，P02/P03 true
"""
import json, io, os, re, shutil, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

R = r'D:\HermesWorkspace\ai小说\红绳'
DRAFT = os.path.join(R, '05-workflow', 'ep03', '重构版_分段提示词草案.md')
DM = r'D:\HermesWorkspace\directorMaster'
STAGE = os.path.join(DM, 'workspace', 'production', 'ep03_v3', 'assets')
SPEC = os.path.join(DM, 'workspace', 'production', 'ep03_v3', 'spec-ep03-p01p03.json')

IMG_ANNA = os.path.join(R, '05-images', '人物', '安娜_游泳社人设四格.png')
IMG_LIXIANG = os.path.join(R, '05-images', '人物', '李想_游泳社人设四格.png')
VOICE = os.path.join(R, '05-workflow', 'ep02', '归档素材', '人物参考音色')
A_ANNA = os.path.join(VOICE, '安娜.wav')
A_LIXIANG = os.path.join(VOICE, '李想.wav')
A_TEACHER = os.path.join(VOICE, '王老师.wav')     # 体育老师临时声线（项目自有素材）
A_BOY = os.path.join(VOICE, '陆沉.wav')           # 起哄男生临时声线（项目自有素材）

# ---- 每段素材清单（顺序 = <Picture N> / <Audio M> 的编号顺序）----
ASSETS = {
    'P01': [('image', IMG_ANNA, 'ep03_P01_安娜.png', '安娜（校服），黑长直，冷静克制的高中女生'),
            ('audio', A_ANNA, 'ep03_P01_安娜音.wav', '安娜的音色参考（本段无台词）')],
    'P02': [('image', IMG_ANNA, 'ep03_P02_安娜.png', '安娜（竞技泳装+泳帽+泳镜）'),
            ('image', IMG_LIXIANG, 'ep03_P02_李想.png', '李想（竞技泳装+泳帽+泳镜，健壮自信）'),
            ('audio', A_TEACHER, 'ep03_P02_体育老师音.wav', '体育老师短促清晰口令的音色参考'),
            ('audio', A_ANNA, 'ep03_P02_安娜音.wav', '安娜的音色参考'),
            ('audio', A_LIXIANG, 'ep03_P02_李想音.wav', '李想的音色参考')],
    'P03': [('image', IMG_ANNA, 'ep03_P03_安娜.png', '安娜（竞技泳装+泳帽+泳镜，左侧跳台）'),
            ('image', IMG_LIXIANG, 'ep03_P03_李想.png', '李想（竞技泳装+泳帽+泳镜，右侧跳台）'),
            ('audio', A_BOY, 'ep03_P03_男生音.wav', '池边起哄男生的临时声线参考'),
            ('audio', A_LIXIANG, 'ep03_P03_李想音.wav', '李想的音色参考'),
            ('audio', A_TEACHER, 'ep03_P03_体育老师音.wav', '体育老师口令与哨声的音色参考')],
}
TITLES = {'P01': '校门开学', 'P02': '下一组自由泳', 'P03': '红杉菲尔普斯'}


def extract(text, key):
    """切出某个段落的 H3 主提示词 / soundscape / negativePrompt。"""
    i = text.find('## %s｜' % key)
    if i < 0:
        raise SystemExit('找不到段落 ' + key)
    j = text.find('\n## ', i + 3)
    block = text[i:j if j > 0 else len(text)]
    k = block.find('### H3主提示词草案')
    if k < 0:
        raise SystemExit(key + ' 没有 H3主提示词草案')
    body = block[k + len('### H3主提示词草案'):]

    # negativePrompt 行（最后一段）
    m = re.search(r'^negativePrompt:\s*(.+)$', body, re.M)
    if not m:
        raise SystemExit(key + ' 没有 negativePrompt')
    negative = m.group(1).strip()
    head = body[:m.start()]

    # soundscape
    ms = re.search(r'^overall_soundscape:\s*\n(.+?)(?=\n\s*\n\s*non_diegetic_music:)', head, re.M | re.S)
    soundscape = ms.group(1).strip() if ms else ''

    # finalPrompt = subject_definitions 开头 到 non_diegetic_music 那行
    ms2 = re.search(r'^subject_definitions:', head, re.M)
    me2 = re.search(r'^non_diegetic_music:\s*N/A\s*$', head, re.M)
    if not ms2 or not me2:
        raise SystemExit(key + ' 提示词结构不完整')
    final_prompt = head[ms2.start():me2.end()].strip()
    return final_prompt, soundscape, negative


def labels(prompt, kind):
    return sorted({int(x) for x in re.findall(r'<%s (\d+)>' % kind, prompt)})


def main():
    text = open(DRAFT, encoding='utf-8').read()
    os.makedirs(STAGE, exist_ok=True)

    segments = []
    for idx, key in enumerate(['P01', 'P02', 'P03']):
        final_prompt, soundscape, negative = extract(text, key)
        pl, al = labels(final_prompt, 'Picture'), labels(final_prompt, 'Audio')
        assets = []
        npic = naux = 0
        for media, src, dst, desc in ASSETS[key]:
            if not os.path.exists(src):
                raise SystemExit('缺素材 ' + src)
            target = os.path.join(STAGE, dst)
            shutil.copy2(src, target)
            assets.append({'path': target, 'mediaType': media, 'description': desc})
            if media == 'audio':
                naux += 1
            else:
                npic += 1
        # 严格对齐：<Picture N> 必须 1..npic，<Audio M> 必须 1..naux
        if pl != list(range(1, npic + 1)):
            raise SystemExit('%s Picture 标签 %s 与素材数 %d 不匹配' % (key, pl, npic))
        if al != list(range(1, naux + 1)):
            raise SystemExit('%s Audio 标签 %s 与素材数 %d 不匹配' % (key, al, naux))
        print('%s %s：Picture%s Audio%s → %d 图 %d 音  提示词 %d 字'
              % (key, TITLES[key], pl, al, npic, naux, len(final_prompt)))
        segments.append({
            'id': 'ep03_%s_%s' % (key.lower(), TITLES[key]),
            'title': '%s｜%s' % (key, TITLES[key]),
            'durationSec': 15,
            'continuityFromPrev': idx > 0,          # P01 无；P02/P03 开段间引导
            'finalPrompt': final_prompt,
            'soundscape': soundscape,
            'negativePrompt': negative,
            'assets': assets,
        })

    spec = {
        'workflow': r'F:\Work-Fisher纯净包2026.8.7\ComfyUI\user\default\workflows\minimax_h3_director_二采_加速_红绳.json',
        'outputDir': os.path.join(DM, 'workspace', 'outputs', 'videos_ep03_v3'),
        'negativePrompt': segments[0]['negativePrompt'],
        'settings': {'fps': 24, 'width': 1056, 'height': 608, 'megapixels': 0.6,
                     'steps': 8, 'seed': 666, 'cfg': 1},
        'segments': segments,
    }
    os.makedirs(os.path.dirname(SPEC), exist_ok=True)
    json.dump(spec, open(SPEC, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print()
    print('spec -> ' + SPEC)
    print('段数 %d，共 %d 帧/段，合计 %d 帧（%.1f 秒）'
          % (len(segments), 362, 362 * len(segments), 362 * len(segments) / 24))


main()
