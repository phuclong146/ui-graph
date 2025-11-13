import { promises as fs } from "node:fs";

const scrollToBottom = function({ frequency = 100, timing = 8, remoteWindow = window } = {}) {
  let resolve;
  let scrolls = 1;
  let deferred = new Promise(r => (resolve = r));
  let totalScrolls = remoteWindow.document.body.scrollHeight / frequency;
  
  function scroll() {
    let scrollBy = totalScrolls * scrolls;
    remoteWindow.setTimeout(() => {
      remoteWindow.scrollTo(0, scrollBy);
      if (scrolls < frequency) {
        scrolls += 1;
        scroll();
      }
      if (scrolls === frequency) {
        remoteWindow.setTimeout(() => {
          remoteWindow.scrollTo(0, 0);
          resolve(true);
        }, 250);
      }
    }, timing);
  }
  
  scroll();
  return deferred;
};

const internalCaptureWebsiteCore = async (options, page) => {
  options = {
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    fullPage: true,
    defaultBackground: true,
    delay: 1,
    ...options,
  };

  const viewportOptions = {
    width: options.width,
    height: options.height,
    deviceScaleFactor: options.scaleFactor,
  };

  await page.setViewport(viewportOptions);

  if (options.fullPage) {
    await page.evaluate(scrollToBottom);
  }

  if (options.delay) {
    await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
  }

  const buffer = await page.screenshot({
    fullPage: options.fullPage,
    omitBackground: !options.defaultBackground,
  });

  return buffer;
};

const captureWebsite = {};

captureWebsite.file = async (page, filePath, options = {}) => {
  const screenshot = await internalCaptureWebsiteCore(options, page);
  await fs.writeFile(filePath, screenshot, {
    flag: options.overwrite ? "w" : "wx",
  });
};

captureWebsite.buffer = async (page, options) =>
  internalCaptureWebsiteCore(options, page);

captureWebsite.base64 = async (page, options) => {
  const screenshot = await internalCaptureWebsiteCore(options, page);
  return screenshot.toString("base64");
};

export default captureWebsite;
