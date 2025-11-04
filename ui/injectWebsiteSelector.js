// ui/injectWebsiteSelector.js
/**
 * Inject autocomplete UI into given page.
 * page.exposeFunction("startTrackingFromUI") should be provided by caller.
 * @param {import('puppeteer').Page} page
 * @param {Array<{website:string,toolName:string}>} allWebsites
 */
export async function injectWebsiteSelector(page, allWebsites = [], allSessions = []) {
    await page.exposeFunction("startTrackingFromUI", async (websiteData) => {
        console.log(`▶️ startTrackingFromUI called with ${websiteData.website}`);
        if (page.trackerInstance) {
            page.trackerInstance.urlTracking = websiteData.website;
            page.trackerInstance.nameTracking = websiteData.toolName;
            await page.trackerInstance.startTracking(websiteData.website, websiteData.code);
        } else {
            console.error("❌ trackerInstance not found on page context");
        }
    });

    await page.exposeFunction("loadSessionFromUI", async (sessionFolder) => {
        console.log(`▶️ loadSessionFromUI called with ${sessionFolder}`);
        if (page.trackerInstance) {
            await page.trackerInstance.loadSession(sessionFolder);
        } else {
            console.error("❌ trackerInstance not found on page context");
        }
    });

    const html = `
    <html>
      <head>
        <title>Website Tracker</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: #f8f9fa;
            margin: 0;
          }
          h2 {
            font-size: 20px;
            margin-bottom: 20px;
            color: #202124;
          }
          .search-box {
            position: relative;
            width: 480px;
            max-width: 90%;
          }
          input {
            width: 100%;
            padding: 12px 16px;
            font-size: 16px;
            border: 1px solid #dfe1e5;
            border-radius: 24px;
            outline: none;
            box-shadow: 0 1px 6px rgba(32, 33, 36, 0.28);
            transition: all 0.2s ease;
          }
          input:focus {
            border-color: #4285f4;
            box-shadow: 0 1px 6px rgba(66, 133, 244, 0.6);
          }
          .suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            border: 1px solid #dfe1e5;
            border-top: none;
            border-radius: 0 0 24px 24px;
            box-shadow: 0 4px 6px rgba(32, 33, 36, 0.28);
            max-height: 240px;
            overflow-y: auto;
            background: white;
            z-index: 1000;
          }
          .suggestion {
            padding: 10px 16px;
            cursor: pointer;
            font-size: 14px;
            color: #202124;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .suggestion:hover,
          .suggestion.active {
            background: #f1f3f4;
          }
          .highlight {
            font-weight: bold;
            color: #1a73e8;
          }
          button {
            margin-top: 20px;
            padding: 10px 24px;
            font-size: 14px;
            background: #1a73e8;
            color: white;
            border: none;
            border-radius: 24px;
            cursor: pointer;
            transition: background 0.2s ease;
          }
          button:hover {
            background: #1558b0;
          }
        </style>
      </head>
      <body>
        <h2>Chọn website để Tracking</h2>
        <div class="search-box">
          <input type="text" id="websiteInput" placeholder="Nhập tên hoặc URL..." autocomplete="off"/>
          <div id="suggestions" class="suggestions"></div>
        </div>
        <button id="trackBtn">Tracking</button>

        <h2 style="margin-top: 40px;">Hoặc tiếp tục session cũ</h2>
        <div id="sessionsList" style="width: 480px; max-width: 90%; max-height: 300px; overflow-y: auto; background: white; border: 1px solid #dfe1e5; border-radius: 12px; padding: 10px;"></div>

        <script>
          const allWebsites = ${JSON.stringify(allWebsites)};
          const allSessions = ${JSON.stringify(allSessions)};
          const input = document.getElementById("websiteInput");
          const suggestionsBox = document.getElementById("suggestions");
          let currentFilter = "";
          let activeIndex = -1;
          let itemsPerPage = 20;
          let currentPage = 1;
          let filteredList = allWebsites;

          // 🔹 Render suggestions (đã fix lặp)
          function renderSuggestions(reset = true) {
            if (reset) {
              suggestionsBox.innerHTML = "";
              currentPage = 1;
            }

            const startIndex = reset ? 0 : (currentPage - 1) * itemsPerPage;
            const endIndex = Math.min(currentPage * itemsPerPage, filteredList.length);
            const slice = filteredList.slice(startIndex, endIndex);

            slice.forEach((w) => {
              const option = document.createElement("div");
              option.className = "suggestion";

              let label = w.toolName;
              if (currentFilter) {
                const regex = new RegExp(\`(\${currentFilter})\`, "ig");
                label = w.toolName.replace(regex, "<span class='highlight'>$1</span>");
              }

              option.innerHTML = \`
                <img src="https://www.google.com/s2/favicons?domain=\${w.website}" width="16" height="16" />
                <span>\${label} - <small style="color:#5f6368">\${w.website}</small></span>
              \`;

              option.addEventListener("click", () => {
                input.value = w.website;
                input.setAttribute("data-name", w.toolName);
                input.setAttribute("data-code", w.code);
                suggestionsBox.innerHTML = "";
              });

              suggestionsBox.appendChild(option);
            });
          }

          // 🔹 Infinite scroll (đã fix trùng)
          suggestionsBox.addEventListener("scroll", () => {
            const nearBottom = suggestionsBox.scrollTop + suggestionsBox.clientHeight >= suggestionsBox.scrollHeight - 10;
            if (nearBottom && currentPage * itemsPerPage < filteredList.length) {
              currentPage++;
              renderSuggestions(false);
            }
          });

          // 🔹 Render full list on focus
          input.addEventListener("focus", () => {
            filteredList = allWebsites;
            currentFilter = "";
            renderSuggestions(true);
          });

          // 🔹 Filter realtime
          input.addEventListener("input", () => {
            currentFilter = input.value.toLowerCase();
            filteredList = !currentFilter
              ? allWebsites
              : allWebsites.filter(
                  (w) =>
                    w.toolName.toLowerCase().includes(currentFilter) ||
                    w.website.toLowerCase().includes(currentFilter)
                );
            renderSuggestions(true);
          });

          // 🔹 Keyboard navigation
          input.addEventListener("keydown", (e) => {
            const items = suggestionsBox.getElementsByClassName("suggestion");
            if (!items.length) return;

            if (e.key === "ArrowDown") {
              activeIndex = (activeIndex + 1) % items.length;
            } else if (e.key === "ArrowUp") {
              activeIndex = (activeIndex - 1 + items.length) % items.length;
            } else if (e.key === "Enter") {
              if (activeIndex >= 0) {
                items[activeIndex].click();
                e.preventDefault();
              }
            }

            Array.from(items).forEach((item, idx) => {
              item.classList.toggle("active", idx === activeIndex);
            });
          });

          // 🔹 Click ngoài dropdown → đóng
          document.addEventListener("click", (e) => {
            if (!e.target.closest(".search-box")) {
              suggestionsBox.innerHTML = "";
            }
          });

          // 🔹 Bắt đầu tracking
          document.getElementById("trackBtn").addEventListener("click", () => {
            const url = input.value;
            const name = input.getAttribute("data-name") || url;
            const code = input.getAttribute("data-code");
            if (url && code) {
              window.startTrackingFromUI({ website: url, toolName: name, code: code });
            } else {
              alert('Vui lòng chọn website từ danh sách!');
            }
          });

          const sessionsList = document.getElementById("sessionsList");
          if (allSessions.length === 0) {
            sessionsList.innerHTML = "<p style='text-align: center; color: #5f6368;'>Chưa có session nào</p>";
          } else {
            allSessions.forEach(session => {
              const sessionDiv = document.createElement("div");
              sessionDiv.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid #f1f3f4; display: flex; justify-content: space-between; align-items: center;";
              sessionDiv.innerHTML = \`
                <div>
                  <div style="font-weight: bold; color: #202124;">\${session.toolName}</div>
                  <div style="font-size: 12px; color: #5f6368;">\${session.formattedTime}</div>
                </div>
                <div style="font-size: 12px; color: #1a73e8;">Tiếp tục →</div>
              \`;
              sessionDiv.addEventListener("click", () => {
                window.loadSessionFromUI(session.folder);
              });
              sessionDiv.addEventListener("mouseenter", () => {
                sessionDiv.style.background = "#f1f3f4";
              });
              sessionDiv.addEventListener("mouseleave", () => {
                sessionDiv.style.background = "white";
              });
              sessionsList.appendChild(sessionDiv);
            });
          }
        </script>
      </body>
    </html>
  `;
    await page.setContent(html, { waitUntil: "domcontentloaded" });
}
