import { Provider } from "@/components/provider";
import { SkipLink } from "@/components/skip-link";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/lib/site";
import "./global.css";

export const metadata = {
  metadataBase: new URL(siteConfig.canonicalOrigin),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>
          <SkipLink />
          <div className="flex min-h-screen flex-1 flex-col">
            {children}
            <SiteFooter />
          </div>
        </Provider>
      </body>
    </html>
  );
}
