// gitシミュレータの状態。すべてプレーンなオブジェクトで、JSONにそのまま保存できる。

/** 40桁の16進数（SHA-1） */
export type Oid = string
/** リポジトリのルートからの相対パス。区切りは '/' */
export type FilePath = string
/** 'refs/heads/main' のような完全なref名 */
export type RefName = string

export type FileMode = '100644' | '100755'

export interface Signature {
  name: string
  email: string
  /** UNIX時間（秒） */
  timestamp: number
  /** UTCからのずれ（分）。+0900 なら 540 */
  tzOffset: number
}

export interface BlobObject {
  type: 'blob'
  /** テキストファイルのみ扱う（UTF-8） */
  content: string
}

export interface TreeEntry {
  mode: FileMode | '40000'
  name: string
  oid: Oid
}

export interface TreeObject {
  type: 'tree'
  entries: TreeEntry[]
}

export interface CommitObject {
  type: 'commit'
  tree: Oid
  parents: Oid[]
  author: Signature
  committer: Signature
  /** 末尾の改行を含む、gitに保存されるとおりのメッセージ */
  message: string
}

export type GitObject = BlobObject | TreeObject | CommitObject

export interface IndexEntry {
  oid: Oid
  mode: FileMode
}

export type Head = { type: 'symbolic'; ref: RefName } | { type: 'detached'; oid: Oid }

/** コンフリクト中のファイルの、index の stage 1（共通の祖先）/ 2（自分）/ 3（相手） */
export interface UnmergedEntry {
  base?: IndexEntry
  ours?: IndexEntry
  theirs?: IndexEntry
}

/** マージの途中（コンフリクトで止まっている）。本物の .git/MERGE_HEAD と MERGE_MSG に当たる */
export interface MergeState {
  /** 取り込もうとしているコミット */
  head: Oid
  /** コミットするときの既定のメッセージ */
  message: string
}

export interface GitDir {
  /** 作業ツリーを持たないリポジトリ（サーバー側の origin など） */
  bare: boolean
  objects: Record<Oid, GitObject>
  refs: Record<RefName, Oid>
  /** 別の ref を指す ref（refs/remotes/origin/HEAD → refs/remotes/origin/main） */
  symrefs: Record<RefName, RefName>
  head: Head
  /** stage 0（ふつうの状態）の index。コンフリクト中のファイルはここになく unmerged にある */
  index: Record<FilePath, IndexEntry>
  unmerged: Record<FilePath, UnmergedEntry>
  merge: MergeState | null
  config: Record<string, string>
  /** `git switch -` で戻る先のブランチ名 */
  previousBranch: string | null
  /** detached HEAD になった時点のコミット（status の "detached at / from" の判定に使う） */
  detachedAt: Oid | null
  /** merge / pull / reset で動く前の HEAD（本物の .git/ORIG_HEAD）。古い保存データにはない */
  origHead?: Oid
}

export interface Workspace {
  /** 表示用の絶対パス（例 /home/sensei/project） */
  path: string
  /** 作業ツリー。ディレクトリはファイルのパスから暗黙に決まる */
  files: Record<FilePath, string>
  /** .git がなければ null */
  git: GitDir | null
}

export interface World {
  /** ディレクトリごとのワークスペース。キーは任意だが、clone で作ったものはパスがキーになる */
  workspaces: Record<string, Workspace>
  /** git config --global 相当 */
  globalConfig: Record<string, string>
}

export interface ExecContext {
  /** コマンドを実行するワークスペース */
  workspace: string
  /** 実行時刻。シミュレータは現在時刻を自分で読まない */
  now: { timestamp: number; tzOffset: number }
  /** 端末に表示する出力か（本物のgitと同じく、log の装飾などが変わる） */
  tty: boolean
  /** cd ~ の行き先 */
  home?: string
}
