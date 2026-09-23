export const ja: Record<string, string> = {
  // logo containers
  "MediaTek logo (Xiaomi and other MTK devices)": "MediaTek logo（Xiaomi など MTK 端末）",
  // analysis report
  Image: "イメージ",
  Boot: "ブート",
  Kernel: "カーネル",
  Ramdisk: "ラムディスク",
  Metadata: "メタデータ",
  "Technical details": "技術的な詳細",
  File: "ファイル",
  Size: "サイズ",
  Format: "形式",
  Header: "ヘッダー",
  "Page size": "ページサイズ",
  "OS version": "OS バージョン",
  Cmdline: "Cmdline",
  "Image name": "イメージ名",
  "Kernel address": "カーネルアドレス",
  "Ramdisk address": "ラムディスクアドレス",
  "Tags address": "Tags アドレス",
  "Second stage": "セカンドステージ",
  Architecture: "アーキテクチャ",
  Payload: "ペイロード",
  Compression: "圧縮",
  "Expanded size": "展開後のサイズ",
  Archive: "アーカイブ形式",
  Entries: "エントリ数",
  Directories: "ディレクトリ",
  Files: "ファイル",
  Symlinks: "シンボリックリンク",
  "Other entries": "その他のエントリ",
  Bootconfig: "Bootconfig",
  "Recovery DTBO": "Recovery DTBO",
  DTB: "DTB",
  "AVB signature": "AVB 署名",
  "Image id": "イメージ ID",
  "Vendor ramdisk entries": "vendor ramdisk のエントリ数",
  "Vendor ramdisk table": "vendor ramdisk テーブル",
  Magic: "マジック",
  "Header size": "ヘッダーサイズ",
  "Total size": "合計サイズ",
  warning: "警告",
  "Existing patch": "既存のパッチ",
  "(empty)": "（空）",
  undetermined: "判定できず",
  absent: "なし",
  "not a CPIO archive": "CPIO アーカイブではありません",
  "not supported": "未対応",
  unavailable: "取得できません",
  "no kernel": "カーネルなし",
  "Android Boot Image": "Android Boot イメージ",
  "Android Vendor Boot Image": "Android Vendor Boot イメージ",
  "CPIO newc": "CPIO newc",
  "CPIO newc (crc)": "CPIO newc (crc)",
  Uncompressed: "非圧縮",
  GZip: "GZip",
  "LZ4 (legacy)": "LZ4（legacy）",
  "LZ4 (frame)": "LZ4（frame）",
  XZ: "XZ",
  LZMA: "LZMA",
  BZip2: "BZip2",
  Zstandard: "Zstandard",
  "CPIO (uncompressed)": "CPIO（非圧縮）",
  Unknown: "不明",
  "The kernel payload is compressed or uses an unknown container.":
    "カーネルのペイロードは圧縮されているか、未知のコンテナを使っています。",
  "Android ramdisks are normally CPIO newc archives.": "Android のラムディスクは通常 CPIO newc アーカイブです。",
  "KernelPatch (APatch or one of its forks): the kernel carries KP1158":
    "KernelPatch（APatch またはそのフォーク）: カーネルに KP1158 があります",
  "Magisk: overlay.d/ or .backup/.magisk is in the ramdisk":
    "Magisk: ラムディスクに overlay.d/ または .backup/.magisk があります",
  "KernelSU: kernelsu.ko is in the ramdisk": "KernelSU: ラムディスクに kernelsu.ko があります",
  "a previous ramdisk patch kept init.real": "以前のラムディスクパッチが init.real を残しています",

  // provider descriptions
  "Structural placeholder that exercises the whole pipeline: it rewrites the kernel cmdline and writes a bootconfig manifest. It does not grant root.":
    "パイプライン全体を通すための構造的なプレースホルダーです。カーネルの cmdline を書き換え、bootconfig のマニフェストを書き込みます。root を取得するものではありません。",
  "KernelPatch based root: the KernelPatch core image (kpimg) is injected into the kernel inside boot.img.":
    "KernelPatch ベースの root: KernelPatch のコアイメージ（kpimg）を boot.img 内のカーネルに注入します。",
  "Kernel based root: the KernelSU loadable module is injected into the ramdisk, which replaces init.":
    "カーネルベースの root: KernelSU のローダブルモジュールをラムディスクに注入し、init を置き換えます。",
  "Systemless root: magiskinit replaces the ramdisk init, and Magisk's payloads are written under overlay.d/sbin.":
    "システムレス root: magiskinit がラムディスクの init を置き換え、Magisk のペイロードを overlay.d/sbin の下に書き込みます。",

  // descriptor notes
  "Never describes itself as a root solution.": "自分を root ソリューションと呼ぶことはありません。",
  "Used to validate analysis, planning, worker execution, verification and download.":
    "分析・計画・worker での実行・検証・ダウンロードの各段階を確認するために使います。",
  "Patches the kernel only, therefore boot.img is the only valid target: init_boot.img carries no kernel.":
    "パッチするのはカーネルだけなので、有効な対象は boot.img のみです。init_boot.img にカーネルは含まれません。",
  "Requires CONFIG_KALLSYMS=y in the target kernel. This is verified before the patch runs.":
    "対象カーネルで CONFIG_KALLSYMS=y が必要です。パッチを実行する前に確認します。",
  "Uncompressed, gzip, LZ4 (frame or legacy, independent or dependent blocks) and xz kernels are supported and re-compressed in the original container; LZMA, BZip2 and Zstandard kernels are refused.":
    "非圧縮・gzip・LZ4（frame または legacy、独立ブロックまたは依存ブロック）・xz のカーネルに対応し、元のコンテナで再圧縮します。LZMA・BZip2・Zstandard のカーネルは拒否します。",
  "The superkey is optional and unset by default, matching the manager default where authentication is signature based.":
    "スーパーキーは任意で、既定では未設定です。署名で認証するマネージャーの既定と同じ挙動です。",
  "The superkey is optional and left unset by default, matching the manager default where authentication is signature based.":
    "スーパーキーは任意で、既定では未設定です。署名で認証するマネージャーの既定と同じ挙動です。",
  "Three KernelPatch core images are registered, because each build only trusts the manager it was made for: the official upstream build (me.bmax.apatch), the Aster fork build (me.yuki.aster) and the extended branch FolkPatch ships (me.yuki.folk).":
    "KernelPatch のコアイメージを 3 つ登録しています。各ビルドが信頼するのは、そのために作られたマネージャーだけだからです。公式の上流ビルド（me.bmax.apatch）、Aster フォークのビルド（me.yuki.aster）、そして FolkPatch が使う拡張ブランチ（me.yuki.folk）です。",
  "A custom flavour takes the core image from the run instead of the registry: the file has to start with the KernelPatch magic, and its digest and version are reported in the result.":
    "カスタムフレーバーでは登録簿ではなく今回の実行からコアイメージを受け取ります。ファイルは KernelPatch のマジックで始まる必要があり、ダイジェストとバージョンは結果に記録されます。",
  "KernelPatch modules (KPM) can be attached, and are embedded by kptools with the same command shape FolkTool uses.":
    "KP モジュール（.kpm ファイル）を添付でき、kptools が FolkTool と同じコマンド形式で埋め込みます。",
  "Runs the upstream KernelPatch kptools, compiled to WebAssembly, inside the patch worker.":
    "WebAssembly にコンパイルした上流の KernelPatch kptools を、パッチ worker の中で実行します。",
  "Injects the module into the ramdisk of init_boot.img (GKI 13+) or of a boot.img that carries one, exactly as ksud does: init becomes init.real, a new init (ksuinit) is added, and kernelsu.ko is added next to it.":
    "ksud とまったく同じように、init_boot.img（GKI 13 以降）またはラムディスクを持つ boot.img のラムディスクにモジュールを注入します。init は init.real になり、新しい init（ksuinit）が追加され、その隣に kernelsu.ko が追加されます。",
  "The KMI is read from the kernel banner when the image carries a kernel, and can be selected otherwise; init_boot.img carries no kernel, so there it has to be selected.":
    "イメージにカーネルがあれば KMI はカーネルのバナーから読み取り、なければ選択できます。init_boot.img にはカーネルがないため、そこでは選択が必要です。",
  "Refuses a ramdisk that is already patched by Magisk, and reports when KernelSU is already installed.":
    "Magisk でパッチ済みのラムディスクは拒否し、KernelSU がすでに導入されている場合はその旨を報告します。",
  "Rewrites the ramdisk the way Magisk's own patcher does: init becomes magiskinit (0750), overlay.d/ and overlay.d/sbin are created (0750), magisk.xz, stub.xz and init-ld.xz are added (0644), and .backup/.magisk holds the configuration (000).":
    "Magisk 自身のパッチツールと同じ方法でラムディスクを書き換えます。init は magiskinit（0750）になり、overlay.d/ と overlay.d/sbin を作成し（0750）、magisk.xz・stub.xz・init-ld.xz を追加し（0644）、設定は .backup/.magisk（000）に置きます。",
  "The stock init is replaced rather than renamed.": "純正の init は名前を変えるのではなく置き換えられます。",
  "fstab entries are patched exactly like magiskboot does when verity or forced encryption are not kept: the matching flag strings are removed and verity_key is dropped.":
    "verity や強制暗号化を維持しない場合、fstab のエントリは magiskboot とまったく同じ方法でパッチされます。一致するフラグ文字列を削除し、verity_key も取り除きます。",
  "SHA1 in the configuration is the digest of the whole source image, like Magisk's app records it.":
    "設定内の SHA1 は元イメージ全体のダイジェストで、Magisk アプリが記録するものと同じです。",
  "Refuses a ramdisk that Magisk or KernelSU already patched.":
    "Magisk または KernelSU でパッチ済みのラムディスクは拒否します。",
  "Like Magisk's own patcher, the stock init is kept inside the ramdisk as .backup/init.xz, together with .backup/.rmlist, so Magisk's app can restore the image by itself.":
    "Magisk 自身のパッチツールと同様に、純正の init は .backup/init.xz としてラムディスク内に残し、.backup/.rmlist も添えます。これにより Magisk アプリが自力でイメージを復元できます。",
  "Two managers are registered as flavours, because each build of magiskinit only trusts its own app: Magisk (com.topjohnwu.magisk) and WeaveMask (io.github.seyud.weave, a fork whose patcher is byte for byte Magisk v30.7's). Each flavour carries the payloads of its own pinned release, and both are GPL-3.0.":
    "マネージャーを 2 つ flavour として登録しています。magiskinit の各ビルドが信頼するのは自分用のアプリだけだからです。Magisk（com.topjohnwu.magisk）と WeaveMask（io.github.seyud.weave、パッチ処理が Magisk v30.7 とバイト単位で同一のフォーク）です。各 flavour はそれぞれ固定したリリースのペイロードを同梱し、どちらも GPL-3.0 です。",
  "The manager app of the selected flavour has to be installed for the produced image to be usable.":
    "生成したイメージを使うには、選択した flavour のマネージャーアプリが必要です。",

  // provider analysis notes
  "The Mock Provider never claims to root a device and leaves the ramdisk contents untouched.":
    "Mock プロバイダーは root を取得できるとは決して主張せず、ラムディスクの中身にも触れません。",
  "The kernel is patched, so boot.img is the only valid target: init_boot.img contains no kernel.":
    "パッチするのはカーネルなので、有効な対象は boot.img だけです。init_boot.img にはカーネルがありません。",
  "CONFIG_KALLSYMS=y is verified on the target kernel before any patch is applied.":
    "パッチを適用する前に、対象カーネルで CONFIG_KALLSYMS=y を確認します。",
  "The ramdisk is modified: on GKI Android 13+ that is init_boot.img, otherwise a boot.img that carries a ramdisk.":
    "変更されるのはラムディスクです。GKI の Android 13 以降では init_boot.img、それ以外ではラムディスクを持つ boot.img です。",
  "A ramdisk that Magisk already patched is refused.": "Magisk でパッチ済みのラムディスクは拒否します。",
  "Vendor boot images with a ramdisk table are not supported yet.":
    "ラムディスクテーブルを持つ vendor boot イメージにはまだ対応していません。",
  "The payloads of the selected manager are bundled (both Magisk and WeaveMask are GPL-3.0 throughout), so nothing has to be supplied.":
    "選択したマネージャーのペイロードは同梱されています（Magisk も WeaveMask も全体が GPL-3.0）。用意するものはありません。",
  "The stock init is replaced rather than renamed, and a compressed copy of it is kept inside the ramdisk for the manager's own uninstall path.":
    "純正の init は名前を変えるのではなく置き換えられ、マネージャー自身のアンインストール用にその圧縮コピーもラムディスク内に残します。",
  "A ramdisk that Magisk or KernelSU already patched is refused.":
    "Magisk または KernelSU でパッチ済みのラムディスクは拒否します。",
  "The manager app of the selected flavour (com.topjohnwu.magisk, or io.github.seyud.weave for WeaveMask) has to be installed on the device for the produced image to be usable.":
    "生成したイメージを使うには、端末に選択した flavour のマネージャーアプリ（com.topjohnwu.magisk、WeaveMask なら io.github.seyud.weave）が必要です。",

  // KernelPatch flavours
  "Upstream KernelPatch": "上流の KernelPatch",
  "Aster fork": "Aster フォーク",
  "FolkPatch": "FolkPatch",
  "official APatch release 11224 (KernelPatch 0.13.3)":
    "公式 APatch リリース 11224（KernelPatch 0.13.3）",
  "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981 (upstream 0.13.8 plus the Aster manager trust commit)":
    "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981（上流 0.13.8 に Aster マネージャー信頼のコミットを加えたもの）",
  "LyraVoid/KernelPatch 1de1a37304406615a3c3b6f1d28d2cd926b93a0f (release 0.13.8 of the extended branch FolkPatch is built on)":
    "LyraVoid/KernelPatch 1de1a37304406615a3c3b6f1d28d2cd926b93a0f（FolkPatch が使う拡張ブランチの 0.13.8 リリース）",

  // Magisk flavours (continued)
  "MagisKube": "MagisKube",
  "MagisKube release 1.0.0 (a fork of Magisk on the same v30.7 base)": "MagisKube リリース 1.0.0（Magisk と同じ v30.7 ベースのフォーク）",

  // KernelSU family managers
  "Five managers of this family are registered as flavours — KernelSU (me.weishu.kernelsu), SukiSU (com.sukisu.ultra), ReSukiSU (com.resukisu.resukisu), YukiSU (com.anatdx.yukisu) and KowSU (com.kowx712.supermanager) — because each one's modules are compiled against its own manager certificate and cannot be mixed with another's.":
    "この系統のマネージャーを 5 つ flavour として登録しています。KernelSU（me.weishu.kernelsu）、SukiSU（com.sukisu.ultra）、ReSukiSU（com.resukisu.resukisu）、YukiSU（com.anatdx.yukisu）、KowSU（com.kowx712.supermanager）です。各マネージャーのモジュールは自分の証明書に対してビルドされるため、混在させられません。",
  "Each flavour ships one loadable module per KMI (GPL-2.0-only, redistributed unmodified as a separate program with its own licence; see THIRD_PARTY_LICENSES/kernelsu/). A module supplied by the user overrides the bundled one, and either way its .modinfo and the kernel version it was built for are checked before anything is written.":
    "各 flavour は KMI ごとに 1 つのローダブルモジュールを同梱します（GPL-2.0-only、独立したプログラムとして無改変で再配布し、それぞれライセンスを登録しています。THIRD_PARTY_LICENSES/kernelsu/ を参照）。利用者が用意したモジュールは同梱のものを上書きし、どちらの場合も書き込む前に .modinfo とビルド時のカーネルバージョンを検証します。",
  "The manager app of the selected flavour has to be installed on the device.":
    "端末には選択した flavour のマネージャーアプリが必要です。",
  "The loadable module has to match the device KMI (for example android15-6.6); each manager's own module is bundled, and a module the user supplies overrides it after being verified.":
    "ローダブルモジュールは端末の KMI（例: android15-6.6）と一致している必要があります。各マネージャー自身のモジュールを同梱しており、利用者が用意したモジュールは検証のうえで上書きします。",
  "KernelSU":
    "KernelSU",
  "SukiSU":
    "SukiSU",
  "ReSukiSU":
    "ReSukiSU",
  "YukiSU":
    "YukiSU",
  "KowSU":
    "KowSU",
  "official KernelSU release v3.3.0":
    "公式 KernelSU リリース v3.3.0",
  "SukiSU-Ultra release v4.2.0 (the same wrapper as upstream, its own modules)":
    "SukiSU-Ultra リリース v4.2.0（ラッパーは上流と同じ、モジュールは独自）",
  "ReSukiSU release v4.2.0-rc3 (wrapper and modules recovered from its APK)":
    "ReSukiSU リリース v4.2.0-rc3（ラッパーとモジュールは APK から復元）",
  "YukiSU release v1.7.0 (its modules are release assets, its wrapper comes from its APK)":
    "YukiSU リリース v1.7.0（モジュールはリリース成果物、ラッパーは APK から）",
  "KowSU Manager build 32737 (wrapper and modules recovered from its APK)":
    "KowSU Manager ビルド 32737（ラッパーとモジュールは APK から復元）",

  // Magisk flavours
  "Magisk": "Magisk",
  "WeaveMask": "WeaveMask",
  "official Magisk release v30.7": "公式 Magisk リリース v30.7",
  "WeaveMask release v30.7.5, a fork of Magisk": "WeaveMask リリース v30.7.5（Magisk のフォーク）",

  // plan steps
  "Analyze boot image": "boot イメージを分析",
  "Extract kernel image": "カーネルイメージを取り出す",
  "Load KernelPatch artifacts": "KernelPatch のアーティファクトを読み込む",
  "Inject KernelPatch into the kernel": "カーネルに KernelPatch を注入",
  "Repack the boot image": "boot イメージを再パック",
  "Verify the produced image": "生成したイメージを検証",
  "Read the boot image": "boot イメージを読み取る",
  "Expand the ramdisk": "ラムディスクを展開",
  "Check the ramdisk and the module": "ラムディスクとモジュールを確認",
  "Rewrite the ramdisk": "ラムディスクを書き換え",
  "Check the ramdisk": "ラムディスクを確認",
  "Analyze image": "イメージを分析",
  "Extract sections": "セクションを取り出す",
  "Prepare payload": "ペイロードを準備",
  "Apply mock patch": "mock パッチを適用",
  "Repack boot image": "boot イメージを再パック",
  "Verify output": "出力を検証",

  // progress lines
  "Extracting and expanding the kernel image": "カーネルイメージを取り出して展開しています",
  "Extracting image sections": "イメージのセクションを取り出しています",
  "Injecting KernelPatch into the kernel": "カーネルに KernelPatch を注入しています",
  "Loading KernelPatch artifacts": "KernelPatch のアーティファクトを読み込んでいます",
  "Repacking the boot image": "boot イメージを再パックしています",
  "Verifying the produced image": "生成したイメージを検証しています",
  "Checking the ramdisk": "ラムディスクを確認しています",
  "Checking the ramdisk and the module": "ラムディスクとモジュールを確認しています",
  "Rewriting the ramdisk": "ラムディスクを書き換えています",
  "Expanding the ramdisk": "ラムディスクを展開しています",
  "Applying the mock patch": "mock パッチを適用しています",
  "Preparing the mock manifest": "mock のマニフェストを準備しています",

  // warnings a run reports
  "APatch patches the kernel only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "APatch はカーネルだけをパッチします。このイメージを書き込むかどうかは利用者の判断であり、ImageForge はデバイスへの書き込みを一切行いません。",
  "KernelSU patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "KernelSU はラムディスクだけをパッチします。このイメージを書き込むかどうかは利用者の判断であり、ImageForge はデバイスへの書き込みを一切行いません。",
  "Magisk patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "Magisk はラムディスクだけをパッチします。このイメージを書き込むかどうかは利用者の判断であり、ImageForge はデバイスへの書き込みを一切行いません。",
  "Magisk's app can restore this image by itself: the stock init is kept inside the ramdisk as .backup/init.xz. Keep a stock image anyway.":
    "Magisk アプリはこのイメージを自力で復元できます。純正の init は .backup/init.xz としてラムディスク内に残しています。それでも純正イメージは保管しておいてください。",
  "The ramdisk has no init entry, so the wrapper cannot hand over to the stock init.":
    "ラムディスクに init のエントリがないため、ラッパーから純正の init に処理を渡せません。",
  "The Mock Provider does not root the device and does not modify ramdisk contents.":
    "Mock プロバイダーは root を取得せず、ラムディスクの中身も変更しません。",
  "The produced image has no ramdisk to read back.": "生成したイメージに読み戻せるラムディスクがありません。",
  "The Magisk configuration in the produced ramdisk looks wrong.":
    "生成したラムディスク内の Magisk 設定が正しくないようです。",
  // the field names the result and the plan record, shown as labels
  archiveEntriesAfter: "アーカイブのエントリ数（パッチ後）",
  archiveEntriesBefore: "アーカイブのエントリ数（パッチ前）",
  artifact: "アーティファクト",
  artifactSha256: "アーティファクト SHA-256",
  artifactVerified: "アーティファクト検証済み",
  artifactVersion: "アーティファクトのバージョン",
  backupInitSha256: "バックアップした init の SHA-256",
  cmdlineMarker: "cmdline のマーカー",
  config: "Magisk の設定内容",
  configSha256: "設定の SHA-256",
  fstabPatched: "fstab のパッチ",
  headerVersion: "ヘッダーバージョン",
  imageSizeAfter: "出力イメージサイズ",
  imageSizeBefore: "元のイメージサイズ",
  initBackupEntry: "init のバックアップ先",
  initEntry: "init エントリ",
  initHandling: "init の扱い",
  injection: "注入方式",
  kallsyms: "CONFIG_KALLSYMS",
  kallsymsAll: "CONFIG_KALLSYMS_ALL",
  keepForceEncrypt: "強制暗号化の維持",
  keepSignature: "AVB バイト列の保持",
  keepVerity: "verity の維持",
  kernelCompression: "カーネルの圧縮",
  kernelPatchFlavor: "KernelPatch のフレーバー",
  kernelPatchMode: "KernelPatch の方式",
  kernelPatchSource: "コアイメージの取得元",
  kernelPatchVersion: "KernelPatch のバージョン",
  kernelRawSizeAfter: "カーネル展開後サイズ（パッチ後）",
  kernelRawSizeBefore: "カーネル展開後サイズ（パッチ前）",
  kernelSectionSize: "カーネルセクションのサイズ",
  kernelSize: "カーネルサイズ",
  kernelSizeAfter: "カーネルサイズ（パッチ後）",
  kernelSizeBefore: "カーネルサイズ（パッチ前）",
  kmi: "端末の KMI",
  kmiSource: "KMI の取得元",
  kpimgSha256: "kpimg SHA-256",
  kpimgSource: "kpimg の取得元",
  kpimgVersion: "kpimg のバージョン",
  kpmCount: "KP モジュール数",
  kpmModules: "KP モジュール",
  kptoolsArtifact: "kptools アーティファクト",
  kptoolsConfirmation: "kptools の確認結果",
  kptoolsSha256: "kptools SHA-256",
  kptoolsVersion: "kptools のバージョン",
  ksuConfig: "ksu_config エントリ",
  magiskArtifacts: "Magisk アーティファクト",
  magiskinitSha256: "magiskinit SHA-256",
  manifestKind: "マニフェストの種類",
  mock: "Mock プロバイダー",
  moduleArtifact: "モジュールのアーティファクト",
  moduleDeclaredName: "モジュールが宣言する名前",
  moduleDigest: "モジュールのダイジェスト",
  moduleEntry: "モジュールのエントリ名",
  moduleLicense: "モジュールのライセンス",
  moduleParameters: "モジュールのパラメータ",
  moduleSize: "モジュールのサイズ",
  moduleSource: "モジュールの取得元",
  moduleVermagic: "モジュールの vermagic",
  payloadDigests: "ペイロードのダイジェスト",
  payloads: "ペイロード",
  planId: "計画 ID",
  preinitDevice: "事前初期化パーティション",
  preserveImageSize: "元のイメージサイズを維持",
  provider: "プロバイダー",
  providerName: "プロバイダー名",
  ramdiskCompression: "ラムディスクの圧縮",
  ramdiskSectionSize: "ラムディスクセクションのサイズ",
  ramdiskSectionSizeAfter: "ラムディスクセクションのサイズ（パッチ後）",
  ramdiskSectionSizeBefore: "ラムディスクセクションのサイズ（パッチ前）",
  release: "リリース",
  reproducible: "再現性",
  requiredManager: "必要なマネージャー",
  rmlist: "追加したパスの一覧",
  sha1Source: "SHA1 の対象",
  sourceImageSha256: "元イメージ SHA-256",
  stockInitSaved: "純正 init のバックアップ",
  superkeyMode: "スーパーキーの方式",
  target: "対象パーティション",
  targetRamdisk: "対象ラムディスク",
  verityKeyRemoved: "verity_key の削除",
  // what the workspace found in the file the user opened
  "Package": "パッケージ",
  "Partition image": "パーティションイメージ",
  "Android boot image": "Android boot イメージ",
  "Filesystem image": "ファイルシステムイメージ",
  "Ramdisk archive": "ラムディスクアーカイブ",
  "Boot logo container": "起動ロゴコンテナ",
  "Report": "レポート",
  "Binary blob": "バイナリデータ",
  "Raw bytes": "生バイト列",
  "Zip archive": "Zip アーカイブ",
  "Android OTA payload": "Android OTA ペイロード（payload.bin）",
  "Android sparse image": "Android sparse イメージ",
  "GZip stream": "GZip ストリーム",
  "LZ4 legacy stream": "LZ4 legacy ストリーム",
  "LZ4 frame": "LZ4 フレーム",
  "XZ stream": "XZ ストリーム",
  "LZMA stream": "LZMA ストリーム",
  "BZip2 stream": "BZip2 ストリーム",
  "Zstandard stream": "Zstandard ストリーム",
  "CPIO archive": "CPIO アーカイブ",
  "Unknown container": "不明なコンテナ",
  "Android init_boot image": "Android init_boot イメージ",
  "Android vendor boot image": "Android vendor boot イメージ",
  "ext4 filesystem": "ext4 ファイルシステム",
  "EROFS filesystem": "EROFS ファイルシステム",
  "F2FS filesystem": "F2FS ファイルシステム",
  "Device tree blob": "デバイスツリー（DTB）",
  "ELF object": "ELF オブジェクト",
  "Unknown content": "不明な内容",
"Logical partition image (super)": "論理パーティションイメージ（super）",
"Splash or logo image": "起動ロゴ・スプラッシュ画像",
};