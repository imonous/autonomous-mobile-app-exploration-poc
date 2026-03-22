import { remote } from "webdriverio";
import { DOMParser } from "@xmldom/xmldom";

export interface ScreenSize {
  width: number;
  height: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface InteractiveElement {
  label: string;
  bounds: Bounds;
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
  return browser.takeScreenshot();
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
  await browser.releaseActions();
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
  await browser.releaseActions();
}

export async function getScreenSize(browser: WebdriverIO.Browser): Promise<ScreenSize> {
  return browser.getWindowSize();
}

function parseBounds(raw: string): Bounds | null {
  const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(raw);
  if (!m) return null;
  return {
    left: Number(m[1]),
    top: Number(m[2]),
    right: Number(m[3]),
    bottom: Number(m[4]),
  };
}

function buildLabel(el: Element): string {
  const text = el.getAttribute("text") ?? "";
  const contentDesc = el.getAttribute("content-desc") ?? "";
  const parts = [text, contentDesc].filter(Boolean);
  if (parts.length > 0) return parts.join(" — ");

  const resourceId = el.getAttribute("resource-id") ?? "";
  if (resourceId) {
    const segments = resourceId.split("/");
    return segments[segments.length - 1] ?? resourceId;
  }
  return "(unlabeled)";
}

export async function getInteractiveElements(
  browser: WebdriverIO.Browser,
): Promise<InteractiveElement[]> {
  const xml = await browser.getPageSource();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const all = Array.from(doc.getElementsByTagName("*"));
  const elements: InteractiveElement[] = [];

  for (const el of all) {
    if (el.getAttribute("clickable") !== "true") continue;
    if (el.getAttribute("enabled") !== "true") continue;

    const bounds = parseBounds(el.getAttribute("bounds") ?? "");
    if (!bounds) continue;
    if (bounds.left === bounds.right || bounds.top === bounds.bottom) continue;

    elements.push({ label: buildLabel(el), bounds });
  }

  return elements;
}

export function formatElementList(
  elements: InteractiveElement[],
  excludeLabels?: string[],
): string {
  return elements
    .map((el, i) => {
      const disabled = excludeLabels?.some((ex) => el.label.includes(ex));
      const suffix = disabled ? " (disabled)" : "";
      return `[${String(i)}] "${el.label}"${suffix} [${String(el.bounds.left)},${String(el.bounds.top)}][${String(el.bounds.right)},${String(el.bounds.bottom)}]`;
    })
    .join("\n");
}

export async function tapElement(
  browser: WebdriverIO.Browser,
  elements: InteractiveElement[],
  index: number,
): Promise<void> {
  if (index < 0 || index >= elements.length) {
    throw new Error(
      `Element index ${String(index)} out of range (0-${String(elements.length - 1)})`,
    );
  }
  const { bounds } = elements[index];
  const x = Math.round((bounds.left + bounds.right) / 2);
  const y = Math.round((bounds.top + bounds.bottom) / 2);
  await tap(browser, x, y);
}
