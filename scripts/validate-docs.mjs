#!/usr/bin/env node
/**
 * 文档—代码一致性校验（AI 先行机制的门禁）。
 *
 * 本仓库要求业务规则先写进 docs/features/<name>/doc.md 的规格表，每条规则一个 Spec ID，
 * 测试用例标题以 [ID] 引用它。光靠纪律维持不住，所以在这里做成可失败的断言。
 *
 * 校验项（见 AGENTS.md 第 4 节）：
 *   1. 文档声明的每个 Spec ID 都有测试覆盖 —— 否则规格没落地
 *   2. 测试引用的每个 Spec ID 都能追到文档 —— 否则代码跑在文档前面
 *   3. 每个 miniprogram/utils/*.js 都被某份 doc.md 引用 —— 否则出现无主模块
 *   4. Spec ID 不跨文档重复声明
 *   5. 使用的区名（ID 前缀）已登记在 docs/glossary.md
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES_DIR = join(ROOT, 'docs', 'features');
const GLOSSARY = join(ROOT, 'docs', 'glossary.md');
const UTILS_DIR = join(ROOT, 'miniprogram', 'utils');
const TESTS_DIR = join(ROOT, 'tests');

// Spec ID 格式：大写区名 + 两位数字，如 FULLNESS-02

const errors = [];

/** 递归收集目录下匹配后缀的文件，目录不存在时返回空数组 */
async function collect(dir, suffix) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(full, suffix)));
    } else if (entry.name.endsWith(suffix)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * 从 doc.md 中提取声明的 Spec ID。
 *
 * 只认规格表里「以 ID 开头的表格行」（`| FULLNESS-02 | ... |`），
 * 正文里顺带提到的 ID 不算声明，这样才能区分「定义」和「引用」。
 */
function declaredIds(markdown) {
  const ids = new Set();
  for (const line of markdown.split('\n')) {
    const match = /^\s*\|\s*([A-Z]{2,}-\d{2})\s*\|/.exec(line);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/** 从测试文件中提取被引用的 Spec ID（测试标题里的 [ID] 前缀） */
function referencedIds(source) {
  const ids = new Set();
  for (const match of source.matchAll(/\[([A-Z]{2,}-\d{2})\]/g)) {
    ids.add(match[1]);
  }
  return ids;
}

async function main() {
  const docs = await collect(FEATURES_DIR, 'doc.md');

  // docs/features/ 为空是允许的（项目早期），但要提示，避免门禁形同虚设
  if (docs.length === 0) {
    console.log('⚠ docs/features/ 下还没有 doc.md，跳过规格校验');
  }

  // 1 & 4：收集文档声明的 ID，同时查重
  const idToDoc = new Map();
  const docTexts = new Map();
  for (const doc of docs) {
    const text = await readFile(doc, 'utf8');
    const rel = relative(ROOT, doc);
    docTexts.set(rel, text);

    for (const id of declaredIds(text)) {
      if (idToDoc.has(id)) {
        errors.push(`Spec ID ${id} 在 ${idToDoc.get(id)} 与 ${rel} 中重复声明`);
        continue;
      }
      idToDoc.set(id, rel);
    }
  }

  // 收集测试引用的 ID
  const testFiles = await collect(TESTS_DIR, '.js');
  const idToTests = new Map();
  for (const file of testFiles) {
    const rel = relative(ROOT, file);
    for (const id of referencedIds(await readFile(file, 'utf8'))) {
      if (!idToTests.has(id)) idToTests.set(id, []);
      idToTests.get(id).push(rel);
    }
  }

  // 1：声明了但没测试
  for (const [id, doc] of idToDoc) {
    if (!idToTests.has(id)) {
      errors.push(`Spec ${id}（声明于 ${doc}）没有对应测试，规格尚未落地`);
    }
  }

  // 2：测试引用了但文档没声明
  for (const [id, files] of idToTests) {
    if (!idToDoc.has(id)) {
      errors.push(`测试 ${files.join(', ')} 引用了未声明的 Spec ${id}，请先补文档`);
    }
  }

  // 3：utils 模块必须有主
  const utils = await collect(UTILS_DIR, '.js');
  const allDocText = [...docTexts.values()].join('\n');
  for (const util of utils) {
    const rel = relative(ROOT, util);
    if (!allDocText.includes(rel)) {
      errors.push(`${rel} 没有被任何 doc.md 引用，无主模块`);
    }
  }

  // 5：区名必须登记在 glossary
  let glossary = '';
  try {
    glossary = await readFile(GLOSSARY, 'utf8');
  } catch {
    errors.push('缺少 docs/glossary.md');
  }
  if (glossary) {
    const registered = new Set();
    for (const line of glossary.split('\n')) {
      const match = /^\s*\|\s*`([A-Z]{2,})`\s*\|/.exec(line);
      if (match) registered.add(match[1]);
    }
    for (const [id, doc] of idToDoc) {
      const area = id.split('-')[0];
      if (!registered.has(area)) {
        errors.push(`区名 ${area}（用于 ${id}，见 ${doc}）未登记在 docs/glossary.md`);
      }
    }
  }

  report(idToDoc.size, docs.length);
}

function report(specCount, docCount) {
  if (errors.length > 0) {
    console.error('✗ 文档一致性校验失败：');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ 文档一致性校验通过（${docCount} 份 doc.md，${specCount} 条规格）`);
}

await main();
