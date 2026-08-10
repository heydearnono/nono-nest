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
 */
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'miniprogram');
const PAGE_EXTS = ['js', 'json', 'wxml', 'wxss'];

const errors = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
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
