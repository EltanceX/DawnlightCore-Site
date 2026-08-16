import Link from "next/link";
import { supportedLocales } from "@/lib/site";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function DownloadsPage() {
  return (
    <main
      id="content-start"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16"
    >
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-fd-muted-foreground">
        Downloads
      </p>
      <h1 className="text-3xl font-semibold">下载</h1>
      <p className="text-fd-muted-foreground">
        发布清单和正式 artifact 尚未接入。WP1
        只验证静态站点、文档和搜索索引的构建路径。
      </p>
      <Link
        className="w-fit underline underline-offset-4"
        href="/zh-CN/docs/preview"
      >
        返回开发文档
      </Link>
    </main>
  );
}
