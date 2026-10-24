"""Build directorMaster spec for 《红绳》EP03 片段01《空座位》(当前版本, 2026-09-09 制作包).

提示词原文来自工程文件，不加工：
  - 动作流_H3纯提示词.txt  -> finalPrompt（与 9/9 RunningHub 预览同一份原文）
  - 视频提示词.md          -> negativePrompt
素材顺序严格对应 <Picture 1..4>（无 <Audio N>，因此不带参考音频）。
"""
import json, io, sys, os, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO = r'D:\HermesWorkspace\ai小说\红绳'
SEG = os.path.join(REPO, r'05-workflow\ep03\红绳片段01')
PROJ = r'D:\HermesWorkspace\directorMaster'
TEMPLATE = os.path.join(PROJ, r'workspace\workflows\minimax_h3_director_二采_加速.json')

final_prompt = open(os.path.join(SEG, r'动作流_H3纯提示词.txt'), encoding='utf-8').read().strip()
md = open(os.path.join(SEG, r'视频提示词.md'), encoding='utf-8').read()
m = re.search(r'##\s*negativePrompt\s*\n\s*`([^`]+)`', md, re.S)
if not m:
    raise SystemExit('negativePrompt 未找到')
neg = m.group(1).strip()

assets = [
    {"path": os.path.join(SEG, '首帧.png'), "mediaType": "image",
     "description": "本段独立首帧（<Picture 1>）——安娜坐在后排桌前、教材排列整齐、邻座空着，林晓把作业本放在空桌上。"},
    {"path": os.path.join(REPO, r'05-workflow\ep03\归档素材\人物\安娜_人设.png'), "mediaType": "image",
     "description": "安娜校服身份图（<Picture 2> / <Subject 1>）——苍白冷静的脸、深色长发、高中校服。"},
    {"path": os.path.join(REPO, r'05-images\人物\林晓_人设四格.png'), "mediaType": "image",
     "description": "林晓身份图（<Picture 3> / <Subject 2>）——黑长马尾配红绳发带、白蓝高中校服。"},
    {"path": os.path.join(REPO, r'05-images\场景\场景_雨天教室含同学_日漫电影感.png'), "mediaType": "image",
     "description": "雨天高中教室（<Picture 4> / <Subject 3>）——冷蓝灰漫射光、雨痕窗、普通同学、课桌、安静晨间氛围。"},
]

for a in assets:
    if not os.path.exists(a['path']):
        raise SystemExit('素材缺失: ' + a['path'])

# 校验 Picture 标签与素材顺序一一对应
got = sorted({int(x) for x in re.findall(r'<Picture (\d+)>', final_prompt)})
if got != list(range(1, len(assets) + 1)):
    raise SystemExit('Picture 标签与素材数不匹配: prompt=%s assets=%d' % (got, len(assets)))
aud = sorted({int(x) for x in re.findall(r'<Audio (\d+)>', final_prompt)})
if aud:
    raise SystemExit('提示词含 Audio 标签但未提供音频素材: %s' % aud)

spec = {
    "workflow": TEMPLATE,
    "negativePrompt": neg,
    "settings": {"fps": 24, "width": 1056, "height": 608, "megapixels": 0.6,
                 "steps": 8, "seed": 666, "cfg": 1},
    "outputDir": os.path.join(PROJ, r'workspace\production\ep03_v2\segment01\output'),
    "segments": [{
        "id": "redstring-ep03-s01-kongzuowei",
        "sequenceNo": 1,
        "title": "EP03 片段01 · 空座位",
        "durationSec": 15,
        "continuityFromPrev": False,
        "finalPrompt": final_prompt,
        "negativePrompt": neg,
        "soundscape": "Soft rainy classroom ambience, distant footsteps, paper movement, chair contact, and the two brief greetings in order. No narration, no crowd chatter, no extra speech.",
        "assets": assets,
    }],
}

out = os.path.join(PROJ, r'workspace\production\ep03_v2\segment01\spec-ep03-s01.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(spec, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('spec written:', out)
print('finalPrompt chars:', len(final_prompt), '| negativePrompt chars:', len(neg))
print('assets:', len(assets), '| Picture labels OK:', got)
