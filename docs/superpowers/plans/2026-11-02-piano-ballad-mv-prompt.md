# Plan: piano-ballad 模板 + 模板注册表（2026-11-02）
1. [x] 写失败测试 `scripts/test-piano-ballad-mv-prompt.mjs`（RED：导出缺失）
2. [x] `buildPianoBalladMvPrompt` + 版本常量（GREEN）
3. [x] `MV_PROMPT_TEMPLATES` / `listMvPromptTemplates` / `buildMvPromptForTemplate`
4. [x] CLI `mv-cut --template` 走注册表；新增 `mv-templates`
5. [x] `.d.ts`、`npm test` 接入、标准文档、迭代笔记
