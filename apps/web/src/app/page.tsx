import Link from "next/link";

export default function RootPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">DawnlightCore</h1>
      <p className="text-fd-muted-foreground">请选择站点语言。</p>
      <Link className="underline underline-offset-4" href="/zh-CN/">
        简体中文
      </Link>
    </main>
  );
}
