# 仕様：技術スタックとプロジェクト構成

ステータス：**確定**／2026-10-25

## 0. 前提

- 手元の環境：Node v24.21.0（LTS）、npm 11.19.0、git 2.40.0（本物のgitとの突き合わせテストに使う）。pnpm は未インストール
- 決定済みの方針：
  - gitエンジンは自作の純粋TS（02）
  - CLIが正で、補助チップがある（03）
  - PC優先
  - 演出エンジンは決定的で、時刻を注入できる（04）
  - 最初の版はバックエンドなしで、静的サイトとして配信する

## 1. 技術スタック

| 領域                       | 採用（推奨）                           | 理由                                                                                                 | 候補だったもの                               |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 言語                       | **TypeScript**（strict）               | エンジンの状態とイベントを型で守る                                                                   | —                                            |
| ランタイム／パッケージ管理 | **Node 24 LTS／npm**                   | すでにインストール済みで、追加の準備が不要。1パッケージ構成なのでpnpmの利点が薄い                    | pnpm, bun                                    |
| ビルド                     | **Vite**                               | 速い。静的サイトとして出力できる                                                                     | Next.js（SSRは不要）                         |
| UI                         | **React 19**                           | 情報が多く、周辺ライブラリも豊富                                                                     | Svelte, Solid                                |
| UIの状態管理               | **Zustand**                            | 軽い。エンジンの状態をそのまま保持して、undo用の履歴も持てる                                         | Redux Toolkit, Jotai                         |
| 不変更新                   | **Immer**（エンジン内で使う）          | 純粋関数のまま書きやすい。Nodeでも動く                                                               | 手書きのスプレッド                           |
| SHA-1                      | **@noble/hashes**                      | **同期**で計算できる（Web Cryptoは非同期なのでエンジンが複雑になる）。依存なしで軽い                 | Web Crypto                                   |
| ターミナル                 | **自作のReactコンポーネント**          | 完全なターミナルは不要。補助チップ、補完、**日本語入力**（日本語のコミットメッセージ）を自由に作れる | xterm.js（日本語入力に弱く、作り込みにくい） |
| エディタ                   | **CodeMirror 6**                       | Monacoより軽い。コンフリクトの印のハイライトも装飾機能で作れる                                       | Monaco                                       |
| コミットグラフ             | **自作SVG**＋レーン配置のアルゴリズム  | 追加・移動のアニメーションや、origin/* との対比を自由に作れる                                        | @gitgraph/js（アーカイブ済み）, d3-dag       |
| アニメーション             | **Motion**（旧 framer-motion）         | グラフのノード移動、カットイン、表情の変化                                                           | CSSだけ                                      |
| スタイル                   | **Tailwind CSS v4**                    | 速く書ける。テーマ変数で色を統一できる                                                               | CSS Modules                                  |
| テスト                     | **Vitest**                             | Viteと設定を共有できる。Nodeで本物のgitを呼ぶテストも書ける                                          | Jest                                         |
| E2Eテスト                  | **Playwright**（後から入れる）         | シナリオを最後まで通しで確認する                                                                     | —                                            |
| リント・整形               | **Biome**                              | 1つのツールで速い。`noRestrictedImports` で層の境界を守れる                                          | ESLint＋Prettier                             |
| 保存                       | **localStorage**（`try/catch` で包む） | 最初の版は進捗とランクだけ保存する                                                                   | IndexedDB, Supabase                          |
| 配信                       | **Cloudflare Pages**（静的）           | 無料で速い。プレビュー用のURLも出る                                                                  | Vercel, GitHub Pages                         |
| CI                         | **GitHub Actions**                     | 型チェック、リント、ユニットテスト、本物gitとの突き合わせテスト                                      | —                                            |

## 2. プロジェクト構成

1つのパッケージにまとめ、**層の境界はフォルダとimportのルールで守る**。monorepoにはしない（1人で開発するには設定の手間が見合わない）。必要になったら `engine/` を独立したパッケージに切り出す。

```
git_sensei/
├─ docs/                       # 仕様書（01〜）
├─ src/
│  ├─ engine/                  # ① gitシミュレータ（純粋TS。DOM・React・時刻・乱数は使わない）
│  │  ├─ model/                #   World, Repo, オブジェクト（blob/tree/commit）, refs, index
│  │  ├─ objects/              #   gitと同じ形式でのオブジェクトの直列化とSHA-1
│  │  ├─ parser/               #   コマンド文字列 → 構造化されたコマンド
│  │  ├─ commands/             #   add.ts, commit.ts, merge.ts, rebase.ts …（1コマンド1ファイル）
│  │  ├─ shell/                #   ls, cat, touch, rm など、git以外の最小限のコマンド
│  │  ├─ events.ts             #   意味イベントの型
│  │  ├─ stateHash.ts          #   「意味のある状態」のハッシュ（後退と空振りの判定に使う）
│  │  └─ index.ts              #   execute(world, input, ctx) → { world, output, events }
│  │
│  ├─ drama/                   # ② 分類と演出エンジン（純粋TS。engineの型だけをimportする）
│  │  ├─ classifier.ts         #   危険 / エラー / 観測 / 前進 / 後退 / 空振り / 通常
│  │  ├─ trust.ts  mood.ts     #   後輩の信頼、上司の機嫌
│  │  ├─ clock.ts              #   作中の時計、期限、手が止まったときの処理（時刻は外から注入）
│  │  ├─ rank.ts
│  │  ├─ cues.ts               #   Cue型 ← 演出側（別セッション）との受け渡し
│  │  └─ drama.config.ts       #   数値はすべてここに置く（仮の値）
│  │
│  ├─ scenarios/               # ③ シナリオデータ
│  │  ├─ _dsl/                 #   ゴール条件のヘルパー（例：branchAt('main', ...), fileTracked('.env') ）
│  │  ├─ sandbox/              #   フリーモード
│  │  └─ ch3-env-leak/
│  │     ├─ scenario.ts        #   初期状態、NPCの台本、ゴール、par、許可する危険（ロジック）
│  │     ├─ solution.ts        #   作者が用意した解答（突き合わせテストにも使う）
│  │     └─ lines.ja.ts        #   セリフ ← 演出側が編集する。ロジックとは別ファイル
│  │
│  ├─ ui/                      # ④ React（①〜③をすべて使える唯一の層）
│  │  ├─ app/                  #   画面遷移（タイトル / 章選択 / プレイ / 始末書図鑑 / 設定）
│  │  ├─ play/                 #   プレイ画面のレイアウト
│  │  ├─ components/
│  │  │  ├─ terminal/  graph/  areas/  files/  editor/
│  │  │  ├─ chat/  header/  cutin/
│  │  ├─ store/                #   Zustand（World・演出状態・入力ログ）
│  │  └─ storage.ts            #   localStorage（try/catchで包む）
│  │
│  └─ main.tsx
├─ assets/                     # 立ち絵・アイコン（演出側が用意）
├─ tests/
│  ├─ golden/                  # 本物のgitとの突き合わせテスト
│  │  ├─ runner.ts             #   一時ディレクトリで本物のgitを実行 → refs・グラフ・作業ツリー・ハッシュを比べる
│  │  └─ cases/*.ts
│  └─ scenarios.test.ts        # すべてのシナリオの solution.ts がゴールに届き、par 以内に収まるか
├─ biome.json  tsconfig.json  vite.config.ts  package.json
└─ .github/workflows/ci.yml
```

### 2.1 層の依存ルール（Biomeで強制する）

```
engine   ← どこにも依存しない
drama    ← engine（型だけ）
scenarios← engine, drama
ui       ← すべて
```

- `engine` と `drama` は **DOM・React・`Date.now()`・`Math.random()` を使わない**
  - 時刻と乱数のシードは `ctx` から受け取る → 決定的になり、Nodeでそのままテストできる
- セリフ（`lines.ja.ts`）はロジックから分けておく。別セッションの演出案を、ロジックを触らずに入れ替えられる

### 2.2 本物のgitとの突き合わせテスト

- 手順：
  1. テストケースに書いた手順を、OSの一時ディレクトリで本物のgitに実行させる
  2. 同じ手順をシミュレータでも実行する
  3. 両者の結果を比べる
- 作者・日時は環境変数で固定する：`GIT_AUTHOR_NAME/EMAIL/DATE`, `GIT_COMMITTER_*`
- 比べるもの：
  - 全refsが指すコミットのハッシュ
  - 各コミットの親
  - index（`git ls-files -s`）
  - 作業ツリー
  - `status --porcelain`
- 対象外：出力メッセージの細かな文言（主要なメッセージだけをスナップショットで確認する）
- ローカルでもCIでも実行する（CIの Ubuntu にはgitが入っている）
- npmスクリプト：`npm run test:golden`

## 3. 開発の進め方（最初の版まで）

| 段階 | 内容                                                                                                | 完了条件                          |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| M0   | 下準備：`git init`、Vite＋React＋TS＋Tailwind＋Biome＋Vitest、CI                                    | 空の画面が出て、CIが通る          |
| M1   | エンジンの基本：init / add / commit / status / log / branch / switch / merge（fast-forward）        | 突き合わせテストが通る            |
| M2   | フリーモードの画面：ターミナル、グラフ、4領域、ファイル、エディタ                                   | ブラウザで基本操作ができる        |
| M3   | 複数リポジトリ：clone / fetch / pull / push、NPCの台本                                              | NPCがpushしてきたものをpullできる |
| M4   | 演出エンジン：分類器、ゲージ、Cue、時計                                                             | 仮のセリフで反応する              |
| M5   | 取り消しと書き換え：reset / revert / restore / reflog / stash / rebase / cherry-pick / push --force | 突き合わせテストが通る            |
| M6   | シナリオ：各章を実装し、別セッションの演出を組み込む                                                | 全シナリオを通しで遊べる          |

## 4. 決定事項（2026-10-25）

- [x] 構成：**1パッケージ＋npm**（monorepoにしない）
- [x] 配信：**Cloudflare Pages**
- [x] リポジトリ：**GitHubに非公開で作る**（M0で作成する）
