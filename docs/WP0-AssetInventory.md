# WP0 资产盘点

状态：初次盘点完成，Preview 概念 Hero 已生成；正式资产门禁仍未关闭

盘点日期：2026-08-16

盘点源：`E:\sc\2.4 Rebuild\1.81-3\SurvivalcraftApi Dawnlight`

## 1. 盘点结论

当前网站仓库没有任何图片、Logo、字体或下载 artifact。核心工程中存在一些可作为参考的图像，但它们不能直接视为网站可发布资产：

- 两张 Debug ScreenCapture 截图当前位于 `bin/Debug`，被 `.gitignore` 忽略；
- 两张截图分别存在明显的地面/植被伪影、黑色轮廓和过饱和问题，不适合 hero；
- `Logo.png` 是 Survivalcraft 游戏 Logo，不是 DawnlightCore 网站 Logo；
- `DawnlightNormal.png` 和 `DawnlightClicked.png` 是 70×63 的游戏内按钮图标，适合作为品牌参考，不适合作为主 Logo；
- 官方原版纹理、游戏 UI、Survivalcraft icon 和 shaderpack 内资源的公开授权尚未确认；
- 不能从 `bin/Debug`、`obj`、`output` 或本地构建目录生成稳定网站资产。

2026-08-17 补充：为 Preview 开发者门户生成了两张原创方块世界概念渲染，并制作 WebP/JPEG 衍生图。它们不是 Dawnlight 实机截图，不得用于证明渲染效果，也不关闭正式 Hero 截图门禁。

## 2. 已识别资产

| Asset ID | Core 相对路径 | 尺寸 | 大小 | SHA-256 | 当前结论 |
|---|---|---:|---:|---|---|
| `capture-2026-08-15-1539` | `Survivalcraft.Windows/bin/Debug/ScreenCapture/Survivalcraft Dawnlight 2026-08-15 15-39-09.png` | 2048×1222 | 1,584,447 | `f1bc9a01d2ad985a9b0f2009a5330895ac6f6fca5429e0974c13589ccd70dce6` | Reject：白色地面出现严重噪声/轮廓伪影，不能做 hero |
| `capture-2026-08-15-1542` | `Survivalcraft.Windows/bin/Debug/ScreenCapture/Survivalcraft Dawnlight 2026-08-15 15-42-07.png` | 2048×1222 | 1,859,520 | `4b87cd2da7eeba2b44f54f195ef899bd0ca7713c772dd069ce275d888117da20` | Reject：绿色和黑色区域明显过饱和/剪裁，不能做 hero |
| `survivalcraft-logo` | `Survivalcraft/Content/Assets/Textures/Gui/Logo.png` | 1024×128 | 134,961 | `6a7693e6831f7fa578c13c8af94fcf5928ed8aa972e726c5641ae589781f409a` | Hold：Survivalcraft 品牌资产，需授权确认 |
| `dawnlight-button-normal` | `Survivalcraft/Content/Assets/Textures/Gui/DawnlightNormal.png` | 70×63 | 3,513 | `fd47f3c4e56bec6684314b14d1975dfb9d71e0d6aab250a2d83aeb5c31980d02` | Reference：游戏内 Dawnlight 按钮，分辨率过低，不作为 hero |
| `dawnlight-button-clicked` | `Survivalcraft/Content/Assets/Textures/Gui/DawnlightClicked.png` | 70×63 | 3,184 | `d06b43b2c3c83ec9892aabf30a317cc9c4c3b19f22aa4bd50ae06bbe8b74f89f` | Reference：游戏内 Dawnlight 按钮，分辨率过低，不作为 hero |
| `survivalcraft-app-icon` | `Survivalcraft/icon.png` | 144×144 | 31,648 | `9a63b350cbbc8ffab6948e26a564532dd5d3dab75a6e9112ef16e35ba0cb8f12` | Hold：游戏 App icon，需授权确认 |
| `engine-icon` | `Engine/Resources/icon.png` | 64×64 | 9,520 | `2e417352379ecf651349a52af02eb342fd8d8dbe95c1c61efac4b6125dc5a087` | Reference：引擎图标，分辨率过低且品牌归属不明 |

## 2.1 Preview 概念 Hero

| Asset ID | 网站相对路径 | 尺寸 | 大小 | SHA-256 | 当前结论 |
|---|---|---:|---:|---|---|
| `preview-hero-wide-webp` | `apps/web/public/media/hero/dawnlight-preview-wide.webp` | 1600×900 | 253,232 | `98de160bdc96aad3c15282c3e44e370e4334bdd618804317a5420a80d6334279` | Preview only：宽屏 Hero 首选格式，非实机截图 |
| `preview-hero-wide-jpeg` | `apps/web/public/media/hero/dawnlight-preview-wide.jpg` | 1600×900 | 351,457 | `4efed810b7d8b7c50da8eec7d6da1b4458fb3385b399b3c04c67a5172c5015b5` | Preview only：宽屏 fallback，非实机截图 |
| `preview-hero-mobile-webp` | `apps/web/public/media/hero/dawnlight-preview-mobile.webp` | 900×1350 | 184,866 | `d7e9ad4edc5677004bc771664d722e881a2c914bd6c7f773018c14f3d94929cd` | Preview only：移动 Hero 首选格式，非实机截图 |
| `preview-hero-mobile-jpeg` | `apps/web/public/media/hero/dawnlight-preview-mobile.jpg` | 900×1350 | 262,157 | `380dc95ea00db4713ad2a132c76961e64433bab050fb4703332e33c1e5b2ddc3` | Preview only：移动 fallback，非实机截图 |

原始 PNG、完整 Prompt、模型、实际尺寸、使用边界和校验信息位于 `assets/media/source/hero/asset-metadata.yml`。网页不直接加载 2.5 MiB 级原图。当前环境没有 AVIF encoder，因此 Preview 先提供 WebP 与 JPEG；正式图片流水线仍需补齐 AVIF 和内容 hash 文件名。

## 3. 光影包和内置资源盘点

这些是开发和示例的源资料，不是首页营销图片：

| 资源 | 文件数 | 字节数 | 用途 | 网站处理 |
|---|---:|---:|---|---|
| `Survivalcraft/shaderpacks/Dawnlight_v3.1` | 130 | 9,440,556 | External Complete 示例/候选官方下载包 | 只作为 contract/example 和未来 artifact 输入 |
| `Survivalcraft/shaderpacks/ToonLab_v0.1` | 139 | 9,462,272 | clean-room/实验包 | V1 不作为官方下载，除非另行确认状态和授权 |
| `Survivalcraft/Content/Assets/Shaders` | 49 | 30,553 | BuiltIn Minimal 内置 shader 源 | 仅用于文档概念说明，不能直接整包复制到网站 |
| `Dawnlight_v3.1/shaders/assets` | 17 PNG，约 8.6 MB | 包内资源 | Cubemap、noise、PBR 等 shader 输入 | 不作为网页图像，避免把技术纹理误当展示素材 |

## 4. 发行和文档来源

| 资源 | 来源 | 证据 |
|---|---|---|
| 技术源仓库 | GitHub `https://github.com/EltanceX/DawnlightCore` | Core git remote |
| 现有发行入口 | Gitee `https://gitee.com/SC-SPM/SurvivalcraftApi/releases/latest` | Core README |
| API 当前正式标签 | `API_1.9.2.1` | Core git tag，commit `675efcde...` |
| 当前光影管线候选 | commit `3ec28fc9461e6b1636ad4adc086e9cea8150c02e` | Core branch `HEAD` 的可复现 commit tree；不得读取脏工作树 |
| 完整包 Manifest | `Survivalcraft/shaderpacks/Dawnlight_v3.1/shaderpack.json` | `manifestVersion: 3`，pack id `dawnlight:dawnlight_v3_1`，当前 28 个 fragments |
| 当前发布说明 | Core `README.md`、`CHANGELOG.md` | 平台和运行要求来源 |

## 5. 禁止直接复制的资产

以下目录不应在没有明确许可证/品牌授权的情况下复制到网站：

- `Survivalcraft/Content/Assets/**`；
- `Survivalcraft/Content/Dawnlight/**`；
- `Survivalcraft/icon.png`、`Survivalcraft/Content/Assets/Textures/Gui/Logo.png`；
- 官方原版资源目录 `E:\sc\2.4 Rebuild\1.9.2.1`；
- `Survivalcraft.Windows/bin/**` 和 `obj/**` 构建输出；
- 未确认来源的 shaderpack `assets` 纹理。

## 6. 首页 Hero 重新采集要求

现有截图不合格，下一次采集至少需要：

1. 使用干净 commit 构建的 Windows Debug/Release 运行环境；
2. 记录 Core commit、API/Game version、shader pack id/version、选项和分辨率；
3. 先修复截图中的地面伪影、黑色轮廓和过饱和问题，再采集；
4. 采集海岸、水体、森林/植被和夜间/光照至少三类场景；
5. 输出原始 PNG 和网站衍生图，不把 Debug 输出目录作为资产 source；
6. 同时提供宽屏 16:9、移动端 4:5 或 3:4 裁切和项目卡片缩略图；
7. 添加 `asset-metadata.yml`，记录 source、license、captureVersion、packVersion、scene、settings 和 sha256；
8. 由非实现者人工确认画面无明显渲染故障、文字/调试 UI 和版权风险。

## 7. WP0 资产退出标准

- [x] 网站仓库当前没有未盘点的媒体资产；
- [x] 现有截图已查看并标记为不可发布；
- [x] 现有 Logo/icon 已分类并标记授权状态；
- [x] Core、shaderpack、发行和文档来源已记录；
- [x] Preview 概念 Hero 原图、衍生图和可追溯 metadata 已入库；
- [ ] 正式 hero 截图重新采集；
- [ ] 网站 Logo/品牌资产授权确认；
- [ ] 正式 artifact 和发布源确认；
- [ ] 资产复制到网站仓库并完成衍生图处理。
