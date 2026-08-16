import { resolve } from "node:path";

export const defaultCoreRepository = resolve(
  process.env.DAWNLIGHT_CORE_REPOSITORY ??
    "E:/sc/2.4 Rebuild/1.81-3/SurvivalcraftApi Dawnlight",
);
export const defaultCommit = "3ec28fc9461e6b1636ad4adc086e9cea8150c02e";
export const contractRoot = resolve("contracts/dawnlight/preview");

export const sourceFiles = [
  {
    output: "manifest/shaderpack.json",
    source: "Survivalcraft/shaderpacks/Dawnlight_v3.1/shaderpack.json",
  },
  {
    output: "manifest/settings.json",
    source:
      "Survivalcraft/shaderpacks/Dawnlight_v3.1/manifest/ui/settings.json",
  },
  {
    output: "examples/minimal/shaderpack.json",
    source: "Survivalcraft.Pipeline.Tests/Fixtures/P4/Minimal/shaderpack.json",
  },
  {
    output: "examples/settings-auto/shaderpack.json",
    source:
      "Survivalcraft.Pipeline.Tests/Fixtures/P9/SettingsUi/Valid/shaderpack.json",
  },
  {
    output: "examples/settings-auto/manifest/ui/settings.json",
    source:
      "Survivalcraft.Pipeline.Tests/Fixtures/P9/SettingsUi/Valid/manifest/ui/settings.json",
  },
  {
    output: "examples/settings-authored/shaderpack.json",
    source: "Survivalcraft/shaderpacks/Dawnlight_v3.1/shaderpack.json",
  },
  {
    output: "examples/settings-authored/manifest/ui/settings.json",
    source:
      "Survivalcraft/shaderpacks/Dawnlight_v3.1/manifest/ui/settings.json",
  },
];
