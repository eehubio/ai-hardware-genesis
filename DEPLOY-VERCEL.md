# 设计前端 · 部署到 Vercel

这是 AI 硬件设计前端(Vite + React + 3 个 Gemini serverless 接口)。
它读取「云端模块平台」的 API 获取硬件库,用 Gemini 提供 AI 设计助手。

## 与数据平台的关系

- **数据平台**(`ai-hardware-genesis-platform`,已部署):管模块数据 + API + 编辑后台
- **设计前端**(本项目):做设计,通过 API 读平台的模块库

两者独立部署。本前端默认已指向线上平台,无需额外配置数据库。

## 部署步骤

### 1. 推到 GitHub
```bash
cd ai-hardware-genesis
git init && git add . && git commit -m "init design frontend"
git branch -M main
git remote add origin git@github.com:你的用户名/ai-hardware-genesis.git
git push -u origin main
```

### 2. Vercel 导入
- https://vercel.com/new → 选本仓库 → Import
- Framework 自动识别为 **Vite**,构建配置用默认(`vercel.json` 已配好)
- **关键:添加环境变量** `GEMINI_API_KEY` = 你的 Gemini Key
  （申请：https://aistudio.google.com/apikey）
- 点 Deploy

### 3. 验证
部署完成后打开站点：
- 左侧硬件库应列出模块（来自云端平台 API）
- 点「智造 AI 设计助手」，输入需求（如「做一个温湿度监测器」），
  AI 应返回方案（这需要 GEMINI_API_KEY 已配置）

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `GEMINI_API_KEY` | 是 | AI 助手 / PCB 布局 / 网表解析 |
| `MODULE_API_BASE` | 否 | 覆盖默认的模块平台地址 |

## serverless 接口

`api/` 下三个函数由 Vercel 自动部署：
- `/api/assistant` — AI 设计助手（描述需求→推荐模块）
- `/api/layout` — AI PCB 布局
- `/api/parse-netlist` — 上传 KiCad 网表/原理图→提取器件

它们都从服务端环境变量读 `GEMINI_API_KEY`，Key 不会暴露到浏览器。

## 本地开发

```bash
npm install
# 本地若要测 AI，需要 vercel dev（而非 npm run dev），因为 serverless 函数
# 只在 vercel 环境运行：
#   npm i -g vercel && vercel dev
# 仅看界面/模块库则 npm run dev 即可（AI 会显示连接超时，属正常）。
npm run dev
```
