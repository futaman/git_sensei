// どのステージでも使える始末書の文（ステージが自分の文を持っていなければ、これを出す）。
// やらかし道場の図鑑の文でもある。損害額の内訳つき
import type { StageDefinition } from './stage.ts'

const cost = (yen: number) => `¥${yen.toLocaleString('ja-JP')}`

export const GENERIC_REPORTS: StageDefinition['reports'] = {
  BAD_COMMIT_MESSAGE: {
    title: '半年後の誰にも読めない一行について',
    what: 'コミットメッセージに「fix」「修正」のような、何をしたか分からない言葉を書いた',
    why: '履歴を読む人（半年後の自分を含む）が、何をなぜ変えたのか分からない',
    howToFix: 'push 前なら git commit --amend -m "…" で書き直す',
    prevention: '1行目に「何を」「なぜ」を書く',
    bossWord: '読めないメッセージは、ないのと同じだ',
    cost: `${cost(0)}（でも、読んだ人の時間が減る）`,
  },
  JUNK_STAGED: {
    title: 'node_modules を積んだことについて',
    what: 'node_modules/ をステージに載せた',
    why: '誰でも npm install で作れるものを、リポジトリに入れると重くなる。差分も読めなくなる',
    howToFix: 'git rm -r --cached node_modules で外す',
    prevention: '.gitignore に node_modules/ を書く。add の前に git status を見る',
    bossWord: '荷物を増やすな',
    cost: `クローンの待ち時間 ${cost(12480)}`,
  },
  CONFLICT_MARKER_COMMITTED: {
    title: '矢印を刺したままのコミットについて',
    what: 'コンフリクトの印（<<<<<<< ======= >>>>>>>）が残ったファイルをコミットした',
    why: '印の残ったファイルは、プログラムとして動かない。本番に出れば障害になる',
    howToFix: '印と不要な行を消して、直すコミットを足す',
    prevention: 'コミットの前に、ファイルに <<<<<<< が残っていないか確かめる',
    bossWord: '矢印は、git からの質問だ',
    cost: `障害の調査と問い合わせ対応 ${cost(38000)}`,
  },
  COMMITS_ORPHANED: {
    title: '名もなき迷子について',
    what: 'detached HEAD で作ったコミットを、ブランチに乗せないまま置き去りにした',
    why: 'どのブランチからもたどれないコミットは、log に出なくなり、いずれ消える',
    howToFix: 'switch の Warning に出たハッシュで git branch <名前> <ハッシュ>',
    prevention: 'detached HEAD でコミットしたら、移動する前に git switch -c <名前>',
    bossWord: '警告は読め',
    cost: `探し直す時間 ${cost(12480)}`,
  },
  DIRECT_PUSH_TO_PROTECTED: {
    title: 'レビューを飛び越えたことについて',
    what: '保護している main に、レビューなしで直接 push した',
    why: 'レビューを飛ばすと、間違いがそのまま全員に広がる',
    howToFix: '入ったものを、みんなで見直す。必要なら元に戻すコミットを足す',
    prevention: 'ブランチを切って push し、レビューに出す',
    bossWord: 'レビューを飛ばすな',
    cost: `本番の障害対応 ${cost(380000)}`,
  },
  HISTORY_REWRITTEN_ON_SHARED_BRANCH: {
    title: 'みんなの過去を書き換えたことについて',
    what: 'ほかの人も使っているブランチを、amend や reset と force push で書き換えた',
    why: '共有ブランチを書き換えると、ほかの人の手元の履歴と食い違い、次の pull で混乱する',
    howToFix: '書き換えたことを伝え、相手に fetch して合わせてもらう',
    prevention: '共有ブランチは書き換えない。直すコミットを足す',
    bossWord: 'みんなの過去を、勝手に変えるな',
    cost: `チーム全員の手戻り ${cost(420000)}`,
  },
  FORCE_PUSH_OVERWROTE: {
    title: '仲間の仕事を、なかったことにしたことについて',
    what: 'fetch せずに git push --force して、origin にあったほかの人のコミットを消した',
    why: '自分が知らないコミットごと、origin を上書きした。消された本人は気づかないこともある',
    howToFix:
      '消された人の手元にはコミットが残っている。push し直してもらい、自分は pull してから push する',
    prevention: '拒否されたら pull。上書きが要るときは --force-with-lease',
    bossWord: '押し切るな',
    cost: `作業のやり直しと信頼 ${cost(4200000)}`,
  },
  SECRET_PUSHED: {
    title: '鍵をばらまいたことについて',
    what: '.env（API キー）の入ったコミットを push した',
    why: 'push した時点で、キーは誰かに見られたかもしれない。履歴を消しても戻らない',
    howToFix: 'まずキーを失効させる。それから git rm --cached .env して直すコミットを足す',
    prevention: '.env は .gitignore に書く。add の前に git status を見る',
    bossWord: '消すより先に、止めろ',
    cost: `キーの再発行 ${cost(80000)}／不正利用の調査 ${cost(2400000)}／お客様へのお知らせ ${cost(45520000)}`,
  },
  UNCOMMITTED_CHANGES_DISCARDED: {
    title: '書きかけを、まとめて捨てたことについて',
    what: 'まだコミットしていない変更があるまま、git reset --hard（や checkout .）を打った',
    why: 'コミットしていない作業は、git にも残っていない。まとめて消すと、もう戻らない',
    howToFix: '戻せない。エディタの元に戻す（Ctrl+Z）が残っていれば、それだけが頼り',
    prevention: '消す前に git status と git diff を見る。迷ったら、いったん commit しておく',
    bossWord: 'コミットしてない作業は、git でも戻せない',
    cost: `消えた作業時間 ${cost(240000)}`,
  },
  REPO_DELETED: {
    title: '家ごと消したことについて',
    what: 'rm -rf .git で、リポジトリ（履歴・ブランチ・設定）をまるごと消した',
    why: '.git は、リポジトリそのもの。消すと、手元の履歴は全部なくなる',
    howToFix:
      'clone し直せば、origin にあるものは戻る。push していなかったコミットやブランチは戻らない',
    prevention: '.git には触らない。困ったら消す前に、誰かに聞く',
    bossWord: '…家ごと、か',
    cost: '測定不能',
  },
}
