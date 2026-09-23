export const zhHant: Record<string, string> = {
  // logo containers
  "MediaTek logo (Xiaomi and other MTK devices)": "MediaTek logo（小米等 MTK 機型）",
  // analysis report
  Image: "映像",
  Boot: "開機",
  Kernel: "核心",
  Ramdisk: "Ramdisk",
  Metadata: "中介資料",
  "Technical details": "技術細節",
  File: "檔案",
  Size: "大小",
  Format: "格式",
  Header: "標頭",
  "Page size": "頁面大小",
  "OS version": "OS 版本",
  Cmdline: "Cmdline",
  "Image name": "映像名稱",
  "Kernel address": "核心位址",
  "Ramdisk address": "Ramdisk 位址",
  "Tags address": "Tags 位址",
  "Second stage": "第二階段",
  Architecture: "架構",
  Payload: "載荷",
  Compression: "壓縮",
  "Expanded size": "展開後大小",
  Archive: "封存格式",
  Entries: "項目數",
  Directories: "目錄",
  Files: "檔案",
  Symlinks: "符號連結",
  "Other entries": "其他項目",
  Bootconfig: "Bootconfig",
  "Recovery DTBO": "Recovery DTBO",
  DTB: "DTB",
  "AVB signature": "AVB 簽章",
  "Image id": "映像 ID",
  "Vendor ramdisk entries": "vendor ramdisk 項目數",
  "Vendor ramdisk table": "vendor ramdisk 表",
  Magic: "魔數",
  "Header size": "標頭大小",
  "Total size": "總大小",
  warning: "警告",
  "Existing patch": "既有修補",
  "(empty)": "（空）",
  undetermined: "未判定",
  absent: "無",
  "not a CPIO archive": "不是 CPIO 封存檔",
  "not supported": "不支援",
  unavailable: "無法取得",
  "no kernel": "沒有核心",
  "Android Boot Image": "Android Boot 映像",
  "Android Vendor Boot Image": "Android Vendor Boot 映像",
  "CPIO newc": "CPIO newc",
  "CPIO newc (crc)": "CPIO newc (crc)",
  Uncompressed: "未壓縮",
  GZip: "GZip",
  "LZ4 (legacy)": "LZ4（legacy）",
  "LZ4 (frame)": "LZ4（frame）",
  XZ: "XZ",
  LZMA: "LZMA",
  BZip2: "BZip2",
  Zstandard: "Zstandard",
  "CPIO (uncompressed)": "CPIO（未壓縮）",
  Unknown: "未知",
  "The kernel payload is compressed or uses an unknown container.":
    "核心載荷是壓縮過的，或使用了未知的容器。",
  "Android ramdisks are normally CPIO newc archives.": "Android 的 ramdisk 通常是 CPIO newc 封存檔。",
  "KernelPatch (APatch or Aster): the kernel carries KP1158":
    "KernelPatch（APatch 或 Aster）：核心裡帶有 KP1158",
  "Magisk: overlay.d/ or .backup/.magisk is in the ramdisk":
    "Magisk：ramdisk 裡有 overlay.d/ 或 .backup/.magisk",
  "KernelSU: kernelsu.ko is in the ramdisk": "KernelSU：ramdisk 裡有 kernelsu.ko",
  "a previous ramdisk patch kept init.real": "先前的 ramdisk 修補保留了 init.real",

  // provider descriptions
  "Structural placeholder that exercises the whole pipeline: it rewrites the kernel cmdline and writes a bootconfig manifest. It does not grant root.":
    "結構性佔位實作，用來跑通整條流程：它改寫核心 cmdline 並寫入 bootconfig 清單。它不會授予 root。",
  "KernelPatch based root: the KernelPatch core image (kpimg) is injected into the kernel inside boot.img.":
    "以 KernelPatch 為基礎的 root：KernelPatch 核心映像（kpimg）會被注入 boot.img 內的核心。",
  "Kernel based root: the KernelSU loadable module is injected into the ramdisk, which replaces init.":
    "以核心為基礎的 root：KernelSU 可載入模組被注入 ramdisk，並取代 init。",
  "Systemless root: magiskinit replaces the ramdisk init, and Magisk's payloads are written under overlay.d/sbin.":
    "不修改系統（systemless）的 root：magiskinit 取代 ramdisk 的 init，Magisk 的載荷寫入 overlay.d/sbin 下。",

  // descriptor notes
  "Never describes itself as a root solution.": "它從不自稱是 root 方案。",
  "Used to validate analysis, planning, worker execution, verification and download.":
    "用來驗證分析、計畫、worker 執行、驗證與下載這幾個環節。",
  "Patches the kernel only, therefore boot.img is the only valid target: init_boot.img carries no kernel.":
    "只修補核心，因此只有 boot.img 是有效目標：init_boot.img 裡沒有核心。",
  "Requires CONFIG_KALLSYMS=y in the target kernel. This is verified before the patch runs.":
    "要求目標核心開啟 CONFIG_KALLSYMS=y。修補執行之前會先驗證這一點。",
  "Uncompressed, gzip, LZ4 (frame or legacy, independent or dependent blocks) and xz kernels are supported and re-compressed in the original container; LZMA, BZip2 and Zstandard kernels are refused.":
    "支援未壓縮、gzip、LZ4（frame 或 legacy，獨立區塊或相依區塊）以及 xz 的核心，並會依原容器重新壓縮；LZMA、BZip2 與 Zstandard 的核心會被拒絕。",
  "The superkey is optional and unset by default, matching the manager default where authentication is signature based.":
    "superkey 是選用的，預設不設定，與管理器預設的「以簽章認證」一致。",
  "The superkey is optional and left unset by default, matching the manager default where authentication is signature based.":
    "superkey 是選用的，預設不設定，與管理器預設的「以簽章認證」一致。",
  "Two KernelPatch core images are registered: the official upstream build (only the me.bmax.apatch manager is trusted) and the Aster fork build (only the me.yuki.aster manager is trusted).":
    "登錄了兩個 KernelPatch 核心映像：官方上游建置（只信任 me.bmax.apatch 管理器）與 Aster 分支建置（只信任 me.yuki.aster 管理器）。",
  "A custom flavour takes the core image from the run instead of the registry: the file has to start with the KernelPatch magic, and its digest and version are reported in the result.":
    "自訂風味改為從本次執行取得核心映像，而不是從註冊表取得：檔案必須以 KernelPatch 魔數開頭，結果裡會報告摘要與版本。",
  "KernelPatch modules (KPM) can be attached, and are embedded by kptools with the same command shape FolkTool uses.":
    "可以附加 KP 模組（.kpm 檔案），kptools 會用與 FolkTool 相同的命令形式將它們嵌入。",
  "Runs the upstream KernelPatch kptools, compiled to WebAssembly, inside the patch worker.":
    "在修補 worker 內執行編譯為 WebAssembly 的上游 KernelPatch kptools。",
  "Injects the module into the ramdisk of init_boot.img (GKI 13+) or of a boot.img that carries one, exactly as ksud does: init becomes init.real, a new init (ksuinit) is added, and kernelsu.ko is added next to it.":
    "完全依 ksud 的做法把模組注入 init_boot.img（GKI 13+）或帶 ramdisk 的 boot.img 的 ramdisk：init 變成 init.real，新增一個 init（ksuinit），並在旁邊加上 kernelsu.ko。",
  "The build ships one loadable module per KMI (GPL-2.0-only, redistributed unmodified as a separate program with its own licence; see THIRD_PARTY_LICENSES/kernelsu/). A module supplied by the user overrides the bundled one, and either way its .modinfo and the kernel version it was built for are checked before anything is written.":
    "這個建置為每個 KMI 隨附一個可載入模組（GPL-2.0-only，作為獨立程式原樣再散布，並附有自己的授權記錄；見 THIRD_PARTY_LICENSES/kernelsu/）。使用者提供的模組會覆寫隨附模組，無論哪一種，寫入之前都會檢查它的 .modinfo 以及它所針對的核心版本。",
  "The KMI is read from the kernel banner when the image carries a kernel, and can be selected otherwise; init_boot.img carries no kernel, so there it has to be selected.":
    "映像帶核心時會從核心 banner 讀出 KMI，否則可以手動選擇；init_boot.img 不帶核心，所以必須在那裡選擇。",
  "Refuses a ramdisk that is already patched by Magisk, and reports when KernelSU is already installed.":
    "拒絕已被 Magisk 修補過的 ramdisk，並在 KernelSU 已安裝時如實回報。",
  "The KernelSU manager app (me.weishu.kernelsu) has to be installed on the device.":
    "裝置上必須安裝 KernelSU 管理器應用程式（me.weishu.kernelsu）。",
  "Rewrites the ramdisk the way Magisk's own patcher does: init becomes magiskinit (0750), overlay.d/ and overlay.d/sbin are created (0750), magisk.xz, stub.xz and init-ld.xz are added (0644), and .backup/.magisk holds the configuration (000).":
    "依 Magisk 自帶修補工具的方式改寫 ramdisk：init 變成 magiskinit（0750），建立 overlay.d/ 與 overlay.d/sbin（0750），加入 magisk.xz、stub.xz 與 init-ld.xz（0644），設定放在 .backup/.magisk（000）。",
  "The stock init is replaced rather than renamed.": "原廠 init 是被取代，而不是改名。",
  "fstab entries are patched exactly like magiskboot does when verity or forced encryption are not kept: the matching flag strings are removed and verity_key is dropped.":
    "在不保留 verity 或強制加密時，fstab 項目會完全依 magiskboot 的做法修補：移除相符的旗標字串並去掉 verity_key。",
  "SHA1 in the configuration is the digest of the whole source image, like Magisk's app records it.":
    "設定裡的 SHA1 是整個來源映像的摘要，與 Magisk 應用程式記錄的一致。",
  "Refuses a ramdisk that Magisk or KernelSU already patched.": "拒絕已被 Magisk 或 KernelSU 修補過的 ramdisk。",
  "Like Magisk's own patcher, the stock init is kept inside the ramdisk as .backup/init.xz, together with .backup/.rmlist, so Magisk's app can restore the image by itself.":
    "與 Magisk 自帶修補工具一樣，原廠 init 會以 .backup/init.xz 的形式保留在 ramdisk 內，並附上 .backup/.rmlist，這樣 Magisk 應用程式可以自行還原映像。",
  "The payloads are bundled from the pinned Magisk release, which is GPL-3.0.":
    "載荷封裝自固定版本的 Magisk release，其授權條款為 GPL-3.0。",
  "The Magisk app (com.topjohnwu.magisk) has to be installed for the produced image to be usable.":
    "產物映像要能用，必須安裝 Magisk 應用程式（com.topjohnwu.magisk）。",

  // provider analysis notes
  "The Mock Provider never claims to root a device and leaves the ramdisk contents untouched.":
    "Mock 提供者從不聲稱能讓裝置取得 root，也不更動 ramdisk 內容。",
  "The kernel is patched, so boot.img is the only valid target: init_boot.img contains no kernel.":
    "修補的是核心，所以只有 boot.img 是有效目標：init_boot.img 裡沒有核心。",
  "CONFIG_KALLSYMS=y is verified on the target kernel before any patch is applied.":
    "套用修補之前會先在目標核心上驗證 CONFIG_KALLSYMS=y。",
  "The ramdisk is modified: on GKI Android 13+ that is init_boot.img, otherwise a boot.img that carries a ramdisk.":
    "被修改的是 ramdisk：在 GKI Android 13+ 上是 init_boot.img，否則就是帶 ramdisk 的 boot.img。",
  "The loadable module has to match the device KMI (for example android15-6.6) and is supplied by the user; it is verified before use.":
    "可載入模組必須與裝置 KMI 相符（例如 android15-6.6），由使用者提供，並在使用前驗證。",
  "A ramdisk that Magisk already patched is refused.": "已被 Magisk 修補過的 ramdisk 會被拒絕。",
  "Vendor boot images with a ramdisk table are not supported yet.":
    "帶 ramdisk 表的 vendor boot 映像目前還不支援。",
  "The KernelSU manager app (me.weishu.kernelsu) has to be installed for the produced image to be usable.":
    "產物映像要能用，必須安裝 KernelSU 管理器應用程式（me.weishu.kernelsu）。",
  "Magisk is GPL-3.0 throughout and its payloads are bundled, so nothing has to be supplied.":
    "Magisk 整體採用 GPL-3.0，其載荷已隨附，因此無需自備。",
  "The stock init is replaced rather than renamed. Magisk's own patcher also keeps a compressed copy of it inside the ramdisk for its uninstall path, which this build does not write, so restoring later needs a stock image.":
    "原廠 init 是被取代而不是改名。Magisk 自帶修補工具為了卸載路徑還會在 ramdisk 內保留它的一份壓縮副本，而本建置不寫這份副本，所以日後還原需要自備原廠映像。",
  "A ramdisk that Magisk or KernelSU already patched is refused.": "已被 Magisk 或 KernelSU 修補過的 ramdisk 會被拒絕。",
  "The Magisk app (com.topjohnwu.magisk) has to be installed on the device for the produced image to be usable.":
    "裝置上必須安裝 Magisk 應用程式（com.topjohnwu.magisk），產物映像才能使用。",

  // KernelPatch flavours
  "Upstream KernelPatch": "上游 KernelPatch",
  "Aster fork": "Aster 分支",
  "official APatch release 11224 (KernelPatch 0.13.3)":
    "官方 APatch release 11224（KernelPatch 0.13.3）",
  "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981 (upstream 0.13.8 plus the Aster manager trust commit)":
    "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981（上游 0.13.8 加上 Aster 管理器信任的提交）",

  // plan steps
  "Analyze boot image": "分析 boot 映像",
  "Extract kernel image": "取出核心映像",
  "Load KernelPatch artifacts": "載入 KernelPatch 產物",
  "Inject KernelPatch into the kernel": "把 KernelPatch 注入核心",
  "Repack the boot image": "重新封裝 boot 映像",
  "Verify the produced image": "驗證產物映像",
  "Read the boot image": "讀取 boot 映像",
  "Expand the ramdisk": "展開 ramdisk",
  "Check the ramdisk and the module": "檢查 ramdisk 與模組",
  "Rewrite the ramdisk": "改寫 ramdisk",
  "Check the ramdisk": "檢查 ramdisk",
  "Analyze image": "分析映像",
  "Extract sections": "取出各區段",
  "Prepare payload": "準備載荷",
  "Apply mock patch": "套用 mock 修補",
  "Repack boot image": "重新封裝 boot 映像",
  "Verify output": "驗證輸出",

  // progress lines
  "Extracting and expanding the kernel image": "取出並展開核心映像",
  "Extracting image sections": "取出映像區段",
  "Injecting KernelPatch into the kernel": "正在把 KernelPatch 注入核心",
  "Loading KernelPatch artifacts": "正在載入 KernelPatch 產物",
  "Repacking the boot image": "正在重新封裝 boot 映像",
  "Verifying the produced image": "正在驗證產物映像",
  "Checking the ramdisk": "正在檢查 ramdisk",
  "Checking the ramdisk and the module": "正在檢查 ramdisk 與模組",
  "Rewriting the ramdisk": "正在改寫 ramdisk",
  "Expanding the ramdisk": "正在展開 ramdisk",
  "Applying the mock patch": "正在套用 mock 修補",
  "Preparing the mock manifest": "正在準備 mock 清單",

  // warnings a run reports
  "APatch patches the kernel only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "APatch 只修補核心；是否刷入這個映像是使用者自己的責任，ImageForge 從不刷入裝置。",
  "KernelSU patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "KernelSU 只修補 ramdisk；是否刷入這個映像是使用者自己的責任，ImageForge 從不刷入裝置。",
  "Magisk patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "Magisk 只修補 ramdisk；是否刷入這個映像是使用者自己的責任，ImageForge 從不刷入裝置。",
  "Magisk's app can restore this image by itself: the stock init is kept inside the ramdisk as .backup/init.xz. Keep a stock image anyway.":
    "Magisk 應用程式可以自行還原這個映像：原廠 init 以 .backup/init.xz 的形式留在 ramdisk 裡。但無論如何都請保留一份原廠映像。",
  "The ramdisk has no init entry, so the wrapper cannot hand over to the stock init.":
    "ramdisk 裡沒有 init 項目，因此 wrapper 無法交棒給原廠 init。",
  "The Mock Provider does not root the device and does not modify ramdisk contents.":
    "Mock 提供者不會讓裝置取得 root，也不修改 ramdisk 內容。",
  "The produced image has no ramdisk to read back.": "產物映像裡沒有可回讀的 ramdisk。",
  "The Magisk configuration in the produced ramdisk looks wrong.":
    "產物 ramdisk 裡的 Magisk 設定看起來不對。",
  // the field names the result and the plan record, shown as labels
  archiveEntriesAfter: "封存項目數（修補後）",
  archiveEntriesBefore: "封存項目數（修補前）",
  artifact: "產物",
  artifactSha256: "產物 SHA-256",
  artifactVerified: "產物已驗證",
  artifactVersion: "產物版本",
  backupInitSha256: "備份 init 的 SHA-256",
  cmdlineMarker: "cmdline 標記",
  config: "Magisk 設定內容",
  configSha256: "設定 SHA-256",
  fstabPatched: "fstab 修補",
  headerVersion: "標頭版本",
  imageSizeAfter: "輸出映像大小",
  imageSizeBefore: "原始映像大小",
  initBackupEntry: "init 備份項目",
  initEntry: "init 項目",
  initHandling: "init 處理方式",
  injection: "注入方式",
  kallsyms: "CONFIG_KALLSYMS",
  kallsymsAll: "CONFIG_KALLSYMS_ALL",
  keepForceEncrypt: "保留強制加密",
  keepSignature: "保留原 AVB 位元組",
  keepVerity: "保留 verity",
  kernelCompression: "核心壓縮",
  kernelPatchFlavor: "KernelPatch 風味",
  kernelPatchMode: "KernelPatch 模式",
  kernelPatchSource: "核心映像來源",
  kernelPatchVersion: "KernelPatch 版本",
  kernelRawSizeAfter: "核心展開後大小（修補後）",
  kernelRawSizeBefore: "核心展開後大小（修補前）",
  kernelSectionSize: "核心區段大小",
  kernelSize: "核心大小",
  kernelSizeAfter: "核心大小（修補後）",
  kernelSizeBefore: "核心大小（修補前）",
  kmi: "裝置 KMI",
  kmiSource: "KMI 來源",
  kpimgSha256: "kpimg SHA-256",
  kpimgSource: "kpimg 來源",
  kpimgVersion: "kpimg 版本",
  kpmCount: "KP 模組數",
  kpmModules: "KP 模組",
  kptoolsArtifact: "kptools 產物",
  kptoolsConfirmation: "kptools 回讀確認",
  kptoolsSha256: "kptools SHA-256",
  kptoolsVersion: "kptools 版本",
  ksuConfig: "ksu_config 項目",
  magiskArtifacts: "Magisk 產物",
  magiskinitSha256: "magiskinit SHA-256",
  manifestKind: "清單類型",
  mock: "Mock 提供者",
  moduleArtifact: "模組產物",
  moduleDeclaredName: "模組宣告名稱",
  moduleDigest: "模組摘要",
  moduleEntry: "模組項目名",
  moduleLicense: "模組授權條款",
  moduleParameters: "模組參數",
  moduleSize: "模組大小",
  moduleSource: "模組來源",
  moduleVermagic: "模組 vermagic",
  payloadDigests: "載荷摘要",
  payloads: "載荷檔案",
  planId: "計畫 ID",
  preinitDevice: "預先初始化分割區",
  preserveImageSize: "保持原映像大小",
  provider: "提供者",
  providerName: "提供者名稱",
  ramdiskCompression: "ramdisk 壓縮",
  ramdiskSectionSize: "ramdisk 區段大小",
  ramdiskSectionSizeAfter: "ramdisk 區段大小（修補後）",
  ramdiskSectionSizeBefore: "ramdisk 區段大小（修補前）",
  release: "版本",
  reproducible: "可重現性",
  requiredManager: "需要的管理器",
  rmlist: "新增路徑清單",
  sha1Source: "SHA1 來源",
  sourceImageSha256: "來源映像 SHA-256",
  stockInitSaved: "原廠 init 備份",
  superkeyMode: "superkey 模式",
  target: "目標分割區",
  targetRamdisk: "目標 ramdisk",
  verityKeyRemoved: "verity_key 已移除",
  // what the workspace found in the file the user opened
  "Package": "安裝包",
  "Partition image": "分割區映像",
  "Android boot image": "Android boot 映像",
  "Filesystem image": "檔案系統映像",
  "Ramdisk archive": "ramdisk 封存檔",
  "Boot logo container": "開機 logo 容器",
  "Report": "報告",
  "Binary blob": "二進位資料塊",
  "Raw bytes": "原始位元組",
  "Zip archive": "Zip 封存檔",
  "Android OTA payload": "Android OTA 包（payload.bin）",
  "Android sparse image": "Android sparse 映像",
  "GZip stream": "GZip 流",
  "LZ4 legacy stream": "LZ4 legacy 流",
  "LZ4 frame": "LZ4 frame",
  "XZ stream": "XZ 流",
  "LZMA stream": "LZMA 流",
  "BZip2 stream": "BZip2 流",
  "Zstandard stream": "Zstandard 流",
  "CPIO archive": "CPIO 封存檔",
  "Unknown container": "未知容器",
  "Android init_boot image": "Android init_boot 映像",
  "Android vendor boot image": "Android vendor boot 映像",
  "ext4 filesystem": "ext4 檔案系統",
  "EROFS filesystem": "EROFS 檔案系統",
  "F2FS filesystem": "F2FS 檔案系統",
  "Device tree blob": "裝置樹（DTB）",
  "ELF object": "ELF 物件",
  "Unknown content": "未知內容",
};