import Link from "next/link";
import { Download, FileJson, History } from "lucide-react";
import { DownloadExperience } from "@/components/download-experience";
import { releaseFeed } from "@/lib/releases";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function DownloadsPage() {
  return (
    <main id="content-start" className="dl-download-page">
      <div className="dl-page-container">
        <p className="dl-eyebrow">Official distribution</p>
        <h1>下载 DawnlightCore</h1>
        <p className="dl-download-page__intro">
          选择匹配的平台和架构，核对文件大小与
          SHA-256，再从官方源或镜像下载。Release Feed v1
          是页面和机器客户端共用的唯一版本来源。
        </p>
        <DownloadExperience feed={releaseFeed} />
        <nav className="dl-download-page__links" aria-label="下载相关入口">
          <Link href="/zh-CN/downloads/releases/">
            <History size={16} aria-hidden="true" />
            发布记录
          </Link>
          <a href="/feeds/releases-v1.json">
            <FileJson size={16} aria-hidden="true" />
            Release Feed JSON
          </a>
          <Link href="/zh-CN/docs/preview/01-getting-started/prerequisites/">
            <Download size={16} aria-hidden="true" />
            查看安装前置条件
          </Link>
        </nav>
      </div>
    </main>
  );
}
