import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { getPageImageUrl, getPageMarkdownUrl, source } from "@/lib/source";
import { getMDXComponents } from "@/components/mdx";
import { gitConfig } from "@/lib/shared";
import { isDocsVersion, isSupportedLocale, supportedLocales } from "@/lib/site";

type Params = { locale: string; version: string; slug?: string[] };

function getParams(params: Params) {
  if (!isSupportedLocale(params.locale) || !isDocsVersion(params.version))
    notFound();
  return params;
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const resolved = getParams(await params);
  const page = source.getPage(resolved.slug);
  if (!page) notFound();
  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/web/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({ a: createRelativeLink(source, page) })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams().flatMap((params) =>
    supportedLocales.map((locale) => ({
      locale,
      version: "preview",
      slug: params.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const resolved = getParams(await params);
  const page = source.getPage(resolved.slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
    robots: { index: false, follow: true },
    openGraph: { images: getPageImageUrl(page).url },
  };
}
