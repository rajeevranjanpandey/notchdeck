// Same user actions against the original site and the rebuild; records the
// notch state from the aria-live description and aria-expanded attributes.
import { chromium } from "playwright";
const targets = { original: "https://topnotch-hazel.vercel.app/", rebuild: "http://127.0.0.1:4173/" };
const browser = await chromium.launch({ channel: "chromium" });
const state = async (page) => {
  const t = (await page.locator("[aria-live=polite]").filter({ hasText: /notch is closed|panel:/ }).first().textContent()) || "";
  return t.startsWith("The notch is closed") ? "closed" : t.split(" panel")[0].toLowerCase();
};
const out = {};
for (const [name, url] of Object.entries(targets)) {
  const log = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  log.push(["t=0", await state(page)]);
  await page.waitForTimeout(1600);
  log.push(["after 1.6s", await state(page)]);
  await page.getByRole("button", { name: "Close the notch" }).first().click();
  log.push(["click close", await state(page)]);
  await page.getByRole("button", { name: "Open the notch" }).click();
  await page.waitForTimeout(300);
  log.push(["click open", await state(page)]);
  await page.getByRole("group", { name: "Show a panel" }).getByRole("button", { name: "Weather" }).click();
  log.push(["chip Weather", await state(page)]);
  log.push(["Weather chip aria-pressed", await page.getByRole("group", { name: "Show a panel" }).getByRole("button", { name: "Weather" }).getAttribute("aria-pressed")]);
  await page.getByRole("button", { name: "Close the notch" }).first().click();
  await page.getByRole("button", { name: "Open the notch" }).click();
  await page.waitForTimeout(300);
  log.push(["close then open remembers", await state(page)]);
  // touched before the auto-open timer
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("group", { name: "Show a panel" }).getByRole("button", { name: "Focus" }).click({ timeout: 800 });
  await page.waitForTimeout(1600);
  log.push(["early chip Focus, wait 1.6s", await state(page)]);
  // mouse hover on a closed notch opens it
  await page.getByRole("button", { name: "Close the notch" }).first().click();
  await page.mouse.move(10, 10);
  const box = await page.getByRole("button", { name: "Open the notch" }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  log.push(["hover closed notch", await state(page)]);
  // reduced motion: opens immediately
  const rm = await browser.newContext({ reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto(url, { waitUntil: "load" });
  await p2.waitForTimeout(150);
  log.push(["reduced motion after load", await state(p2)]);
  await rm.close();
  await ctx.close();
  out[name] = log;
}
await browser.close();
const rows = out.original.map((r, i) => [r[0], r[1], out.rebuild[i][1], r[1] === out.rebuild[i][1] ? "match" : "DIFF"]);
console.table(rows);
console.log(JSON.stringify(out));
