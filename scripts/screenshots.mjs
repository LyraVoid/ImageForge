#!/usr/bin/env node
/**
 * Looks at the interface.
 *
 * There is no way to judge a user interface from unit tests, and this project found that out the hard
 * way: two real bugs were reported by a person using it a minute after tests had gone green. This
 * script drives the running app in a real browser, takes a picture of every page, and reports anything
 * the console said. Point it at a dev server or at a preview of the build:
 *
 *     node scripts/screenshots.mjs [base-url]
 *
 * Pictures land in /tmp/imageforge-shots.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const directory = "/tmp/imageforge-shots";
mkdirSync(directory, { recursive: true });

const realImage = "\u002eresearch/aster-validation/init_boot.img".replace(/^\u002e/, ".");
const scenarios = [
  { name: "01-home", path: "/" },
  { name: "02-patch-empty", path: "/tools/patch" },
  { name: "03-patch-init-boot", path: "/", file: "\u002eresearch/aster-validation/init_boot.img" },
  { name: "04-inspect-init-boot", path: "/tools/inspect", file: "\u002eresearch/aster-validation/init_boot.img" },
  { name: "05-logo-mtk", path: "/tools/logo", file: "\u002eresearch/mtk-logo/sample-logo.img" },
  { name: "06-unpack-mtk", path: "/tools/unpack", file: "\u002eresearch/mtk-logo/sample-logo.img" },
  { name: "07-diff-empty", path: "/tools/diff" },
  { name: "08-animation-empty", path: "/tools/bootanimation" },
  { name: "09-home-dark", path: "/", dark: true },
  { name: "10-logo-mobile", path: "/tools/logo", file: "\u002eresearch/mtk-logo/sample-logo.img", mobile: true },
];

const browser = await chromium.launch();
const findings = [];
for (const scenario of scenarios) {
  const context = await browser.newContext({
    viewport: scenario.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  if (scenario.dark) {
    await context.addInitScript(() => window.localStorage.setItem("imageforge.theme", "dark"));
  }
  const page = await context.newPage();
  const messages = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") messages.push(message.type() + ": " + message.text());
  });
  page.on("pageerror", (error) => messages.push("pageerror: " + error.message));
  try {
    await page.goto(base + scenario.path, { waitUntil: "networkidle", timeout: 60000 });
    if (scenario.file) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(scenario.file, { timeout: 8000 });
      } catch {
        // a drop zone that opens a dialog instead: click it and answer the chooser
        const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
        await page.getByText("或点击选择文件").first().click({ timeout: 8000 }).catch(() => {});
        (await chooser).setFiles(scenario.file);
      }
      await page.waitForTimeout(4000);
    }
    await page.screenshot({ path: directory + "/" + scenario.name + ".png", fullPage: true });
  } catch (error) {
    messages.push("scenario failed: " + error.message.split("\n")[0]);
  }
  if (messages.length > 0) findings.push(scenario.name + ": " + messages.slice(0, 4).join(" | "));
  await context.close();
}
await browser.close();
writeFileSync(directory + "/findings.txt", findings.join("\n") + "\n");
console.log("shots in " + directory);
console.log(findings.length === 0 ? "no console complaints" : findings.join("\n"));
void realImage;
