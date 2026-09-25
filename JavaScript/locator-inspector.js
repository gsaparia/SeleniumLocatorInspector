(function () {
    if (window.__seleniumLocatorInspector) {
        return;
    }

    window.__seleniumLocatorInspector = {
        active: false,
        rectangleActive: false,
        previousElement: null,
        previousOutline: "",
        result: null,
        rectangleStart: null,
        rectangleBox: null,
        rectangleOverlay: null,
        rectangleMoveHandler: null,
        rectangleUpHandler: null,
        rectangleDownHandler: null,
        previousUserSelect: "",
        selectionElements: [],

        start: function () {
            // The picker is intentionally reusable. Clear the previous
            // selection/result before every new inspection.
            this.stop();
            this.stopRectangleSelection();
            this.result = null;
            window.__seleniumLocatorResult = null;

            this.active = true;

            this.moveHandler = this.onMouseMove.bind(this);
            this.clickHandler = this.onClick.bind(this);

            document.addEventListener("mousemove", this.moveHandler, true);
            document.addEventListener("click", this.clickHandler, true);
        },

        stop: function () {
            this.active = false;

            if (this.moveHandler) {
                document.removeEventListener("mousemove", this.moveHandler, true);
            }

            if (this.clickHandler) {
                document.removeEventListener("click", this.clickHandler, true);
            }

            this.clearHighlight();
        },

        startRectangleSelection: function () {
            this.stop();
            this.stopRectangleSelection();
            this.result = null;
            window.__seleniumLocatorResult = null;
            this.selectionElements = [];

            this.rectangleActive = true;
            this.rectangleStart = null;

            this.rectangleDownHandler = this.onRectangleMouseDown.bind(this);
            this.rectangleMoveHandler = this.onRectangleMouseMove.bind(this);
            this.rectangleUpHandler = this.onRectangleMouseUp.bind(this);

            document.addEventListener("mousedown", this.rectangleDownHandler, true);
            document.addEventListener("mousemove", this.rectangleMoveHandler, true);
            document.addEventListener("mouseup", this.rectangleUpHandler, true);
        },

        stopRectangleSelection: function () {
            this.rectangleActive = false;
            this.rectangleStart = null;

            if (this.rectangleDownHandler) {
                document.removeEventListener("mousedown", this.rectangleDownHandler, true);
            }

            if (this.rectangleMoveHandler) {
                document.removeEventListener("mousemove", this.rectangleMoveHandler, true);
            }

            if (this.rectangleUpHandler) {
                document.removeEventListener("mouseup", this.rectangleUpHandler, true);
            }

            this.rectangleDownHandler = null;
            this.rectangleMoveHandler = null;
            this.rectangleUpHandler = null;

            if (this.rectangleOverlay) {
                this.rectangleOverlay.remove();
                this.rectangleOverlay = null;
            }

            if (document.documentElement) {
                document.documentElement.style.userSelect = this.previousUserSelect || "";
            }
        },

        onRectangleMouseDown: function (event) {
            if (!this.rectangleActive || event.button !== 0) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            this.rectangleStart = {
                x: event.clientX,
                y: event.clientY
            };

            this.previousUserSelect = document.documentElement.style.userSelect || "";
            document.documentElement.style.userSelect = "none";

            if (!this.rectangleOverlay) {
                this.rectangleOverlay = document.createElement("div");
                this.rectangleOverlay.setAttribute("data-sli-overlay", "true");
                this.rectangleOverlay.style.position = "fixed";
                this.rectangleOverlay.style.pointerEvents = "none";
                this.rectangleOverlay.style.zIndex = "2147483647";
                this.rectangleOverlay.style.border = "2px solid #0066ff";
                this.rectangleOverlay.style.background = "rgba(0, 102, 255, 0.12)";
                document.documentElement.appendChild(this.rectangleOverlay);
            }

            this.updateRectangle(event.clientX, event.clientY);
        },

        onRectangleMouseMove: function (event) {
            if (!this.rectangleActive || !this.rectangleStart) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            this.updateRectangle(event.clientX, event.clientY);
        },

        onRectangleMouseUp: function (event) {
            if (!this.rectangleActive || !this.rectangleStart) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const box = this.getRectangle(
                this.rectangleStart.x,
                this.rectangleStart.y,
                event.clientX,
                event.clientY
            );

            this.stopRectangleSelection();
            this.clearHighlight();

            const elements = this.findElementsInRectangle(box);
            this.selectionElements = elements;

            const results = elements.map((element, index) =>
                this.generateLocators(element, index)
            );

            if (results.length === 0) {
                this.result = {
                    isRectangleSelection: true,
                    rectangleResults: [],
                    tagName: "",
                    text: "No elements",
                    css: "",
                    xpath: "",
                    cssUnique: false,
                    xpathUnique: false,
                    insideShadowDom: false,
                    insideIframe: false,
                    shadowPath: [],
                    framePath: [],
                    candidates: [],
                    stability: { rating: "", positive: [], warnings: [] },
                    seleniumCode: "",
                    selectionIndex: -1
                };
            } else {
                this.result = Object.assign({}, results[0], {
                    isRectangleSelection: true,
                    rectangleResults: results
                });
            }

            window.__seleniumLocatorResult = this.result;
        },

        updateRectangle: function (x, y) {
            if (!this.rectangleOverlay || !this.rectangleStart) return;

            const box = this.getRectangle(
                this.rectangleStart.x,
                this.rectangleStart.y,
                x,
                y
            );

            this.rectangleOverlay.style.left = box.left + "px";
            this.rectangleOverlay.style.top = box.top + "px";
            this.rectangleOverlay.style.width = Math.max(1, box.width) + "px";
            this.rectangleOverlay.style.height = Math.max(1, box.height) + "px";
        },

        getRectangle: function (x1, y1, x2, y2) {
            return {
                left: Math.min(x1, x2),
                top: Math.min(y1, y2),
                right: Math.max(x1, x2),
                bottom: Math.max(y1, y2),
                width: Math.abs(x2 - x1),
                height: Math.abs(y2 - y1)
            };
        },

        findElementsInRectangle: function (box) {
            const all = this.getAllElementsDeep();
            const result = [];
            const seen = new Set();

            for (const element of all) {
                if (!element || seen.has(element)) continue;
                seen.add(element);

                if (element === document.documentElement ||
                    element === document.body) {
                    continue;
                }

                if (element.hasAttribute && element.hasAttribute("data-sli-overlay")) {
                    continue;
                }

                let rect;
                try {
                    rect = element.getBoundingClientRect();
                } catch {
                    continue;
                }

                if (!rect || rect.width <= 0 || rect.height <= 0) continue;

                // Include an element when its visible rectangle intersects
                // the user's selection rectangle.
                const intersects =
                    rect.left < box.right &&
                    rect.right > box.left &&
                    rect.top < box.bottom &&
                    rect.bottom > box.top;

                if (intersects) {
                    result.push(element);
                }
            }

            return result.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return (ra.top - rb.top) || (ra.left - rb.left);
            });
        },

        getAllElementsDeep: function () {
            const result = [];
            const visitedRoots = new Set();

            const walkRoot = (root) => {
                if (!root || visitedRoots.has(root)) return;
                visitedRoots.add(root);

                const elements = root.querySelectorAll
                    ? Array.from(root.querySelectorAll("*"))
                    : [];

                for (const element of elements) {
                    result.push(element);

                    if (element.shadowRoot) {
                        walkRoot(element.shadowRoot);
                    }
                }
            };

            walkRoot(document);
            return result;
        },

        highlightSelection: function (index) {
            this.clearHighlight();

            if (!this.selectionElements || index < 0 || index >= this.selectionElements.length) {
                return;
            }

            const element = this.selectionElements[index];
            if (!element) return;

            this.previousElement = element;
            this.previousOutline = element.style.outline;
            element.style.outline = "3px solid #00aa00";

            try {
                element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
            } catch {
                try { element.scrollIntoView({ block: "center", inline: "center" }); } catch {}
            }
        },

        onMouseMove: function (event) {
            if (!this.active) return;

            const element = this.deepElementFromPoint(event.clientX, event.clientY);

            if (element) {
                this.highlight(element);
            }
        },

        onClick: function (event) {
            if (!this.active) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            const element = this.deepElementFromPoint(event.clientX, event.clientY);

            if (!element) return;

            this.selectionElements = [element];
            this.result = this.generateLocators(element, 0);
            window.__seleniumLocatorResult = this.result;

            this.stop();
        },

        /*
         * Walk through open shadow roots under the mouse.
         * elementFromPoint() on a document can return the shadow host;
         * calling elementFromPoint() against the open shadow root lets us
         * continue into the shadow tree.
         */
        deepElementFromPoint: function (x, y) {
            let root = document;
            let element = root.elementFromPoint(x, y);

            while (element) {
                if (element.shadowRoot) {
                    const inside = element.shadowRoot.elementFromPoint(x, y);
                    if (!inside || inside === element) break;

                    root = element.shadowRoot;
                    element = inside;
                } else {
                    break;
                }
            }

            return element;
        },

        highlight: function (element) {
            if (this.previousElement === element) return;

            this.clearHighlight();

            this.previousElement = element;
            this.previousOutline = element.style.outline;

            element.style.outline = "2px solid #ff0000";
        },

        clearHighlight: function () {
            if (this.previousElement) {
                this.previousElement.style.outline = this.previousOutline || "";
                this.previousElement = null;
            }
        },

        generateLocators: function (element, selectionIndex) {
            const css = this.bestCss(element);
            const xpath = this.bestXPath(element);
            const shadowPath = this.getShadowPath(element);
            const framePath = this.getFramePath();

            const candidates = this.buildCandidates(element);
            const stability = this.analyzeStability(element, candidates);

            return {
                tagName: element.tagName.toLowerCase(),
                text: (element.innerText || element.textContent || "")
                    .trim()
                    .replace(/\s+/g, " ")
                    .substring(0, 500),

                css: css,
                xpath: xpath,

                cssUnique: this.cssCount(css) === 1,
                xpathUnique: this.xpathCount(xpath) === 1,

                insideShadowDom: shadowPath.length > 0,
                insideIframe: framePath.length > 0,

                shadowPath: shadowPath,
                framePath: framePath,
                candidates: candidates,
                stability: stability,

                seleniumCode: this.generateSeleniumCode(
                    css,
                    shadowPath,
                    framePath
                ),

                selectionIndex: Number.isInteger(selectionIndex) ? selectionIndex : -1
            };
        },

        buildCandidates: function (element) {
            const candidates = [];

            const add = (type, value, baseScore) => {
                if (!value) return;

                let unique = false;

                try {
                    unique = this.cssCount(value) === 1;
                } catch {}

                let score = baseScore;

                if (unique) score += 10;

                candidates.push({
                    type: type,
                    value: value,
                    score: score,
                    unique: unique
                });
            };

            if (element.id && !this.isProbablyGenerated(element.id)) {
                add(
                    "CSS",
                    "#" + CSS.escape(element.id),
                    100
                );
            }

            const testId =
                element.getAttribute("data-testid") ||
                element.getAttribute("data-test-id") ||
                element.getAttribute("data-cy");

            if (testId) {
                add(
                    "CSS",
                    element.tagName.toLowerCase() +
                    '[data-testid="' +
                    this.cssAttributeEscape(testId) +
                    '"]',
                    95
                );
            }

            const aria = element.getAttribute("aria-label");

            if (aria) {
                add(
                    "CSS",
                    element.tagName.toLowerCase() +
                    '[aria-label="' +
                    this.cssAttributeEscape(aria) +
                    '"]',
                    85
                );
            }

            const name = element.getAttribute("name");

            if (name) {
                add(
                    "CSS",
                    element.tagName.toLowerCase() +
                    '[name="' +
                    this.cssAttributeEscape(name) +
                    '"]',
                    80
                );
            }

            const role = element.getAttribute("role");

            if (role) {
                add(
                    "CSS",
                    element.tagName.toLowerCase() +
                    '[role="' +
                    this.cssAttributeEscape(role) +
                    '"]',
                    70
                );
            }

            const cls = this.stableClasses(element);

            if (cls.length) {
                add(
                    "CSS",
                    element.tagName.toLowerCase() +
                    cls.map(c => "." + CSS.escape(c)).join(""),
                    60
                );
            }

            const text = (element.innerText || "").trim();

            if (text && text.length <= 80) {
                const tag = element.tagName.toLowerCase();

                add(
                    "XPATH",
                    "//" + tag +
                    "[normalize-space(.)=" +
                    this.xpathLiteral(text) +
                    "]",
                    50
                );
            }

            const xpath = this.bestXPath(element);

            if (xpath) {
                candidates.push({
                    type: "XPATH",
                    value: xpath,
                    score: 65 + (this.xpathCount(xpath) === 1 ? 10 : 0),
                    unique: this.xpathCount(xpath) === 1
                });
            }

            return candidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 12);
        },

        bestCss: function (element) {
            if (element.id && !this.isProbablyGenerated(element.id)) {
                const candidate = "#" + CSS.escape(element.id);

                if (this.cssCount(candidate) === 1)
                    return candidate;
            }

            const attributes = [
                ["data-testid", 95],
                ["data-test-id", 95],
                ["data-cy", 90],
                ["name", 85],
                ["aria-label", 80],
                ["title", 70]
            ];

            for (const item of attributes) {
                const value = element.getAttribute(item[0]);

                if (!value) continue;

                const candidate =
                    element.tagName.toLowerCase() +
                    "[" + item[0] + "=\"" +
                    this.cssAttributeEscape(value) +
                    "\"]";

                if (this.cssCount(candidate) === 1)
                    return candidate;
            }

            const stableClasses = this.stableClasses(element);

            if (stableClasses.length) {
                const candidate =
                    element.tagName.toLowerCase() +
                    stableClasses.map(c => "." + CSS.escape(c)).join("");

                if (this.cssCount(candidate) === 1)
                    return candidate;
            }

            return this.cssPath(element);
        },

        cssPath: function (element) {
            const parts = [];
            let current = element;

            while (
                current &&
                current.nodeType === Node.ELEMENT_NODE &&
                current !== document.body
            ) {
                let selector = current.tagName.toLowerCase();

                if (current.id && !this.isProbablyGenerated(current.id)) {
                    selector += "#" + CSS.escape(current.id);
                    parts.unshift(selector);
                    break;
                }

                const stableClasses = this.stableClasses(current);

                if (stableClasses.length) {
                    selector += stableClasses
                        .slice(0, 2)
                        .map(c => "." + CSS.escape(c))
                        .join("");
                }

                const parent = current.parentElement;

                if (parent) {
                    const sameTag = Array.from(parent.children)
                        .filter(x => x.tagName === current.tagName);

                    if (sameTag.length > 1) {
                        selector += ":nth-of-type(" +
                            (sameTag.indexOf(current) + 1) +
                            ")";
                    }
                }

                parts.unshift(selector);
                current = parent;
            }

            return parts.join(" > ");
        },

        bestXPath: function (element) {
            if (element.id && !this.isProbablyGenerated(element.id)) {
                const value = this.xpathLiteral(element.id);

                const candidate = "//*[@id=" + value + "]";

                if (this.xpathCount(candidate) === 1)
                    return candidate;
            }

            const attrs = [
                "data-testid",
                "data-test-id",
                "data-cy",
                "name",
                "aria-label",
                "title"
            ];

            const tag = element.tagName.toLowerCase();

            for (const attr of attrs) {
                const value = element.getAttribute(attr);

                if (!value) continue;

                const candidate =
                    "//" + tag +
                    "[@" + attr + "=" +
                    this.xpathLiteral(value) +
                    "]";

                if (this.xpathCount(candidate) === 1)
                    return candidate;
            }

            const text = (element.innerText || "").trim();

            if (text && text.length <= 80) {
                const candidate =
                    "//" + tag +
                    "[normalize-space(.)=" +
                    this.xpathLiteral(text) +
                    "]";

                if (this.xpathCount(candidate) === 1)
                    return candidate;
            }

            return this.xpathPath(element);
        },

        xpathPath: function (element) {
            const parts = [];
            let current = element;

            while (
                current &&
                current.nodeType === Node.ELEMENT_NODE
            ) {
                let index = 1;
                let sibling = current.previousElementSibling;

                while (sibling) {
                    if (sibling.tagName === current.tagName)
                        index++;

                    sibling = sibling.previousElementSibling;
                }

                parts.unshift(
                    current.tagName.toLowerCase() +
                    "[" + index + "]"
                );

                current = current.parentElement;
            }

            return "/" + parts.join("/");
        },

        getShadowPath: function (element) {
            const result = [];
            let current = element;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
                const root = current.getRootNode();

                if (!(root instanceof ShadowRoot))
                    break;

                result.unshift(this.simpleCss(current));

                current = root.host;
            }

            return result;
        },

        getFramePath: function () {
            const result = [];

            try {
                let win = window;

                while (win !== win.parent) {
                    const frame = win.frameElement;

                    if (!frame) break;

                    result.unshift(this.simpleCss(frame));
                    win = win.parent;
                }
            } catch {}

            return result;
        },

        simpleCss: function (element) {
            if (element.id && !this.isProbablyGenerated(element.id))
                return "#" + CSS.escape(element.id);

            const tag = element.tagName.toLowerCase();

            const testId =
                element.getAttribute("data-testid") ||
                element.getAttribute("data-test-id");

            if (testId) {
                return tag +
                    '[data-testid="' +
                    this.cssAttributeEscape(testId) +
                    '"]';
            }

            const name = element.getAttribute("name");

            if (name) {
                return tag +
                    '[name="' +
                    this.cssAttributeEscape(name) +
                    '"]';
            }

            return tag;
        },

        stableClasses: function (element) {
            return Array.from(element.classList || [])
                .filter(c => {
                    if (!c) return false;
                    if (c.length > 40) return false;

                    return !/^css-[a-z0-9]+$/i.test(c) &&
                        !/^sc-[a-z0-9]+$/i.test(c) &&
                        !/^_[a-z0-9]{5,}$/i.test(c) &&
                        !/^\d+$/.test(c);
                })
                .slice(0, 3);
        },

        isProbablyGenerated: function (value) {
            if (!value) return false;

            return (
                /^ctl\d+_/i.test(value) ||
                /^ember\d+$/i.test(value) ||
                /^react-select-\d+/i.test(value) ||
                /^css-[a-z0-9]+$/i.test(value) ||
                /^[a-f0-9]{12,}$/i.test(value) ||
                /_\d{4,}$/.test(value)
            );
        },

        cssAttributeEscape: function (value) {
            return String(value)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"');
        },

        xpathLiteral: function (value) {
            if (!value.includes("'"))
                return "'" + value + "'";

            if (!value.includes('"'))
                return '"' + value + '"';

            return "concat('" +
                value.replace(/'/g, "',\"'\",'") +
                "')";
        },

        cssCount: function (selector) {
            try {
                return document.querySelectorAll(selector).length;
            } catch {
                return 0;
            }
        },

        xpathCount: function (xpath) {
            try {
                const result = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                    null
                );

                return result.snapshotLength;
            } catch {
                return 0;
            }
        },

        analyzeStability: function (element, candidates) {
            const warnings = [];
            const positive = [];

            if (element.id) {
                if (this.isProbablyGenerated(element.id)) {
                    warnings.push("ID looks dynamically generated.");
                } else {
                    positive.push("Stable-looking ID.");
                }
            }

            if (element.getAttribute("data-testid") ||
                element.getAttribute("data-test-id") ||
                element.getAttribute("data-cy")) {
                positive.push("Test-specific data attribute found.");
            }

            if (element.getAttribute("aria-label")) {
                positive.push("ARIA label available.");
            }

            const classes = Array.from(element.classList || []);
            const dynamicClasses = classes.filter(c =>
                /^css-[a-z0-9]+$/i.test(c) ||
                /^sc-[a-z0-9]+$/i.test(c) ||
                /^_[a-z0-9]{5,}$/i.test(c) ||
                /[a-f0-9]{8,}/i.test(c)
            );

            if (dynamicClasses.length) {
                warnings.push(
                    "One or more CSS classes look generated: " +
                    dynamicClasses.join(", ")
                );
            }

            const indexy = candidates.some(c =>
                c.value.includes(":nth-of-type(") ||
                /\/\w+\[\d+\]/.test(c.value)
            );

            if (indexy) {
                warnings.push("A candidate depends on a DOM position/index.");
            }

            if (element.closest && element.closest("[role]")) {
                positive.push("Semantic role information is available.");
            }

            const best = candidates.length ? candidates[0] : null;

            let rating = "Medium";

            if (best && best.unique &&
                (best.value.includes("data-testid") ||
                 best.value.includes("data-test-id") ||
                 best.value.includes("data-cy"))) {
                rating = "High";
            } else if (best && best.unique &&
                (element.id && !this.isProbablyGenerated(element.id))) {
                rating = "High";
            } else if (warnings.length >= 2) {
                rating = "Low";
            }

            return {
                rating: rating,
                positive: positive,
                warnings: warnings
            };
        },

        generateSeleniumCode: function (css, shadowPath, framePath) {
            let code = "";

            if (framePath && framePath.length) {
                for (const frame of framePath) {
                    code +=
                        'driver.SwitchTo().Frame(driver.FindElement(By.CssSelector("' +
                        frame.replace(/"/g, '\\"') +
                        '")));\\n';
                }

                code += "\\n";
            }

            if (!shadowPath || shadowPath.length === 0) {
                code +=
                    'var element = driver.FindElement(By.CssSelector("' +
                    css.replace(/"/g, '\\"') +
                    '"));';

                return code;
            }

            let expression = "document";

            for (let i = 0; i < shadowPath.length; i++) {
                expression +=
                    ".querySelector('" +
                    shadowPath[i].replace(/'/g, "\\'") +
                    "')";

                if (i < shadowPath.length - 1) {
                    expression += ".shadowRoot";
                }
            }

            expression +=
                ".querySelector('" +
                css.replace(/'/g, "\\'") +
                "')";

            code +=
                'var element = (IWebElement)((IJavaScriptExecutor)driver)' +
                '.ExecuteScript(@"return ' +
                expression +
                ';");';

            return code;
        }
    };
})();
