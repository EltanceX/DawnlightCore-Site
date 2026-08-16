import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BookOpen, Download } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandMark />,
      url: "/zh-CN/",
    },
    links: [
      {
        type: "main",
        text: "文档",
        url: "/zh-CN/docs/preview/",
        icon: <BookOpen size={16} aria-hidden="true" />,
      },
      {
        type: "main",
        text: "下载",
        url: "/zh-CN/downloads/",
        icon: <Download size={16} aria-hidden="true" />,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
