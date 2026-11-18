#!/usr/bin/env node
/**
 * validate-plugins.mjs — 零依赖的插件市场结构校验器
 *
 * 校验范围（本地文件，不联网、不需要任何密钥）：
 *   1. .claude-plugin/marketplace.json 的 JSON 结构与必填字段
 *   2. 条目 name 唯一性与命名规范
 *   3. source 为本地路径的条目：目录存在、.claude-plugin/plugin.json 合法且 name 一致
 *   4. source 为外部仓库的条目：必须带 40 位 sha 锁定（可复现安装）
 *   5. 每个插件的 skills/<name>/SKILL.md frontmatter 是否含 name / description
 *   6. commands/*.md frontmatter 是否含 description
 *   7. .mcp.json / plugin.json 内嵌 mcpServers 的 JSON 合法性与 http 型 url 存在性
 *   8. 误提交的密钥特征串（sk-ant- / ghp_ / AKIA...）
 *
 * 用法：
 *   node .github/scripts/validate-plugins.mjs           # 在仓库根目录执行
 *   node .github/scripts/validate-plugins.mjs --strict  # 警告也视为失败
 *
 * 退出码：0 = 通过；1 = 有错误（或 --strict 下有警告）。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv.includes('--root')
  ? path.resolve(process.argv[process.argv.indexOf('--root') + 1])
  : process.cwd();
const STRICT = process.argv.includes('--strict');

const errors = [];
const warnings = [];
const notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
/** 提示级：上游本就如此，不计入失败，只做汇总，避免刷屏。 */
const note = (m) => notes.push(m);

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

/** 极简 frontmatter 提取：只取 --- 之间的 key: value 顶层字段。 */
function frontmatter(file) {
  const text = read(file).replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const body = text.slice(3, end);
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- 1. 市场清单
const MP = path.join(ROOT, '.claude-plugin', 'marketplace.json');
if (!exists(MP)) {
  err('.claude-plugin/marketplace.json 不存在 —— 这不是一个可安装的插件市场仓库。');
  report();
}

let marketplace;
try {
  marketplace = JSON.parse(read(MP));
} catch (e) {
  err(`.claude-plugin/marketplace.json 不是合法 JSON：${e.message}`);
  report();
}

if (typeof marketplace.name !== 'string' || !marketplace.name.trim()) {
  err('marketplace.json 缺少顶层 name 字段。');
}
if (!marketplace.owner || typeof marketplace.owner.name !== 'string') {
  err('marketplace.json 缺少 owner.name 字段。');
}
if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
  err('marketplace.json 的 plugins 必须是非空数组。');
  report();
}

const entries = marketplace.plugins;
const stats = { total: entries.length, local: 0, external: 0, skills: 0, commands: 0, mcpServers: 0 };
const seen = new Map();

for (const [i, entry] of entries.entries()) {
  const where = `plugins[${i}]${entry && entry.name ? ` (${entry.name})` : ''}`;

  if (!entry || typeof entry !== 'object') {
    err(`${where}: 条目必须是对象。`);
    continue;
  }
  if (typeof entry.name !== 'string' || !entry.name) {
    err(`${where}: 缺少 name。`);
  } else {
    if (seen.has(entry.name)) {
      err(`${where}: name 重复（另一处位于 plugins[${seen.get(entry.name)}]）。`);
    } else {
      seen.set(entry.name, i);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      err(`${where}: name 只能包含小写字母、数字和连字符。`);
    }
  }
  if (typeof entry.description !== 'string' || entry.description.trim().length < 10) {
    warn(`${where}: description 缺失或过短（建议 1-2 句说明替用户做什么）。`);
  }

  const src = entry.source;
  if (typeof src === 'string') {
    // ---- 仓库内自带的插件
    stats.local++;
    if (!src.startsWith('./')) {
      err(`${where}: 本地 source 必须以 ./ 开头，当前为 "${src}"。`);
      continue;
    }
    const dir = path.join(ROOT, src.slice(2));
    if (!exists(dir) || !fs.statSync(dir).isDirectory()) {
      err(`${where}: source 指向的目录不存在：${src}`);
      continue;
    }
    validatePlugin(dir, entry.name, where);
  } else if (src && typeof src === 'object') {
    // ---- 外部仓库引用
    stats.external++;
    if (!['url', 'git-subdir', 'github'].includes(src.source)) {
      err(`${where}: source.source 只支持 url / git-subdir / github，当前为 "${src.source}"。`);
    }
    if (typeof src.url !== 'string' || !/^https?:\/\//.test(src.url)) {
      err(`${where}: 外部条目缺少合法的 source.url。`);
    }
    if (typeof src.sha !== 'string' || !/^[0-9a-f]{40}$/.test(src.sha)) {
      err(`${where}: 外部条目必须用 40 位 commit sha 锁定（当前：${JSON.stringify(src.sha ?? null)}）。未锁定的引用无法复现安装。`);
    }
    if (src.source === 'git-subdir' && typeof src.path !== 'string') {
      err(`${where}: git-subdir 条目必须有 source.path。`);
    }
  } else {
    err(`${where}: source 必须是 "./目录" 字符串或 {source,url,sha} 对象。`);
  }
}

// ------------------------------------------------------- 2. 插件内部结构校验
function validatePlugin(dir, expectedName, where) {
  const rel = path.relative(ROOT, dir).replace(/\\/g, '/');
  const manifestPath = path.join(dir, '.claude-plugin', 'plugin.json');

  if (!exists(manifestPath)) {
    err(`${where}: 缺少 ${rel}/.claude-plugin/plugin.json。`);
  } else {
    let manifest;
    try {
      manifest = JSON.parse(read(manifestPath));
    } catch (e) {
      err(`${where}: ${rel}/.claude-plugin/plugin.json 不是合法 JSON：${e.message}`);
    }
    if (manifest) {
      if (manifest.name !== expectedName) {
        err(`${where}: plugin.json 的 name("${manifest.name}") 与市场条目 name("${expectedName}") 不一致。`);
      }
      if (!manifest.version) warn(`${where}: plugin.json 缺少 version（升级无法被识别）。`);
      else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) warn(`${where}: version "${manifest.version}" 不是 semver。`);
      if (!manifest.description) warn(`${where}: plugin.json 缺少 description。`);
      if (manifest.mcpServers && typeof manifest.mcpServers === 'object') {
        stats.mcpServers += countHttpServers(manifest.mcpServers, `${rel}/.claude-plugin/plugin.json`, where);
      }
    }
  }

  // skills
  const skillsDir = path.join(dir, 'skills');
  if (exists(skillsDir)) {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    if (dirs.length === 0) warn(`${where}: skills/ 为空目录。`);
    for (const d of dirs) {
      const skillMd = path.join(skillsDir, d.name, 'SKILL.md');
      if (!exists(skillMd)) {
        err(`${where}: skills/${d.name}/SKILL.md 不存在。`);
        continue;
      }
      stats.skills++;
      const fm = frontmatter(skillMd);
      if (!fm) err(`${where}: skills/${d.name}/SKILL.md 缺少 YAML frontmatter。`);
      else {
        if (!fm.name) err(`${where}: skills/${d.name}/SKILL.md frontmatter 缺少 name。`);
        else if (fm.name !== d.name) note(`${rel}/skills/${d.name}: skill name "${fm.name}" 与目录名不同（上游命名习惯，不影响安装）。`);
        if (!fm.description) err(`${where}: skills/${d.name}/SKILL.md frontmatter 缺少 description（决定技能何时被触发）。`);
      }
    }
  }

  // commands
  const cmdDir = path.join(dir, 'commands');
  if (exists(cmdDir)) {
    const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md'));
    stats.commands += files.length;
    for (const f of files) {
      const fm = frontmatter(path.join(cmdDir, f));
      if (!fm) warn(`${where}: commands/${f} 缺少 frontmatter。`);
      else if (!fm.description) warn(`${where}: commands/${f} 缺少 description。`);
    }
  }

  // .mcp.json
  const mcpJson = path.join(dir, '.mcp.json');
  if (exists(mcpJson)) {
    let cfg;
    try {
      cfg = JSON.parse(read(mcpJson));
    } catch (e) {
      err(`${where}: ${rel}/.mcp.json 不是合法 JSON：${e.message}`);
    }
    if (cfg) {
      const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : cfg;
      stats.mcpServers += countHttpServers(servers, `${rel}/.mcp.json`, where);
    }
  }
}

function countHttpServers(servers, file, where) {
  let n = 0;
  for (const [name, def] of Object.entries(servers)) {
    if (!def || typeof def !== 'object') continue;
    if (def.type === 'http' || def.type === 'sse') {
      n++;
      if (typeof def.url !== 'string' || !def.url) {
        stats.placeholders = (stats.placeholders || 0) + 1;
        note(`${file}: 服务器 "${name}" 的 url 为空占位（接入时由用户或 .mcp.json 填写）。`);
      }
    }
  }
  return n;
}

// ------------------------------------------------------------ 3. 密钥特征扫描
const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{16,}/, 'Anthropic API key'],
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub PAT'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, '私钥'],
];
for (const file of walk(ROOT)) {
  if (!/\.(md|json|ya?ml|py|sh|js|mjs|ts|txt)$/i.test(file)) continue;
  const text = read(file);
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) err(`疑似 ${label} 被提交：${path.relative(ROOT, file).replace(/\\/g, '/')}`);
  }
}

report();

function report() {
  const line = (s) => process.stdout.write(s + '\n');
  line('');
  line('知识工作插件市场 — 结构校验');
  line('─'.repeat(60));
  line(`  市场清单：.claude-plugin/marketplace.json`);
  line(`  条目总数：${stats.total ?? 0}（仓库内 ${stats.local ?? 0} / 外部引用 ${stats.external ?? 0}）`);
  line(`  技能数：${stats.skills ?? 0}　命令数：${stats.commands ?? 0}　MCP 服务器（http/sse）：${stats.mcpServers ?? 0}`);
  if (stats.placeholders) line(`  其中 url 待配置占位：${stats.placeholders}`);
  line('');

  if (warnings.length) {
    line(`⚠ 警告 ${warnings.length} 条（不阻塞部署，但建议处理）`);
    for (const w of warnings.slice(0, 25)) line(`   - ${w}`);
    if (warnings.length > 25) line(`   … 其余 ${warnings.length - 25} 条同类警告已省略`);
    line('');
  }
  if (notes.length) {
    line(`· 提示 ${notes.length} 条（上游原有状态，不影响安装）`);
    line('');
  }
  if (errors.length) {
    line(`✖ 错误 ${errors.length} 条`);
    for (const e of errors) line(`   - ${e}`);
    line('');
    line('校验未通过。');
    process.exit(1);
  }
  line('✔ 校验通过。');
  if (STRICT && warnings.length) {
    line('（--strict：存在警告，判定为失败）');
    process.exit(1);
  }
  process.exit(0);
}
