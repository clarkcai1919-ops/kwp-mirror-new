# SETUP-STEPS — 三项必补项的设置步骤

> 配套 [`DEPLOY.md`](./DEPLOY.md) 第 5 节。DEPLOY.md 说"补什么"，本文件说"怎么点、每条命令是什么、报错怎么判"。
> 读完照着做，全程约 15 分钟。每一步都有**验收标准**，没达到就别往下走。

## 本机实测基线（2026-11-18，命令已跑过）

| 项 | 实测值 | 对步骤的影响 |
|---|---|---|
| git | 2.55.0.windows.3（PortableGit） | 支持 `--initial-branch`、GCM |
| credential.helper | `manager`（system 级，来自 PortableGit 的 gitconfig） | **方案 1 零配置可 push** |
| SSH 公钥 | 无 | 走方案 2 需先生成 |
| gh CLI | 无（winget 1.29 可用） | 不需要 gh，本文件全用原生 git |
| node / npm | v22.22.2 / 10.9.7 | 可本地跑校验器 |
| claude CLI | **未安装** | 验收第 4 步需先装或跳过（见 §4） |
| 本地仓库 | `E:\AI2026\workbuddy\deploy\knowledge-work-plugins`，`main`，1287 文件，孤儿提交 | 决定了方案 A/B 的 push 方式不同 |

---

## 第 0 步（30 秒）：确认你的 GitHub 账号

浏览器打开 → https://github.com/settings/profile

- 页面上方 **Public profile** 区的 **Username** 就是你的账号名。记下来。
- 下面所有 `<OWNER>` 都替换成它。
- 顺带确认：https://github.com/settings/organizations 看你属于哪些组织（决定第 3 项选个人还是组织）。

> ⚠️ 当前 GitHub 连接器的授权身份是 `clarkcai1919-ops`。**以你浏览器登录的号为准**——如果不是同一个号，push 会报 404 / 403。

**验收**：能在纸上写出一行 `OWNER=xxxx`。

---

## 第 1 项：创建仓库的权限（三选一）

> 背景：连接器调 `POST /user/repos` 和 `POST /repos/anthropics/knowledge-work-plugins/forks` 都是 `403 Resource not accessible by integration`，因为授权里没有 `Administration: write`。所以这一步必须你在网页做。
> 想让连接器代做：去 https://github.com/settings/installations → 找到该 App → Configure → 把 **Administration** 与 **Contents** 都改成 **Read and write** → Save。改完我可以接管后续。

### 方案 A —— 新建空仓库（推荐：最快，push 不用 --force）

1. 打开 https://github.com/new
2. **Owner**：`<OWNER>`
3. **Repository name**：`kwp-mirror`
4. **Description**（可选）：`Deployment mirror of anthropics/knowledge-work-plugins`
5. **可见性**：Public（理由见第 3 项决定 3）
6. **下面三个复选框，一个都不要勾**：
   - ☐ Add a README file
   - ☐ Add .gitignore
   - ☐ Choose a license
   > 勾了任何一个，远程会多一个初始 commit，你的 push 会被 `! [rejected] main -> main (fetch first)` 顶回来。
7. 点 **Create repository**
8. 复制页面 "Quick setup" 里的 HTTPS 地址：`https://github.com/<OWNER>/kwp-mirror.git`

**验收**：仓库页显示 "Quick setup — if you've done this kind of thing before"，文件列表为空（没有 README）。

### 方案 B —— Fork 上游（想保留上游历史、以后能同步上游更新）

1. 打开 https://github.com/anthropics/knowledge-work-plugins/fork
2. **Owner** 选 `<OWNER>`，**Repository name** 填 `kwp-mirror`
3. 点 **Create fork**（几秒）
4. **关键一步，别漏**：打开 `https://github.com/<OWNER>/kwp-mirror/actions`
   - 如果顶部有绿色按钮 **"I understand my workflows, go ahead and enable them"**，**必须点**
   - fork 仓库的 Actions 默认是禁用状态，不点的话 `Validate Plugins` 永远不跑，你会误以为部署失败
5. 把本地的孤儿提交接到上游历史上（**只做一次，全程不要用 `--hard`**）：

```bash
cd "E:/AI2026/workbuddy/deploy/knowledge-work-plugins"
git remote add origin https://github.com/<OWNER>/kwp-mirror.git
git remote add upstream https://github.com/anthropics/knowledge-work-plugins.git
git fetch upstream main
git reset --soft upstream/main
git status --short | wc -l          # 期望 8：4 个新增 + 4 个 workflow 修改
git commit -m "chore: fork-friendly deployment validation"
git log --oneline -2                # 第二行应是上游最新提交（不是孤儿历史）
```

原理：`--soft` 只把 HEAD 挪到 `upstream/main`，不动工作树和暂存区。结果是一个 parent 为上游 main 的**增量提交**，push 是正常 fast-forward，不需要 `--force`。

**验收**：`git log --oneline | wc -l` 大于 100（有上游历史）；`git status` 干净。

### 方案 C —— 网页拖拽上传（别用）

1286 个文件里包含 `.github/`、`.claude-plugin/` 两个**点开头**的目录，Windows 资源管理器默认不显示、网页上传也常漏掉。丢了这个，CI 和部署入口一起没了。**不要走这条路。**

---

## 第 2 项：push 权限（三选一，按省事排序）

> ⚠️ **所有命令请在你自己的终端里跑**：Windows Terminal → 新建 Git Bash 标签（或 PowerShell）。
> WorkBuddy 的沙箱 shell 是非交互的，GCM 弹窗弹不出来，`git push` 会一直挂着。

### 方案 1 —— GCM 浏览器登录（本机零配置，最推荐）

你的本机 `credential.helper=manager` 已经就绪（PortableGit 的 system config 带下来的），不需要造 token：

```bash
cd "E:/AI2026/workbuddy/deploy/knowledge-work-plugins"
git remote add origin https://github.com/<OWNER>/kwp-mirror.git
git push -u origin main
```

首次 push 会弹出 **Git Credential Manager** 窗口：

1. 选 **"Sign in with your browser"**
2. 浏览器跳到 GitHub 授权页 → 点 **Authorize git-credential-manager**
3. 回到终端，push 自动继续

**期望输出**：

```
* [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

**验收**：`git remote -v` 有 origin；`git status` 显示 `Your branch is up to date with 'origin/main'`。

### 方案 2 —— SSH key（一劳永逸，无过期，长期维护建议这条）

```bash
ssh-keygen -t ed25519 -C "clarkcai1919-ops-kwp" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

→ 复制输出的**一整行**（`ssh-ed25519 AAAA...... clarkcai1919-ops-kwp`）
→ 浏览器打开 https://github.com/settings/ssh/new

| 字段 | 填什么 |
|---|---|
| Title | `workbuddy-nanjing`（随便，能认出是这台机器） |
| Key type | `Authentication Key` |
| Key | 粘贴整行 |

→ 点 **Add SSH key**
→ 验证：

```bash
ssh -T git@github.com
# 首次会问 Are you sure you want to continue connecting? 输 yes
# 期望：Hi <OWNER>! You've successfully authenticated, but GitHub does not provide shell access.
```

→ 切 remote 并推：

```bash
cd "E:/AI2026/workbuddy/deploy/knowledge-work-plugins"
git remote set-url origin git@github.com:<OWNER>/kwp-mirror.git
git push -u origin main
```

**这条路径最大的好处：SSH 走账号身份，天然具备 workflow 写权限，不会踩下面那个 PAT 坑。**

### 方案 3 —— PAT（要接 CI / 写脚本时用）

生成（二选一）：

**Classic**（简单，推荐首次用）
1. https://github.com/settings/tokens
2. **Generate new token (classic)**
3. Note：`kwp-deploy`；Expiration：`90 days`
4. 勾选 **`repo`** + **`workflow`** ← 两个都必须
5. Generate → 复制 `ghp_...`（**只显示一次**）

**Fine-grained**（更小权限面）
1. https://github.com/settings/personal-access-tokens/new
2. Repository access：`Only select repositories` → 选 `kwp-mirror`
3. Repository permissions：
   - **Contents** → `Read and write`
   - **Workflows** → `Read and write` ← 必须，否则推不了 `.github/workflows/`
   - Metadata 会自动变 `Read-only`
4. Generate → 复制 `github_pat_...`

用法：

```bash
cd "E:/AI2026/workbuddy/deploy/knowledge-work-plugins"
git remote set-url origin https://github.com/<OWNER>/kwp-mirror.git
git push -u origin main
# Username: <OWNER>
# Password: 粘贴 token（输入时不显示字符，正常）
```

> **为什么必须有 workflow 权限**：本次提交包含 `.github/workflows/validate-plugins.yml` 等 6 个 workflow 文件。GitHub 硬规则：不带 workflow 权限的 PAT 不允许创建/更新 workflow 文件，报错原文：
> ```
> refusing to allow a Personal Access Token to create or update workflow
> `.github/workflows/validate-plugins.yml` without `workflow` scope
> ```
> 这就是我把 SSH 排在前面的原因——它没有这个坑。
> ⚠️ 不要把 token 拼进 remote URL 后提交，也不要写进 DEPLOY.md，会进 git 历史。

---

## 第 3 项：目标账号 / 仓库名 / 可见性（3 个决定 + 2 处联动）

### 决定 1：owner 用个人还是组织

| 选项 | 前提 | 影响 |
|---|---|---|
| 个人账号 `<OWNER>` | 无 | 最省事；换号/交接时要迁仓库 |
| 组织（如 `estun-service`） | 你在该组织是 Owner，或被允许建仓 | 团队共同维护；组织的 Actions 策略/公开范围可能受限，需 Owner 放行 |

**建议**：先个人跑通，团队要用再 Transfer 到组织（GitHub 支持仓库转移，历史不丢）。

### 决定 2：仓库名，以及市场标识要不要改

`marketplace.json` 顶部现状：

```json
"name": "knowledge-work-plugins",
"owner": { "name": "Anthropic" }
```

`name` 就是 `claude plugin marketplace add` 之后客户端认的**市场标识**。和上游同名会撞车（谁后加谁覆盖，`sales@knowledge-work-plugins` 指向不明）。

| 选择 | 要不要改代码 | 安装命令 |
|---|---|---|
| **保持原样**（纯镜像） | 不改 | `claude plugin install sales@knowledge-work-plugins`（和官方同名） |
| **改成本地标识**（推荐） | 改 `name` → `"kwp-mirror"`，`owner.name` → `"<OWNER>"` | `claude plugin install sales@kwp-mirror` |

选"改"的话由我动手：改 2 行 → 跑一遍 `node .github/scripts/validate-plugins.mjs` 确认仍通过 → 提交。

### 决定 3：Public 还是 Private

| | **Public**（建议） | Private |
|---|---|---|
| 别人安装 | `claude plugin marketplace add <OWNER>/<repo>` 直接可读 | 必须先 `gh auth login` 或配 token，否则读不到清单 |
| Actions 额度 | 公开仓库不限 | 计入你的月度分钟数（本 CI 每次 <1 分钟，可忽略） |
| 内容暴露 | 22 个插件、225 个 skill 全公开 | 仅你可见 |
| 保密收益 | 内容本来就是上游 Apache-2.0 公开内容，**没有保密收益** | 反而给每个安装方加一道登录门槛 |

**建议 Public**。

### 联动 1：仓库名进了 remote
仓库名一旦定下，`git remote` 必须跟着改：
```bash
git remote set-url origin https://github.com/<OWNER>/<REPO>.git
git remote -v      # 核对两行都对
```

### 联动 2：marketplace 的 name 进了安装命令
改了 `marketplace.json` 的 `name`，所有安装命令里的 `@后面的部分`都要换。DEPLOY.md 第 4 节的示例命令我会同步更新。

---

## §4 三项做完后的验收（4 条，逐条对照）

把 `OWNER` / `REPO` 换成实际值后**整段粘贴**执行（Git Bash 可跑）：

```bash
OWNER=<你的账号>
REPO=kwp-mirror

# ① 部署入口可读 —— 必须 200
curl -s -o /dev/null -w "marketplace.json -> %{http_code}\n" \
  "https://raw.githubusercontent.com/$OWNER/$REPO/main/.claude-plugin/marketplace.json"

# ② 文件齐全 —— 期望 files = 1287
curl -s "https://api.github.com/repos/$OWNER/$REPO/git/trees/main?recursive=1" \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('files =',(j.tree||[]).filter(t=>t.type==='blob').length)})"

# ③ workflow 已在远程 —— 期望列出 6 个，含 validate-plugins.yml
curl -s "https://api.github.com/repos/$OWNER/$REPO/contents/.github/workflows?ref=main" \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s).forEach(f=>console.log(' -',f.name))})"
```

**④ 客户端能认这个市场**（claude CLI 本机未装，二选一）

```bash
# 装了 CLI 的话：
claude plugin marketplace add "$OWNER/$REPO"
claude plugin marketplace list      # 列表里出现该市场

# 没装就只做网页确认：
# 打开 https://github.com/<OWNER>/<REPO>/actions
# 看到 Validate Plugins 最近一次运行是绿色 ✅（首次 push 后 30–60 秒生成）
```

**四项全绿 = 部署成功。** 任一项不绿，查下面的对照表。

---

## 卡住时对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| `! [rejected] main -> main (fetch first)` | 建仓时勾了 README/gitignore/license | `git pull --rebase origin main` 再 push；或删库重建（不勾任何框） |
| `refusing to allow a Personal Access Token ... without 'workflow' scope` | PAT 缺 workflow 权限 | 换 SSH（方案 2），或重新生成带 `workflow` 的 token |
| `remote: Repository not found` / `403` | owner 或仓库名拼错；token 未选中该私有仓库 | 回第 0 步核对 username；`git remote -v` 核对地址 |
| GCM 窗口不弹、命令卡死 | 在非交互 shell 里跑 | 换 Windows Terminal 的 Git Bash 重跑 |
| Actions 灰着不跑 | fork 仓库默认禁用 Actions | Actions 页点 "I understand my workflows..." |
| 本地校验绿、远程 Actions 红 | push 漏文件（常见于点开头的目录） | 本地 `node .github/scripts/validate-plugins.mjs` 应通过；`git ls-files \| wc -l` 应 1287 |
| `claude: command not found` | CLI 未安装 | `npm i -g @anthropic-ai/claude-code`，或跳过验收 ④ 改看 Actions 状态 |

---

## 三行速览（做完打勾）

- [ ] 第 0 步：确认 `OWNER`
- [ ] 第 1 项：建仓（A 空仓库 / B fork + enable Actions）→ 拿到 `https://github.com/<OWNER>/<REPO>.git`
- [ ] 第 2 项：push 成功（GCM 浏览器登录 / SSH / PAT 三选一）→ `git status` 显示 up to date
- [ ] 第 3 项：确认 owner、仓库名（含是否改 marketplace name）、Public
- [ ] §4：①②③④ 全绿
