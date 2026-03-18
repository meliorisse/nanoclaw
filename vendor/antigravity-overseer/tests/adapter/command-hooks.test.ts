import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultConfig } from "../../src/config/defaults.ts";
import { Extraction } from "../../src/adapter/macos-ui/extraction.ts";
import { Screenshots } from "../../src/adapter/macos-ui/screenshots.ts";

test("extraction can read visible text from a shell command", async () => {
  const config = {
    ...defaultConfig,
    screenSource: {
      textCommand: "printf 'Workspaces\\nnanoclaw\\nFixing Host Mode Responses... now\\n'",
      screenshotCommand: null
    }
  };

  const extraction = new Extraction(config);
  const text = await extraction.getVisibleText();
  assert.match(text, /nanoclaw/);
  assert.match(text, /Fixing Host Mode Responses/);
});

test("screenshots can delegate to an external shell command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ag-overseer-shot-test-"));
  const config = {
    ...defaultConfig,
    evidenceDir: root,
    screenSource: {
      textCommand: null,
      screenshotCommand: "printf 'fake-image' > {output}"
    }
  };

  const screenshots = new Screenshots(config);
  const outputPath = await screenshots.capture("agent-manager", "ignored");
  const contents = await readFile(outputPath, "utf8");

  assert.match(outputPath, /\.png$/);
  assert.equal(contents, "fake-image");
});
