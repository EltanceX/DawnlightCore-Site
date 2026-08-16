import Link from "next/link";
import { siteConfig, supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-20">
      <div className="max-w-3xl space-y-5">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-fd-muted-foreground">
          Survivalcraft shader pipeline
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          {siteConfig.name}
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-fd-muted-foreground">
          面向 Dawnlight 光影开发者的版本化文档、合同快照与官方发布入口。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/zh-CN/docs/preview"
          className="inline-flex h-10 items-center rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground"
        >
          开始阅读文档
        </Link>
        <Link
          href="/zh-CN/downloads"
          className="inline-flex h-10 items-center rounded-md border border-fd-border px-4 text-sm font-medium"
        >
          查看下载
        </Link>
      </div>
      <section
        className="grid gap-4 border-t border-fd-border pt-8 sm:grid-cols-3"
        aria-label="当前状态"
      >
        <div>
          <p className="text-sm font-medium">文档版本</p>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            Preview · Manifest v3
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">发布模式</p>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            静态站点 · 可校验下载
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">当前语言</p>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            简体中文（zh-CN）
          </p>
        </div>
      </section>
    </main>
  );
}
