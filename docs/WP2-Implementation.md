# WP2：设计 Token 与站点 Shell

状态：已完成

日期：2026-08-16

## 交付内容

- 建立 DawnlightCore 设计 token：中性表面、文字和边框色，琥珀色主操作色，青色状态/焦点色；
- 同时定义亮色和暗色变量，兼容 Fumadocs 的 `dark` class 和系统主题切换；
- 增加全局焦点环、文字选择色、减少动态效果和 Skip Link；
- 通过 Fumadocs `baseOptions` 注入品牌标识、文档/下载主导航和 GitHub 外链；
- 增加根级 `SiteFooter`，在首页、文档页和下载页共享品牌、导航、版本和版权信息；
- 增加 `PageContainer`、`Button`、`IconButton`、`Badge`、`Callout` 五个基础 UI 原语；
- 增加 `UiPreview` fixture，作为后续组件检查和视觉回归的最小入口；
- 重做首页第一版布局：状态信号、主要操作、当前版本状态和开发者三步入口；
- 使用 Fumadocs 内置搜索、主题切换和移动菜单，避免重复实现已有可访问交互；
- 保持首页不使用未经授权的截图、Logo 图片或渐变背景，真实 Hero 资产留到 WP7。

## 视觉与交互约束

- 主操作使用文本 + Lucide 图标，单独图标操作使用 `IconButton` 和 aria-label；
- 页面的重复信息使用平面分组和细边框，不嵌套卡片；
- 390px 视口下主标题、按钮、状态区和 Footer 不发生横向溢出；
- 移动导航由 Fumadocs 的 `Toggle Menu` 控制，展开后包含文档、下载、GitHub 和主题切换；
- Skip Link 指向页面实际内容起点 `#content-start`；
- `Preview` 合同和下载占位状态保留明确文字，不伪装为稳定发布。

## 验证

已通过：

```text
pnpm check
```

并使用本地浏览器检查：

- 1280×800 首页亮/暗主题；
- 390×844 首页移动导航、主题切换和内容布局；
- 1280×800 文档侧栏、文章、TOC、搜索和 Footer；
- 页面主要 landmark、Skip Link、导航链接和按钮的可访问名称。

## 后续边界

- Header 的 release 入口在 WP6 发布记录页完成后再加入，当前不显示指向空页面的导航；
- 真实截图、Logo、Open Graph 图片和首页 Hero 在 WP7 接入；
- 设计 token 当前位于 `global.css`，在出现第二个真实消费者前不拆出独立 UI package；
- Fumadocs 的移动菜单和主题组件作为基础设施保留，只有出现产品特有行为时才替换。
