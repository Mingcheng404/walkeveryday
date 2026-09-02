# WalkEveryDay

WalkEveryDay 是一個 **Mobile-First + PWA** 的香港散步探索 Web App。  
用戶可在開放區域（屯門 / 元朗 / 天水圍）輸入預計行走時間，自動生成帶有 2-3 個打卡點的隨機路線，並透過 GPS 追蹤「未走藍線 / 已走灰線」。

---

## 1) 專案目錄結構（GitHub 靜態部署優化）

```text
walkeveryday-app/
├─ .github/workflows/deploy.yml      # GitHub Pages CI/CD
├─ public/
│  ├─ favicon.svg
│  └─ pwa-icon.svg
├─ src/
│  ├─ components/
│  │  ├─ AuthModal.tsx
│  │  ├─ BottomNav.tsx
│  │  ├─ BottomSheet.tsx
│  │  ├─ HistoryList.tsx
│  │  ├─ MapView.tsx
│  │  ├─ ProfilePanel.tsx
│  │  ├─ ShareRouteCard.tsx
│  │  └─ StatsPanel.tsx
│  ├─ lib/
│  │  ├─ database.types.ts
│  │  ├─ districts.ts
│  │  ├─ geo.ts
│  │  ├─ route-generator.ts
│  │  └─ supabase.ts
│  ├─ types/app.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css
│  └─ vite-env.d.ts
├─ supabase/schema.sql               # DB + RLS + trigger + achievements seed
├─ vite.config.ts                    # PWA + runtime caching + base path
├─ .env.example
└─ package.json
```

---

## 2) 安裝與環境變數

```bash
npm install
```

建立 `.env`（由 `.env.example` 複製）：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_BASE_PATH=/
```

- 本機通常 `VITE_BASE_PATH=/`
- GitHub Pages Project Site：`/<repo-name>/`

---

## 3) Supabase 初始化與 Auth 模組

### Supabase Client

- `src/lib/supabase.ts` 使用 `createClient<Database>()`
- 以 `import.meta.env` 載入 URL / anon key
- 啟用 `persistSession`、`autoRefreshToken`

### Auth UI（手機優先）

- `src/components/AuthModal.tsx`
  - Email/Password 註冊與登入
  - 註冊成功後建立 `profiles` 記錄
- `src/App.tsx`
  - 未登入可瀏覽地圖
  - 生成路線、歷史、統計、Profile 操作會提示登入

---

## 4) 地圖分區 + 隨機路線 + 打卡點

### 香港地圖分區渲染

- `src/lib/districts.ts`
  - 載入官方 18 區 GeoJSON
  - 開放區：屯門 / 元朗（官方區界）+ 天水圍（首期客製 Polygon）
- `src/components/MapView.tsx`
  - 非開放區灰色遮罩
  - 開放區高亮
  - 路線、打卡點、起終點、即時位置渲染

### 隨機路線生成

- `src/lib/route-generator.ts`
  1. 以 4.5 km/h 將「分鐘」換算目標距離  
  2. 在區域邊界內隨機取 waypoint  
  3. 優先呼叫 OSRM 取得真實道路路線  
  4. OSRM 失敗則 fallback 前端插值路徑  
  5. 依路徑長度與時間自動挑選 **2-3 個 POI 打卡點**

路線會寫入 `routes`，包含：

- `path_coordinates` (JSONB)
- `checkpoints` (JSONB)
- `is_public`

---

## 5) 即時 GPS 追蹤與藍灰動態拆分

- `src/App.tsx` 使用 `navigator.geolocation.watchPosition`
- `nearestCoordinateIndex()` 計算目前最接近路線索引
- 路線顏色：
  - 未走：藍色 `#3B82F6`
  - 已走：灰色 `#6B7280`
- 打卡點解鎖：
  - 靠近 checkpoint（<= 60m）自動 `unlocked`
- 進度同步：
  - 每 10 秒節流更新 `walk_history.covered_coordinates`
- 支援續行：
  - `History` 開啟歷史路線，會載入最近未完成進度繼續走

---

## 6) 社群分享與統計成就

### Public 路線與分享卡

- `History` 中可切換路線 `is_public`
- `ShareRouteCard.tsx` 生成可分享卡片內容
  - 若支援 Web Share API：直接分享
  - 否則 fallback 複製到 clipboard

### 健康統計

- `profiles`：總里程、總時長、連續天數
- `walk_history`：每次消耗卡路里
- `StatsPanel.tsx` 顯示：
  - 累積公里 / 時長 / 卡路里 / streak / 完成次數

### 成就徽章

- `achievements` + `user_achievements`
- 完成路線時自動評估門檻並解鎖

---

## 7) PWA 設定（manifest + service worker）

- `vite.config.ts` 使用 `vite-plugin-pwa`
- 已設定：
  - manifest（app name / icon / standalone）
  - `generateSW`
  - `navigateFallback: index.html`
  - runtime caching：
    - OSM 瓦片（CacheFirst）
    - 香港區界資料（StaleWhileRevalidate）
    - Routing API（NetworkFirst）
- `main.tsx`：`registerSW({ immediate: true })`

---

## 8) Supabase Schema（一鍵 SQL）

執行 `supabase/schema.sql`，內容包含：

- `profiles`, `routes`, `walk_history`, `achievements`, `user_achievements`
- 索引、RLS policy
- `auth.users` -> `profiles` 自動建立 trigger
- achievements 預設資料 seed

---

## 9) GitHub Pages 部署

`deploy.yml` 已配置：

1. `npm ci`
2. `npm run build`
3. 複製 `dist/index.html` -> `dist/404.html`（SPA fallback）
4. 發佈至 GitHub Pages

在 GitHub repo Secrets 設定：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`VITE_BASE_PATH` 在 workflow 會自動設為：

```text
/${{ github.event.repository.name }}/
```

---

## 10) 本機驗證

```bash
npm run lint
npm run build
npm run dev
```

目前此版本已通過 `lint` 與 `build`。
