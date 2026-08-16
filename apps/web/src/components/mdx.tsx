import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { VerifiedCodeBlock } from "@/components/verified-code-block";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    VerifiedCodeBlock,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
