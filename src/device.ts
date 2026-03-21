import { remote } from "webdriverio";
import { writeFile, mkdir } from "node:fs/promises";

let screenshotCounter = 0;

export interface ScreenSize {
  width: number;
  height: number;
}

export async function createSession(appiumUrl: string): Promise<WebdriverIO.Browser> {
  return remote({
    hostname: new URL(appiumUrl).hostname,
    port: Number(new URL(appiumUrl).port) || 4723,
    path: "/",
    logLevel: "silent",
    capabilities: {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:noReset": true,
      "appium:skipDeviceInitialization": true,
    },
  });
}

export async function destroySession(browser: WebdriverIO.Browser): Promise<void> {
  await browser.deleteSession();
}

export async function takeScreenshot(browser: WebdriverIO.Browser): Promise<string> {
  const base64 = await browser.takeScreenshot();
  await mkdir("output/screenshots", { recursive: true });
  await writeFile(
    `output/screenshots/step-${String(screenshotCounter++)}.png`,
    Buffer.from(base64, "base64"),
  );
  return base64;
}

export async function tap(browser: WebdriverIO.Browser, x: number, y: number): Promise<void> {
  await browser
    .action("pointer", {
      parameters: { pointerType: "touch" },
    })
    .move({ x: Math.round(x), y: Math.round(y) })
    .down()
    .pause(50)
    .up()
    .perform();
}

export async function pressBack(browser: WebdriverIO.Browser): Promise<void> {
  await browser.back();
}

export async function scroll(
  browser: WebdriverIO.Browser,
  direction: "up" | "down",
): Promise<void> {
  const { width, height } = await getScreenSize(browser);
  const centerX = Math.round(width / 2);
  const startY = Math.round(direction === "down" ? height * 0.7 : height * 0.3);
  const endY = Math.round(direction === "down" ? height * 0.1 : height * 0.9);

  await browser
    .action("pointer", {
      parameters: { pointerType: "touch" },
    })
    .move({ x: centerX, y: startY })
    .down()
    .pause(100)
    .move({ x: centerX, y: endY, duration: 300 })
    .up()
    .perform();
}

export async function getScreenSize(browser: WebdriverIO.Browser): Promise<ScreenSize> {
  return browser.getWindowSize();
}
