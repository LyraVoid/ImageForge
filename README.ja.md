<p align="center">
  <img src="docs/images/icon.svg" width="88" height="88" alt="ImageForge">
</p>

<h1 align="center">ImageForge</h1>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <b>日本語</b>
</p>

**ブラウザだけで動く Android boot イメージの道具です。** Magisk・KernelSU・APatch あるいはそのフォークで
イメージにパッチを当てる。OTA パッケージを開いて中のパーティションを取り出す。`super`／`erofs`／`ext4`
イメージの中身を覗く。2 つのイメージを比較する。起動ロゴや起動アニメーションを差し替える。そして、触る前に
そのファイルが何なのかを確かめる。

![ツール一覧](docs/images/tools.png)

サーバーもアカウントもテレメトリーもありません。パーサー・パッチ処理・コーデックはページ内の Web Worker で
動き、速度が要る部分や上流の C 実装をそのまま使う部分は WebAssembly になっています。**何もアップロードせず、
デバイスに書き込みもしません**。処理の行き着く先は、あなたがダウンロードする 1 つのファイルです。

リポジトリ: <https://github.com/LyraVoid/ImageForge>

## ツール

| ツール | 用途 | 状態 |
| --- | --- | --- |
| **イメージにパッチ** | boot イメージを解析し、方法を選び、計画を立て、worker で実行し、結果を検証してダウンロードする。KernelSU 系 5 マネージャー、KernelPatch のコアイメージ 3 種、Magisk 系 3 マネージャーに対応 | 利用可 |
| **パッケージから取り出す** | OTA の `payload.bin` やベンダーアーカイブを開き（8 GB のパッケージも範囲読み出しで、全体は読み込まない）、`boot`・`init_boot`・`vendor_boot` などを取り出す | 利用可 |
| **パーティションを解く** | `super` イメージと論理パーティション、sparse イメージ、`erofs`、`ext4` を開く。範囲読み出しで閲覧し、1 ファイルを取り出し、sparse と `super` を書き戻す | 利用可 |
| **起動ロゴ** | splash イメージ（OPPO/Realme/OnePlus）や MediaTek の logo イメージを読み、中の絵を見て 1 枚差し替える | 利用可 |
| **起動アニメーション** | `bootanimation.zip` を開いて再生し、フレームを差し替え、`desc.txt` を編集して梱包し直す | 利用可 |
| **イメージを比較** | 2 つのファイルを比較し、違いが boot イメージのどのセクションにあるかを示す | 利用可 |
| **中身を見る** | 読み取り専用。このファイルは何か、何が入っているか、何でパッチ済みか | 利用可 |

## どのマネージャー向けにパッチできるか

パッチは**それを信頼するマネージャーアプリ**と揃っていないと使えません。ペイロードはどれも自分の署名証明書に
対してビルドされるからです。だからこれは固定リストではなく選択になります。計画にはマネージャーが記録され、
結果ページにそのアプリの公式リリースページへのリンクが出ます。

| 系統 | マネージャー | 生成物に必要なアプリ |
| --- | --- | --- |
| KernelPatch（カーネルパッチ） | APatch、Aster、FolkPatch | `me.bmax.apatch`、`me.yuki.aster`、`me.yuki.folk` |
| KernelSU（ramdisk + モジュール） | KernelSU、SukiSU、ReSukiSU、YukiSU、KowSU | 対応するアプリ（例: `me.weishu.kernelsu`） |
| Magisk（ramdisk） | Magisk、WeaveMask、MagisKube | `com.topjohnwu.magisk`、`io.github.seyud.weave`、`org.magiskube.magisk` |

![実際の init_boot.img を解析したところ](docs/images/analyze.png)

## 生成物を信頼できる理由

ここにあるバイト単位の形式はすべて**参考実装に照らして**実装されており、記憶から書いたものはありません。
プロジェクトが述べる主張も、テストで確かめられる範囲に限っています。

* **パッチ後の ramdisk は公式アプリの出力とバイト単位で同一** — Magisk 公式アプリの出力、および KernelSU の
  出力と、同じ元イメージで比較済み。LZ4 と bzip2 は**参考実装**を WebAssembly にしたもので、自作実装では
  ありません。実機の ramdisk は再圧縮しても出荷時のコンテナと同じバイト列に戻ります。
* **KernelPatch のコアイメージは各リリースの成果物と一致** — ブラウザの wasm kptools と、各ブランチ公式の
  ネイティブ `kptools` バイナリで突き合わせ、バイト単位で一致することを確認しています。
* **sparse と `super` は AOSP の `img2simg`・`lpmake`・`lpdump`・`lpunpack` と比較**し、`erofs` と `ext4` の
  リーダーは**実機で取得した `sha256sum`** と比較しています。
* **同梱するバイナリは使用前にすべてダイジェスト検証**し、`THIRD_PARTY_LICENSES/` に上流リビジョンと
  ライセンスを登録しています。さらに「自称どおりのものか」も検証します — カーネルモジュールは再配置可能な
  ELF で `vermagic` が端末の KMI と一致すること、コアイメージは `KP1158` で始まること、stub は APK であること。
* **このプロジェクト自身の出力を基準にしません。** 参考実装があれば読んで行番号を引用し、ビルドできるなら
  そのまま使うか、成熟したツールを oracle としてバイト単位で比較します。その順序と、それぞれが実際に
  見つけたバグは [docs/architecture.md](docs/architecture.md) に書いてあります。

バイト単位の契約はあるのに確かめる実材料が無い箇所では、記録に**検証していないと明記**します。強い主張を
弱い根拠で通すことはしません。各マネージャーのライセンス記録
（[THIRD_PARTY_LICENSES/](THIRD_PARTY_LICENSES/README.md)）の末尾に、まだ検証できていない点が並んでいます。

## 入手とビルド

    git clone https://github.com/LyraVoid/ImageForge && cd ImageForge
    pnpm install
    pnpm dev          # 開発サーバー http://127.0.0.1:5173/
    pnpm build        # tsc -b && vite build、dist/ に静的サイト
    pnpm preview      # 本番ビルドを確認
    pnpm verify       # ドキュメント検査・型検査・lint・テスト・ビルド = ゲート

必要なもの: **Node 22.13+ と pnpm 11**（pnpm の正確なバージョンは `package.json` の `packageManager` に
固定してあり、`corepack enable` か新しい pnpm が自動で採用します）。Rust モジュールの再ビルドには
`wasm32-unknown-unknown` ターゲット入りの Rust ツールチェーンが要ります。それ以外の WebAssembly モジュールは
`scripts/` が固定した上流リリースからビルドします。ビルド済みモジュールはリポジトリに入っているので、
**動かす・開発するだけならツールチェーンは不要**です。

静的サイトで、内部のパスは絶対パスです — service worker、manifest、WebAssembly モジュールは `/`、`/wasm`、
`/artifacts` から取得します — そのためドメインの**ルート**に置いてください（サブディレクトリ不可）。
一度開けばオフラインでも動きます。

## 読める形式

| 形式 | ここでできること |
| --- | --- |
| boot ヘッダ v0–v4 | 解析・抽出・再梱包・検証。`boot`、`init_boot`、`vendor_boot` |
| カーネルコンテナ | 無圧縮、gzip、LZ4（frame / legacy、依存ブロック含む）、xz |
| ramdisk | CPIO `newc`/`crc`、gzip/LZ4/xz コンテナ。`magiskboot` と同じ書き方で生成 |
| `super` イメージ | liblp メタデータ、論理パーティションと extents。`lpmake` と同じ書き方で生成 |
| sparse イメージ | AOSP のチャンク種別。全体またはストリーム。`img2simg` と同じ書き方で生成 |
| `erofs` | スーパーブロック、inode、LZ4 圧縮ファイル。範囲読み出し対応 |
| `ext4` | スーパーブロック、extent ツリー、ディレクトリ。範囲読み出し対応 |
| zip / OTA パッケージ | zip64、8 GB の `payload.bin` を範囲読み出し、`REPLACE`・`REPLACE_XZ`・`REPLACE_BZ` |
| splash / MediaTek logo | 解析、フレームのデコード、1 枚の差し替え、再梱包 |
| 起動アニメーション | `desc.txt`（ベンダー方言含む）と part ディレクトリ。stored zip として再梱包 |

リーダーが理解できない入力は、**固有のエラーで拒否**します。壊れた入力は後付けではなくテスト suite の
一部です。

## 書き込む前に

ImageForge はデバイスに触れません。渡すのはファイル 1 つで、その使い道はあなたの判断です。パッチ済みイメージを
誤ったパーティションへ、あるいは別の端末・カーネル向けのイメージを書き込むと、起動できなくなることがあります。
**パッチするパーティションの純正コピーを必ず残し**、fastboot での復元手順を把握し、結果ページのチェックリストを
読んでください — 対象パーティション、必要なマネージャーアプリ、AVB 署名が消えていることをそこに書いています。
使い方は [docs/usage.md](docs/usage.md) にあります。

## 意図的にやらないこと

* **コアイメージは自分で用意しても構いません**（KernelPatch の `kpimg` を添付できます）。利用者が用意した
  KernelSU / Magisk モジュールは同梱のものを上書きします。どちらも使用前に検証します — コアイメージは
  KernelPatch のマジック、モジュールは `.modinfo` とビルド時のカーネルバージョンで。
* **再梱包で AVB 署名は失われます**。検証付き起動を通すには再署名か検証の無効化が必要です。
* **リモートからの成果物ダウンロードはありません**。同梱（かつダイジェスト検証済み）の成果物だけを解決します。
  これがオフライン利用と監査可能性を支えています。
* **`erofs`／`ext4` の書き込み**と **KernelPatch LKM の経路**は実装しません。どちらも実機での検証が要るため、
  できるふりはしません。

## 構成

    src/core/      イメージエンジン、パッチエンジン、成果物レジストリ、互換性判定、エラー
    src/workers/   worker プロトコルとセッション
    src/wasm/      モジュール読み込み、TypeScript フォールバック、WASI ランナー、ダイジェスト登録
    src/routes/    ページ。src/components/ はデザインシステム、src/i18n/ は 4 言語
    crates/        WebAssembly にコンパイルする Rust クレート
    scripts/       再現可能なビルド、アイコン生成、マテリアル表、ペイロード抽出
    public/        同梱の WebAssembly モジュール、マネージャーのペイロード、アイコン、service worker
    tests/         ユニット、統合、worker、wasm、UI テスト
    docs/          アーキテクチャ、テスト材料、利用ガイド
    THIRD_PARTY_LICENSES/  上流ライセンス、ダイジェスト、統合ポリシー

`pnpm verify` がゲートです。[docs/testing.md](docs/testing.md) に、最も強いテストが必要とする実材料の一覧、
それぞれの探索先、与える環境変数が書いてあります。材料が要るテストは**自分からスキップして理由を述べる**ので、
suite は「何を走らせなかったか」について正直です。[CONTRIBUTING.md](CONTRIBUTING.md) に守るべきルール
（マネージャーの追加手順を含む）、[SECURITY.md](SECURITY.md) に脆弱性の報告方法があります。

## ライセンス

ImageForge は **AGPL-3.0-or-later** です: [LICENSE](LICENSE) と [NOTICE](NOTICE) を参照してください。改変版を
ネットワークサービスとして提供する場合、AGPL は利用者にソースを提供することを求めます。

サードパーティのコードはそれぞれのライセンスのままで、再ライセンスはしません。同梱するバイナリはすべて
[THIRD_PARTY_LICENSES/](THIRD_PARTY_LICENSES/README.md) に上流リビジョン・ライセンス全文・ダイジェストを
登録しています。同梱元のプロジェクト名は**出所を示すためだけ**に使っています。ImageForge は独立した
プロジェクトであり、Magisk・KernelSU・APatch・KernelPatch および [NOTICE](NOTICE) に挙げたマネージャーの
いずれとも**提携・推薦・スポンサーの関係にありません**。
