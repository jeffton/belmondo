import { chromium } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--use-angle=swiftshader",
    "--use-vulkan=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  page.on("console", (message) => console.log(message.type(), message.text()));
  await page.route("**/probe", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto(new URL("probe", server.resolvedUrls.local[0]).href);
  console.log(
    JSON.stringify(
      await page.evaluate(async () => {
        const adapter = await navigator.gpu?.requestAdapter();
        return {
          api: !!navigator.gpu,
          adapter: !!adapter,
          info: adapter?.info,
        };
      }),
    ),
  );
} finally {
  await browser.close();
  await server.close();
}
