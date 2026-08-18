import type { Metadata } from "next";
import { Callout } from "@/components/ui/callout";
import { PageContainer } from "@/components/ui/page-container";
import { AuthorWorkspace } from "@/components/author/author-workspace";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "作者工作区",
  description: "DawnlightCore 邀请制项目团队与私有元数据草稿工作区。",
  robots: { index: false, follow: false },
};

export default function AuthorPage() {
  return (
    <main id="content-start" className="dl-v2-page dl-author-page">
      <PageContainer>
        <p className="dl-eyebrow">V2.0 Invitation-only Authoring</p>
        <h1>作者工作区</h1>
        <p className="dl-v2-lede">
          用 OIDC 身份管理项目团队、草稿元数据和 artifact
          预声明。这里的内容保持私有，只有经过后续上传、Loader
          验证和审核流程的版本才可能进入公开目录。
        </p>
        <Callout title="WP5 边界">
          当前不接收光影包文件，不创建 quarantine 或 published
          对象，也不把草稿标记为已验证。作者 API 必须通过资源角色、CSRF、Origin
          与幂等校验。
        </Callout>
        <AuthorWorkspace />
      </PageContainer>
    </main>
  );
}
