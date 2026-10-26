// git の英語のエラーに、日本語のひとことを添える（出力そのものは本物の git のまま）。
// つまずきやすいものだけに絞る。1つのコマンドに出すのは1つまで。

interface Rule {
  /** 出力（stdout と stderr）に当てはまるか */
  match: RegExp
  /** 打ったコマンドの条件（なければ、どのコマンドでも） */
  command?: RegExp
  text: string
}

const RULES: Rule[] = [
  {
    match: /Aborting commit due to empty commit message/,
    text: 'メッセージが空なので、コミットは中止されました。git commit -m "何をしたか" のように、"" の中に書いてください',
  },
  {
    match: /switch `m' requires a value/,
    text: '-m の後ろにメッセージが要ります（例：git commit -m "README を追加"）',
  },
  {
    match: /Committing is not possible because you have unmerged files/,
    text: 'コンフリクトが残っています。印（<<<<<<< など）を直したファイルを git add してから commit します',
  },
  {
    match: /nothing to commit|no changes added to commit|nothing added to commit/,
    command: /^git commit/,
    text: 'コミットする変更がありません。変えたファイルを git add でステージに載せてから commit します',
  },
  {
    match: /^Everything up-to-date/m,
    command: /^git push/,
    text: 'origin に送る新しいコミットはありません。commit したかどうか、git status や git log で確かめましょう',
  },
  {
    match: /\[rejected\].*\(fetch first\)/,
    text: 'origin に、手元にないコミットがあります。先に git pull で取り込んでから push します',
  },
  {
    match: /\[rejected\].*\(non-fast-forward\)/,
    text: '手元の履歴が origin より古いか、分かれています。git pull で取り込んでから push します',
  },
  {
    match: /^CONFLICT \(/m,
    text: 'コンフリクトしました。ファイルの <<<<<<< と >>>>>>> の間を正しく直して、git add → git commit。やめるなら git merge --abort',
  },
  {
    match: /error: path '.*' is unmerged/,
    text: 'コンフリクト中のファイルは、--ours（自分の側）か --theirs（取り込む側）で、どちらに戻すかを指定します',
  },
  {
    match: /Your local changes to the following files would be overwritten/,
    text: '手元の変更が上書きされるので止めました。commit するか、git restore <file> で変更を捨ててから、もう一度',
  },
  {
    match: /The following untracked working tree files would be overwritten/,
    text: '同じ名前の、まだ git に入れていないファイルがあります。名前を変えるか消してから、もう一度',
  },
  {
    match: /not a git repository/,
    text: 'ここは git のリポジトリではありません。git init で作るか、cd でリポジトリのフォルダに移動します',
  },
  {
    match: /is not a git command/,
    text: 'コマンド名のつづりを確かめましょう（help で使えるコマンドの一覧が出ます）',
  },
  {
    match: /did not match any file\(s\) known to git|did not match any files/,
    text: 'そのファイルは git が知りません。名前のつづりと、git status の一覧を確かめましょう',
  },
  {
    match: /^HEAD is now at /m,
    command: /^git reset --hard/,
    text: '動く前の位置は ORIG_HEAD で指せます。やりすぎたら git reset --hard ORIG_HEAD で戻れます',
  },
]

/** コマンドの出力に添える日本語のひとこと。当てはまるものがなければ null */
export function explain(command: string, output: string): string | null {
  for (const rule of RULES) {
    if (rule.command && !rule.command.test(command.trim())) continue
    if (rule.match.test(output)) return rule.text
  }
  return null
}
