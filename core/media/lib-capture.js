const scrollToElement = (element, options) => {
  const isOverflown = (element) =>
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth;

  const findScrollParent = (element) => {
    if (element === undefined) {
      return;
    }

    if (isOverflown(element)) {
      return element;
    }

    return findScrollParent(element.parentElement);
  };

  const calculateOffset = (rect, options) => {
    if (options === undefined) {
      return {
        x: rect.left,
        y: rect.top,
      };
    }

    const offset = options.offset || 0;

    switch (options.offsetFrom) {
      case "top":
        return {
          x: rect.left,
          y: rect.top + offset,
        };
      case "right":
        return {
          x: rect.left - offset,
          y: rect.top,
        };
      case "bottom":
        return {
          x: rect.left,
          y: rect.top - offset,
        };
      case "left":
        return {
          x: rect.left + offset,
          y: rect.top,
        };
      default:
        throw new Error("Invalid `scrollToElement.offsetFrom` value");
    }
  };

  const rect = element.getBoundingClientRect();
  const offset = calculateOffset(rect, options);
  const parent = findScrollParent(element);

  if (parent !== undefined) {
    parent.scrollIntoView(true);
    parent.scrollTo(offset.x, offset.y);
  }
};

const disableAnimations = () => {
  const rule = `
		*,
		::before,
		::after {
			animation: initial !important;
			transition: initial !important;
		}
	`;

  const style = document.createElement("style");
  document.body.append(style);

  style.sheet.insertRule(rule);
};

const getBoundingClientRect = (element) => {
  const { top, left, height, width, x, y } = element.getBoundingClientRect();
  return { top, left, height, width, x, y };
};

const internalCaptureWebsiteCore = async (input, options, page, browser) => {
  options = {
    inputType: "url",
    width: 1280,
    height: 800,
    scaleFactor: 2,
    fullPage: false,
    defaultBackground: true,
    timeout: 60,
    delay: 0,
    debug: false,
    darkMode: false,
    _keepAlive: false,
    isJavaScriptEnabled: true,
    blockAds: true,
    inset: 0,
    pdf: false,
    ...options,
  };

  const timeoutInMilliseconds = options.timeout * 1000;

  const viewportOptions = {
    width: options.width,
    height: options.height,
    deviceScaleFactor: options.scaleFactor,
  };

  const screenshotOptions = {};

  if (options.type) {
    screenshotOptions.type = options.type;
  }

  if (options.quality) {
    screenshotOptions.quality = options.quality * 100;
  }

  if (options.fullPage) {
    screenshotOptions.fullPage = options.fullPage;
  }

  if (typeof options.defaultBackground === "boolean") {
    screenshotOptions.omitBackground = !options.defaultBackground;
  }

  if (page && page.setViewport) {
    await page.setViewport(viewportOptions);
  }

  if (page && options.darkMode !== undefined) {
    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: options.darkMode ? "dark" : "light",
      },
    ]);
  }

  if (options.disableAnimations) {
    await page.evaluate(disableAnimations, options.disableAnimations);
  }

  if (Array.isArray(options.hideElements) && options.hideElements.length > 0) {
    await page.addStyleTag({
      content: `${options.hideElements.join(
        ", "
      )} { visibility: hidden !important; }`,
    });
  }

  if (
    Array.isArray(options.removeElements) &&
    options.removeElements.length > 0
  ) {
    await page.addStyleTag({
      content: `${options.removeElements.join(
        ", "
      )} { display: none !important; }`,
    });
  }

  if (options.clickElement) {
    await page.click(options.clickElement);
  }

  if (options.waitForElement) {
    await page.waitForSelector(options.waitForElement, {
      visible: true,
      timeout: timeoutInMilliseconds,
    });
  }

  if (options.beforeScreenshot) {
    await options.beforeScreenshot(page, browser);
  }

  if (options.element) {
    await page.waitForSelector(options.element, {
      visible: true,
      timeout: timeoutInMilliseconds,
    });
    screenshotOptions.clip = await page.$eval(
      options.element,
      getBoundingClientRect
    );
    screenshotOptions.fullPage = false;
  }

  if (options.delay) {
    await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
  }

  if (options.scrollToElement) {
    if (typeof options.scrollToElement === "object") {
      await page.$eval(
        options.scrollToElement.element,
        scrollToElement,
        options.scrollToElement
      );
    } else {
      await page.$eval(options.scrollToElement, scrollToElement);
    }
  }

  if (screenshotOptions.fullPage) {
    const bodyHandle = await page.$("body");
    const bodyBoundingHeight = await bodyHandle.boundingBox();
    await bodyHandle.dispose();

    const viewportHeight = viewportOptions.height;
    let viewportIncrement = 0;
    while (viewportIncrement + viewportHeight < bodyBoundingHeight) {
      const navigationPromise = page.waitForNavigation({
        waitUntil: "networkidle0",
      }).catch(() => {});
      await page.evaluate((_viewportHeight) => {
        window.scrollBy(0, _viewportHeight);
      }, viewportHeight);
      await navigationPromise;
      viewportIncrement += viewportHeight;
    }

    await page.evaluate((_) => {
      window.scrollTo(0, 0);
    });
  }

  if (options.inset && !screenshotOptions.fullPage) {
    const inset = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const key of Object.keys(inset)) {
      if (typeof options.inset === "number") {
        inset[key] = options.inset;
      } else {
        inset[key] = options.inset[key] || 0;
      }
    }

    let clipOptions = screenshotOptions.clip;

    if (!clipOptions) {
      clipOptions = await page.evaluate(() => ({
        x: 0,
        y: 0,
        height: window.innerHeight,
        width: window.innerWidth,
      }));
    }

    const x = clipOptions.x + inset.left;
    const y = clipOptions.y + inset.top;
    const width = clipOptions.width - (inset.left + inset.right);
    const height = clipOptions.height - (inset.top + inset.bottom);

    if (width === 0 || height === 0) {
      throw new Error(
        "When using the `clip` option, the width or height of the screenshot cannot be equal to 0."
      );
    }

    screenshotOptions.clip = { x, y, width, height };
  }

  if (options.pdf) {
    const pdf = await page.pdf(options.pdf);

    return pdf;
  } else {
    const buffer = await page.screenshot(screenshotOptions);

    return buffer;
  }
};

export async function captureExistingPage(page, options = {}) {
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
        if (scrolls === frequency) resolve(true);
      }, timing);
    }
    
    scroll();
    return deferred;
  };

  const originalViewport = page.viewport() || await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio
  }));

  const optionsWithDefaults = {
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    fullPage: false,
    delay: 1,
    darkMode: false,
    blockAds: false,
    skipViewportRestore: false,
    beforeScreenshot: async (page) => {
      if (optionsWithDefaults.fullPage) {
        await page.evaluate(scrollToBottom);
      }
    },
    ...options
  };

  try {
    const result = await internalCaptureWebsiteCore(null, optionsWithDefaults, page, null);
    return { buffer: result, originalViewport };
  } finally {
    if (!optionsWithDefaults.skipViewportRestore && originalViewport) {
      await page.setViewport(originalViewport);
    }
  }
}
