import { describe, expect, it } from "vitest";
import { parseShaderPackCliOutput } from "./validator.js";

describe("ShaderPackCli output adapter", () => {
  it("maps a real Loader success transcript into separated sections", () => {
    const report = parseShaderPackCliOutput(
      [
        "valid=true",
        "packId=dawnlight:dawnlight_v3_1",
        "settingsSha256=9c937dc5fd1be30864ff7f4da69db31d261920773b1d8c78b735d5f643538de1",
        "manifestSha256=e9d84f004a8dc80b125b7ffb9b15f6f4b52559583aeeac53e8e8a54120286e4a",
        "options=43",
        "coverage=43/43",
        "diagnostics=0",
      ].join("\n"),
      "",
      0,
    );
    expect(report.status).toBe("loader-passed");
    expect(report.sections.loader.status).toBe("passed");
    expect(report.sections.schema.status).toBe("passed");
    expect(report.sections.compatibility.status).toBe("declared");
  });

  it("does not promote a non-zero or malformed result", () => {
    const report = parseShaderPackCliOutput(
      "valid=false\ndiagnostics=1",
      "bad manifest",
      1,
    );
    expect(report.status).toBe("loader-failed");
    expect(report.sections.loader.status).toBe("failed");
  });
});
