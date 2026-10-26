// 「金曜17:45、定時前の push」のセリフと始末書（演出案のセッションから受け取った素材）。
// ロジックは scenario.ts。演出側は、このファイルの文言だけを直せばよい。
import type { Character } from '../../drama/index.ts'
import type { StageDefinition } from '../stage.ts'

export const NAMES: Record<Character, string> = {
  boss: '黒岩部長',
  kouhai: '田中',
  senpai: '早瀬先輩',
  system: 'お知らせ',
}

export const INTRO: StageDefinition['intro'] = [
  {
    from: 'boss',
    text: '決済の端数を切り捨てに直したやつ、今日中に main に入れておけ。18時に帰る',
  },
  { from: 'kouhai', text: 'あ、僕もさっき calc.ts の料金改定を push しました！' },
  { from: 'senpai', text: 'push が弾かれても、--force で押し切るなよ。金曜だぞ' },
]

/** いまの状況（導入で見せる）。何がすでに終わっていて、何が残っているか */
export const SITUATION: StageDefinition['situation'] = [
  'あなたは calc.ts の手数料の端数処理を「四捨五入」から「切り捨て」（Math.floor）に直して、手元でコミットしました。まだ push していません。',
  'そのあいだに田中さんが、同じ calc.ts の手数料率を 3.5% から 3.6% に変えて、先に origin へ push しました。',
]

/** ゴール（画面に出して、その場でチェックがつく） */
export const GOALS = {
  mine: 'origin の main に、あなたの修正（端数の切り捨て）を届ける',
  tanaka: '田中さんの修正（手数料率 3.6%）を消さない',
}

export const MISSION = { task: 'calc.ts の修正を main に入れる', due: '18:00' }

export const LINES: Record<string, string[]> = {
  // 汎用 key の上書き
  'kouhai.error': ['えっ、弾かれました？', 'また…？', '（メモを取る手が止まった）'],
  'kouhai.danger': ['…先輩、いま --force って…'],
  'boss.danger.FORCE_PUSH_OVERWROTE': ['…田中のコミットは、どこに行った'],
  'boss.danger.CONFLICT_MARKER_COMMITTED': ['calc.ts に矢印が刺さってるぞ'],
  'boss.danger.BAD_COMMIT_MESSAGE': ['"修正"って、何をだ'],
  'boss.deadlineUrgent': ['あと2分だ'],
  'boss.overtime': ['…18時だぞ', '電車、1本見送った', '（部長がコートを脱いだ）'],
  'senpai.idle': [
    'pull して、ぶつかったところを見てみ',
    '<<<<<<< と >>>>>>> の間、両方いるやつじゃない？',
    '上の段と下の段から、1行ずつ正しいほうを拾うんだよ',
  ],
  'senpai.rollback': ['push の前まで戻しといた。今度は pull からな'],
  // ヒント（先輩。押すと作中の時計が2分飛ぶ）。時間を払ったぶん、idle より具体的に言う
  'hint.push': ['とりあえず git push してみ。弾かれたら、そのとき考えよ'],
  'hint.pull': ['origin に田中のが先に入ってるんだよ。git pull で取り込も'],
  'hint.resolve': [
    'calc.ts の上の段がおまえ、下の段が田中。0.036 と Math.floor を残して、矢印は全部消す',
  ],
  'hint.add': ['直したら git add。「解決したよ」って git に教えるやつ'],
  'hint.commit': ['あとは git commit。メッセージはそのままでいいよ（--no-edit）'],
  'hint.pushAgain': ['マージできたじゃん。もっかい git push'],
  // ヒント：間違えた後（取り返し方まで言う）
  'hint.redo': [
    '片方、消えてるよ。0.036 と Math.floor を両方残すか、git merge --abort で pull の前からやり直し',
  ],
  'hint.fixBeforeCommit': [
    'まだコミット前だからセーフ。calc.ts を 0.036 と Math.floor にして、もっかい git add',
  ],
  'hint.fixForward': [
    'やっちゃったら、直すコミットを足すだけ。calc.ts を 0.036 と Math.floor にして、add → commit → push',
  ],
  'hint.commitFix': [
    '直ったじゃん。add して、commit -m には何を直したか書いて（「修正」はダメな）、push',
  ],
  'hint.forced': [
    'origin から田中のコミット、消えてるよ。始末書の「チェックポイントに戻る」か、上の「やり直す」で戻ろ',
  ],
  'hint.detached': ['HEAD がブランチから外れちゃってる。git switch main で戻れるよ'],
  // 先輩の助け舟：間違えた後（タダで出るので、方向だけ）
  'senpai.idle.mistake': [
    'calc.ts、もっかい見てみ。0.036 と Math.floor、両方ある？',
    '田中の変更とおまえの変更、どっちも生きてる？',
  ],
  'senpai.idle.forced': ['…田中のコミット、origin にないよ。上の「やり直す」で戻ってこ'],
  'senpai.idle.detached': ['あれ、いまブランチの上にいないよ。main に戻ろ'],
  'senpai.afterWrongPush': ['大丈夫大丈夫。push しちゃっても、直すコミットを足せばいいだけ'],
  // マイルストーン（田中）
  'milestone.pulledConflict': ['あ、ぶつかった…僕のせいですか？'],
  'milestone.resolvedBoth': ['両方残ってる…！'],
  'milestone.mergeCommitted': ['マージコミットって、こうなるんですね'],
  // 間違った解消（危険ではなく、ゴールを満たさないだけ）
  'kouhai.lostRate': ['あれ…僕の 0.036 が…'],
  'kouhai.lostFloor': ['あれ、先輩の切り捨て、戻ってません？'],
  'boss.lostFloorPushed': ['端数、四捨五入のままだぞ'],
  // 結末
  'ending.onTime': ['…よし。帰る'],
  'ending.thanks': ['僕の変更も残してくれて、ありがとうございます'],
  'ending.late': ['電車、1本見送った'],
  'ending.afterReport': ['な？ 押し切るなって言ったろ'],
  // 結末：間違えたままコミットしてから、直してクリアした（判定は docs/04_spec_drama_system の §12.4）
  'ending.thanksRecovered': ['一回消えたときは焦りましたけど…戻ってよかったです'], // 田中。0.036 が消えたままコミットしたとき
  'ending.recovered': ['消さずに、直すコミットを足す。それで合ってる'], // 先輩
}

export const REPORTS: StageDefinition['reports'] = {
  FORCE_PUSH_OVERWROTE: {
    title: 'force push による他人のコミットの消失について',
    what: 'origin/main に git push --force を実行し、田中さんのコミット「料金改定：手数料率を3.6%に」を origin から消した',
    why: 'push が拒否されたのは、自分が持っていないコミットが origin にあったから。--force は origin を自分の手元の状態で上書きする命令なので、そのコミットは origin からなくなる。しかも、消された本人が気づかないことがある',
    howToFix:
      '一度も fetch していなければ、消えたコミットはあなたの手元にはない。残っているのは田中さんの手元だけ。田中さんに事情を話して push し直してもらい、そのうえで自分は pull してから push する。fetch 済みなら、自分の reflog や origin/main の記録からハッシュを探して取り込める',
    prevention:
      '拒否されたら pull する（または fetch して中身を見てから merge する）。どうしても上書きが必要なときは --force-with-lease を使う。main は branch protection で force push を禁止する',
    bossWord: '拒否は、git が止めてくれたんだ。押し切るな',
  },
  CONFLICT_MARKER_COMMITTED: {
    title: 'コンフリクトの印を残したままのコミットについて',
    what: 'calc.ts に <<<<<<< / ======= / >>>>>>> の印が残ったままコミットした',
    why: '印は「どちらの変更を残すか決めて」という git からの質問。残したままだと、そのファイルはプログラムとして動かない',
    howToFix:
      '印と、いらない行を消して、正しい内容に直す。git add してから、もう一度コミットする（push 前なら git commit --amend でもよい）',
    prevention: 'コミットの前に、ファイルの中に <<<<<<< が残っていないか確かめる',
    bossWord: '矢印は、git からの質問だ。答えてからコミットしろ',
  },
}
