# 7Being Studio

[7Being](https://github.com/rush0100/7Being) — **RUSH0100** × **BURNLab KMITL**.

Founder & PhD Biomedical Engineering Student [Mr. Ratchaphon Khaemphukhiao](https://www.linkedin.com/in/ratchaphon/).

No-code BCI flow builder (Next.js). หน้าควบคุม Brain → BCI. MIT licensed (`LICENSE`).

| ส่วน | ที่อยู่ |
|------|---------|
| แกน | [7Being](https://github.com/rush0100/7Being) |
| Studio (repo นี้) | หน้าควบคุม |
| ADS1299 | [7being-ads1299](https://github.com/rush0100/7being-ads1299) |
| H1 | ส่วนตัว · ไม่อยู่ในชุดสาธารณะ |
| EPOC X | LSL adapter · ไทย / 中文 / English ด้านล่าง |

## EPOC X

- **ไทย:** ซื้อ [EmotivPRO](https://www.emotiv.com/emotivpro) จากนั้นติดต่อ hello@rush0100.com เพื่อขอ LSL adapter
- **中文:** 请先购买 [EmotivPRO](https://www.emotiv.com/emotivpro)，然后联系 hello@rush0100.com 获取 LSL adapter
- **English:** Buy [EmotivPRO](https://www.emotiv.com/emotivpro), then contact hello@rush0100.com for the LSL adapter

Wire **Device → Mental → Outputs** (game / mqtt / serialport / tcpudp / grpc / custom), then **Apply** to sync with the Python API.

## Prerequisites

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

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `BCI_API_URL` | `http://127.0.0.1:8765` | Python API (rewritten from `/api/bci/*`) |

Copy `.env.example` → `.env.local` if needed.

## Flow model

- **Device** — scan / connect EEG input
- **Mental** — profile, calibrate, train, fit, live, control
- **Output** — edge from Mental enables that sink on Apply

Graph is saved in `localStorage` and can be Export / Import as JSON.

## Stack

Next.js 15 App Router · TypeScript · Tailwind · `@xyflow/react`

## Third-party assets

`public/models/brain.glb` is **CC BY-SA 4.0**, from [Brain Project](https://github.com/itayinbarr/brainproject) (Itay Inbar), derived from [Z-Anatomy](https://github.com/Z-Anatomy) / [BodyParts3D](https://lifesciencedb.jp/bp3d/). It is not covered by the MIT license on this repo. `public/models/draco/` is the Google Draco decoder (**Apache-2.0**). Details: [`NOTICE`](NOTICE).
