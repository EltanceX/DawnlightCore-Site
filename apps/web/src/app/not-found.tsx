import Link from "next/link";
import { ArrowLeft, BookOpen, Download, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main id="content-start" className="dl-not-found">
      <div className="dl-page-container dl-not-found__inner">
        <SearchX size={30} aria-hidden="true" />
        <p className="dl-eyebrow">404 · Not found</p>
        <h1>没有找到这个页面</h1>
        <p>链接可能属于其他文档版本，或页面尚未进入当前 preview 内容树。</p>
        <nav aria-label="恢复导航">
          <Link className="dl-button dl-button--primary" href="/zh-CN/">
            <ArrowLeft size={16} aria-hidden="true" />
            返回首页
          </Link>
          <Link
            className="dl-button dl-button--secondary"
            href="/zh-CN/docs/preview/"
          >
            <BookOpen size={16} aria-hidden="true" />
            浏览文档
          </Link>
          <Link className="dl-button dl-button--quiet" href="/zh-CN/downloads/">
            <Download size={16} aria-hidden="true" />
            下载
          </Link>
        </nav>
      </div>
    </main>
  );
}
