import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import {
  BookOpen,
  Boxes,
  Download,
  GitFork,
  UserRound,
  Wrench,
} from "lucide-react";
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
      {
        type: "main",
        text: "工具",
        url: "/zh-CN/tools/",
        icon: <Wrench size={16} aria-hidden="true" />,
      },
      {
        type: "main",
        text: "光影",
        url: "/zh-CN/shaders/",
        icon: <Boxes size={16} aria-hidden="true" />,
      },
      {
        type: "main",
        text: "作者",
        url: "/zh-CN/author/",
        icon: <UserRound size={16} aria-hidden="true" />,
      },
      {
        type: "icon",
        text: "GitHub",
        label: "GitHub",
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
        icon: <GitFork aria-hidden="true" />,
      },
    ],
  };
}
