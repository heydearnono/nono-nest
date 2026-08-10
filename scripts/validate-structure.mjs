#!/usr/bin/env node
/**
 * 项目结构校验。
 *
 * 小程序的页面注册散落在 app.json 与文件系统两处，两边不一致时
 * 开发者工具只会在运行期报错，CI 里看不出来。这个脚本把这类问题前置到提交前。
 *
 * 校验项：
 *   1. app.json 里注册的每个页面，四个文件（js/json/wxml/wxss）是否齐全
 *   2. miniprogram/pages 下是否存在未注册的页面目录
 *   3. 入口文件是否存在
 *   4. project.config.json 的 appid 必须是 touristappid（防个人 appid 入库）
 *   5. .gitignore 必须忽略 project.private.config.json
 */
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'miniprogram');
const PAGE_EXTS = ['js', 'json', 'wxml', 'wxss'];

/** 入库的共享配置里只允许游客 appid，真实 appid 放 project.private.config.json */
const PUBLIC_APPID = 'touristappid';
const PRIVATE_CONFIG = 'project.private.config.json';

const errors = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 校验个人 appid 没有泄进入库文件。
 *
 * 用开发者工具打开项目后，工具会把当前 appid 回写进 project.config.json。
 * 这个仓库要推到公开远端，所以入库的那份必须保持游客 appid，
 * 真实 appid 只放进被 gitignore 的 project.private.config.json
 * （私有文件里的同名配置优先级更高，本地体验不受影响）。
 *
 * 这类回写靠记性防不住，所以做成门禁。
 */
async function checkAppid() {
  const configPath = join(ROOT, 'project.config.json');
  if (!(await exists(configPath))) {
    errors.push('缺少 project.config.json');
    return;
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    errors.push(`project.config.json 解析失败：${err.message}`);
    return;
  }

  if (config.appid === undefined) {
    errors.push(`project.config.json 缺少 appid 字段，应为 "${PUBLIC_APPID}"`);
  } else if (config.appid !== PUBLIC_APPID) {
    errors.push(
      `project.config.json 的 appid 是 ${JSON.stringify(config.appid)}，必须为 "${PUBLIC_APPID}"。` +
        `开发者工具可能回写了个人 appid —— 请把它移到 ${PRIVATE_CONFIG}（该文件不入库），` +
        `再把这里改回 "${PUBLIC_APPID}"`,
    );
  }

  // 私有配置一旦失去忽略保护，appid 就会从另一条路入库
  const gitignorePath = join(ROOT, '.gitignore');
  if (!(await exists(gitignorePath))) {
    errors.push('缺少 .gitignore');
    return;
  }
  const ignored = (await readFile(gitignorePath, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line === PRIVATE_CONFIG || line === `/${PRIVATE_CONFIG}`);
  if (!ignored) {
    errors.push(`.gitignore 必须忽略 ${PRIVATE_CONFIG}，否则个人 appid 会入库`);
  }
}

async function main() {
  // 放在最前：main 里有提前 report() 返回的分支，appid 校验不能被它们跳过
  await checkAppid();

  // 入口文件
  for (const entry of ['app.js', 'app.json', 'app.wxss', 'sitemap.json']) {
    if (!(await exists(join(SRC, entry)))) {
      errors.push(`缺少入口文件 miniprogram/${entry}`);
    }
  }

  const appJsonPath = join(SRC, 'app.json');
  if (!(await exists(appJsonPath))) {
    report();
    return;
  }

  let appJson;
  try {
    appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));
  } catch (err) {
    errors.push(`app.json 解析失败：${err.message}`);
    report();
    return;
  }

  const pages = appJson.pages ?? [];
  if (pages.length === 0) {
    errors.push('app.json 的 pages 为空，小程序至少需要一个页面');
  }

  // 注册页面的四个文件是否齐全
  for (const page of pages) {
    for (const ext of PAGE_EXTS) {
      const file = join(SRC, `${page}.${ext}`);
      if (!(await exists(file))) {
        errors.push(`页面 ${page} 缺少 ${ext} 文件`);
      }
    }
  }

  // 文件系统里是否有未注册的页面
  const registered = new Set(pages);
  const pagesDir = join(SRC, 'pages');
  if (await exists(pagesDir)) {
    const dirs = await readdir(pagesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const files = await readdir(join(pagesDir, dir.name));
      // 有 .js 的目录才算页面目录，纯资源目录跳过
      if (!files.some((f) => f.endsWith('.js'))) continue;

      const hasRegistered = [...registered].some((p) => p.startsWith(`pages/${dir.name}/`));
      if (!hasRegistered) {
        errors.push(`pages/${dir.name}/ 未在 app.json 的 pages 中注册`);
      }
    }
  }

  report();
}

function report() {
  if (errors.length > 0) {
    console.error('✗ 项目结构校验失败：');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('✓ 项目结构校验通过');
}

await main();
