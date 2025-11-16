import { promises as fs } from "node:fs";
import sharp from "sharp";

const waitForStableDOM = async (page, timeout = 5000, stableTime = 500) => {
  await page.evaluate((stableTime) => {
    if (window.__domStableObserver) {
      window.__domStableObserver.disconnect();
      clearTimeout(window.__domStableTimeoutId);
    }

    window.__domStable = false;
    let timeoutId;

    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        window.__domStable = true;
      }, stableTime);
    });

    window.__domStableObserver = observer;

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: true,
      characterDataOldValue: false
    });

    timeoutId = setTimeout(() => {
      window.__domStable = true;
    }, stableTime);

    window.__domStableTimeoutId = timeoutId;
  }, stableTime);

  try {
    await page.waitForFunction(
      () => window.__domStable === true,
      { timeout, polling: 100 }
    );
  } catch (err) {
    if (err.message && err.message.includes('exceeded')) {
      console.log(`  ⚠️ DOM stable timeout after ${timeout}ms, continuing capture...`);
    } else {
      throw err;
    }
  } finally {
    await page.evaluate(() => {
      if (window.__domStableObserver) {
        window.__domStableObserver.disconnect();
        delete window.__domStableObserver;
      }
      if (window.__domStableTimeoutId) {
        clearTimeout(window.__domStableTimeoutId);
        delete window.__domStableTimeoutId;
      }
      delete window.__domStable;
    });
  }
};

const scrollToBottom = function({ frequency = 100, timing = 8, remoteWindow = window } = {}) {
  let resolve;
  let scrolls = 1;
  let deferred = new Promise(r => (resolve = r));
  
  const scrollHeight = Math.max(
    remoteWindow.document.body.scrollHeight || 0,
    remoteWindow.document.documentElement.scrollHeight || 0,
    remoteWindow.document.body.offsetHeight || 0,
    remoteWindow.document.documentElement.offsetHeight || 0,
    remoteWindow.document.body.clientHeight || 0,
    remoteWindow.document.documentElement.clientHeight || 0
  );
  
  const viewportHeight = remoteWindow.innerHeight || 1080;
  
  if (scrollHeight <= viewportHeight) {
    resolve(true);
    return deferred;
  }
  
  let totalScrolls = scrollHeight / frequency;
  
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

const forceDocumentScroll = async (page) => {
  const result = await page.evaluate(async () => {
    const findScrollableElement = () => {
      const candidates = [];
      
      const checkElement = (el) => {
        if (!el || el === document.documentElement || el === document.body) return;
        
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const scrollHeight = el.scrollHeight;
          const clientHeight = el.clientHeight;
          
          if (scrollHeight > clientHeight) {
            candidates.push({
              element: el,
              scrollHeight: scrollHeight,
              clientHeight: clientHeight
            });
          }
        }
      };
      
      const walk = (el) => {
        checkElement(el);
        for (let child of el.children) {
          walk(child);
        }
      };
      
      walk(document.body);
      candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
      
      return candidates[0] || null;
    };
    
    const scrollContainer = findScrollableElement();
    
    if (!scrollContainer) {
      return { found: false };
    }
    
    const container = scrollContainer.element;
    
    window.__originalStyles = [];
    
    const saveAndForceStyles = (el) => {
      const originalStyles = {
        element: el,
        overflowY: el.style.overflowY,
        overflowX: el.style.overflowX,
        overflow: el.style.overflow,
        height: el.style.height,
        maxHeight: el.style.maxHeight,
        minHeight: el.style.minHeight,
        position: el.style.position,
        top: el.style.top,
        bottom: el.style.bottom,
        left: el.style.left,
        right: el.style.right
      };
      
      window.__originalStyles.push(originalStyles);
      
      el.style.setProperty('overflow-y', 'visible', 'important');
      el.style.setProperty('overflow-x', 'visible', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('min-height', '0', 'important');
    };
    
    let currentEl = container;
    while (currentEl && currentEl !== document.body) {
      saveAndForceStyles(currentEl);
      currentEl = currentEl.parentElement;
    }
    
    document.body.style.setProperty('overflow-y', 'auto', 'important');
    document.documentElement.style.setProperty('overflow-y', 'auto', 'important');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { found: true };
  });
  
  return result;
};

export const restoreOriginalScroll = async (page) => {
  await page.evaluate(() => {
    if (window.__originalStyles && window.__originalStyles.length > 0) {
      for (const original of window.__originalStyles) {
        const { element, overflowY, overflowX, overflow, height, maxHeight, minHeight, position, top, bottom, left, right } = original;
        
        const restore = (prop, value) => {
          if (value) {
            element.style[prop] = value;
          } else {
            element.style.removeProperty(prop);
          }
        };
        
        restore('overflowY', overflowY);
        restore('overflowX', overflowX);
        restore('overflow', overflow);
        restore('height', height);
        restore('maxHeight', maxHeight);
        restore('minHeight', minHeight);
        restore('position', position);
        restore('top', top);
        restore('bottom', bottom);
        restore('left', left);
        restore('right', right);
      }
      
      delete window.__originalStyles;
    }
    
    document.body.style.removeProperty('overflow-y');
    document.documentElement.style.removeProperty('overflow-y');
  });
};

const initStickyElements = async (page) => {
  await page.evaluate(() => {
    if (!window.__stickyElementsData) {
      window.__stickyElementsData = [];
      
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach((el) => {
        if (el === document.documentElement || el === document.body) return;
        
        const style = window.getComputedStyle(el);
        const position = style.position;
        
        if (position === 'sticky' || position === 'fixed') {
          window.__stickyElementsData.push({
            element: el,
            originalPosition: el.style.position || '',
            originalDisplay: el.style.display || '',
            capturedPageIndex: null
          });
        }
      });
    }
  });
};

const disableStickyElementsForSection = async (page, sectionIndex, viewportTop, viewportBottom) => {
  await page.evaluate((sectionIndex, viewportTop, viewportBottom) => {
    if (window.__stickyElementsData && window.__stickyElementsData.length > 0) {
      window.__stickyElementsData.forEach((item) => {
        const computedStyle = window.getComputedStyle(item.element);
        const position = computedStyle.position;
        const rect = item.element.getBoundingClientRect();
        const scrollY = window.pageYOffset || window.scrollY || 0;
        const viewportHeight = window.innerHeight;
        
        let isVisibleInViewport = false;
        
        if (position === 'fixed') {
          isVisibleInViewport = (
            rect.top >= 0 && rect.top < viewportHeight &&
            rect.left >= 0 && rect.left < window.innerWidth &&
            rect.width > 0 && rect.height > 0
          );
        } else {
          const elementTop = rect.top + scrollY;
          const elementBottom = rect.bottom + scrollY;
          
          isVisibleInViewport = (
            (elementTop >= viewportTop && elementTop < viewportBottom) ||
            (elementBottom > viewportTop && elementBottom <= viewportBottom) ||
            (elementTop < viewportTop && elementBottom > viewportBottom)
          ) && rect.width > 0 && rect.height > 0;
        }
        
        if (isVisibleInViewport && item.capturedPageIndex === null) {
          item.capturedPageIndex = sectionIndex;
        }
        
        if (item.capturedPageIndex !== null && item.capturedPageIndex < sectionIndex) {
          item.element.style.setProperty('display', 'none', 'important');
        } else {
          item.element.style.removeProperty('display');
          if (item.originalDisplay) {
            item.element.style.display = item.originalDisplay;
          }
        }
      });
    }
  }, sectionIndex, viewportTop, viewportBottom);
};

const restoreStickyElements = async (page) => {
  await page.evaluate(() => {
    if (window.__stickyElementsData && window.__stickyElementsData.length > 0) {
      window.__stickyElementsData.forEach((item) => {
        item.element.style.setProperty('position', '', 'important');
        item.element.style.setProperty('display', '', 'important');
        item.element.style.removeProperty('position');
        item.element.style.removeProperty('display');
        
        if (item.originalPosition) {
          item.element.style.position = item.originalPosition;
        }
        if (item.originalDisplay) {
          item.element.style.display = item.originalDisplay;
        }
      });
      
      delete window.__stickyElementsData;
    }
  });
};

const hideScrollbar = async (page) => {
  await page.addStyleTag({
    content: `
      * {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `
  });
};

const captureByStitching = async (page, options) => {
  await hideScrollbar(page);
  await forceDocumentScroll(page);
  
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.setAttribute('style', 'height: auto; scroll-behavior: auto;');
    document.body.setAttribute('style', 'height: auto; scroll-behavior: auto;');
  });
  
  await waitForStableDOM(page, 5000, 1000);
  
  let dimensions = await page.evaluate(() => {
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const devicePixelRatio = window.devicePixelRatio;
    
    return {
      scrollHeight,
      viewportHeight,
      viewportWidth,
      devicePixelRatio
    };
  });
  
  const numSections = Math.ceil(dimensions.scrollHeight / dimensions.viewportHeight);
  
  if (numSections === 1) {
    const buffer = await page.screenshot({
      omitBackground: !options.defaultBackground
    });
    return buffer;
  }
  
  console.log(`📸 Capturing ${numSections} sections with stitching...`);
  
  await initStickyElements(page);
  
  const fullSectionsHeight = (numSections - 1) * dimensions.viewportHeight;
  const lastSectionHeight = Math.max(0, dimensions.scrollHeight - fullSectionsHeight);
  const physicalViewportHeight = Math.round(dimensions.viewportHeight * dimensions.devicePixelRatio);
  const physicalWidth = Math.round(dimensions.viewportWidth * dimensions.devicePixelRatio);
  const physicalLastHeight = Math.round(lastSectionHeight * dimensions.devicePixelRatio);
  
  const sections = [];
  
  for (let i = 0; i < numSections; i++) {
    try {
      const isLast = i === numSections - 1;
      let scrollY;
      
      if (isLast && lastSectionHeight > 0 && lastSectionHeight < dimensions.viewportHeight) {
        scrollY = dimensions.scrollHeight - dimensions.viewportHeight;
      } else {
        scrollY = i * dimensions.viewportHeight;
      }
      
      await page.evaluate((y) => {
        window.scrollTo(0, y);
        document.documentElement.scrollTop = y;
        document.body.scrollTop = y;
      }, scrollY);
      
      await waitForStableDOM(page, 5000, 1000);
      
      const actualScrollY = await page.evaluate(() => {
        return Math.max(
          window.pageYOffset || window.scrollY || 0,
          document.documentElement.scrollTop || 0,
          document.body.scrollTop || 0
        );
      });
      
      if (Math.abs(actualScrollY - scrollY) > 10) {
        console.log(`  ⚠️ Scroll mismatch: expected ${scrollY}, got ${actualScrollY}`);
      }
      
      await waitForStableDOM(page, 5000, 1000);
      
      const viewportTop = scrollY;
      const viewportBottom = scrollY + dimensions.viewportHeight;
      await disableStickyElementsForSection(page, i, viewportTop, viewportBottom);
      
      const screenshot = await page.screenshot({
        omitBackground: !options.defaultBackground
      });
      
      sections.push(screenshot);
      console.log(`  ✅ Section ${i + 1}/${numSections} captured at y=${scrollY} (actual: ${actualScrollY})`);
    } catch (err) {
      console.error(`  ❌ Failed to capture section ${i + 1}/${numSections}:`, err.message);
      throw err;
    }
  }
  
  await page.evaluate(() => window.scrollTo(0, 0));
  
  let compositeImages = [];
  
  for (let i = 0; i < sections.length - 1; i++) {
    const sectionBuffer = sections[i];
    const croppedSection = await sharp(sectionBuffer)
      .extract({
        left: 0,
        top: 0,
        width: physicalWidth,
        height: physicalViewportHeight
      })
      .toBuffer();
    
    compositeImages.push({
      input: croppedSection,
      top: i * physicalViewportHeight,
      left: 0
    });
  }
  
  if (lastSectionHeight > 0 && lastSectionHeight < dimensions.viewportHeight) {
    const lastSectionBuffer = sections[sections.length - 1];
    const cropTop = physicalViewportHeight - physicalLastHeight;
    const croppedLast = await sharp(lastSectionBuffer)
      .extract({
        left: 0,
        top: cropTop,
        width: physicalWidth,
        height: physicalLastHeight
      })
      .toBuffer();
    
    compositeImages.push({
      input: croppedLast,
      top: (sections.length - 1) * physicalViewportHeight,
      left: 0
    });
  } else {
    const lastSectionBuffer = sections[sections.length - 1];
    const croppedLast = await sharp(lastSectionBuffer)
      .extract({
        left: 0,
        top: 0,
        width: physicalWidth,
        height: physicalViewportHeight
      })
      .toBuffer();
    
    compositeImages.push({
      input: croppedLast,
      top: (sections.length - 1) * physicalViewportHeight,
      left: 0
    });
  }
  
  const totalHeight = (sections.length - 1) * physicalViewportHeight + physicalLastHeight;
  
  console.log(`🔧 Stitching ${sections.length} sections into ${physicalWidth}x${totalHeight}...`);
  
  const mergedBuffer = await sharp({
    create: {
      width: physicalWidth,
      height: totalHeight,
      channels: 4,
      background: options.defaultBackground 
        ? { r: 255, g: 255, b: 255, alpha: 1 } 
        : { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite(compositeImages)
  .png()
  .toBuffer();
  
  console.log(`✅ Stitching completed`);
  
  await restoreStickyElements(page);
  
  await restoreOriginalScroll(page);
  
  await page.evaluate(() => {
    const removeImportantFromElement = (el) => {
      el.style.setProperty('overflow-y', '', 'important');
      el.style.setProperty('overflow-x', '', 'important');
      el.style.setProperty('overflow', '', 'important');
      el.style.removeProperty('overflow-y');
      el.style.removeProperty('overflow-x');
      el.style.removeProperty('overflow');
    };
    
    removeImportantFromElement(document.body);
    removeImportantFromElement(document.documentElement);
    
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return mergedBuffer;
};

const internalCaptureWebsiteCore = async (options, page) => {
  options = {
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    fullPage: true,
    defaultBackground: true,
    delay: 1,
    useStitching: false,
    ...options,
  };

  const viewportOptions = {
    width: options.width,
    height: options.height,
    deviceScaleFactor: options.scaleFactor,
  };

  await page.setViewport(viewportOptions);
  await hideScrollbar(page);

  if (options.fullPage) {
    // await forceDocumentScroll(page);
    const hasCustomScroll = await forceDocumentScroll(page);
    
    if (hasCustomScroll.found) {
      return await captureByStitching(page, options);
    }
    
    await page.evaluate(scrollToBottom);
    
    if (options.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
    }

    const { width, height, devicePixelRatio } = await page.evaluate(() => {
      return {
        width: window.innerWidth,
        height: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        ),
        devicePixelRatio: window.devicePixelRatio
      };
    });

    const client = page._client();
    
    await page.evaluate(() => window.scrollTo(0, 0));
    
    const clip = {
      x: 0,
      y: 0,
      width: width,
      height: height,
      scale: devicePixelRatio
    };

    if (!options.defaultBackground) {
      await client.send('Emulation.setDefaultBackgroundColorOverride', {
        color: { r: 0, g: 0, b: 0, a: 0 }
      });
    }

    const result = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: clip,
      captureBeyondViewport: true
    });

    if (!options.defaultBackground) {
      await client.send('Emulation.setDefaultBackgroundColorOverride');
    }

    return Buffer.from(result.data, 'base64');
  }

  if (options.delay) {
    await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
  }

  const buffer = await page.screenshot({
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
