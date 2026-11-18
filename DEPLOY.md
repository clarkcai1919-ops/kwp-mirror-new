# 部署说明：knowledge-work-plugins（GitHub）

> 上游仓库：<https://github.com/anthropics/knowledge-work-plugins>（Apache-2.0，main 分支）
> 本目录是一个**已完成配置、可直接 push 的部署副本**，不是代码构建产物。

---

## 0. 部署状态：已上线（2026-11-18 22:00）

| 项 | 实际值 |
|---|---|
| 目标仓库 | <https://github.com/clarkcai1919-ops/kwp-mirror-new>（public，默认分支 main） |
| 首个 commit | `ef7bf2d` — 1287 个文件，本地 HEAD 与远程 HEAD 一致 |
| 认证方式 | SSH ed25519（`~/.ssh/id_ed25519`，无 passphrase），公钥已挂到 GitHub 账号 |
| CI 结果 | `Validate Plugins` 在 push 后 30 秒内跑完 → **success** |
| 清单可读 | `raw.githubusercontent.com/.../marketplace.json` → HTTP 200，68192 B，123 条插件 |

第 5 节三项必补项的完成情况：

- [x] **建仓权限** — `clarkcai1919-ops/kwp-mirror-new`，空仓库创建（未勾 README，因此无需 `pull --rebase`）
- [x] **push 权限** — SSH 认证通过：`Hi clarkcai1919-ops! You've successfully authenticated`
- [x] **账号/仓库名确认** — owner=`clarkcai1919-ops`，repo=`kwp-mirror-new`，可见性 Public

尚未做（不阻塞上线）：

- `claude` CLI 本机未安装，客户端侧 `plugin marketplace add` 未实测；可用 npm 安装后补验
- `marketplace.json` 的 `name` 仍为 `knowledge-work-plugins`（与上游同名），是否改成本地标识（如 `kwp-mirror`）待定

---

## 1. 先明确一件事：这个仓库不是"网站/服务"

它没有 `package.json`、没有 Dockerfile、没有构建步骤。整个仓库是 **123 条插件市场清单 + 1173 个 Markdown 技能文件**，运行时由 Claude Code / Cowork 客户端读取。

所以"部署到 GitHub"的准确含义是：

| 层面 | 内容 | 是否必须部署 |
|---|---|---|
| **市场清单** | `.claude-plugin/marketplace.json`（123 条：22 条仓库自带、101 条外部仓库引用） | 必须。这是唯一的部署入口 |
| **插件内容** | 22 个本地插件目录（`sales/`、`finance/`、`data/`… 共 225 个 skill、15 个 slash command、185 个 MCP server 声明） | 必须。跟着仓库一起发布 |
| **CI 校验** | GitHub Actions | 建议。防止改坏清单后别人装不上 |
| **网站 / Pages** | 无 | 不需要。没有前端产物 |
| **服务端 / 数据库** | 无 | 不需要 |

**结论**：部署 = 把仓库放到一个有推送权限的 GitHub 仓库里，并保证 `.claude-plugin/marketplace.json` 在默认分支可读 + 结构合法。

---

## 2. 部署入口 / 依赖 / 环境

### 部署入口
1. **安装侧入口**：仓库根目录的 `.claude-plugin/marketplace.json`（客户端 `claude plugin marketplace add <owner>/<repo>` 读的就是它）
2. **校验侧入口**：`.github/workflows/validate-plugins.yml` → 调用 `.github/scripts/validate-plugins.mjs`
3. **客户端安装命令**（部署成功后别人这样用）：
   ```bash
   claude plugin marketplace add <你的账号>/knowledge-work-plugins
   claude plugin install sales@knowledge-work-plugins
   ```

### 依赖项
| 依赖 | 版本 | 用途 | 必需性 |
|---|---|---|---|
| Node.js | ≥ 18（CI 用 20） | 跑 `validate-plugins.mjs`（零第三方依赖） | 校验时需要，安装插件时不需要 |
| Claude Code CLI | 最新 | `claude plugin marketplace add` / `claude plugin validate` | 验证安装时需要 |
| `bio-research/skills/instrument-data-to-allotrope/requirements.txt` | — | 仅该 skill 的 Python 脚本用（allotrope 转换） | 可选，只用 bio-research 时才装 |
| GitHub Actions Runner | `ubuntu-latest` | 跑校验 workflow | 默认免费额度内 |
| Secret / 环境变量 | **无** | 本仓库 CI 不读任何密钥 | — |

> 上游另有 4 个 workflow（`scan-plugins` / `bump-plugin-shas` / `revert-failed-bumps` / `close-external-prs`）依赖 Anthropic 内部的 WIF 联邦身份和私有 composite action，在本仓库中已被加 `if: github.repository == 'anthropics/...'` 守卫，**在你的仓库里只会显示 skipped，不会变红**。`check-mcp-urls.yml` 是纯 `curl + jq`，保留可用（会每天探测 MCP 端点存活）。

---

## 3. 三种部署路径，选一个

### 路径 A：Fork 上游（推荐，能持续同步上游更新）

> 注意：当前环境的 GitHub 连接器是只读授权（`POST /repos/{owner}/{repo}/forks` 返回 403 Resource not accessible by integration），**Fork 必须由你在网页或用 `gh` 完成**，我无法代做。

```bash
# 1) 浏览器打开 https://github.com/anthropics/knowledge-work-plugins → 右上角 Fork → 选 clarkcai1919-ops
# 2) 把本目录（含 CI 改动）推上去，覆盖 fork 的 main
cd E:\AI2026\workbuddy\deploy\knowledge-work-plugins
git remote add origin https://github.com/clarkcai1919-ops/knowledge-work-plugins.git
git push -u origin main --force
```

### 路径 B：新建空仓库（不想保留 fork 关系时）

```bash
# 1) 浏览器 https://github.com/new → 名称 knowledge-work-plugins → Public → 不要勾 README/LICENSE
cd E:\AI2026\workbuddy\deploy\knowledge-work-plugins
git remote add origin https://github.com/clarkcai1919-ops/knowledge-work-plugins.git
git push -u origin main
```

### 路径 C：不部署，直接用上游（只想用、不想维护）

```bash
claude plugin marketplace add anthropics/knowledge-work-plugins
claude plugin install productivity@knowledge-work-plugins
```

---

## 4. 部署后怎么验证（按顺序做，4 分钟）

| # | 验证项 | 命令 / 操作 | 通过标准 |
|---|---|---|---|
| 1 | 清单可匿名读取 | `curl -s -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/<owner>/knowledge-work-plugins/main/.claude-plugin/marketplace.json` | `200`（私有仓库会是 404） |
| 2 | 清单结构合法 | `node .github/scripts/validate-plugins.mjs` | 输出 `✔ 校验通过。`，退出码 0 |
| 3 | CI 真的在跑 | 仓库页 → Actions → **Validate Plugins** | 最新 run 是绿色 ✅（若显示 no runs，检查默认分支名是否 `main`、Actions 是否被 Disabled） |
| 4 | 客户端能装 | `claude plugin marketplace add <owner>/knowledge-work-plugins` 然后 `claude plugin marketplace list`、`claude plugin install sales@knowledge-work-plugins` | marketplaces 列表里出现 `knowledge-work-plugins`；安装后 `/sales:call-prep` 等命令可见 |
| 5 | 插件真的生效 | 新开一个 Claude Code 会话，输入 `/sales:account-research` | 命令能被补全并执行 |

**一次性验证脚本**（把 owner 换成你的账号）：

```bash
OWNER=clarkcai1919-ops
curl -s -o /dev/null -w "raw marketplace.json -> %{http_code}\n" \
  "https://raw.githubusercontent.com/$OWNER/knowledge-work-plugins/main/.claude-plugin/marketplace.json"
claude plugin marketplace add "$OWNER/knowledge-work-plugins" && claude plugin marketplace list
```

**本地已验证结果**（我在本机跑过的）：

```
知识工作插件市场 — 结构校验
────────────────────────────────────────────────────────────
  条目总数：123（仓库内 22 / 外部引用 101）
  技能数：225　命令数：15　MCP 服务器（http/sse）：185
  其中 url 待配置占位：30
· 提示 44 条（上游原有状态，不影响安装）
✔ 校验通过。
```

另外做了**负向自测**（故意造错），校验器能正确拦下：name 重复、source 目录不存在、外部条目未锁 sha、plugin.json name 与条目不一致、SKILL.md 缺 frontmatter、误提交 `sk-ant-` 密钥 —— 6 类错误全部命中，退出码 1。

---

## 5. 还需要你补的权限 / 信息

> **手把手步骤见 [`SETUP-STEPS.md`](./SETUP-STEPS.md)**：三项必补项的逐条点击路径、完整命令、验收标准和报错对照表。本节只列清单。

### 必须补（否则推不上去）
| 缺什么 | 具体表现 | 怎么补 |
|---|---|---|
| **创建 / Fork 仓库的权限** | 连接器调 `POST /repos/anthropics/knowledge-work-plugins/forks` 和 `POST /user/repos` 均返回 `403 Resource not accessible by integration` | 在 GitHub App 授权页给连接器加 `Administration: write` + `Contents: write`；或按路径 A/B 用网页手动建仓 |
| **对目标仓库的 push 权限（contents: write）** | 当前 git 无 credential，本机也没有 `gh` CLI | 建仓后用 HTTPS + PAT（`repo` 或 fine-grained `Contents: Read and write`）或 SSH key push；或 `winget install GitHub.cli && gh auth login` |
| **目标账号 / 仓库名确认** | 当前连接器身份是 `clarkcai1919-ops`（0 个公开仓库） | 告诉我最终用 `clarkcai1919-ops/knowledge-work-plugins` 还是别的组织/名字 |

### 按需补（不影响首次部署）
| 项 | 何时需要 |
|---|---|
| Anthropic API Key / WIF 联邦身份 | 仅当你想恢复上游的 AI 策略扫描（`scan-plugins`）。个人仓库没有这套联邦规则，跑不了 |
| `workflow` scope 的 PAT | 若用 `gh` 推送包含 `.github/workflows/` 的提交，classic PAT 必须带 `workflow` scope，否则报 `refusing to allow a Personal Access Token to create or update workflow` |
| 私有仓库 + 访问令牌 | 若仓库设为 Private，安装方必须先 `gh auth login`，`claude plugin marketplace add` 才能读到清单 |
| 仓库命名区分 | 若想和上游同时装，建议改名（如 `kwp-mirror`），否则两个 `knowledge-work-plugins` 市场同名容易混 |
| MCP 端点的真实 URL | 30 个 `http/sse` 服务器 url 为空占位（gmail、google calendar、snowflake 等），接哪家就填哪家 |

---

## 6. 本次改了什么（相对上游）

```
新增  .github/scripts/validate-plugins.mjs     零依赖校验器（8 类检查，可本地跑）
新增  .github/workflows/validate-plugins.yml   fork 可用的 CI 闸门（无需任何 Secret）
新增  DEPLOY.md                                本文件
修改  .github/workflows/scan-plugins.yml        + if: 仅上游仓库执行
修改  .github/workflows/bump-plugin-shas.yml    + if: 仅上游仓库执行
修改  .github/workflows/revert-failed-bumps.yml + if: 仅上游仓库执行
修改  .github/workflows/close-external-prs.yml  + if: 仅上游仓库执行
保留  .github/workflows/check-mcp-urls.yml     纯 curl+jq，镜像里照常可用
```

插件内容（22 个插件目录、225 个 skill）**一行未改**。

---

## 7. 日常维护（推上去之后）

```bash
# 上游更新了，拉回来（路径 A 的 fork 才有 upstream）
git remote add upstream https://github.com/anthropics/knowledge-work-plugins.git
git fetch upstream && git merge upstream/main

# 合并前先本地校验，避免 CI 红
node .github/scripts/validate-plugins.mjs
```
