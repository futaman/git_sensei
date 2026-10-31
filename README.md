# git_sensei

gitをわかりやすく体験できる日本語のWebアプリ。職場のストーリーの中で、gitの基本操作から「やっちゃいけないこと」とその戻し方までを体験する。

仕様は [docs/](docs/) を参照。

| 文書                                                            | 内容                                       |
| --------------------------------------------------------------- | ------------------------------------------ |
| [01_competitor_research.md](docs/01_competitor_research.md)     | 競合調査                                   |
| [02_spec_git_engine.md](docs/02_spec_git_engine.md)             | gitエンジン（自作シミュレータ）            |
| [03_spec_input_and_layout.md](docs/03_spec_input_and_layout.md) | 入力方式と画面構成                         |
| [04_spec_drama_system.md](docs/04_spec_drama_system.md)         | 演出システム（信頼・機嫌・無駄操作の判定） |
| [05_spec_tech_stack.md](docs/05_spec_tech_stack.md)             | 技術スタックとプロジェクト構成             |
| [06_guide_direction.md](docs/06_guide_direction.md)             | 演出とシナリオを実装するときのガイド       |
| [07_scenario_catalog.md](docs/07_scenario_catalog.md)           | シナリオ集（章立てと各ステージの素材）     |
| [08_spec_look_and_clarity.md](docs/08_spec_look_and_clarity.md) | 見た目と、ゲームとしてのわかりやすさ       |

## 開発

Node 24 以上と git が必要（本物のgitとの突き合わせテストに使う）。

```bash
npm install
npm run dev          # 開発サーバー
npm test             # ユニットテスト＋本物gitとの突き合わせテスト
npm run test:golden  # 突き合わせテストだけ
npm run typecheck
npm run lint         # Biome（整形とリント）。直すときは npm run lint:fix
npm run build
```

## 構成

```
src/engine/     gitシミュレータ（どこにも依存しない）
src/drama/      操作の分類と演出エンジン（engine の型だけに依存）
src/scenarios/  シナリオデータ（engine, drama に依存）
src/ui/         React
tests/golden/   本物のgitとの突き合わせテスト
```

層の境界は Biome（`biome.json`）と `tests/architecture.test.ts` で守る。
