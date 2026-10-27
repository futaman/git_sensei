# シナリオ集：章立てと各ステージの素材

ステータス：案（演出側から実装者へ）／2026-10-26

> **この文書の位置づけ**
> - 1本目の「金曜17:45、定時前の push」（`src/scenarios/friday-push/`）と同じ粒度で、ほかのステージの素材をまとめたもの
> - **今すぐ作れる**（◎）ステージには、`lines.ja.ts` にそのまま入れられる素材を全部つけた
> - M5（取り消し系）や、その後（rebase / stash / cherry-pick）を待つステージ（○ △）は、設計だけ書いた
> - 2026-10-27：エンジンに reset / restore / rm / diff / show / checkout -- <file> とシェルが入った（docs/02 §5）。2-4・2-5・3-2 が今すぐ作れるようになったので、素材をつけて 3章に移した
> - キャラクターの声は docs/06 の 3章、見た目は 6章に従う

## 1. ゲーム性を保つための決まり

「チュートリアルに見えないこと」を、どのステージにも求める。次の5つを**全部**入れる。

| # | 要素 | 中身 | お手本 |
|---|---|---|---|
| K1 | 一目でわかる目的 | 「今日のしごと」カードと締切。目的は1行で書ける | friday-push の「calc.ts の修正を main に入れる 〆 18:00」 |
| K2 | 楽に見える誘惑 | **間違ったほうが手数が少なく見える**道を、必ず1つ置く。『Good Job!』の「壁を壊せば早い」 | `push --force` で押し切る |
| K3 | 途中で状況が動く | プレイ中に1回、NPC の操作か知らせで状況が変わる。手順をなぞるだけでは終わらない | 締切が早まる、NPC が push する |
| K4 | 取り返せる | どの失敗からも、戻る道か「やり直す」がある。失敗した後の結末も用意する | friday-push の救済（docs/04 §12.4） |
| K5 | 上手さの余地 | par、スマート解、隠しの結末のどれか。2周目を遊ぶ理由になる | `--amend`、`switch -c` |

それ以外の目安：

- 1本は**3〜6分**、par は**2〜7手**
- 新しく覚えるコマンドは、1本につき**2つまで**
- **出力を読めば解ける謎**を、なるべく1つ入れる（`git log` の作者、`git status` の「HEAD detached」、`git switch` の警告）。見るコマンドはタダなので、「調べる人が得をする」ゲームになる
- 結末は**最低3種類**：上手にできた／普通／やらかしてから直した。できれば隠しを1つ
- NPC がコマンドを打つのは、学習者のコマンドとコマンドの間だけにする（カットインや入力の最中には動かない）

## 2. 章立て

| 章 | ステージ | 新しく覚えること | 型 | 作れる時期 |
|---|---|---|---|---|
| 1 新人編 | 1-1 入社初日、犯人は log の中 | clone, log | 体験 | ◎ 今すぐ |
| | 1-2 月曜9:55、朝会の前に | add, commit, push, `--amend` | 体験 | ◎ 今すぐ |
| | 1-3 火曜14:00、今日から main は保護 | switch -c, push -u | 体験 | ◎ 今すぐ |
| | 1-4 金曜17:45、定時前の push | pull, コンフリクト | 実戦 | ✅ 実装済み |
| 2 独り立ち編 | 2-1 デモ5分前 | detached HEAD, 出力を読む | 実戦 | ◎ 今すぐ |
| | 2-2 先輩の force push | fetch, `--force-with-lease` の限界 | 実戦 | ◎ 今すぐ |
| | 2-3 トップページに矢印 | 直すコミット、障害対応 | 実戦 | ◎ 今すぐ |
| | 2-4 本日26時リリース | reset, rm --cached | 実戦 | ◎ 今すぐ |
| | 2-5 職務経歴書 | rm --cached と rm の違い | 実戦 | ◎ 今すぐ |
| 3 先輩編 | 3-1 田中の3時間 | reflog | 実戦 | ○ reflog の後 |
| | 3-2 .env が漏れた | 履歴より先に、キーを無効にする | 実戦 | ◎ 今すぐ |
| | 3-3 3月31日深夜 | revert -m 1 | 実戦 | ○ revert の後 |
| | 3-4 stash の地層 | stash list / show / pop | 実戦 | △ stash の後 |
| | 3-5 金曜18:52の hotfix | cherry-pick | 実戦 | △ cherry-pick の後 |
| 外伝 | やらかし道場 | 危険の体験と始末書の収集 | 体験 | ◎ 今すぐ |

- 1章は1日ずつ進む（月→火→…→金）。金曜の friday-push が章の締めになる
- 1-2 で main に直接 push できたのが、1-3 で禁止される。「昨日まで許されたことが今日から禁止」が職場らしさで、ブランチを使う理由にもなる

### 2.1 ゲーム性のチェック

| ステージ | K1 目的 | K2 誘惑 | K3 状況の変化 | K4 取り返し | K5 上手さ |
|---|---|---|---|---|---|
| 1-1 | 犯人を報告 | いちばん新しいコミットを犯人にする | 部長が黙り込む | 答え直せる | 「わかりません」の隠し結末 |
| 1-2 | README を直す | `-m "修正"` | 部長が「ついでに」を足す | push 前なら amend | `--amend`、朝会での読み上げ |
| 1-3 | ブランチで出す | main で commit して push | レビュー会が10分早まる | push 前ならブランチに逃がせる | `switch -c` |
| 1-4 | main に入れる | `--force` | （NPC は開始前に push 済み） | 直すコミット、チェックポイント | par 5 |
| 2-1 | demo に出す | いきなり `switch demo` | 取引先が1人ずつ待機室に入る | 警告のハッシュから救出 | par 4、迷子なしの結末 |
| 2-2 | 消えた修正を戻す | `--force` でやり返す | `--force-with-lease` が止める／止めない | チェックポイント | 報告の選び方で4つの結末 |
| 2-3 | 矢印を消す | 恥ずかしいコミットを amend して `--force` | 田中が main に push してくる | 直すコミット | 損害額が少ないほど上 |
| 2-4 | 26時までに1コミットで出す | そのまま push（18分かかる）、`reset --hard` | 眠気、後輩が起きてのぞく | `reset --hard ORIG_HEAD` | `rm --cached` ＋ amend の3手、memo.txt の隠し結末 |
| 2-5 | 部長の pull の前に出す | そのまま push | 部長の「pull 中…」が進む | `--cached` を忘れて消したファイルを戻す | 3手、田中に見られない |
| 3-2 | 漏れたキーを止める | 履歴を消して `--force` で「なかったことに」 | 検出ボットの通知、早瀬が push してくる | 周知してからの `--force-with-lease` は許可 | 初動の順番、田中へのフォロー |

## 3. 今すぐ作れるステージ（素材つき）

各ステージは friday-push と同じ並びで書く：状況 → 初期状態 → ゴールと par → 誘惑 → 状況の変化 → 結末 → 素材（`lines.ja.ts`）→ エンジンとシナリオへの要望。

---

### 1-1 入社初日、犯人は log の中

**状況**：入社初日。リポジトリはまだ手元にない。昨夜から、トップページの合計金額が `NaN` になっている。

**初期状態**（origin の `shop-app`、main の履歴。上が新しい）

| コミット | 作者 | 日時 | 中身 |
|---|---|---|---|
| `e5…` docs: README を更新 | 早瀬 | 今朝 9:02 | README.md だけ |
| `d4…` とりあえず | 黒岩 | 昨日 23:41 | src/cart.ts の合計を壊す（`reduce` の初期値が `undefined` になる） |
| `c3…` 料金改定：手数料率を3.6%に | 田中 | 昨日 15:20 | src/payment/calc.ts |
| `b2…` feat: カートに合計金額を表示 | 早瀬 | 3日前 | src/cart.ts |
| `a1…` init | 早瀬 | 3週間前 | — |

- **謎の解き方**：田中が「18時には動いていた」と言う。だから犯人は18時より後のコミット（d4 と e5）。e5 は README しか触っていない（メッセージから推測できる）ので、犯人は d4
- 一番新しい e5（早瀬）を犯人にするのが、**楽に見える誘惑**
- `git log --oneline` だと作者と時刻が見えない。このステージでは**スマート解にしない**。「短い表示が、いつも上手いとは限らない」

**ゴール**：clone して、`#dev` で犯人のコミットを選んで報告する（チャットの選択肢）。選択肢は、学習者が `git log` を1回打った後に出す
**par**：2（clone、cd。log は観測なのでタダ）

**結末**

| 条件 | 流れ |
|---|---|
| 正解（d4） | 黒岩が「入力中…」を2回出しては消す → 「…俺だ。よく見てるな」→ 田中「（部長も「とりあえず」って書くんだ…）」→ 早瀬「ようこそ、うちのチームへ」 |
| 田中（c3）を選んだ | 田中「えっ、僕ですか…」（信頼 −10）→ 黒岩「…ちがう」→ もう一度選べる |
| 早瀬（e5）を選んだ | 早瀬「README で合計は壊れないって」→ もう一度選べる |
| 隠し：「わかりません」 | 黒岩「わからないと言えるのは悪くない」（機嫌 +5）→ 早瀬「時刻を見てみ。18時には動いてたんでしょ？」→ もう一度選べる |

```ts
export const MISSION = { task: '昨日 main を壊したコミットを見つけて報告する', due: '10:30' }

export const INTRO = [
  { from: 'boss', text: '初日で悪いが、トップの合計が NaN になってる。どのコミットからか調べて、ここに書け' },
  { from: 'kouhai', text: '昨日の18時に見たときは、ちゃんと動いてました！' },
  { from: 'senpai', text: 'リポジトリは git clone https://git.example.com/shop-app.git ね。見るだけのコマンドは何回打ってもタダだよ' },
]

export const LINES = {
  'senpai.idle': [
    'clone したら、cd shop-app で中に入ってみ',
    'git log で、誰がいつ何をしたか全部見えるよ',
    '田中は「18時には動いてた」って言ってたよね',
  ],
  'hint.clone': ['チャットの URL を git clone に渡す。リポジトリが丸ごと手元に来るよ'],
  'hint.cd': ['clone したら shop-app ってフォルダができてる。cd shop-app'],
  'hint.log': ['git log。Author と Date をよく見てみ'],
  'hint.answer': ['18時より後のコミットは2つ。README だけのほうは、合計を壊せないよね'],
  'milestone.cloned': ['わ、全部来た'],                       // 田中
  'milestone.sawLog': ['（コミットが5個…）'],                 // 田中
  'kouhai.observeLoop': ['…迷ってます？', '（さっきと同じ画面だ）'],
  'kouhai.oneline': ['（--oneline だと、誰が書いたか見えないんだ）'],
  'answer.wrong.kouhai': ['えっ、僕ですか…'],
  'answer.wrong.kouhai.boss': ['…ちがう'],
  'answer.wrong.senpai': ['README で合計は壊れないって'],
  'answer.dontKnow': ['わからないと言えるのは悪くない'],     // 黒岩
  'ending.bossConfess': ['…俺だ。よく見てるな'],
  'ending.kouhaiWhisper': ['（部長も「とりあえず」って書くんだ…）'],
  'ending.welcome': ['ようこそ、うちのチームへ'],              // 早瀬
}

export const CHOICES = [
  { id: 'answer.d4', text: 'd4… 「とりあえず」（黒岩）' },
  { id: 'answer.c3', text: 'c3… 「料金改定：手数料率を3.6%に」（田中）' },
  { id: 'answer.e5', text: 'e5… 「docs: README を更新」（早瀬）' },
  { id: 'answer.unknown', text: 'わかりません' },
]
```

**要望**
- チャットの選択肢を「git log を打った後」に出す条件（マイルストーン `sawLog` で出す）
- 選択肢の効果（信頼・機嫌）と、選び直しができること
- 危険はなし。体験型で、機嫌は動かさなくてよい（正解の +5 だけ）

---

### 1-2 月曜9:55、朝会の前に

**状況**：README.md のインストール手順に `git clnoe` という誤字がある。10時の朝会で、部長が今週のコミットを画面共有で読み上げる。

**初期状態**：clone 済みで origin と同じ。main への直接 push は**このステージでは許可**（保護は 1-3 から）

**ゴール**：origin/main の README.md が `git clone` になっていて、CONTRIBUTING.md も直っている（下の「状況の変化」）
**par**：3（add、commit、push）。状況の変化の後は、`--amend` なら +1、直すコミットなら +2

**誘惑**：`git commit -m "修正"`。短くて楽。朝会で読み上げられる

**状況の変化**：最初の commit をした直後に、部長がチャットで追加する
> 黒岩「ついでに CONTRIBUTING.md の『コミットメッセージは自由』も直しとけ。自由じゃない」

- 正解は「コミットメッセージには、何をなぜ変えたかを書く」に書き換える（文言は自由。「自由」の文字が消えていればよい）
- push 前なら、`git add` → `git commit --amend` で1つにまとめるのが**スマート解**（+8）。新しいコミットを足しても減点しない
- **罠**：先に push してから amend すると、push が拒否される。そこで `--force` すると `HISTORY_REWRITTEN_ON_SHARED_BRANCH`

**結末**（10:00 の朝会、または両方 push したとき）

| 条件 | 流れ |
|---|---|
| 両方直して、メッセージがまとも | 黒岩が log を読み上げる「"{message}"。…読める。次」 |
| メッセージが「修正」など | 黒岩「"修正"。…以上」→ 田中「（朝会の空気が止まった）」 |
| CONTRIBUTING が間に合わない | 黒岩「CONTRIBUTING は」→ 早瀬「（あとでいいから、やっとこ）」 |
| 10時に間に合わない | （朝会が始まった。画面共有に、あなたの push はまだない） |
| 隠し：CONTRIBUTING に自分の言葉で書いた | 黒岩「…この文、誰が書いた」→ 田中「先輩です！」→ 黒岩「…そうか」 |

```ts
export const MISSION = { task: 'README の誤字を直して main に push する', due: '10:00 朝会' }

export const INTRO = [
  { from: 'boss', text: '10時の朝会で、今週のコミットを読み上げる。README の clnoe、直しておけ' },
  { from: 'kouhai', text: 'clnoe…（打ちそう）' },
  { from: 'senpai', text: 'エディタで直したら、add → commit → push ね。メッセージは朝会で読まれるよ' },
]

export const LINES = {
  'senpai.idle': [
    'README.md を開いて、clnoe を直してみ',
    'git status で、何が変わったか見えるよ',
    'commit のメッセージ、朝会で読まれるからね',
  ],
  'hint.edit': ['README.md の clnoe を clone に。保存したら git status で確認'],
  'hint.add': ['git add README.md。commit に入れるものを選ぶ'],
  'hint.commit': ['git commit -m "docs: README の clone の綴りを修正" みたいに、何を直したか書く'],
  'hint.push': ['git push。main に出る'],
  'hint.amend': ['まだ push してないなら、git add してから git commit --amend で1つにまとめられるよ'],
  'hint.pushAll': ['あとは git push'],
  'boss.addMore': ['ついでに CONTRIBUTING.md の『コミットメッセージは自由』も直しとけ。自由じゃない'],
  'kouhai.smart': ['amend って、さっきのコミットに足せるんですね'],
  'senpai.afterPushAmend': ['push した後の amend は、履歴が分かれるよ。今回は新しいコミットを足そ'],
  'milestone.committed': ['（コミットした…！）'],             // 田中
  'boss.danger.BAD_COMMIT_MESSAGE': ['朝会で読むぞ、それ'],
  'ending.readOk': ['"{message}"。…読める。次'],
  'ending.readBad': ['"修正"。…以上'],
  'ending.readBadKouhai': ['（朝会の空気が止まった）'],
  'ending.contribMissing': ['CONTRIBUTING は'],
  'ending.contribMissingSenpai': ['（あとでいいから、やっとこ）'],
  'ending.late': ['（朝会が始まった。画面共有に、あなたの push はまだない）'],
  'ending.hidden.boss1': ['…この文、誰が書いた'],
  'ending.hidden.kouhai': ['先輩です！'],
  'ending.hidden.boss2': ['…そうか'],
}
```

**要望**
- セリフ中の `{message}` を、実際のコミットメッセージ（1行目）に差し替える。無理なら `ending.readOk` は「…読める。次」だけでよい
- 「コミットした直後に部長が発言する」きっかけ（マイルストーン `committed` で note を出す）
- 隠し結末の判定：CONTRIBUTING.md の新しい文が、ヒントの例文と違い、10文字以上ある

---

### 1-3 火曜14:00、今日から main は保護

**状況**：`src/receipt.ts`（レシート機能）を書き終えたところ。まだ commit していない。いまいるのは main。今日から main への直接 push は禁止。

**初期状態**：main に、未追跡の `src/receipt.ts` と、変更済みの `src/index.ts`（receipt を読み込む1行）。保護ブランチは `main`

**ゴール**：origin に `feature/receipt`（名前は `feature/` で始まればよい）があり、2ファイルの変更が入っている。origin/main は変わっていない
**par**：4（switch -c、add、commit、push -u）

**誘惑**：いつもどおり main で add → commit → push。`DIRECT_PUSH_TO_PROTECTED`

**出力を読む場面**：`-u` なしで push すると、本物どおり `fatal: The current branch feature/receipt has no upstream branch.` と、`git push --set-upstream origin feature/receipt` の提案が出る。それを打てば進める（エラー1回ぶんの時間がかかるだけ）

**取り返し**：main で commit してしまっても、push 前なら `git switch -c feature/receipt` でそのコミットごとブランチに移れる。ローカルの main が1つ進んだまま残るが、ゴールには関係ない（先輩がそう言う）

**状況の変化**：14:15 に部長が「レビュー会、14:20 からにする」。締切が10分早まる

**結末**

| 条件 | 流れ |
|---|---|
| ブランチで出せた | レビュー依頼のカード「feature/receipt → main」が出る → 黒岩「…ブランチ名がいい」 |
| main で commit してから逃がした | 早瀬「ローカルの main が1個進んだままだけど、それは reset を覚えたら直そ」 |
| main に push した | 黒岩「レビュー会で見るものが、もう main に入ってるな」 |
| 隠し：`switch -c` を使い、エラーなし | 田中「先輩、1回もエラー出してない…」 |

```ts
export const MISSION = { task: 'レシート機能を feature ブランチで push する', due: '14:30 レビュー会' }

export const INTRO = [
  { from: 'boss', text: '今日から main は保護する。直接 push するな。ブランチを切って、レビューに出せ' },
  { from: 'senpai', text: 'ブランチ名は feature/ から始めてね。feature/receipt とか' },
  { from: 'kouhai', text: '先輩、もう main で書いちゃってません…？' },
]

export const LINES = {
  'senpai.idle': [
    'git status。いま、どのブランチにいる？',
    'まだ commit してない変更は、ブランチを切っても一緒についてくるよ',
    'git switch -c で、作って移るのが一発でできる',
  ],
  'hint.branch': ['git switch -c feature/receipt。変更はそのまま持っていける'],
  'hint.add': ['git add で2つとも選ぶ。git status で確認しながらね'],
  'hint.commit': ['git commit -m "feat: レシートを発行できるようにする" みたいに'],
  'hint.push': ['初めての push は git push -u origin feature/receipt。-u で次から git push だけで済む'],
  'hint.rescue': ['main で commit しちゃったなら、push する前に git switch -c feature/receipt。コミットごと移れるよ'],
  'kouhai.smart': ['作って移るの、1回でできるんですね'],
  'kouhai.noUpstream': ['（エラーの中に、打つべきコマンドが書いてある…）'],
  'boss.moveUp': ['レビュー会、14:20 からにする'],
  'boss.danger.DIRECT_PUSH_TO_PROTECTED': ['main に直接か。レビューは'],
  'senpai.rescued': ['ローカルの main が1個進んだままだけど、それは reset を覚えたら直そ'],
  'ending.review': ['…ブランチ名がいい'],
  'ending.directPush': ['レビュー会で見るものが、もう main に入ってるな'],
  'ending.noError': ['先輩、1回もエラー出してない…'],
}
```

**要望**
- 時刻で部長が発言するきっかけ（作中 14:15）と、締切を変える仕組み
- ゴールの判定で、ブランチ名を「`feature/` で始まる」で受ける

---

### 2-1 デモ5分前

**状況**：15時から取引先デモ。昨夜、v1.2 の画面を見るために過去のコミットへ移動し、そのままそこでボタンの文言を直してコミットした。demo 環境は、origin の `demo` ブランチから自動で出る。

**初期状態**
- コミット V（v1.2）：ローカルの `demo`、origin/demo、どちらもここ
- コミット F「fix: 購入ボタンを『カートに入れる』に」：親は V。**HEAD は F で detached**（どのブランチにも入っていない）
- main はもっと先に進んでいる（デモには使わない）

**ゴール**：origin/demo が F を含む
**par**：4（`switch -c demo-fix` → `switch demo` → `merge demo-fix` → `push`）

**誘惑（迷子の罠）**：いきなり `git switch demo`。一番自然に見えるが、F がどのブランチからもたどれなくなる（`COMMITS_ORPHANED`）
- 本物どおり `Warning: you are leaving 1 commit behind…` と、`git branch <new-branch-name> <hash>` の提案が出る（実装済み）
- **出力を読めば救える**：`git branch rescue <hash>` → `git merge rescue` → `git push`

**出力を読む場面**：最初に `git status` を打つと `HEAD detached at …` と出る。先輩の導入がそこへ導く

**状況の変化**：作中1分ごとに、待機室の取引先が1人ずつ増える（ヘッダーの横に人のアイコン）。14:58 に部長「…まだか」

**結末**

| 条件 | 流れ |
|---|---|
| 迷子にせず間に合った | 取引先（システムの1行）「このボタン、わかりやすいですね」→ 黒岩「…よし」 |
| 迷子にしてから救った | 早瀬「出力に書いてあったでしょ？ git はちゃんと教えてくれてる」→ 黒岩「…よし」 |
| 間に合わない | 黒岩「…v1.2 の画面でデモした」→ 田中「（ボタンの文字、古いままだった…）」 |

```ts
export const MISSION = { task: '昨夜の修正を demo 環境に出す', due: '15:00 デモ開始' }

export const INTRO = [
  { from: 'boss', text: '15時から取引先デモだ。昨日の修正、demo に出てるな？' },
  { from: 'kouhai', text: '待機室に、もう1人入ってきました' },
  { from: 'senpai', text: 'git status、見てみ。いまどこにいる？' },
]

export const LINES = {
  'senpai.idle': [
    'git status の1行目、読んでみ',
    'detached って、どのブランチにも乗ってないってこと',
    'そのコミット、まずブランチに乗せてあげよ',
  ],
  'hint.status': ['git status。いまどこにいるか、1行目に書いてある'],
  'hint.branch': ['git switch -c demo-fix。いまのコミットに名前をつけて乗る'],
  'hint.toDemo': ['名前がついたら git switch demo'],
  'hint.merge': ['git merge demo-fix で、修正を demo に取り込む'],
  'hint.push': ['git push。demo 環境に出るよ'],
  'hint.rescue': ['さっきの Warning に、ハッシュと git branch の打ち方が書いてあるよ'],
  'kouhai.orphaned': ['…いま、昨日の修正、どこ行きました？'],
  'senpai.afterOrphan': ['大丈夫、まだ消えてない。出力をよく読んで'],
  'kouhai.waiting': ['待機室、{n}人になりました'],
  'boss.deadlineUrgent': ['…まだか'],
  'milestone.onBranch': ['あ、ブランチに乗った'],             // 田中
  'ending.client': ['（取引先：このボタン、わかりやすいですね）'],
  'ending.onTime': ['…よし'],
  'ending.rescued': ['出力に書いてあったでしょ？ git はちゃんと教えてくれてる'],
  'ending.late': ['…v1.2 の画面でデモした'],
  'ending.lateKouhai': ['（ボタンの文字、古いままだった…）'],
}

export const REPORTS = {
  COMMITS_ORPHANED: {
    title: 'detached HEAD のコミットを置き去りにしたことについて',
    what: 'どのブランチにも入っていないコミット「fix: 購入ボタンを『カートに入れる』に」があるまま、git switch demo で移動した',
    why: 'detached HEAD で作ったコミットは、ブランチから外れている。移動すると、どこからもたどれなくなり、log にも出なくなる',
    howToFix: '移動したときの Warning にハッシュが出ている。git branch <名前> <ハッシュ> でブランチにすれば戻る。見失っても、しばらくは reflog に残っている',
    prevention: 'detached HEAD でコミットしたら、移動する前に git switch -c <名前> でブランチに乗せる',
    bossWord: '警告は読め。git は、言ってくれてる',
  },
}
```

**要望**
- 初期の world を detached HEAD で作る
- `COMMITS_ORPHANED` を危険の種類に足す（重さ minor、ヤバ度 Lv2 冷や汗）。救えたら始末書は「救出済み」の印つきにすると、図鑑が楽しくなる
- 待機室の人数（`{n}`）を、作中の時刻から出す

---

### 2-2 先輩の force push

**状況**：`feature/coupon` は早瀬先輩と2人で使っているブランチ。あなたの修正「fix: クーポンの期限切れ判定」は昨日 push した。今朝、早瀬先輩が `--force` で push した。

**初期状態**
- ローカルの feature/coupon：A → B → X（あなたの修正。src/coupon/expire.ts）
- ローカルの origin/feature/coupon：X（**まだ fetch していないので、古いまま**）
- 本当の origin の feature/coupon：A → B → C（早瀬「feat: クーポンの見た目」。src/coupon/ui.ts）。**X は消えている**
- X と C は別のファイルなので、マージしてもコンフリクトしない

**ゴール**：origin/feature/coupon が X と C の両方を含む。さらに、`#dev` で早瀬先輩に何か伝える（チャットの選択肢。選んだものによって結末が変わる）
**par**：2（pull --no-rebase、push）＋報告

**調べる場面**：`git fetch` → `git log origin/feature/coupon` で X がないことを自分の目で確かめられる（観測なのでタダ）
- 最初に `git status` を打つと「origin と同じ（up to date）」と出る。fetch するまで、手元の origin の記録は古いまま。**status は fetch した時点の origin しか知らない**、を体験させる。田中「え、同じって出てますけど…？」

**誘惑**：「やり返す」`git push --force`。C が消えて、こんどは自分が `FORCE_PUSH_OVERWROTE` を起こす（二重事故）

**`--force-with-lease` の授業**（このステージの山場）
- fetch する前に `--force-with-lease` すると、**拒否される**（ローカルの origin/feature/coupon は X なのに、本当は C だから）。先輩「お、lease が止めてくれたね」
- fetch した後に `--force-with-lease` すると、**通ってしまい C が消える**。lease は「知らない変更」を守るだけで、知った後で消すのは止めない
- 先輩の hint でこの違いを言う。本物の git と同じ挙動（エンジンの `stale-info` で実装済み）

**状況の変化**：pull すると、田中が「先輩、マージコミットができてます。これで両方入ったんですか？」と聞いてくる。ここで log を見て確かめると、信頼が上がる（危険の前の観測と同じ +3）

**報告の選択肢と結末**

| 選択肢 | 結末 |
|---|---|
| A「消えてたので、マージして戻しておきました。次は --force-with-lease でお願いします」 | 早瀬「…助かった。今度おごる」→ 田中「（直してから言うの、かっこいい）」（いちばん良い） |
| B「先輩の --force で、クーポンの修正が消えてました」 | 早瀬「うわ、ごめん。マジか」→ 早瀬「次から気をつける」（普通） |
| C 何も言わない | 結末の後に1行「（翌週の月曜、また消えていた）」（隠しの悪い結末。笑えるように） |
| D「部長に報告します」 | 黒岩「…早瀬、ちょっといいか」→ 早瀬「…言ってくれるじゃん」（正しいが、角が立つ） |
| `--force` でやり返した後 | 黒岩「force push の応酬をするな」→ チェックポイントに戻る |

```ts
export const MISSION = { task: 'origin から消えたクーポンの修正を取り戻す', due: '12:00 昼休み' }

export const INTRO = [
  { from: 'kouhai', text: '先輩、昨日のクーポンの修正、origin に見当たらないんですけど…' },
  { from: 'senpai', text: '朝ちょっと push 弾かれたから、--force で入れといた。なんかあった？' },
  { from: 'boss', text: '昼までに feature/coupon をレビューに出せ' },
]

export const LINES = {
  'senpai.idle': [
    'git fetch してから、origin の log を見てみ',
    '手元のと origin の、何が違う？',
    'どっちも残すなら、取り込んでから push だよね',
  ],
  'hint.fetch': ['git fetch。origin の今を、手元に持ってくる'],
  'hint.compare': ['git log origin/feature/coupon。おまえの修正、ある？'],
  'hint.pull': ['git pull --no-rebase で、俺のとおまえのを合わせる'],
  'hint.push': ['マージできたら git push'],
  'hint.report': ['直したら、#dev でひとこと言っとくと、次から起きにくいよ'],
  'hint.lease': ['lease は「知らない変更」を守るだけ。fetch した後に打つと、知ってて消すことになる'],
  'senpai.leaseStopped': ['お、lease が止めてくれたね'],
  'kouhai.askMerge': ['先輩、マージコミットができてます。これで両方入ったんですか？'],
  'kouhai.observeBeforeDanger': ['確認してから打つんですね'],
  'kouhai.danger': ['…先輩、それ、やり返してません？'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['force push の応酬をするな'],
  'senpai.overwritten': ['あれ、俺のコミット消えた？'],
  'ending.A.senpai': ['…助かった。今度おごる'],
  'ending.A.kouhai': ['（直してから言うの、かっこいい）'],
  'ending.B.senpai': ['うわ、ごめん。マジか', '次から気をつける'],
  'ending.C': ['（翌週の月曜、また消えていた）'],
  'ending.D.boss': ['…早瀬、ちょっといいか'],
  'ending.D.senpai': ['…言ってくれるじゃん'],
}

export const CHOICES = [
  { id: 'report.fixedAndAdvise', text: '消えてたので、マージして戻しておきました。次は --force-with-lease でお願いします', trust: 5 },
  { id: 'report.fact', text: '先輩の --force で、クーポンの修正が消えてました' },
  { id: 'report.silent', text: '（何も言わない）' },
  { id: 'report.boss', text: '部長に報告します', mood: 5 },
]

export const REPORTS = {
  FORCE_PUSH_OVERWROTE: {
    title: 'force push のやり返しによる、先輩のコミットの消失について',
    what: '自分のコミットを消されたあと、git push --force で origin/feature/coupon を上書きし、早瀬さんのコミット「feat: クーポンの見た目」を消した',
    why: '消されたものを、消し返しても戻らない。消える人が入れ替わるだけ。共有ブランチの force push は、相手の手元とも食い違わせる',
    howToFix: '早瀬さんの手元には、まだコミットが残っている。push し直してもらい、自分は pull（マージ）してから push する',
    prevention: '取り込んでから push する。上書きが必要なときは --force-with-lease。ただし fetch した後の lease は、知っている変更を消すのを止めない',
    bossWord: 'やられても、やり返すな。取り込め',
  },
}
```

**要望**
- 初期の world で、「ローカルの origin/feature/coupon は古い」状態を作る（開始前に NPC の force push を1回打てば作れる）
- 報告はゴールの1つにする（選ぶまでクリアしない）。選ぶのは push の前でも後でもよい
- 「C 何も言わない」は、結末の画面の最後に1行だけ出す

---

### 2-3 トップページに矢印

**状況**：昨日の自分のマージで、トップページに `<<<<<<<` が出ている。main に push すると自動で本番に出る。問い合わせが作中1分ごとに1件増える。

**初期状態**
- origin/main の `src/pages/index.html` に印が残っている
  ```
  <<<<<<< HEAD
  <h1>冬のセール</h1>
  =======
  <h1>WINTER SALE</h1>
  >>>>>>> feature/english
  ```
- `src/pages/en/index.html` には `<h1>WINTER SALE</h1>` が正しく入っている（英語は英語ページのもの、という手がかり）
- ローカルは origin と同じ。main は保護しているが、障害対応なので**このステージだけ main への直接 push を許可**する（部長がそう言う）

**ゴール**：origin/main の index.html から印が消え、`冬のセール` が残っている
**par**：3（add、commit、push）。状況の変化の後は +2（pull、push）

**探す場面**：どのファイルかは、問い合わせの文面「トップページに矢印」から探す。`ls src/pages` と `cat` で見つける（観測なのでタダ）

**誘惑**：「恥ずかしいコミットを消したい」。印の入ったマージコミットを `--amend` で直して `--force` で push すると、履歴が書き換わる（`HISTORY_REWRITTEN_ON_SHARED_BRANCH`）。状況の変化の後なら、田中のコミットも消える（`FORCE_PUSH_OVERWROTE`）

**状況の変化**：学習者が commit した直後に、田中が main に「fix: 送料の表示ゆれ」を push する。学習者の push は拒否される → pull → push（friday-push の復習）

**損害額**：問い合わせ1件につき ¥1,200（サポートの対応コスト）。結末で「問い合わせ 7件／対応コスト ¥8,400」と出す（docs/06 の 2.1 の損害額を、最初に見せる場所）

**結末**

| 条件 | 流れ |
|---|---|
| 作中5分以内 | 田中「問い合わせ、止まりました！」→ 黒岩「…早かったな」 |
| それより遅い | （問い合わせ {n} 件。サポートの佐藤さんが、静かにお茶を淹れている） |
| WINTER SALE を残した | 田中「日本語のページが、英語になってます…」（ゴールは未達。直すコミットで取り返す） |
| 履歴を書き換えた | 黒岩「矢印より、そっちのほうが問題だ」→ チェックポイントに戻る |

```ts
export const MISSION = { task: 'トップページの矢印を消して main に出す', due: '問い合わせが増える前に' }

export const INTRO = [
  { from: 'boss', text: 'トップページに矢印が出てる。昨日のマージだな。今回は main に直接でいい。急げ' },
  { from: 'kouhai', text: 'サポートから「お客様が、矢印が出ていると」…3件来てます' },
  { from: 'senpai', text: '落ち着いて。まず、どのファイルか探そ' },
]

export const LINES = {
  'senpai.idle': [
    'ls src/pages で、トップっぽいファイル探してみ',
    '英語のページ、別にあるよね？',
    '恥ずかしいコミットは、消すより直すほうが早いよ',
  ],
  'hint.find': ['src/pages/index.html。cat で中を見てみ'],
  'hint.fix': ['index.html は日本語のページ。冬のセールを残して、印は全部消す'],
  'hint.add': ['直したら git add'],
  'hint.commit': ['git commit -m "fix: トップページに残ったコンフリクトの印を消す"'],
  'hint.push': ['git push。本番に出るよ'],
  'hint.pull': ['田中が先に push したね。git pull --no-rebase で取り込んでから'],
  'senpai.noAmend': ['恥ずかしいコミットを消したい気持ちはわかる。でも main の履歴はみんなのもの'],
  'kouhai.inquiry': ['問い合わせ、{n}件になりました'],
  'kouhai.pushed': ['あ、僕も送料の表示ゆれ、いま main に入れました！'],
  'kouhai.wrongLang': ['日本語のページが、英語になってます…'],
  'boss.danger.HISTORY_REWRITTEN_ON_SHARED_BRANCH': ['矢印より、そっちのほうが問題だ'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['…田中のコミットは、どこに行った'],
  'ending.fast.kouhai': ['問い合わせ、止まりました！'],
  'ending.fast.boss': ['…早かったな'],
  'ending.slow': ['（問い合わせ {n} 件。サポートの佐藤さんが、静かにお茶を淹れている）'],
}
```

**要望**
- 問い合わせの件数（`{n}`）を作中の時刻から出し、結末で損害額にする
- 学習者の最初の commit をきっかけに NPC（田中）が push する
- このステージだけ、main への直接 push を危険にしない（`policy` で許可）

---

### 2-4 本日26時リリース

docs/04_spec_scenarios の 2章を、今のエンジンで作れる形にしたもの。

**状況**：木曜の深夜。部長は「26時までに出しといて。信じてるから」と言って帰った。田中は終電を逃して隣の席で寝ている。眠気のまま `git add . && git commit -m "ううう"` を打ってしまった（導入のカットシーン。`&&` は学習者には打たせない）

**初期状態**：ローカルの main に、まだ push していないコミット「ううう」が1つ。中身：

```
src/payment/calc.ts        ← 本命の修正
src/payment/calc.ts.bak
debug.log
node_modules/              （実体は20〜50ファイル程度でよい。セリフで数を言わない）
memo.txt                   「部長の"信じてる"は呪い」
```

- 作中の時計：25:30 開始、26:00 締切。`clockScale` 6（実時間5分）
- `.gitignore` はエンジンが未対応なので、ゴールに入れない（対応したら、K5 の加点にする）

**ゴール**：origin/main に、開始時の origin/main を親とする**コミットが1つだけ**増えていて、その中身は calc.ts の修正だけ（memo.txt は隠し結末として許す）。メッセージが「ううう」や BAD_COMMIT_MESSAGE でない
**par**：3（`git rm -r --cached node_modules debug.log src/payment/calc.ts.bak memo.txt` → `git commit --amend -m "…"` → `git push`）

ほかの正しいルート：
- `git reset HEAD~1`（mixed）→ `git add src/payment/calc.ts` → `git commit -m "…"` → `git push`（4手。mixed を使うのがスマート解）
- `git reset --soft HEAD~1` → `git restore --staged .` → `git add src/payment/calc.ts` → commit → push（5手）

**誘惑**
- そのまま `git push`。**作中18分かかる**（`durationOf` で、node_modules/ か debug.log を含む push を18分にする）。間に合うかもしれないが、中身はゴミだらけ（JUNK_STAGED、BAD_COMMIT_MESSAGE）
- `git reset --hard HEAD~1`。calc.ts の修正まで作業ツリーから消える。田中が飛び起きる。**`git reset --hard ORIG_HEAD` で戻せる**（reflog がなくても救える）

**状況の変化**
- 25:45 に田中が起きて画面をのぞく。以後、田中のつぶやきが出る（それまで信頼は動かない）
- 25:50 以降、ヘッダーの「エナドリ 残り1本」が光る（押すと作中1分使って、画面の暗さが戻る。見た目だけ）

**結末**

| 条件 | 流れ |
|---|---|
| 25:45 までに完了 | 朝 7:02、部長から「👍」だけ届く |
| 26:00 までに完了 | 田中「ギリギリでしたね…」→ 朝 7:02、部長「👍」 |
| 26:00 を過ぎた | 朝のメール「昨夜の件、10時に5分ください」 |
| memo.txt ごと push（隠し） | 朝、部長「memo.txt 読んだ。呪いを解きます。今日は定時で帰りなさい」 |
| `reset --hard` から救った | 田中「…いま、一回消えましたよね？」→ 早瀬（翌朝）「ORIG_HEAD、よく知ってたね」 |

```ts
export const MISSION = { task: 'calc.ts の修正だけを1コミットで push する', due: '26:00' }

export const INTRO = [
  { from: 'boss', text: '先に帰る。26時までに出しといて。信じてるから' },
  { from: 'kouhai', text: '（すぅ…すぅ…）' },
  { from: 'senpai', text: '（既読がつかない。もう寝てる）' },
]

export const LINES = {
  'senpai.idle': [],  // 先輩は寝ている。このステージは助け舟なし（ヒントボタンは、朝に読む先輩のメモという体で出す）
  'hint.look': ['（先輩のメモ）まず git show --stat。何が入っちゃったか見る'],
  'hint.rmCached': ['（先輩のメモ）git rm -r --cached でいらないのを外す。--cached を付ければ、ファイル自体は消えない'],
  'hint.amend': ['（先輩のメモ）外したら git commit --amend -m "fix: …" で、さっきのコミットを作り直す'],
  'hint.reset': ['（先輩のメモ）git reset HEAD~1 なら、コミットを取り消して中身は手元に残る'],
  'hint.push': ['（先輩のメモ）中身を git show --stat で確かめてから git push'],
  'hint.rescue': ['（先輩のメモ）reset --hard しちゃったら、git reset --hard ORIG_HEAD で直前に戻れる'],
  'kouhai.wake': ['…あれ、先輩まだいたんですか'],
  'kouhai.discarded': ['…いま、消えました？'],
  'kouhai.slowPush': ['（Writing objects: 3%…）', '先輩、これ何を送ってるんですか…？'],
  'kouhai.smart': ['--cached って、ファイルは残るんですね'],
  'boss.danger.JUNK_STAGED': ['（翌朝の部長）node_modules まで入ってるぞ'],
  'boss.danger.BAD_COMMIT_MESSAGE': ['（翌朝の部長）"ううう"って、何がだ'],
  'ending.early': ['👍'],
  'ending.close.kouhai': ['ギリギリでしたね…'],
  'ending.late': ['昨夜の件、10時に5分ください'],
  'ending.memo': ['memo.txt 読んだ。呪いを解きます。今日は定時で帰りなさい'],
  'ending.rescued.kouhai': ['…いま、一回消えましたよね？'],
  'ending.rescued.senpai': ['ORIG_HEAD、よく知ってたね'],
}
```

**要望**
- 部長の反応は、その場ではなく**翌朝**として結末の前にまとめて出す（部長は帰っている）。演出エンジンの機嫌は、プレイ中は動かさず、結末でまとめて反映する案
- `durationOf`：node_modules/ か debug.log を含む push を18分にする
- 先輩が寝ているので `senpai.idle` はなし。ヒントは「先輩のメモ」として出す

---

### 2-5 職務経歴書

**状況**：請求書の PDF 出力を作ってコミットした。`git add .` で、`転職/職務経歴書_2026.md` まで入っていた。まだ push していない。部長が「いまから pull してレビューする」と言った。

**初期状態**
- ローカルの main に、push 前のコミット「feat: 請求書を PDF で出力する」。中身は `src/invoice/pdf.ts` と `転職/職務経歴書_2026.md`
- 作業ツリーにも `転職/職務経歴書_2026.md` がある（自分の大事なファイル）
- 日本語のパスは Tab で補完できる。打ちにくければ `転職/` だけ打てば足りるルートにしておく

**ゴール**：origin/main に pdf.ts の変更が入り、`転職/` は入っていない。さらに、**作業ツリーに職務経歴書が残っている**（自分のファイルを消さない）
**par**：3（`git rm -r --cached 転職` → `git commit --amend --no-edit` → `git push`）

**誘惑**：そのまま `git push`。部長が pull して、結末は 1on1

**罠（`--cached` の授業）**：`git rm -r 転職`（`--cached` なし）を打つと、**作業ツリーからも消える**
- 田中「先輩、それ…ファイルごと消えましたよ」
- 戻し方：amend の前なら、まだ HEAD のコミットに入っているので `git restore --source HEAD 転職`（作業ツリーにだけ戻る。index からは外れたまま）。ゴールに「作業ツリーに残っている」を入れているので、取り返すまでクリアにならない
- amend した後は、元のコミットが reflog でしかたどれない（`commit --amend` は ORIG_HEAD を書かない）。reflog はまだ未対応なので、隠しの結末になる。reflog に対応したら、ここが「reflog で救う」の予告になる
- `reset --soft HEAD~1` のルートなら、reset が ORIG_HEAD に元のコミットを書く。消してから commit しても（commit は ORIG_HEAD を書かない）、`git restore --source ORIG_HEAD 転職` で戻せる。ルートによって救えるかどうかが変わるので、ヒントも分ける
- 初期状態に古い ORIG_HEAD を残さないこと（実装担当が対応する）。残っていると、ORIG_HEAD が別の場所を指してしまう

**状況の変化**：部長のアイコンに「pull 中…」の進み具合が出て、作中1分ごとに進む（作中8分で pull が終わる）。終わった時点の origin/main で結末が決まる

**田中に見られる**：学習者のターミナルの出力に「職務経歴書」が出るたびに（`git status`、`git show --stat` など）、田中が1回だけ「（…見なかったことにします）」とつぶやく。結末にも出る

**結末**

| 条件 | 流れ |
|---|---|
| きれいに push できた | 黒岩「…請求書の PDF、いいな」 |
| 職務経歴書ごと push した | 黒岩「…1on1、しようか」 |
| 田中に見られた | 最後に田中「（…見なかったことにします）」 |
| 職務経歴書を消して取り返した | 早瀬「--cached、大事でしょ？」 |
| 隠し：`--cached` なしで消したまま amend した | push はできるが、ゴールの「作業ツリーに残っている」を満たせない。部長の pull が終わった時点で（転職活動が、振り出しに戻った） |

```ts
export const MISSION = { task: '請求書の PDF 出力を push する（余計なものは入れずに）', due: '部長の pull が終わるまで' }

export const INTRO = [
  { from: 'boss', text: '請求書の PDF、いまから pull してレビューする。push しとけ' },
  { from: 'kouhai', text: '先輩、さっきのコミット、ファイル2つ入ってましたよね？' },
  { from: 'senpai', text: 'push の前に git show --stat。いつものやつね' },
]

export const LINES = {
  'senpai.idle': [
    'git show --stat で、コミットの中身を見てみ',
    'コミットから外したいだけなら、ファイルは消さなくていいよね',
    'rm には --cached ってのがある',
  ],
  'hint.look': ['git show --stat。何が入ってる？'],
  'hint.rmCached': ['git rm -r --cached 転職。コミットからは外れて、ファイルは手元に残る'],
  'hint.amend': ['git commit --amend --no-edit で、さっきのコミットを作り直す'],
  'hint.push': ['git show --stat でもう一回見てから git push'],
  'hint.restoreFile': ['消しちゃったなら、amend する前に git restore --source HEAD 転職。コミットにはまだ残ってるから'],
  'hint.lostAfterAmend': ['amend しちゃったか…。元のコミットは reflog でしか追えない。今回は、あきらめよ'],
  'hint.restoreFromOrigHead': ['reset した後なら、元のコミットは ORIG_HEAD に残ってる。git restore --source ORIG_HEAD 転職'],
  'kouhai.saw': ['（…見なかったことにします）'],
  'kouhai.deletedFile': ['先輩、それ…ファイルごと消えましたよ'],
  'kouhai.smart': ['--cached だと、手元には残るんですね'],
  'boss.pulling': ['（部長が pull しています…）'],
  'ending.clean': ['…請求書の PDF、いいな'],
  'ending.leaked': ['…1on1、しようか'],
  'ending.restored': ['--cached、大事でしょ？'],
  'ending.hidden': ['（転職活動が、振り出しに戻った）'],
}
```

**要望**
- 部長の「pull 中…」の進み具合（作中の時刻から出す）と、終わった時点の origin/main で結末を決める仕組み
- 「ターミナルの出力に特定の文字列が出たら」を、セリフのきっかけにする（田中に見られる）
- ゴールに作業ツリーの条件（ファイルが残っている）を入れる

---

### 3-2 .env が漏れた

**状況**：3章から、あなたは田中を見る側。10分前、田中が `.env` 入りのコミットを origin/main に push した。このリポジトリは**公開している SDK のサンプル**で、誰でも見られる。

**初期状態**
- origin/main の最新：田中「feat: 決済のサンプルを追加」。中身に `.env`（`PAYMENT_API_KEY=shop-live-0000-0000-dummy`）
- 学習者のローカルは、そのひとつ前（まだ pull していない）
- 開始から作中3分後、早瀬が origin/main に「docs: サンプルの説明を追加」を push する（状況の変化）

**ゴール**（すべて）
1. チャットの選択肢「インフラにキーの失効を依頼する」を選ぶ
2. origin/main の最新の中身に `.env` がない（`git pull` → `git rm --cached .env` → commit → push）
3. 田中に何か声をかける（選択肢）

**par**：4（pull、rm --cached、commit、push）＋選択肢

**S ランクの条件**：**最初の行動が「キーの失効」**であること（git のコマンドより先に選ぶ）。履歴から消しても、漏れたキーは取り消せない。止めるのが先

**誘惑**：「なかったことにする」。`git reset --hard HEAD~1` → `git push --force`
- 手数は少なく見えるが、キーは公開された時点で漏れている
- 早瀬の push の後なら、早瀬のコミットも消える（`FORCE_PUSH_OVERWROTE`）
- docs/04 §4.3 のとおり、「チームに周知する」を選んでから `--force-with-lease` を使った書き換えは**許可**する（危険にしない）。ただし、それでもキーの失効がなければクリアしない

**状況の変化**
- 作中1分：シークレット検出ボットが `#dev` に投稿する「公開リポジトリで秘密情報らしき文字列を検出しました：.env」
- 作中3分：早瀬が push する

**選択肢**

| id | 文 | 効果 |
|---|---|---|
| `revoke` | インフラにキーの失効を依頼する | ゴール1。最初に選ぶと S の条件 |
| `announce` | チームに「履歴を書き換えるかも。しばらく pull しないで」と周知する | 書き換えの許可条件 |
| `kouhai.teach` | 田中に「.gitignore に .env を書いておこう。次は add の前に status を見よう」 | 信頼 +8。ゴール3 |
| `kouhai.blame` | 田中に「何やってるの」 | 信頼 −10。ゴール3（声はかけた） |
| `kouhai.cover` | 田中に「大丈夫、一緒に片づけよ」 | 信頼 +5。ゴール3 |

**結末**

| 条件 | 流れ |
|---|---|
| 失効が最初 | 黒岩「…初動が正しい」→ 田中「先輩、ありがとうございます…」 |
| 失効が後 | 黒岩「消すより先に、止めろ」 |
| 締切までに失効しない | Lv5 の演出：黒岩「少しお時間よろしいでしょうか」→ 暗転 → 社内報風のカード「その朝、何が起きたのか」→ 早瀬「…履歴を消しても、キーはまだ使えるんだよ」 |
| 田中に教えた | 最後の1行「（田中のモニターに、"add の前に status" の付箋が貼られた）」 |
| 早瀬のコミットを消した | 早瀬「俺のも消えたんだけど」→ チェックポイントに戻る |

```ts
export const MISSION = { task: '漏れた API キーを止めて、.env を片づける', due: '10:30' }

export const INTRO = [
  { from: 'kouhai', text: '先輩…さっきの push、.env が入ってました…' },
  { from: 'senpai', text: 'あのリポジトリ、公開のやつだよね' },
  { from: 'boss', text: '…どうする' },
]

export const LINES = {
  'senpai.idle': [
    '履歴を消す前に、考えることない？',
    'キーが漏れたら、まず何を止める？',
    '消すのは、そのあとでいい',
  ],
  'hint.revoke': ['まずキーを止める。チャットの「インフラにキーの失効を依頼する」'],
  'hint.pull': ['git pull で、田中のコミットを手元に持ってくる'],
  'hint.rmCached': ['git rm --cached .env。リポジトリから外す。キーの値は、もう無効だからね'],
  'hint.commit': ['git commit -m "chore: .env を追跡から外す"'],
  'hint.push': ['git push'],
  'hint.kouhai': ['田中に、ひとこと言ってあげて'],
  'bot.detected': ['シークレット検出ボット：公開リポジトリで秘密情報らしき文字列を検出しました：.env'],
  'senpai.pushed': ['サンプルの説明、push しといた'],
  'kouhai.revoked': ['キー、止まったって連絡来ました！'],
  'kouhai.thanks': ['先輩、ありがとうございます…'],
  'kouhai.blamed': ['…すみません'],
  'kouhai.danger': ['先輩、それ…早瀬さんのも消えません？'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['…早瀬のコミットは、どこに行った'],
  'senpai.overwritten': ['俺のも消えたんだけど'],
  'ending.revokeFirst': ['…初動が正しい'],
  'ending.revokeLate': ['消すより先に、止めろ'],
  'ending.noRevoke.boss': ['少しお時間よろしいでしょうか'],
  'ending.noRevoke.senpai': ['…履歴を消しても、キーはまだ使えるんだよ'],
  'ending.taught': ['（田中のモニターに、"add の前に status" の付箋が貼られた）'],
}

export const REPORTS = {
  FORCE_PUSH_OVERWROTE: {
    title: '秘密情報を消すための force push で、同僚のコミットを消したことについて',
    what: '.env の入ったコミットを履歴から消そうとして git push --force し、早瀬さんのコミット「docs: サンプルの説明を追加」も消した',
    why: '公開リポジトリに出た時点で、キーは誰かに見られたかもしれない。履歴を消しても、漏れたキーは戻らない。しかも、ほかの人の作業まで巻き込んだ',
    howToFix: 'まずキーを失効させる。消えたコミットは早瀬さんの手元にあるので、push し直してもらう。.env は git rm --cached で外して、普通のコミットで直す',
    prevention: 'キーの失効が最優先。履歴を書き換えるなら、チームに周知してから --force-with-lease。.env は .gitignore に書く',
    bossWord: '消すより先に、止めろ',
  },
}
```

**要望**
- 「最初の行動が選択肢 `revoke` か」を判定する（S ランクの条件）
- 締切までに `revoke` がないときの Lv5 の結末（docs/06 の 4.2 の演出）
- `announce` を選んだ後の `--force-with-lease` を許可にする（`policy.allow`）
- 検出ボットは新しい話し手（`bot`）になる。Character に足すか、システムの1行として出すか

---

### 外伝 やらかし道場

**状況**：早瀬先輩「研修用のリポジトリを用意した。本番でやったら終わることを、今日ここで全部やっとけ」

**初期状態**（`dojo` リポジトリ。わざと罠だらけにする）
- main は保護している
- `.env`（`PAYMENT_API_KEY=dojo-0000-not-real`）が未追跡のまま置いてある。`.gitignore` はない
- `node_modules/` が置いてある
- origin/main には、まだ fetch していない田中のコミットがある（force push で消せる）
- `conflict-me` ブランチがあり、main とマージするとコンフリクトする
- `shared` ブランチは田中と共有している（履歴を書き換えられる）

**遊び方**
- 目的は「始末書図鑑を埋めること」。空いている枠には**なぞなぞ**だけが出ていて、それが次にやることのヒントになる
- 時間制限なし。機嫌は動くが、雷が落ちてもやり直しにはならない（体験型）
- 画面の上に**損害額**のカウンターを常に出す。危険を起こすたびに増える。**損害額を稼ぐのが目的**（docs/06 の 2.1）
- 「道場を元に戻す」ボタンで、world だけを最初に戻せる（図鑑と損害額は残る）

**図鑑の枠**

| 枠 | なぞなぞ | 危険 | ヤバ度 | 損害額 |
|---|---|---|---|---|
| 1 | 半年後の誰にも読めない一行 | BAD_COMMIT_MESSAGE | Lv1 | ¥0（でも、読んだ人の時間が減る） |
| 2 | 12,483個の荷物 | JUNK_STAGED | Lv1 | ¥12,480 |
| 3 | 矢印を刺したまま | CONFLICT_MARKER_COMMITTED | Lv2 | ¥38,000 |
| 4 | 名もなき迷子 | COMMITS_ORPHANED | Lv2 | ¥12,480 |
| 5 | レビューを飛び越えて | DIRECT_PUSH_TO_PROTECTED | Lv3 | ¥380,000 |
| 6 | みんなの過去を書き換える | HISTORY_REWRITTEN_ON_SHARED_BRANCH | Lv3 | ¥420,000 |
| 7 | 仲間の仕事を、なかったことに | FORCE_PUSH_OVERWROTE | Lv4 | ¥4,200,000 |
| 8 | 鍵をばらまく | SECRET_PUSHED | Lv5 | ¥48,000,000 |
| 9 | 書きかけを、まとめて捨てる | UNCOMMITTED_CHANGES_DISCARDED（`reset --hard`、`checkout .`） | Lv3 | ¥240,000（消えた作業時間） |
| 10 | 家ごと消す | `rm -rf .git`（★新しい危険 `REPO_DELETED`） | 測定不能 | ¥— |
| 11 | 三つ続けて（役満） | 観測以外のコマンドを3つ続けて打つあいだに、3種類以上の危険 | — | その3つの合計の2倍 |

- 金額の内訳は始末書の最後に1行で出す。例：SECRET_PUSHED「キーの再発行 ¥80,000／不正利用の調査 ¥2,400,000／お客様へのお知らせ ¥45,520,000」
- 枠10 は、始末書の「戻し方」で **clone し直せば origin にあるものは戻る。push していなかったものは戻らない**を教える。成仏の条件は `git clone` し直すこと
- 枠11：エンジンは `&&` に未対応（「まだ使えません」と出る）。道場は時間制限なしで時計も止まるので、「作中1分以内」ではなく**コマンドの数**で数える
  - 例：`git add .` → `git commit -m "fix"` → `git push -f origin main`（.env 混入＋「fix」＋ main への force push。3手で4種類）

**称号**（損害額の合計で決まる）

| 合計 | 称号 |
|---|---|
| ¥0〜 | 見習い |
| ¥50,000〜 | ヒヤリハット職人 |
| ¥500,000〜 | 始末書コレクター |
| ¥5,000,000〜 | 歩く障害報告書 |
| ¥50,000,000〜 | 伝説の人 |

```ts
export const MISSION = { task: '始末書図鑑を埋める', due: '時間制限なし' }

export const INTRO = [
  { from: 'senpai', text: '研修用のリポジトリを用意した。本番でやったら終わることを、今日ここで全部やっとけ' },
  { from: 'kouhai', text: '…ほんとにいいんですか？' },
  { from: 'boss', text: '本番でやるよりは、安い' },
]

export const LINES = {
  'senpai.idle': [
    '図鑑の空いてる枠、なぞなぞ読んでみ',
    '3手続けて3つやると、役満だよ',
    '元に戻すボタンもあるから、気にせずやっちゃって',
  ],
  'senpai.newEntry': ['はい、1枚。本番ではやるなよ'],
  'senpai.yakuman': ['…役満。こんなの、研修でしか見られない'],
  'kouhai.newEntry': ['（メモしとこ…）', 'うわぁ…', '先輩、楽しそうですね…'],
  'boss.complete': ['…全部やったか。本番では、ひとつもやるな'],
  'senpai.reset': ['元に戻しといた。図鑑と損害額はそのまま'],
  'title.up': ['称号：{title}'],
}
```

**要望**
- 図鑑の画面（枠、なぞなぞ、始末書の中身、損害額の内訳）
- 損害額のカウンターと称号
- 役満の判定：観測以外のコマンドを3つ続けて打つあいだに出た危険の種類を数える
- `rm -rf .git` を危険 `REPO_DELETED` として判定する（シェルのコマンドなので、エンジンの意味イベントか scenarios 層で）。道場以外のステージでは、docs/04_spec_scenarios の「部長が走ってくる」ネタに使える
- 道場では危険を減点ではなく**得点**として扱う。演出エンジンの `mode: 'experience'` で、機嫌は動かすが雷でやり直しにしない

## 4. まだ作れないステージ（設計だけ）

2-4・2-5・3-2 は、エンジンの取り消しのコマンドが入ったので 3章（素材つき）に移した。

### 3-1 田中の3時間（○ reflog の後）
- 立場が逆になる。田中が `reset --hard` して、DM で泣きついてくる。**操作するのは田中のリポジトリ**
- 正解：`git reflog` → 消えたコミットを探す → `git reset --hard <hash>` か `git branch rescue <hash>`
- K5：自分で直さず、チャットで田中に手順を教える選択肢がある。教えると手数は増えるが、信頼が大きく上がり、隠しの結末「師匠」になる（以後、田中の呼び方が変わる）

### 3-3 3月31日深夜（○ revert の後）
- エイプリルフール用のブランチを release にマージしてしまう。画面のボタンの文言がすべて関西弁になる
- 正解：`git revert -m 1 <merge>`。K2 誘惑：reset して force push
- K5 隠し：翌日の4月1日に、revert を revert して公開し直すと、部長「…今年は、やるのか」

### 3-4 stash の地層（△ stash の後）
- stash が14個。全部「WIP on main」。どれが本物の作業か、`stash list` と `stash show -p` で探す推理ゲーム
- K5：最後に `stash push -m` で名前をつけると、田中「先輩の stash、地層じゃなくなった」

### 3-5 金曜18:52の hotfix（△ cherry-pick の後）
- 作業中の feature ブランチから hotfix を切ってしまい、未発表の新料金プランが混ざった
- 正解：main から切り直して `cherry-pick` で修正だけを持ってくる
- K3 状況の変化：19時に館内放送「まもなく施錠します」

## 5. 作る順番のおすすめ

| 順 | ステージ | 理由 |
|---|---|---|
| 1 | 1-2 朝会の前に | 一番やさしい。add / commit / push と amend。1章の入口を先に固める |
| 2 | 1-1 入社初日 | 選択肢の UI と「観測で解く謎」の型を作れる。ほかのステージでも使い回せる |
| 3 | 2-1 デモ5分前 | detached の警告はエンジンに実装済み。「出力を読めば救える」の型ができる |
| 4 | 1-3 main は保護 | 時刻で起きるイベントと締切の変更の型を作れる |
| 5 | 2-2 先輩の force push | lease の授業。報告の選択肢で結末を分ける型 |
| 6 | 2-3 矢印 | 損害額を初めて見せる |
| 7 | 2-5 職務経歴書 | `rm --cached` と `rm` の違い。「出力に出たら田中が見る」のきっかけを作る |
| 8 | 2-4 本日26時リリース | 2章の締め。時計の飛び（18分の push）と、翌朝にまとめて出す部長の反応 |
| 9 | 3-2 .env が漏れた | 3章の入口。Lv5 の演出と「git より先にやること」 |
| 10 | やらかし道場 | 図鑑の画面が要るので最後。ただし、作れば一番遊ばれる |

- 2章の締めは、2-3 から 2-4 に変える（2-4 のほうが山場が大きい）

## 6. 未決事項

- [ ] 1章を1日ずつ（月〜金）進める構成でよいか
- [ ] 2-3 で、このステージだけ main への直接 push を許可してよいか（障害対応という設定）
- [ ] 2-1 の `COMMITS_ORPHANED` を危険の種類に足すか
- [ ] やらかし道場の損害額の金額
- [ ] 2-2 の「部長に報告する」選択肢の評価（正しいが角が立つ。機嫌は上げて、先輩の態度だけ変える案）
- [ ] `.gitignore` にエンジンが対応したら、2-4・2-5・3-2 の「再発防止」を加点（K5）に足す
- [ ] 2-4 で、部長の反応を「翌朝」にまとめる演出にするか（部長は帰っているので、その場で怒るのは不自然）
- [ ] 3-2 の検出ボットを新しい話し手にするか、システムの1行にするか
