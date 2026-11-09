# 7Being Studio

English · [中文](#中文)

## English

[7Being](https://github.com/rush0100/7Being) — **RUSH0100** × **BURNLab KMITL**.

Founder & PhD Biomedical Engineering Student [Mr. Ratchaphon Khaemphukhiao](https://www.linkedin.com/in/ratchaphon/).

No-code BCI flow builder (Next.js). The control surface for Brain → BCI. MIT licensed (`LICENSE`). The interface is available in ไทย, 中文, and English.

| Part | Where |
|------|--------|
| Core | [7Being](https://github.com/rush0100/7Being) |
| Studio (this repo) | Control surface |
| ADS1299 | [7being-ads1299](https://github.com/rush0100/7being-ads1299) |
| H1 | Private · not in the public set |
| EPOC X | LSL adapter · see below |

### EPOC X

Buy [EmotivPRO](https://www.emotiv.com/emotivpro), then contact hello@rush0100.com for the LSL adapter.

Wire **Device → Mental → Outputs** (game / mqtt / serialport / tcpudp / grpc / custom), then **Apply** to sync with the Python API.

### Prerequisites

1. Device plugin daemon (public example: ADS1299):

```bash
7being-ads1299-serve --port 51053
export SEVENBEING_DEVICE_GRPC=127.0.0.1:51053
```

2. Python BCI API (`:8765`):

```bash
cd ../7Being
./run.sh
```

3. This Studio (`:3000`):

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `BCI_API_URL` | `http://127.0.0.1:8765` | Python API (rewritten from `/api/bci/*`) |

Copy `.env.example` → `.env.local` if needed.

### Flow model

- **Device** — scan / connect EEG input
- **Mental** — profile, calibrate, train, fit, live, control
- **Output** — an edge from Mental enables that sink on Apply

The graph is saved in `localStorage` and can be exported or imported as JSON.

### Stack

Next.js 15 App Router · TypeScript · Tailwind · `@xyflow/react`

### Third-party assets

`public/models/brain.glb` is **CC BY-SA 4.0**, from [Brain Project](https://github.com/itayinbarr/brainproject) (Itay Inbar), derived from [Z-Anatomy](https://github.com/Z-Anatomy) / [BodyParts3D](https://lifesciencedb.jp/bp3d/). It is not covered by the MIT license on this repo. `public/models/draco/` is the Google Draco decoder (**Apache-2.0**). Details: [`NOTICE`](NOTICE).

## 中文

[7Being](https://github.com/rush0100/7Being) — **RUSH0100** × **BURNLab KMITL**。

创始人、生物医学工程博士生 [Mr. Ratchaphon Khaemphukhiao](https://www.linkedin.com/in/ratchaphon/)。

无代码 BCI 流程构建器（Next.js），Brain → BCI 的控制界面。MIT 许可（`LICENSE`）。界面提供 ไทย、中文 与 English。

| 部分 | 位置 |
|------|------|
| 核心 | [7Being](https://github.com/rush0100/7Being) |
| Studio（本仓库） | 控制界面 |
| ADS1299 | [7being-ads1299](https://github.com/rush0100/7being-ads1299) |
| H1 | 私有 · 不在公开套件中 |
| EPOC X | LSL adapter · 见下文 |

### EPOC X

请先购买 [EmotivPRO](https://www.emotiv.com/emotivpro)，然后联系 hello@rush0100.com 获取 LSL adapter。

连接 **Device → Mental → Outputs**（game / mqtt / serialport / tcpudp / grpc / custom），然后 **Apply**，与 Python API 同步。

### 前置条件

1. 设备插件守护进程（公开示例：ADS1299）：

```bash
7being-ads1299-serve --port 51053
export SEVENBEING_DEVICE_GRPC=127.0.0.1:51053
```

2. Python BCI API（`:8765`）：

```bash
cd ../7Being
./run.sh
```

3. 本 Studio（`:3000`）：

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

### 环境变量

| 变量 | 默认值 | 含义 |
|------|--------|------|
| `BCI_API_URL` | `http://127.0.0.1:8765` | Python API（由 `/api/bci/*` 转发） |

需要时把 `.env.example` 复制为 `.env.local`。

### 流程模型

- **Device** — 扫描 / 连接 EEG 输入
- **Mental** — profile、校准、训练、拟合、实时、控制
- **Output** — 从 Mental 连出的边会在 Apply 时启用对应输出

图保存在 `localStorage`，可以按 JSON 导出或导入。

### 技术栈

Next.js 15 App Router · TypeScript · Tailwind · `@xyflow/react`

### 第三方素材

`public/models/brain.glb` 为 **CC BY-SA 4.0**，来自 [Brain Project](https://github.com/itayinbarr/brainproject)（Itay Inbar），衍生自 [Z-Anatomy](https://github.com/Z-Anatomy) / [BodyParts3D](https://lifesciencedb.jp/bp3d/)。它不在本仓库的 MIT 许可范围内。`public/models/draco/` 是 Google Draco 解码器（**Apache-2.0**）。详见 [`NOTICE`](NOTICE)。
