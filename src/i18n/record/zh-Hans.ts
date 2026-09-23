export const zhHans: Record<string, string> = {
  // logo containers
  "MediaTek logo (Xiaomi and other MTK devices)": "MediaTek logo（小米等 MTK 机型）",
  // analysis report
  Image: "镜像",
  Boot: "启动",
  Kernel: "内核",
  Ramdisk: "Ramdisk",
  Metadata: "元数据",
  "Technical details": "技术细节",
  File: "文件",
  Size: "大小",
  Format: "格式",
  Header: "头部",
  "Page size": "页大小",
  "OS version": "OS 版本",
  Cmdline: "Cmdline",
  "Image name": "镜像名称",
  "Kernel address": "内核地址",
  "Ramdisk address": "Ramdisk 地址",
  "Tags address": "Tags 地址",
  "Second stage": "第二阶段",
  Architecture: "架构",
  Payload: "载荷",
  Compression: "压缩",
  "Expanded size": "展开后大小",
  Archive: "归档格式",
  Entries: "条目数",
  Directories: "目录",
  Files: "文件",
  Symlinks: "符号链接",
  "Other entries": "其他条目",
  Bootconfig: "Bootconfig",
  "Recovery DTBO": "Recovery DTBO",
  DTB: "DTB",
  "AVB signature": "AVB 签名",
  "Image id": "镜像 ID",
  "Vendor ramdisk entries": "vendor ramdisk 条目数",
  "Vendor ramdisk table": "vendor ramdisk 表",
  Magic: "魔数",
  "Header size": "头部大小",
  "Total size": "总大小",
  warning: "警告",
  "Existing patch": "已有修补",
  "(empty)": "（空）",
  undetermined: "未确定",
  absent: "无",
  "not a CPIO archive": "不是 CPIO 归档",
  "not supported": "不支持",
  unavailable: "不可用",
  "no kernel": "没有内核",
  "Android Boot Image": "Android Boot 镜像",
  "Android Vendor Boot Image": "Android Vendor Boot 镜像",
  "CPIO newc": "CPIO newc",
  "CPIO newc (crc)": "CPIO newc (crc)",
  Uncompressed: "未压缩",
  GZip: "GZip",
  "LZ4 (legacy)": "LZ4（legacy）",
  "LZ4 (frame)": "LZ4（frame）",
  XZ: "XZ",
  LZMA: "LZMA",
  BZip2: "BZip2",
  Zstandard: "Zstandard",
  "CPIO (uncompressed)": "CPIO（未压缩）",
  Unknown: "未知",
  "The kernel payload is compressed or uses an unknown container.":
    "内核载荷是压缩过的，或者使用了未知的容器。",
  "Android ramdisks are normally CPIO newc archives.": "Android 的 ramdisk 通常是 CPIO newc 归档。",
  "KernelPatch (APatch or one of its forks): the kernel carries KP1158":
    "KernelPatch（APatch 或其分支）：内核里带有 KP1158",
  "Magisk: overlay.d/ or .backup/.magisk is in the ramdisk":
    "Magisk：ramdisk 里有 overlay.d/ 或 .backup/.magisk",
  "KernelSU: kernelsu.ko is in the ramdisk": "KernelSU：ramdisk 里有 kernelsu.ko",
  "a previous ramdisk patch kept init.real": "之前的 ramdisk 修补保留了 init.real",

  // provider descriptions
  "Structural placeholder that exercises the whole pipeline: it rewrites the kernel cmdline and writes a bootconfig manifest. It does not grant root.":
    "结构性占位实现，用来跑通整条流水线：它改写内核 cmdline 并写入 bootconfig 清单。它不会授予 root。",
  "KernelPatch based root: the KernelPatch core image (kpimg) is injected into the kernel inside boot.img.":
    "基于 KernelPatch 的 root：KernelPatch 核心镜像（kpimg）会被注入 boot.img 内的内核。",
  "Kernel based root: the KernelSU loadable module is injected into the ramdisk, which replaces init.":
    "基于内核的 root：KernelSU 可加载模块被注入 ramdisk，并替换 init。",
  "Systemless root: magiskinit replaces the ramdisk init, and Magisk's payloads are written under overlay.d/sbin.":
    "免系统修改（systemless）的 root：magiskinit 替换 ramdisk 的 init，Magisk 的载荷写入 overlay.d/sbin 下。",

  // descriptor notes
  "Never describes itself as a root solution.": "它从不自称是 root 方案。",
  "Used to validate analysis, planning, worker execution, verification and download.":
    "用于验证分析、计划、worker 执行、校验与下载这几步。",
  "Patches the kernel only, therefore boot.img is the only valid target: init_boot.img carries no kernel.":
    "只修补内核，因此只有 boot.img 是有效目标：init_boot.img 里没有内核。",
  "Requires CONFIG_KALLSYMS=y in the target kernel. This is verified before the patch runs.":
    "要求目标内核开启 CONFIG_KALLSYMS=y。修补运行之前会先验证这一点。",
  "Uncompressed, gzip, LZ4 (frame or legacy, independent or dependent blocks) and xz kernels are supported and re-compressed in the original container; LZMA, BZip2 and Zstandard kernels are refused.":
    "支持未压缩、gzip、LZ4（frame 或 legacy，独立块或依赖块）以及 xz 的内核，并会按原容器重新压缩；LZMA、BZip2 与 Zstandard 的内核会被拒绝。",
  "The superkey is optional and unset by default, matching the manager default where authentication is signature based.":
    "superkey 是可选的，默认不设置，与管理器默认的“按签名认证”一致。",
  "The superkey is optional and left unset by default, matching the manager default where authentication is signature based.":
    "superkey 是可选的，默认不设置，与管理器默认的“按签名认证”一致。",
  "Three KernelPatch core images are registered, because each build only trusts the manager it was made for: the official upstream build (me.bmax.apatch), the Aster fork build (me.yuki.aster) and the extended branch FolkPatch ships (me.yuki.folk).":
    "登记了三个 KernelPatch 核心镜像——因为每个构建只信任它为之打造的管理器：官方上游构建（me.bmax.apatch）、Aster 分支构建（me.yuki.aster），以及 FolkPatch 所用的扩展分支（me.yuki.folk）。",
  "A custom flavour takes the core image from the run instead of the registry: the file has to start with the KernelPatch magic, and its digest and version are reported in the result.":
    "自定义口味改为从本次运行取核心镜像，而不是从注册表取：文件必须以 KernelPatch 魔数开头，其结果里会报告摘要与版本。",
  "KernelPatch modules (KPM) can be attached, and are embedded by kptools with the same command shape FolkTool uses.":
    "可以附加 KP 模块（.kpm 文件），kptools 会用与 FolkTool 相同的命令形式把它们嵌入。",
  "Runs the upstream KernelPatch kptools, compiled to WebAssembly, inside the patch worker.":
    "在修补 worker 内运行编译为 WebAssembly 的上游 KernelPatch kptools。",
  "Injects the module into the ramdisk of init_boot.img (GKI 13+) or of a boot.img that carries one, exactly as ksud does: init becomes init.real, a new init (ksuinit) is added, and kernelsu.ko is added next to it.":
    "完全按 ksud 的做法把模块注入 init_boot.img（GKI 13+）或带 ramdisk 的 boot.img 的 ramdisk：init 变为 init.real，新增一个 init（ksuinit），并在旁边加上 kernelsu.ko。",
  "The build ships one loadable module per KMI (GPL-2.0-only, redistributed unmodified as a separate program with its own licence; see THIRD_PARTY_LICENSES/kernelsu/). A module supplied by the user overrides the bundled one, and either way its .modinfo and the kernel version it was built for are checked before anything is written.":
    "这个构建为每个 KMI 随包提供一个可加载模块（GPL-2.0-only，作为独立程序原样再分发，并附有自己的许可证记录；见 THIRD_PARTY_LICENSES/kernelsu/）。用户提供的模块会覆盖随包模块，无论哪种情况，写入之前都会检查它的 .modinfo 以及它所针对的内核版本。",
  "The KMI is read from the kernel banner when the image carries a kernel, and can be selected otherwise; init_boot.img carries no kernel, so there it has to be selected.":
    "镜像带内核时会从内核 banner 读出 KMI，否则可以手动选择；init_boot.img 不带内核，所以必须在那里选择。",
  "Refuses a ramdisk that is already patched by Magisk, and reports when KernelSU is already installed.":
    "拒绝已被 Magisk 修补过的 ramdisk，并在 KernelSU 已安装时如实报告。",
  "The KernelSU manager app (me.weishu.kernelsu) has to be installed on the device.":
    "设备上必须安装 KernelSU 管理器应用（me.weishu.kernelsu）。",
  "Rewrites the ramdisk the way Magisk's own patcher does: init becomes magiskinit (0750), overlay.d/ and overlay.d/sbin are created (0750), magisk.xz, stub.xz and init-ld.xz are added (0644), and .backup/.magisk holds the configuration (000).":
    "按 Magisk 自带修补工具的方式改写 ramdisk：init 变为 magiskinit（0750），创建 overlay.d/ 与 overlay.d/sbin（0750），加入 magisk.xz、stub.xz 与 init-ld.xz（0644），配置放在 .backup/.magisk（000）。",
  "The stock init is replaced rather than renamed.": "原厂 init 是被替换，而不是改名。",
  "fstab entries are patched exactly like magiskboot does when verity or forced encryption are not kept: the matching flag strings are removed and verity_key is dropped.":
    "在不保留 verity 或强制加密时，fstab 条目会完全按 magiskboot 的做法修补：移除匹配的标志字符串并去掉 verity_key。",
  "SHA1 in the configuration is the digest of the whole source image, like Magisk's app records it.":
    "配置里的 SHA1 是整个源镜像的摘要，与 Magisk 应用记录的一致。",
  "Refuses a ramdisk that Magisk or KernelSU already patched.": "拒绝已被 Magisk 或 KernelSU 修补过的 ramdisk。",
  "Like Magisk's own patcher, the stock init is kept inside the ramdisk as .backup/init.xz, together with .backup/.rmlist, so Magisk's app can restore the image by itself.":
    "与 Magisk 自带修补工具一样，原厂 init 会以 .backup/init.xz 的形式保留在 ramdisk 内，并附上 .backup/.rmlist，这样 Magisk 应用可以自行还原镜像。",
  "The payloads are bundled from the pinned Magisk release, which is GPL-3.0.":
    "载荷打包自固定版本的 Magisk release，其许可证为 GPL-3.0。",
  "The Magisk app (com.topjohnwu.magisk) has to be installed for the produced image to be usable.":
    "产物镜像要能用，必须安装 Magisk 应用（com.topjohnwu.magisk）。",

  // provider analysis notes
  "The Mock Provider never claims to root a device and leaves the ramdisk contents untouched.":
    "Mock 提供方从不声称能让设备获得 root，也不改动 ramdisk 内容。",
  "The kernel is patched, so boot.img is the only valid target: init_boot.img contains no kernel.":
    "修补的是内核，所以只有 boot.img 是有效目标：init_boot.img 里没有内核。",
  "CONFIG_KALLSYMS=y is verified on the target kernel before any patch is applied.":
    "打补丁之前会先在目标内核上验证 CONFIG_KALLSYMS=y。",
  "The ramdisk is modified: on GKI Android 13+ that is init_boot.img, otherwise a boot.img that carries a ramdisk.":
    "被修改的是 ramdisk：在 GKI Android 13+ 上是 init_boot.img，否则是带 ramdisk 的 boot.img。",
  "The loadable module has to match the device KMI (for example android15-6.6) and is supplied by the user; it is verified before use.":
    "可加载模块必须与设备 KMI 匹配（例如 android15-6.6），由用户提供，并在使用前校验。",
  "A ramdisk that Magisk already patched is refused.": "已被 Magisk 修补过的 ramdisk 会被拒绝。",
  "Vendor boot images with a ramdisk table are not supported yet.":
    "带 ramdisk 表的 vendor boot 镜像目前还不支持。",
  "The KernelSU manager app (me.weishu.kernelsu) has to be installed for the produced image to be usable.":
    "产物镜像要能用，必须安装 KernelSU 管理器应用（me.weishu.kernelsu）。",
  "Magisk is GPL-3.0 throughout and its payloads are bundled, so nothing has to be supplied.":
    "Magisk 整体采用 GPL-3.0，其载荷已随包提供，因此无需自备。",
  "The stock init is replaced rather than renamed. Magisk's own patcher also keeps a compressed copy of it inside the ramdisk for its uninstall path, which this build does not write, so restoring later needs a stock image.":
    "原厂 init 是被替换而不是改名。Magisk 自带修补工具为卸载路径还会在 ramdisk 内保留它的一份压缩副本，而本构建不写这份副本，所以之后还原需要自备原厂镜像。",
  "A ramdisk that Magisk or KernelSU already patched is refused.": "已被 Magisk 或 KernelSU 修补过的 ramdisk 会被拒绝。",
  "The Magisk app (com.topjohnwu.magisk) has to be installed on the device for the produced image to be usable.":
    "设备上必须安装 Magisk 应用（com.topjohnwu.magisk），产物镜像才能使用。",

  // KernelPatch flavours
  "Upstream KernelPatch": "上游 KernelPatch",
  "Aster fork": "Aster 分支",
  "FolkPatch": "FolkPatch",
  "official APatch release 11224 (KernelPatch 0.13.3)":
    "官方 APatch release 11224（KernelPatch 0.13.3）",
  "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981 (upstream 0.13.8 plus the Aster manager trust commit)":
    "LyraVoid/KernelPatch-Aster 0ff4ae2b8cad8058c408d8a5bdb12569b1a84981（上游 0.13.8 加上 Aster 管理器信任的提交）",
  "LyraVoid/KernelPatch 1de1a37304406615a3c3b6f1d28d2cd926b93a0f (release 0.13.8 of the extended branch FolkPatch is built on)":
    "LyraVoid/KernelPatch 1de1a37304406615a3c3b6f1d28d2cd926b93a0f（FolkPatch 所用的扩展分支的 0.13.8 发布）",

  // plan steps
  "Analyze boot image": "分析 boot 镜像",
  "Extract kernel image": "抽取内核镜像",
  "Load KernelPatch artifacts": "加载 KernelPatch 制品",
  "Inject KernelPatch into the kernel": "把 KernelPatch 注入内核",
  "Repack the boot image": "重打包 boot 镜像",
  "Verify the produced image": "校验产物镜像",
  "Read the boot image": "读取 boot 镜像",
  "Expand the ramdisk": "展开 ramdisk",
  "Check the ramdisk and the module": "检查 ramdisk 与模块",
  "Rewrite the ramdisk": "改写 ramdisk",
  "Check the ramdisk": "检查 ramdisk",
  "Analyze image": "分析镜像",
  "Extract sections": "抽取各分区",
  "Prepare payload": "准备载荷",
  "Apply mock patch": "应用 mock 修补",
  "Repack boot image": "重打包 boot 镜像",
  "Verify output": "校验输出",

  // progress lines
  "Extracting and expanding the kernel image": "抽取并展开内核镜像",
  "Extracting image sections": "抽取镜像分区",
  "Injecting KernelPatch into the kernel": "正在把 KernelPatch 注入内核",
  "Loading KernelPatch artifacts": "正在加载 KernelPatch 制品",
  "Repacking the boot image": "正在重打包 boot 镜像",
  "Verifying the produced image": "正在校验产物镜像",
  "Checking the ramdisk": "正在检查 ramdisk",
  "Checking the ramdisk and the module": "正在检查 ramdisk 与模块",
  "Rewriting the ramdisk": "正在改写 ramdisk",
  "Expanding the ramdisk": "正在展开 ramdisk",
  "Applying the mock patch": "正在应用 mock 修补",
  "Preparing the mock manifest": "正在准备 mock 清单",

  // warnings a run reports
  "APatch patches the kernel only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "APatch 只修补内核；是否刷入这个镜像是用户自己的责任，ImageForge 从不刷入设备。",
  "KernelSU patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "KernelSU 只修补 ramdisk；是否刷入这个镜像是用户自己的责任，ImageForge 从不刷入设备。",
  "Magisk patches the ramdisk only; flashing this image is the user's responsibility and ImageForge never flashes devices.":
    "Magisk 只修补 ramdisk；是否刷入这个镜像是用户自己的责任，ImageForge 从不刷入设备。",
  "Magisk's app can restore this image by itself: the stock init is kept inside the ramdisk as .backup/init.xz. Keep a stock image anyway.":
    "Magisk 应用可以自行还原这个镜像：原厂 init 以 .backup/init.xz 的形式留在 ramdisk 里。但无论如何都请保留一份原厂镜像。",
  "The ramdisk has no init entry, so the wrapper cannot hand over to the stock init.":
    "ramdisk 里没有 init 条目，因此 wrapper 无法交接到原厂 init。",
  "The Mock Provider does not root the device and does not modify ramdisk contents.":
    "Mock 提供方不会让设备获得 root，也不修改 ramdisk 内容。",
  "The produced image has no ramdisk to read back.": "产物镜像里没有可回读的 ramdisk。",
  "The Magisk configuration in the produced ramdisk looks wrong.":
    "产物 ramdisk 里的 Magisk 配置看起来不对。",
  // the field names the result and the plan record, shown as labels
  archiveEntriesAfter: "归档条目数（补丁后）",
  archiveEntriesBefore: "归档条目数（补丁前）",
  artifact: "制品",
  artifactSha256: "制品 SHA-256",
  artifactVerified: "制品已验证",
  artifactVersion: "制品版本",
  backupInitSha256: "备份 init 的 SHA-256",
  cmdlineMarker: "cmdline 标记",
  config: "Magisk 配置内容",
  configSha256: "配置 SHA-256",
  fstabPatched: "fstab 修补",
  headerVersion: "头部版本",
  imageSizeAfter: "输出镜像大小",
  imageSizeBefore: "原始镜像大小",
  initBackupEntry: "init 备份条目",
  initEntry: "init 条目",
  initHandling: "init 处理方式",
  injection: "注入方式",
  kallsyms: "CONFIG_KALLSYMS",
  kallsymsAll: "CONFIG_KALLSYMS_ALL",
  keepForceEncrypt: "保留强制加密",
  keepSignature: "保留原 AVB 字节",
  keepVerity: "保留 verity",
  kernelCompression: "内核压缩",
  kernelPatchFlavor: "KernelPatch 口味",
  kernelPatchMode: "KernelPatch 模式",
  kernelPatchSource: "核心镜像来源",
  kernelPatchVersion: "KernelPatch 版本",
  kernelRawSizeAfter: "内核展开后大小（补丁后）",
  kernelRawSizeBefore: "内核展开后大小（补丁前）",
  kernelSectionSize: "内核分区大小",
  kernelSize: "内核大小",
  kernelSizeAfter: "内核大小（补丁后）",
  kernelSizeBefore: "内核大小（补丁前）",
  kmi: "设备 KMI",
  kmiSource: "KMI 来源",
  kpimgSha256: "kpimg SHA-256",
  kpimgSource: "kpimg 来源",
  kpimgVersion: "kpimg 版本",
  kpmCount: "KP 模块数",
  kpmModules: "KP 模块",
  kptoolsArtifact: "kptools 制品",
  kptoolsConfirmation: "kptools 回读确认",
  kptoolsSha256: "kptools SHA-256",
  kptoolsVersion: "kptools 版本",
  ksuConfig: "ksu_config 条目",
  magiskArtifacts: "Magisk 制品",
  magiskinitSha256: "magiskinit SHA-256",
  manifestKind: "清单类型",
  mock: "Mock 提供方",
  moduleArtifact: "模块制品",
  moduleDeclaredName: "模块声明名称",
  moduleDigest: "模块摘要",
  moduleEntry: "模块条目名",
  moduleLicense: "模块许可证",
  moduleParameters: "模块参数",
  moduleSize: "模块大小",
  moduleSource: "模块来源",
  moduleVermagic: "模块 vermagic",
  payloadDigests: "载荷摘要",
  payloads: "载荷文件",
  planId: "计划 ID",
  preinitDevice: "预初始化分区",
  preserveImageSize: "保持原镜像大小",
  provider: "提供方",
  providerName: "提供方名称",
  ramdiskCompression: "ramdisk 压缩",
  ramdiskSectionSize: "ramdisk 分区大小",
  ramdiskSectionSizeAfter: "ramdisk 分区大小（补丁后）",
  ramdiskSectionSizeBefore: "ramdisk 分区大小（补丁前）",
  release: "版本",
  reproducible: "可复现性",
  requiredManager: "需要的管理器",
  rmlist: "新增路径清单",
  sha1Source: "SHA1 来源",
  sourceImageSha256: "源镜像 SHA-256",
  stockInitSaved: "原厂 init 备份",
  superkeyMode: "superkey 模式",
  target: "目标分区",
  targetRamdisk: "目标 ramdisk",
  verityKeyRemoved: "verity_key 已移除",
  // what the workspace found in the file the user opened
  "Package": "安装包",
  "Partition image": "分区镜像",
  "Android boot image": "Android boot 镜像",
  "Filesystem image": "文件系统镜像",
  "Ramdisk archive": "ramdisk 归档",
  "Boot logo container": "开机 logo 容器",
  "Report": "报告",
  "Binary blob": "二进制数据块",
  "Raw bytes": "原始字节",
  "Zip archive": "Zip 归档",
  "Android OTA payload": "Android OTA 包（payload.bin）",
  "Android sparse image": "Android sparse 镜像",
  "GZip stream": "GZip 流",
  "LZ4 legacy stream": "LZ4 legacy 流",
  "LZ4 frame": "LZ4 frame",
  "XZ stream": "XZ 流",
  "LZMA stream": "LZMA 流",
  "BZip2 stream": "BZip2 流",
  "Zstandard stream": "Zstandard 流",
  "CPIO archive": "CPIO 归档",
  "Unknown container": "未知容器",
  "Android init_boot image": "Android init_boot 镜像",
  "Android vendor boot image": "Android vendor boot 镜像",
  "ext4 filesystem": "ext4 文件系统",
  "EROFS filesystem": "EROFS 文件系统",
  "F2FS filesystem": "F2FS 文件系统",
  "Device tree blob": "设备树（DTB）",
  "ELF object": "ELF 对象",
  "Unknown content": "未知内容",
"Logical partition image (super)": "逻辑分区镜像（super）",
"Splash or logo image": "开机图片（第一屏 / logo）",
};