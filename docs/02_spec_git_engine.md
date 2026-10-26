# 仕様：gitエンジン方式

ステータス：**確定（A. 自作シミュレータ）**／2026-10-25

## 1. 選定基準（このアプリならではの要件）

| #   | 要件                                                                                                         | 理由                                                   |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| R1  | 基本操作を一通りサポートする（rebase / reset / revert / reflog / stash / cherry-pick / push --force を含む） | 「基本操作は全部できる」がコンセプト                   |
| R2  | 複数リポジトリを扱える（自分・origin・後輩・先輩）                                                           | NPCがpushやforce pushをしてくる                        |
| R3  | 「何が起きたか」を意味のあるイベントとして受け取れる                                                         | 上司の激怒や後輩のまなざしなどの演出を起こすため       |
| R4  | 結果が決まっていて、undo・セーブ・リプレイができる                                                           | シナリオのクリア判定、無駄な操作の判定、やり直しに必要 |
| R5  | 軽い（数秒以内に起動、スマホでも動く）                                                                       | 気軽に遊べる学習Webアプリだから                        |
| R6  | 作業ツリーのファイル内容まで扱える                                                                           | コンフリクト解消、`.env` の誤commitなど                |
| R7  | 本物のgitとの挙動差が小さい                                                                                  | 嘘を教えないため                                       |

## 2. 候補の比較

### A. 自作シミュレータ（TypeScript）

学習に必要なgitの一部を、状態を変換する純粋な関数として実装する。Learn Git Branching と同じ方式。

- 👍 R2〜R6をすべて満たせる。演出用のイベントを好きな粒度で出せる
- 👍 状態はJSONで表せる。undo・セーブ・URL共有・リプレイが簡単
- 👍 エラー時に日本語のヒント（「それやると後輩のコミットが消えるぞ」）を出しやすい
- 👍 依存がなく軽い。スマホでも動く
- 👎 実装量が最も多い（25コマンド前後とその主要オプション）
- 👎 本物とずれる危険がある → **本物のgitと突き合わせるテスト**で抑える（後述）

### B. isomorphic-git（gitのJavaScript実装）＋メモリ上のFS

- 👍 commit / merge（コンフリクトマーカーあり）/ cherry-pick / stash / tag / status などが最初からある
- 👍 ブラウザだけで動き、オブジェクトの形式も本物と同じ
- 👎 **rebase / revert / reflog / reset（高レベル）/ diff がない** → 結局自分で作ることになる
- 👎 mergeの制約がある：再帰マージは非対応、`--continue` 相当がない、途中で止まったマージを中止できない
- 👎 pushはHTTPのリモートが前提。ブラウザ内の別リポジトリにpushするには、偽のHTTPクライアントを挟む必要がある
- 👎 CLIとしてのパース、出力メッセージ、エラー文はすべて自作になる
- 👎 「なぜこうなったか」の意味イベントは取れない。前後の状態の差分から推測するしかない
- **結論**：半分は自作になるうえ、ライブラリの都合にも縛られる。中途半端

### C. wasm-git（libgit2をWebAssemblyにしたもの）

- 👍 本物のgitのライブラリなので正確
- 👎 libgit2は**ライブラリでありCLIではない**。用意されているCLI風の命令は clone / add / commit / push / pull など限られた範囲
- 👎 rebaseやstashの操作体系、`status` の出力などは自作が必要
- 👎 WASMの容量があり、Workerやファイルシステムとのつなぎ込みも複雑
- 👎 R3（意味イベント）はBと同じく取れない
- **結論**：Bより重く、得るものは少ない

### D. ブラウザ内のLinux仮想マシン（WebVM / CheerpX）で本物のgitを動かす

- 👍 **100%本物のgit**。どんなコマンドも動く
- 👎 OSイメージの読み込みが重い（数十〜数百MBを順次読み込む）。起動が遅く、スマホは厳しい
- 👎 状態を可視化するには毎回 `git log` などを実行して出力を読む必要があり、遅い
- 👎 意味イベントは出力の解析頼みで壊れやすい
- 👎 CheerpXは個人・OSSなら無料だが、商用はライセンスが必要
- **結論**：リアルすぎて演出がしにくい

### E. サーバー側のコンテナで本物のgitを動かす

- 👍 本物。サーバー側で何でもできる
- 👎 ユーザーごとにコンテナが必要で、インフラ費・セキュリティ隔離・遅延の負担が大きい。オフラインで動かない
- **結論**：学習ゲームには過剰

### 比較表

|                   | A. 自作           | B. isomorphic-git | C. wasm-git | D. WebVM | E. サーバー |
| ----------------- | ----------------- | ----------------- | ----------- | -------- | ----------- |
| R1 コマンド網羅   | ◎（作れば）       | △                 | △           | ◎        | ◎           |
| R2 複数リポジトリ | ◎                 | ○                 | ○           | ◎        | ◎           |
| R3 意味イベント   | ◎                 | ×                 | ×           | ×        | ×           |
| R4 決定性・undo   | ◎                 | △                 | △           | ×        | ×           |
| R5 軽さ           | ◎                 | ○                 | △           | ×        | ○           |
| R6 ファイル内容   | ◎                 | ◎                 | ◎           | ◎        | ◎           |
| R7 本物との一致   | ○（テストで担保） | ◎                 | ◎           | ◎        | ◎           |
| 実装コスト        | 大                | 中〜大            | 大          | 中       | 大＋運用    |

## 3. 推奨：A. 自作シミュレータ＋本物のgitとの突き合わせテスト

このアプリの価値は**演出**にある。演出の土台はR3（意味イベント）とR4（決定性）で、これを最初から満たせるのはAだけ。不足するR7は、テストの仕組みで補う。

### 3.1 アーキテクチャ概要

```
入力（CLI / ボタン）
   ↓
parse ── コマンド文字列を構造化する（未対応コマンドは日本語で案内）
   ↓
execute(world, cmd) → { world', output, events[] }   ← 純粋関数
   ↓                     ↓            ↓
可視化（グラフ／ファイル）   ターミナル出力   演出エンジン（上司・後輩・ゲージ）
```

- **World**：複数リポジトリをまとめた状態
  - `repos: { me, origin, kouhai, senpai }`
  - 各repoが持つもの：`worktree`（ファイル→中身）、`index`、`objects`（blob/tree/commit）、`refs`、`HEAD`、`reflog`、`stash`、`remotes`、`config`
- **NPC**：自分のクローン上でシナリオに書かれた手順を実行し、originへpushする。プレイヤーと同じエンジンを使うので嘘がない
- **events**（例）
  - `FORCE_PUSH_OVERWROTE { lostCommits, authors }`
  - `SECRET_COMMITTED { path }` / `SECRET_PUSHED`
  - `DIRECT_PUSH_TO_PROTECTED { branch }`
  - `UNCOMMITTED_CHANGES_DISCARDED { files }`（`reset --hard` や `checkout -- .` など）
  - `DETACHED_HEAD_ENTERED` / `COMMITS_ORPHANED`
  - `CONFLICT_STARTED { files }` / `CONFLICT_RESOLVED`
  - `HISTORY_REWRITTEN_ON_SHARED_BRANCH`

### 3.2 本物のgitとのずれを抑えるテスト

- Node上で同じ手順を **本物のgit** と **シミュレータ** の両方で実行し、refs・コミットグラフ・作業ツリー・indexを比べる
- 作者名と時刻を固定し、gitと同じオブジェクト形式でSHA-1を計算すれば、**ハッシュ値まで一致**するか確かめられる（可視化に本物と同じ短縮ハッシュを出せる）
- シナリオの手順はすべてこのテストに通す（CIで実行）

### 3.3 サポート範囲（案）

| 区分     | コマンド                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 基本     | init, status, add, rm, mv, commit（-m, -a, --amend）, log（--oneline, --graph, --all）, diff（--staged）, show                               |
| ブランチ | branch（-d, -D, -m）, switch（-c）, checkout（-b, ファイル指定）, merge（--no-ff, --abort）, rebase（--continue, --abort）, cherry-pick, tag |
| 取り消し | restore（--staged）, reset（--soft/--mixed/--hard）, revert, reflog, stash（push/pop/list/apply/drop）                                       |
| リモート | clone, remote, fetch, pull（--rebase）, push（-u, --force, --force-with-lease）, 上流ブランチの追跡                                          |
| 補助     | .gitignore, config（user.name 程度）                                                                                                         |

**対象外**（最初の版ではやらない）：submodule, worktree, sparse-checkout, hooks, パックファイル, 対話的rebase（`rebase -i` は後でGUI付きで検討）, 再帰マージ戦略（シナリオ側でマージベースが1つになるよう設計する）

### 3.4 「無駄な操作」の判定方針（演出エンジンとの接続）

- 各シナリオに **ゴール条件** と **基準手数（par）** を持たせる
- 状態を見るだけのコマンド（status / log / diff）は**減点しない**。確認は良い習慣なので、むしろ評価してもよい
- 減点するのは次のような操作：
  - ゴールから遠ざかる操作
  - 打ち消し合う操作（作ってすぐ消す、行って戻る）
  - 危険な操作（イベントで判定）
  - エラーになるコマンドの連打
- 減点の結果は、後輩の信頼ゲージや表情の変化に反映する（詳細は演出の仕様で詰める）

## 4. 未決事項

- [ ] ターミナル出力を本物の英語にするか、日本語の解説も添えるか（案：出力は本物の英語、横に日本語の吹き出し）
- [ ] ハッシュを本物のSHA-1にするか、見やすい疑似ハッシュにするか（案：本物。テストでも使える）
- [ ] 段階的に機能を開放するか（序盤は使えるコマンドを制限する）

## 5. 実装の状況

### M1（2026-10-25）

対応したコマンド：`init`、`add`（`-A`、`-u`、ディレクトリ、`*`/`?`）、`commit`（`-m`、`-a`、`--amend`、`--no-edit`、`--allow-empty`）、`status`（通常、`-s`、`--porcelain`、`-b`）、`log`（`--oneline`、`--all`、`-n`、`--decorate`、リビジョン指定）、`branch`（一覧、作成、`-d`/`-D`、`-m`、`--show-current`）、`switch`（`-c`、`-C`、`--detach`、`-`）、`checkout`（ブランチ、`-b`、コミット）、`merge`（fast-forward、`--ff-only`）

- 突き合わせテスト（`tests/golden/m1.test.ts`）で、本物のgitと比べて次が一致することを確かめている
  - コミットのハッシュ値
  - refs、HEAD、index、作業ツリー
  - `status --porcelain`
  - 各コマンドの終了コード
  - 主要コマンドの標準出力
- 演出向けの意味イベント：`COMMIT_CREATED`、`DETACHED_HEAD_ENTERED`、`COMMITS_ORPHANED` など（`src/engine/events.ts`）

M1の時点で、本物のgitと違う点や未対応のもの：

- 名前の変更（rename）を検出しない。削除と追加として表示する
- 日本語などASCII以外のファイル名を、本物のgitのようにエスケープして表示しない（`core.quotePath=false` 相当。学習者には読みやすい）
- テキストファイルだけを扱う。実行権限（`100755`）、シンボリックリンク、バイナリには未対応
- `.gitignore` は未対応（M5までに対応する）
- `log --graph`、範囲指定（`a..b`）、fast-forward できないマージ、エディタでのメッセージ入力は、「このシミュレータではまだ使えません」と表示する
- エラーメッセージ（標準エラー）の文言は、gitのバージョンで変わるため完全には合わせていない。終了コードは一致させている

### M3（2026-10-26）

対応したコマンド：

- `clone`（空のリポジトリにも対応）
- `remote`（一覧、`-v`、`add`、`remove`、`get-url`）
- `fetch`（リモート名、ブランチ指定、`--prune`）
- `pull`（fast-forward、`--ff-only`、分岐しているときは本物と同じく取り込み方を聞いて止まる）
- `push`（`-u`、`--force`、`--force-with-lease`、`--delete`、`src:dst`、拒否の判定）
- `config`（取得、設定、`--global`、`--unset`、`--list`）
- `init --bare`
- シェル：`cd`、`pwd`、`ls`、`cat`

既存のコマンドも追跡ブランチに対応させた：

- `status`：上流との差（ahead / behind / diverged / gone）
- `branch`：`-a`、`-r`、`-u`、`--unset-upstream`、リモート追跡ブランチから作ると上流を自動設定
- `switch` / `checkout`：手元にないブランチ名を指定すると `origin/<名前>` から作る
- `log`：`origin/main`・`origin/HEAD` の装飾
- リビジョン指定：`origin/main`、`origin`、`@{u}`

リモートの扱い：

- リモートは同じ world の中の別ワークスペースとして持つ。サーバー役は bare リポジトリで、URL はそのパス
- 追跡の設定は、本物と同じく `branch.<名前>.remote` / `branch.<名前>.merge` / `remote.<名前>.url` に持つ

突き合わせテスト（`tests/golden/m3.test.ts`）では、origin.git・npc・me の3つのリポジトリを本物のgitとシミュレータの両方に作り、次がすべてのリポジトリで一致することを確かめている：

- refs（symref を含む）
- コミット
- remote / branch の設定
- index、作業ツリー、status
- 終了コード

演出向けの意味イベントを追加した：

- `PUSHED`、`PUSH_REJECTED`（理由つき）
- `FORCE_PUSH_OVERWROTE`（消えたコミットとその作者）
- `FETCHED`（履歴の書き換えを検出）
- `PULL_DIVERGED`、`CLONED`、`UPSTREAM_SET` など

NPC の台本は `src/scenarios/npc.ts` で実行する。NPC もプレイヤーと同じエンジンで、自分のクローンにコマンドを打つ。フリーモード「チームで練習」の舞台は `src/scenarios/sandbox/team.ts` にある。

M3の時点で、本物のgitと違う点や未対応のもの：

- 分岐したブランチの取り込み（マージコミット、`pull --rebase`）は未対応。チームで練習すると、ここで行き止まりになる（M5で対応）
- リモートはローカルのパスだけ。HTTPS・SSH の URL や認証は扱わない
- push / fetch のタグ、複数リモートの一括操作（`--all`）、`remote rename` / `set-url` は未対応
- 分岐しているときの `status` のヒント文は、git のバージョンによって文言が違うため、新しい方の文言に合わせている

### マージコミット（M5 から前倒し、2026-10-26）

対応したこと：

- `merge`：fast-forward できない3-wayマージ、`--no-ff`、`-m`、`--abort`、`--continue`
- `pull`：`--no-rebase` か `pull.rebase=false` のとき、マージコミットを作る
- コンフリクト：同じ場所の変更、両方で追加（add/add）、片方削除・片方変更（modify/delete）
  - index に stage 1〜3 を持つ
  - 作業ツリーに `<<<<<<<` の印を書く
  - MERGE_HEAD / MERGE_MSG を持つ
- コンフリクトの解消：`add`、`status`（Unmerged paths、`UU` / `AA` / `UD` など）、`commit`（`--no-edit` ならメッセージに `# Conflicts:` が残り、エディタを開く扱いなら消える）
- マージの途中に断る操作：新しいマージ、pull、switch、checkout、amend
- `log`：マージコミットの `Merge:` 行と、本文のタブの展開

3-wayマージは git の既定（ort 戦略）に合わせた：

- ファイル単位：片方だけが変えたファイルはそのまま取り込み、両方が変えたファイルは行単位でマージする
- 行単位：xdiff の XDL_MERGE_ZEALOUS に合わせた。接している変更もコンフリクトにし、コンフリクトの中の共通の行は外に出して細かく分ける
- マージで書き換わるファイルに手元の変更や未追跡のファイルがあれば、始めずに止める（終了コード 2）

突き合わせテスト（`tests/golden/merge.test.ts`）では、次まで本物と一致することを確かめている：

- マージコミットのハッシュ値
- コンフリクトの印の入った作業ツリー
- stage つきの index、MERGE_HEAD
- `status` / `log` / `merge` の出力
- pull のマージで、コンフリクトの印のラベルがコミットのハッシュ値になる

演出向けの意味イベントを追加した：`MERGED`、`MERGE_CONFLICT`（ファイルと種類）、`CONFLICT_RESOLVED`（残りの数）、`MERGE_ABORTED`。

突き合わせテストのシミュレータ側のパスは、本物と同じ実際のパスにした。pull のマージメッセージにリモートのパスが入るので、パスまで同じでないとハッシュ値を比べられないため。Windows のドライブ名から始まるパス（`C:/...`）も絶対パスとして扱う。

マージの時点で、本物のgitと違う点や未対応のもの：

- 名前の変更（rename）を検出しない。片方が名前を変え、もう片方が中身を変えると、本物は追いかけてマージするが、シミュレータは modify/delete のコンフリクトになる
- 共通の祖先が複数ある交差したマージ（criss-cross）は未対応
- ディレクトリとファイルの衝突、実行権限の変更の衝突は未対応
- `rebase`、`pull --rebase`、`merge --quit`、`--strategy`、`-X ours/theirs` は未対応
- 行の差分は最長共通部分列で求めている。同じ行が何度も出てくるファイルでは、git（Myers）とコンフリクトの区切り方が変わることがある
- フリーモードのチームで練習：同僚（NPC）は `pull.rebase=false` で、分岐していればマージで取り込む。force push で消されたコミットも、持っていた同僚が pull してマージすると、サーバーに戻ってくる（本物と同じ）

### 取り消し・確認のコマンドとシェル（M5 の一部を前倒し、2026-10-27）

試遊で「git checkout で元に戻すのは普通に欲しい」「git やコマンドラインの機能をもう少し」と言われたので足した。

足した git のコマンド：

| コマンド | 対応したこと |
|---|---|
| `checkout [<commit>] [--] <file>` | 作業ツリーを index（コミットを指定したら index も）の内容に戻す。`--ours` / `--theirs`。`--` なしのときだけ「Updated N paths from …」を出す（本物と同じ。数は実際に書き換えたファイルだけ。コミットから戻したときは、その tree の短縮ハッシュ） |
| `restore <file>` | `--staged`、`--worktree`、`--source` / `-s`、`--ours` / `--theirs`。元にないファイルは消す（no-overlay） |
| `reset` | `--soft` / `--mixed`（既定）/ `--hard`、`reset [<commit>] [--] <file>`（ステージから降ろす）。マージの途中をやめる。`ORIG_HEAD` を書く |
| `diff` | 作業ツリーと index、`--staged` / `--cached`、`<commit>`、`A B`、`A..B`、`-- <path>`、`--stat`、`--name-only`、`--name-status`。コンフリクト中の `--staged` は `* Unmerged path` |
| `show` | コミットの見出しと差分、`--stat`、`--name-only`、`--name-status`、`--oneline`、`-s`、`REV:path`（ファイルの中身） |
| `rm` | `--cached`、`-r`、`-f`、`-q`。手元の変更やステージ済みの変更があれば止める |
| `mv` | ファイル1つの名前の変更と、フォルダの中への移動 |

- `ORIG_HEAD`：merge（早送り・マージコミット・コンフリクト）、pull、reset で書く。`MERGE_HEAD` もリビジョンとして使える
- `status`：同じ中身のまま名前を変えたファイル（ステージ済みの削除と追加）を `R  old -> new` / `renamed:` と表示する
- 差分（`src/engine/diff/unified.ts`）：Myers の O(ND) 法。文脈3行、近いハンクのまとめ、`,1` の省略、`\ No newline at end of file`、見出しの関数名（英字・`_`・`$` で始まる行。80バイトまで）を xdiff に合わせた
- 意味イベントを追加した：`FILES_UNSTAGED`、`CHANGES_DISCARDED`（どのオブジェクトにも残っていない内容を消した。`reset --hard` と `.` の指定は bulk）、`RESET`、`FILES_REMOVED`、`FILE_MOVED`
- 危険：`CHANGES_DISCARDED` が bulk のときだけ `UNCOMMITTED_CHANGES_DISCARDED`。ファイルを指定した取り消しは、わかってやっている操作なので危険にしない

シェル：`echo`、`touch`、`mkdir`、`rm`（`-r` / `-f`、`rm -rf .git` でリポジトリごと消える）、`mv`、`cp`（`-r`）、`ls <dir>`、`cat`。出力のリダイレクト `>` / `>>` は、どのコマンドにも使える。パイプ（`|`）、`&&`、`;` は「まだ使えません」と伝える。

- フォルダはファイルのパスから決まるので、リポジトリの中の空のフォルダは作れない（`mkdir` は「中にファイルを作ると現れます」と伝える）。リポジトリの外（ホームなど）では、新しいフォルダとして作り、`cd` して `git init` できる
- リポジトリの中のフォルダには `cd` できない（git のコマンドはルートで実行する作り）。そう伝える

突き合わせテスト（`tests/golden/undo.test.ts`、28件）で、上の git のコマンドの出力・終了コード・index・作業ツリーが本物と一致することを確かめた。シェルは `src/engine/shell.test.ts`。

まだ違う点・未対応のもの：

- `checkout -m` / `restore --merge`（コンフリクトの印を作り直す）、`reset --merge` / `--keep`
- コンフリクト中の `git diff`（diff --cc）。マージコミットの `git show` は見出しだけ（手で直したファイルがあれば、その旨を git-sensei として伝える）
- 差分に indent heuristic がないので、同じ行が続くところへの挿入などでは、ハンクの区切りが本物と違うことがある
- 名前の変更の検出は、中身がまったく同じときだけ
- `revert`、`reflog`、`stash`、`rebase`、`cherry-pick`、`tag` は、まだ未対応

画面では、つまずきやすいエラー（空のコミットメッセージ、push の拒否、コンフリクトなど）のあとに、日本語のひとこと（「ヒント：」）を添える（`src/ui/components/terminal/explain.ts`）。git の出力そのものは変えない。
