import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  // The multilingual tokenizer keeps Chinese terms and ASCII IDs searchable.
  language: "multilingual",
  buildIndex: async (page) => {
    const structuredData = page.data.structuredData;
    const aliases = page.data.searchAliases ?? [];

    return {
      title: page.data.title ?? page.path,
      description: page.data.description,
      url: page.url,
      id: page.url,
      structuredData: aliases.length
        ? {
            ...structuredData,
            contents: [
              ...structuredData.contents,
              { heading: undefined, content: `搜索别名：${aliases.join(" ")}` },
            ],
          }
        : structuredData,
    };
  },
});
