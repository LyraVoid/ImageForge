<p align="center">
  <img src="docs/images/icon.svg" width="88" height="88" alt="ImageForge">
</p>

<h1 align="center">ImageForge</h1>

<p align="center">
  <a href="README.md">English</a> ·
  <b>简体中文</b> ·
  <a href="README.ja.md">日本語</a>
</p>

**一个在浏览器里运行的 Android boot 镜像工具。** 用 Magisk、KernelSU、APatch 或其任意分支给镜像打补丁；
打开 OTA 全量包取出里面的分区；浏览 `super`／`erofs`／`ext4` 镜像里有什么；对比两个镜像的差异；
替换开机 logo 或开机动画；以及在动手之前先看清一个文件到底是什么。

![工具页](docs/images/tools.png)

没有服务器、没有账号、没有遥测。解析、修补与编解码都在页面的 Web Worker 里跑，需要性能或需要上层 C 实现的部分
编译成 WebAssembly 原样运行。**不上传任何东西，也从不刷机**：一次运行的结果就是你下载到的一个文件。

仓库地址：<https://github.com/LyraVoid/ImageForge>

## 工具

| 工具 | 用途 | 状态 |
| --- | --- | --- |
| **修补镜像** | 分析 boot 镜像、选择修补方式、生成修补计划、在 worker 里执行、校验结果并下载。支持 KernelSU 家族的 5 个管理器、3 个 KernelPatch 核心镜像、Magisk 家族的 3 个管理器 | 可用 |
| **从包中提取** | 打开 OTA 的 `payload.bin` 或厂商压缩包（8 GB 的包按范围读取，绝不整体载入内存），取出 `boot`、`init_boot`、`vendor_boot` 或任意条目 | 可用 |
| **解包分区** | 打开 `super` 镜像及其逻辑分区、sparse 镜像、`erofs`、`ext4`；按范围浏览、读出单个文件，并把 sparse 与 `super` 镜像重新打包 | 可用 |
| **开机 logo** | 读取 splash 镜像（OPPO/Realme/一加）或 MediaTek logo 镜像，查看其中的画面并替换其中一张 | 可用 |
| **开机动画** | 打开 `bootanimation.zip`、播放、替换帧、编辑 `desc.txt`、重新打包 | 可用 |
| **对比镜像** | 逐字节比较两个文件，并指出每处差异落在 boot 镜像的哪个分段 | 可用 |
| **查看** | 只读：这个文件是什么、里面有什么、已经被什么打过补丁 | 可用 |

## 能给哪些管理器打补丁

补丁只有配上**信任它的那个管理器应用**才能用 —— 因为每一份载荷都是针对自己的签名证书重新编译的。
所以这是一个选择题而不是固定列表：计划里记录所选管理器，结果页给出对应应用的官方发布页链接。

| 阵营 | 管理器 | 产物镜像需要 |
| --- | --- | --- |
| KernelPatch（内核补丁） | APatch、Aster、FolkPatch | `me.bmax.apatch`、`me.yuki.aster` 或 `me.yuki.folk` |
| KernelSU（ramdisk + 模块） | KernelSU、SukiSU、ReSukiSU、YukiSU、KowSU | 对应的应用，例如 `me.weishu.kernelsu` |
| Magisk（ramdisk） | Magisk、WeaveMask、MagisKube | `com.topjohnwu.magisk`、`io.github.seyud.weave` 或 `org.magiskube.magisk` |

![分析真实的 init_boot.img](docs/images/analyze.png)

## 为什么可以相信产物

这里每一个字节级格式都是**照着参考实现写的**，而不是凭记忆写的；项目给出的结论也仅限于测试能验证的范围：

* **修补产出的 ramdisk 与官方应用逐字节相同** —— 同一份源镜像，Magisk 官方 App 的产物、以及 KernelSU 的产物，
  都做过逐字节比对。LZ4 与 bzip2 用的是**参考实现**编成的 WebAssembly，不是自己重写的实现；真机 ramdisk
  重压后与出厂镜像里的字节完全一致。
* **KernelPatch 核心镜像与各自 release 的产物一致** —— 用浏览器里的 wasm kptools 与各分支官方的原生
  `kptools` 二进制互相比对，逐字节相同。
* **sparse 与 `super` 镜像与 AOSP 的 `img2simg`、`lpmake`、`lpdump`、`lpunpack` 比对**，`erofs` 与 `ext4`
  读取器则与**真机 `sha256sum` 输出**比对。
* **所有打包进来的二进制在使用前都做摘要校验**，并在 `THIRD_PARTY_LICENSES/` 里登记上游 revision 与许可证；
  同时校验它「是不是它自称的东西」—— 内核模块必须是可重定位 ELF 且 `vermagic` 与设备 KMI 相符，核心镜像必须以
  `KP1158` 开头，stub 必须是 APK。
* **绝不拿本项目自己的输出当基准。** 有参考实现就读它并引用行号，能编译就直接编译来用，有成熟工具就当 oracle
  逐字节比对 —— [docs/architecture.md](docs/architecture.md) 写清了这套顺序，以及每种做法各自抓出过的 bug。

凡是存在字节级契约、但手上没有真实材料可验证的地方，记录里会**明说没验证**，而不是含糊地暗示更强的东西：
每个管理器的许可证记录（[THIRD_PARTY_LICENSES/](THIRD_PARTY_LICENSES/README.md)）末尾都会列出现在还没验证的部分。

## 获取与构建

    git clone https://github.com/LyraVoid/ImageForge && cd ImageForge
    pnpm install
    pnpm dev          # 开发服务器 http://127.0.0.1:5173/
    pnpm build        # tsc -b && vite build，静态站点输出到 dist/
    pnpm preview      # 预览生产构建
    pnpm verify       # 文档检查、类型检查、lint、测试、构建 —— 门禁

环境要求：**Node 22.13+ 与 pnpm 11**（pnpm 的精确版本固定在 `package.json` 的 `packageManager`，
`corepack enable` 或较新的 pnpm 会自动采用）。重建 Rust 模块需要带 `wasm32-unknown-unknown` target 的
Rust 工具链；其余 WebAssembly 模块由 `scripts/` 从固定版本的上游 release 构建。编译好的模块都已入库，
因此**只想运行或开发并不需要任何编译工具链**。

它是纯静态站点，且内部路径是绝对路径 —— service worker、manifest、WebAssembly 模块分别从 `/`、`/wasm`、
`/artifacts` 获取 —— 所以要部署在域名**根目录**而不是子目录。首次访问后即可离线使用。

## 能读什么

| 格式 | 这里能做到什么 |
| --- | --- |
| boot 镜像头 v0–v4 | 解析、抽取、重打包、校验；`boot`、`init_boot`、`vendor_boot` |
| 内核容器 | 未压缩、gzip、LZ4（frame 或 legacy，含依赖块）、xz |
| ramdisk | CPIO `newc`/`crc`，gzip/LZ4/xz 容器，按 `magiskboot` 的写法产出 |
| `super` 镜像 | liblp 元数据、逻辑分区与 extents；按 `lpmake` 的写法产出 |
| sparse 镜像 | AOSP 的 chunk 类型，整文件或流式；按 `img2simg` 的写法产出 |
| `erofs` | 超级块、inode、LZ4 压缩文件，全部支持范围读取 |
| `ext4` | 超级块、extent 树、目录，全部支持范围读取 |
| zip 与 OTA 包 | zip64、8 GB `payload.bin` 按范围读、`REPLACE`/`REPLACE_XZ`/`REPLACE_BZ` |
| splash 与 MediaTek logo | 解析、解出各帧、替换其中一帧、重新打包 |
| 开机动画 | `desc.txt`（含厂商方言）与 part 目录，以 stored zip 重新打包 |

任何读取器遇到看不懂的内容，都会用自己的错误**明确拒绝**；损坏输入是测试套件的一部分，而不是事后补的。

## 刷机之前

ImageForge 从不接触设备：它交给你一个文件，怎么用它是你的事。把补丁镜像写进错误的分区，或写进为别的机型／
内核做的镜像，都可能导致手机开不了机。请**保留你打的每一个分区的原厂备份**，知道如何用 fastboot 还原，
并读一遍结果页的清单 —— 它会写明目标分区、这个镜像需要哪个管理器应用，以及 AVB 签名已被移除这件事。
使用说明见 [docs/usage.md](docs/usage.md)。

## 有意不做的部分

* **核心镜像也可以自己提供**：KernelPatch 的 `kpimg` 可以手动附上；用户提供的 KernelSU/Magisk 模块会覆盖内置模块。
  两者都会先校验再使用 —— 核心镜像校验 KernelPatch magic，模块校验 `.modinfo` 与它编译时的内核版本。
* **重打包会丢弃 AVB 签名**，所以要通过校验启动，必须重新签名或关闭校验。
* **没有远端产物下载**：只能解析随构建打包（且摘要校验过）的产物 —— 这让工具可以离线使用、也便于审计。
* **不写 `erofs`／`ext4`**，也不走 KernelPatch LKM 路线：这两件事都需要真机才能验证，所以不做假装。

## 项目结构

    src/core/      镜像引擎、修补引擎、产物登记表、兼容性判定、错误类型
    src/workers/   worker 协议与 session
    src/wasm/      模块加载、TypeScript 回退、WASI runner、摘要登记
    src/routes/    页面；src/components/ 设计系统；src/i18n/ 四种语言
    crates/        编译成 WebAssembly 的 Rust crate
    scripts/       可复现构建、图标生成、材料表、载荷抽取脚本
    public/        打包的 WebAssembly 模块、管理器载荷、图标、service worker
    tests/         单元、集成、worker、wasm 与界面测试
    docs/          架构、测试材料、使用说明
    THIRD_PARTY_LICENSES/  上游许可证、摘要与集成政策

`pnpm verify` 是门禁；[docs/testing.md](docs/testing.md) 列出最强的那批测试需要哪些真实材料、各自去哪里找、
以及用哪个环境变量提供。需要材料的测试会**自动跳过并说明**，因此测试套件对「哪些没跑」是诚实的。
[CONTRIBUTING.md](CONTRIBUTING.md) 写了必须遵守的规则（包括如何新增一个管理器），
[SECURITY.md](SECURITY.md) 说明安全问题该怎么报。

## 许可证

ImageForge 采用 **AGPL-3.0-or-later**：见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。如果你把修改版作为网络服务
运行，AGPL 要求你向使用它的人提供源码。

第三方代码保留自己的许可证，绝不被重新授权。每一个打包的二进制都在
[THIRD_PARTY_LICENSES/](THIRD_PARTY_LICENSES/README.md) 里登记了上游 revision、许可证全文与摘要。
被打包的那些项目**仅用于说明来源**：ImageForge 是独立项目，与 Magisk、KernelSU、APatch、KernelPatch
以及 [NOTICE](NOTICE) 中列出的任何管理器**均无隶属、背书或赞助关系**。
