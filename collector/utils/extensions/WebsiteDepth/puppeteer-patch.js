const {
  PuppeteerWebBaseLoader,
} = require("langchain/document_loaders/web/puppeteer");

async function setupPuppeteerHeaders() {
  const { launch } = await PuppeteerWebBaseLoader.imports();

  const tempBrowser = await launch({
    headless: true,
    defaultViewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  const Browser = tempBrowser.constructor;
  await tempBrowser.close();

  // Fix: Use the constructor's prototype, not the instance's prototype
  Object.defineProperty(PuppeteerWebBaseLoader.prototype, "customHeaders", {
    value: {},
    writable: true,
    enumerable: true,
    configurable: true,
  });

  // Original method
  const originalMethod = Browser.prototype.newPage;

  // New method that sets custom headers
  Browser.prototype.newPage = async function () {
    const page = await originalMethod.call(this);

    // Access customHeaders from any instance of PuppeteerWebBaseLoader
    // You'll need to pass the loader instance or access it differently
    if (
      PuppeteerWebBaseLoader.prototype.customHeaders &&
      Object.keys(PuppeteerWebBaseLoader.prototype.customHeaders).length > 0
    ) {
      await page.setExtraHTTPHeaders(
        PuppeteerWebBaseLoader.prototype.customHeaders
      );
    }

    return page;
  };
}

// Call the setup function
setupPuppeteerHeaders();
