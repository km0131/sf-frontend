# 学園祭 注文システム フロントエンド

学園祭の模擬店向け注文・順番管理システムの画面です。お客様のスマホ、レジ・厨房のタブレット、出来上がり番号の大画面、店長・システム管理者の管理画面を、1つの React アプリの中で URL ごとに切り替えます。

API は [`../backend`](../backend/README.md) です。本番では Cloudflare Workers（`app.example.com`）から配信し、ラズパイ上の API（`api.example.com`）を呼びます。

## 技術スタック

| 用途 | 技術 |
| --- | --- |
| 画面 | React 19、TypeScript 6、Vite 8 |
| 画面の切り替え | React Router 8 |
| データ取得・更新 | TanStack Query 5 |
| グラフ | Recharts 3（売上分析） |
| lint | oxlint |
| 実行環境 | Node 24（Docker の中で動かす） |

## 起動する

先にバックエンドを起動しておきます（`../backend` で `docker compose up -d`）。

```bash
cp .env.example .env
docker compose up -d --build
```

http://localhost:15173 を開きます。ソースはコンテナにマウントしているので、保存するとブラウザにすぐ反映されます。

| サービス | ホスト側のポート | 内容 |
| --- | --- | --- |
| `web` | `15173` | 開発サーバー（Vite） |
| `preview` | `14173` | 本番ビルドの確認（nginx）。`--profile preview` のときだけ起動 |

バックエンドの `CORS_ALLOWED_ORIGINS` には、この2つのポートを入れてあります。ポートを変えたら、バックエンドの方も合わせてください。

## よく使うコマンド

```bash
docker compose exec web npm run lint            # lint
docker compose exec web npx tsc -b              # 型チェック
docker compose exec web npm install <パッケージ>  # パッケージの追加
docker compose logs -f web                      # 開発サーバーのログ
```

- **パッケージを変えたあと**: パッケージ（`node_modules`）は、コンテナ内の専用の保存場所（ボリューム）に置いています。`package.json` を変えたら `docker compose exec web npm install` を実行するか、`docker compose up -d --build -V` で作り直してください。
- **ホストの `node_modules`**: ホスト側にもありますが、エディターの補完用です。Alpine Linux 向けにビルドされているので、ホスト上で直接 `npm run dev` などを実行しないでください。

## 環境変数

`VITE_` で始まる変数はビルド時に画面に埋め込まれます（秘密の値は入れないでください）。

| 変数 | 内容 | 既定値 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | ブラウザから見た API の URL | `http://localhost:18080` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile のサイトキー。空なら確認なしで注文できる（開発用） | 空 |
| `WEB_HOST_PORT` | 開発サーバーのホスト側ポート | `15173` |
| `PREVIEW_HOST_PORT` | 本番ビルド確認のホスト側ポート | `14173` |

本番では、Turnstile のサイトキー（画面側）とシークレットキー（バックエンドの `TURNSTILE_SECRET_KEY`）を両方設定します。

## 画面

| URL | 画面 | 使う人 |
| --- | --- | --- |
| `/` | お店の一覧（待ち組数・待ち時間の目安、自分の注文中の番号、番号での状態確認） | お客様 |
| `/s/{slug}` | お品書き・注文 | お客様 |
| `/o/{token}` | 注文完了・お呼び出し（番号・進捗・記録。自動で更新） | お客様 |
| `/s/{slug}/pos` | 注文帳（受付・調理中・お渡し待ちの3列）とレジ。PIN でログイン。お客様の画面からはリンクしない（管理画面の「画面を開く」から開く） | スタッフ・店長 |
| `/s/{slug}/display` | 出来上がり番号の大画面（ログイン不要） | テレビ・モニター |
| `/display` | 全店舗の呼び出し番号の大画面（ログイン不要） | テレビ・モニター |
| `/manage` | 管理画面。店長は 商品・注文・売上・店舗設定、システム管理者は 店舗・開催回・店長と管理者・全店の売上 | 店長・管理者 |

- **店舗の種類（飲食 / 飲食以外）**:
  - システム管理者が店舗の作成・編集で選びます（既定は飲食。店長の画面では見るだけ）。進行中（受付・調理中）の注文があるあいだは変えられません。
  - 飲食以外の店は「調理中」がなく、注文帳は「待ち／呼び出し中」の2列、大画面は「お呼び出し中の番号」と「待ち ○組」だけになります。
  - 画面の言葉（「お品書き」→「メニュー」、「ご注文」→「受付」、「注文帳」→「受付・進行一覧」など）と状態の表示名は `src/lib/wording.ts` にまとめています。店舗一覧・学園祭の中止のお知らせ・エラー文は、両方の店が混ざるので中立の言葉です。
  - 合計0円の注文は受付の時点で支払い済みになり、画面には「料金はかかりません」と出します。
- **学園祭の中止・再開**:
  - システム管理者の「開催回」の上部の「注文の受け付け」から、全店の注文をまとめて止めたり再開したりします。お客様に出すお知らせも書けます。
  - 中止中は、店舗一覧・お品書き・レジの上部にお知らせを出し、注文・会計のボタンを押せなくします。お品書きは30秒ごと、レジは15秒ごとに状態を取り直します。
- **スタッフ用の画面への入口**:
  - レジ・大画面はお客様の画面からはリンクしていません。
  - 店長は管理メニューの「画面を開く」（レジ・大画面）、システム管理者は同じ場所の「全店の大画面」と、店舗の一覧の「レジ」「大画面」から別のタブで開きます。
- **レジ・厨房**:
  - 注文の変化は SSE で受け取り、画面に即座に反映します。切れたら3秒後につなぎ直します。
  - PIN が変わったり期限が切れたりすると、ログイン画面に戻ります。
- **大画面**:
  - 番号と状態だけを表示し、個人情報は出しません。
  - 画面がスリープしないようにし、できあがりの合図の音を出すこともできます（画面右上で切り替え）。
- **全店舗の大画面**（`/display`）:
  - 店ごとに列を並べ、頭文字の順に表示します。
  - 店舗が4つ以上のときは、一度に3店舗（幅900px以下は1店舗）を見せ、15秒ごとに1列ずつ流します。数と間隔は `AllDisplayPage.tsx` の `ROTATE_FROM`・`ROTATE_MS`・`MAX_PER_VIEW` と、`staff.css` の `--per` で変えられます。
- **注文の控え**:
  - 注文するとブラウザの `localStorage` に控えを残し、店舗一覧の「ご注文中」から注文状況ページに戻れます（その日の分、最大10件）。
  - 別のブラウザで開き直したなどで控えがないときは、店舗一覧の上の「番号で注文を確かめる」を押すと入力欄が開き、状態だけを確かめられます。
- **商品の選択肢**:
  - 管理画面の商品で、選択肢の組ごとに「選べる数」と「まとめ値段（例: 3つで100円）」を設定できます。
  - お客様・レジの画面の金額は、`lib/cart.ts` の `groupDelta` でバックエンドと同じ計算をします。
- **ログイン情報**:
  - ブラウザの `localStorage` に保存します。スタッフはその営業日の終わりまで、店長・管理者は12時間有効です。
- **読み込み**:
  - お客様の画面はすぐに表示できるよう、最初から読み込みます。
  - スタッフ・大画面・管理画面（グラフのライブラリを含む）は、開いたときに読み込みます。

## ディレクトリ構成

```
src/
  main.tsx, router.tsx     起動と、画面の切り替え
  styles/
    tokens.css             デザイントークン（色・フォント・余白・動き）
    base.css               全体の基本スタイルと動き
    components.css         共通部品（ヘッダー・ターミナル表現・ボタン・フォームなど）
    customer.css staff.css manage.css   画面ごと
  components/              共通部品（Header、TerminalLine・Log、VerticalLabel、Sheet、OptionPicker、Turnstile、BarChart）
  lib/
    api.ts                 API の呼び出しとエラー文
    types.ts               API の型
    cart.ts                カート（お客様とレジで共通）。まとめ値段の計算もここ
    session.ts             ログイン情報・注文の控えの保存
    sse.ts                 SSE の受信（fetch のストリーム。Authorization ヘッダーを付けるため）
    colors.ts format.ts
  pages/
    customer/  staff/  display/  manage/（admin/ はシステム管理者用）
               display/screen.ts は大画面で共通の部品（並び順・画面のスリープ防止・合図の音）
```

## デザイン

デザイン仕様書「屋台ターミナル」に沿っています。値はすべて `src/styles/tokens.css` の CSS 変数で持ちます。

- **色**:
  - 地は生成り `#F7F3EC`、文字は墨 `#2B2622` です。
  - 紫苑 `#867BA9` は罫線と装飾だけに使います。文字と操作には濃紫苑 `#574A80` を使います。
- **店舗色**:
  - 山吹茶・青磁・桜鼠・錆浅葱の4色から店ごとに1色を選びます（管理画面の店舗設定）。
  - 画面の外側で `--c-store` を差し替えて使います（`lib/colors.ts` の `storeStyle`）。
  - 面では塗らず、選んだ品の点・調理中の点・呼び出し番号の下の線だけに使います。
- **フォント**:
  - 見出しは Shippori Mincho B1、本文は Zen Kaku Gothic New、番号・価格・時刻は JetBrains Mono です。
  - `@fontsource/*` パッケージで自ドメインから配信します（`src/main.tsx`）。外部 CDN には頼らないので、CSP で読み込み元を自ドメインに限れます。読み込めないときは、端末の明朝体・ゴシック体で表示します。
- **形**: 角丸・影・グラデーションは使いません。区切りは 1px の罫線です。
- **ターミナル表現**:
  - 紫苑の罫線2本の間に「＞ コマンド」とカーソルを置きます（`TerminalLine`）。
  - 時刻付きの記録は `Log` で表示します。
  - 1画面に上部の1行と記録1か所までです。
- **動き**: ふわっと表示・タイピング・カーソルの点滅・進捗バーの伸びだけです。`prefers-reduced-motion` のときは動きを止めます。
- **紫苑の色**: 伝統色の値です。大学公式のカラーコードがあれば `--c-shion` / `--c-shion-deep` を差し替えてください。

## 本番のビルドと配信

### Cloudflare Workers（静的アセット）

`wrangler.jsonc` の設定で `dist/` を配信します。

- ルートディレクトリ: `frontend`
- ビルドコマンド: `npm run build`
- デプロイコマンド: `npx wrangler deploy`（Workers Builds の既定のままでよい）
- ビルド変数: `VITE_API_BASE_URL=https://api.example.com`、`VITE_TURNSTILE_SITE_KEY=...`。値はビルド時に埋め込まれるので、実行時の変数ではなく「ビルド変数」に設定してください。
- `wrangler.jsonc` の `name` は、ダッシュボードの Worker 名と同じにしてください。
- 画面の切り替えはブラウザ側で行うので、存在しない URL には `index.html` を返します（`not_found_handling: "single-page-application"`）。
- セキュリティヘッダー（CSP・`X-Frame-Options`・HSTS・`nosniff` など）は、ビルド時に `dist/_headers` として書き出します（`vite.config.ts`）。CSP の接続先には `VITE_API_BASE_URL` のオリジンが入るので、API の URL を変えたらビルドし直してください。

### ビルド結果の取り出し・確認

```bash
# dist/ に書き出す
docker build --target dist --build-arg VITE_API_BASE_URL=https://api.example.com -o dist .

# 本番と同じ静的ファイルを nginx で配信して確認する（http://localhost:14173）
docker compose --profile preview up -d --build preview
```

nginx の設定（`nginx.conf`）は、`/assets/` を1年キャッシュし、それ以外の URL には `index.html` を返します。セキュリティヘッダーは `dist/_headers` から作るので、Cloudflare Workers と同じものが付きます。
