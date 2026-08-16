import { Provider } from "@/components/provider";
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
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
