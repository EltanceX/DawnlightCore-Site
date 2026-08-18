import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { gitConfig } from "@/lib/shared";

export function SiteFooter() {
  return (
    <footer className="dl-footer">
      <div className="dl-page-container dl-footer__inner">
        <div className="dl-footer__brand">
          <BrandMark />
          <p>面向 Dawnlight 光影开发者的版本化文档与发布入口。</p>
        </div>
        <nav className="dl-footer__links" aria-label="页脚导航">
          <Link href="/zh-CN/docs/preview/">开发文档</Link>
          <Link href="/zh-CN/downloads/">下载</Link>
          <Link href="/zh-CN/tools/">开发工具</Link>
          <Link href="/zh-CN/shaders/">光影目录</Link>
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            rel="noreferrer"
          >
            GitHub <ExternalLink size={13} aria-hidden="true" />
          </a>
        </nav>
        <div className="dl-footer__meta">
          <span>Preview 文档 · Manifest v3</span>
          <span>© {new Date().getFullYear()} DawnlightCore</span>
        </div>
      </div>
    </footer>
  );
}
