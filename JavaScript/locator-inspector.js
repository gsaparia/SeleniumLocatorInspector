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
        locatorHighlights: [],
        pickSnapshot: null,

        start: function () {
            // The picker is intentionally reusable. Clear the previous
            // selection/result before every new inspection.
            this.stop();
            this.stopRectangleSelection();
            this.result = null;
            window.__seleniumLocatorResult = null;

            // Run the supplied multi-frame/shadow flattening when Pick Element
            // starts. Selection itself takes a new copy if the page changes.
            this.pickSnapshot = this.flattenMultiFrameDOM();

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
            this.clearLocatorHighlights();
            this.pickSnapshot = null;
        },

        startRectangleSelection: function () {
            this.stop();
            this.stopRectangleSelection();
            this.result = null;
            window.__seleniumLocatorResult = null;
            this.selectionElements = [];

            this.pickSnapshot = this.flattenMultiFrameDOM();

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
            this.pickSnapshot = null;

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

            const snapshot = elements.length ? this.flattenMultiFrameDOM() : null;
            const results = elements.map((element, index) =>
                this.generateLocators(element, index, snapshot)
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
            this.clearLocatorHighlights();
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

        generateLocators: function (element, selectionIndex, snapshot = this.flattenMultiFrameDOM()) {
            const selectedClone = snapshot.findClone(element);
            if (!selectedClone)
                throw new Error("The selected element is no longer present in the accessible flattened DOM.");

            this._analysisSnapshot = snapshot;
            this._analysisQueryCache = new Map();
            try {
                const css = this.bestCss(selectedClone);
                const xpath = this.bestXPath(selectedClone);
                const shadowPath = this.getShadowPath(element);
                const framePath = this.getFramePath();

                const candidates = this.buildCandidates(selectedClone);
                const detailedCandidates = this.buildDetailedCandidates(selectedClone, candidates, snapshot);
                const best = candidates[0];
                const status = best ? this.locatorStatus(best.value, element, snapshot) :
                    { visible: false, clickable: false };
                const stability = this.analyzeStability(selectedClone, [...candidates, ...detailedCandidates]);

                return {
                    tagName: selectedClone.tagName.toLowerCase(),
                    text: (selectedClone.textContent || "")
                        .trim().replace(/\s+/g, " ").substring(0, 500),
                    css, xpath,
                    cssUnique: this.cssCount(css) === 1,
                    xpathUnique: this.xpathCount(xpath) === 1,
                    insideShadowDom: shadowPath.length > 0,
                    insideIframe: framePath.length > 0,
                    shadowPath, framePath, candidates,
                    visible: status.visible,
                    clickable: status.clickable,
                    detailedCandidates,
                    stability,
                    seleniumCode: this.generateSeleniumCode(css, shadowPath, framePath),
                    selectionIndex: Number.isInteger(selectionIndex) ? selectionIndex : -1
                };
            } finally {
                this._analysisSnapshot = null;
                this._analysisQueryCache = null;
            }
        },

        matchingClones: function (value, snapshot = this._analysisSnapshot) {
            const cache = snapshot === this._analysisSnapshot ? this._analysisQueryCache : null;
            if (cache && cache.has(value)) return cache.get(value);
            const matches = snapshot.findAllClones(value);
            if (cache) cache.set(value, matches);
            return matches;
        },

        candidateScore: function (value, base, unique) {
            let score = base + (unique ? 12 : -25);
            const positions = (value.match(/:nth-of-type\(|\/[a-z][\w-]*\[\d+\]/gi) || []).length;
            score -= Math.min(36, positions * 12);
            if (/^\/(?!\/)/.test(value)) score -= 18;
            if (value.length > 160) score -= Math.min(15, Math.ceil((value.length - 160) / 30));
            if (/^\/[\/.]*[a-z]+\[normalize-space\(\.\)=(['"])(?:Edit|View|Save|Next|More)\1\]$/i.test(value)) score -= 12;
            return Math.max(0, Math.min(100, Math.round(score)));
        },

        buildCandidates: function (element) {
            const candidates = [];

            const add = (type, value, baseScore) => {
                if (!value || candidates.some(c => c.type === type && c.value === value)) return;
                let matches;
                try { matches = this.matchingClones(value); } catch { return; }
                if (!matches.includes(element)) return;
                const unique = matches.length === 1;

                candidates.push({
                    type: type,
                    value: value,
                    score: this.candidateScore(value, baseScore, unique),
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

            for (const attribute of ["data-testid", "data-test-id", "data-cy"]) {
                const value = element.getAttribute(attribute);
                if (value) add("CSS", element.tagName.toLowerCase() +
                    "[" + attribute + '="' + this.cssAttributeEscape(value) + '"]', 95);
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

            const text = (element.textContent || "").trim().replace(/\s+/g, " ");

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

            if (xpath) add("XPATH", xpath, 65);

            return candidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 12);
        },

        // Analyze a single flattened snapshot, then map matching clones back
        // to live elements for highlighting and state checks. A later highlight
        // creates a fresh snapshot so navigation cannot leave a stale map.
        flattenMultiFrameDOM: function (rootWindow = window) {
            const cloneRoot = document.implementation.createHTMLDocument("Flattened Multi-Frame Copy");
            const elementMap = new Map();
            const originalToClone = new Map();
            const traverse = (node, parentClone) => {
                let clone;
                if (node.nodeType === Node.ELEMENT_NODE) {
                    clone = cloneRoot.createElement(node.tagName.toLowerCase());
                    for (const attr of node.attributes) {
                        try { clone.setAttribute(attr.name, attr.value); } catch {}
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    clone = cloneRoot.createTextNode(node.nodeValue);
                } else return;
                parentClone.appendChild(clone);
                elementMap.set(clone, node);
                originalToClone.set(node, clone);
                if (node.shadowRoot) node.shadowRoot.childNodes.forEach(child => traverse(child, clone));
                node.childNodes.forEach(child => traverse(child, clone));
            };
            const flattenFrames = (win, parent) => {
                try {
                    const container = cloneRoot.createElement("div");
                    container.setAttribute("data-frame", win.document.URL || "main");
                    parent.appendChild(container);
                    traverse(win.document.documentElement, container);
                    for (let i = 0; i < win.frames.length; i++) flattenFrames(win.frames[i], parent);
                } catch (e) {
                    console.warn("Cannot access frame due to cross-origin restrictions:", e);
                }
            };
            flattenFrames(rootWindow, cloneRoot.body);
            const findAllClones = (selector, useXPath) => {
                const trimmed = selector.trim();
                const isXPath = useXPath === undefined
                    ? /^(?:\*?\/\/|\.\/|\/|\()/.test(trimmed) || trimmed === "." || trimmed === ".."
                    : useXPath;
                if (!isXPath)
                    return Array.from(cloneRoot.querySelectorAll(selector)).filter(el => elementMap.has(el));
                const found = [];
                const iterator = cloneRoot.evaluate(selector, cloneRoot, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node;
                while ((node = iterator.iterateNext())) {
                    if (elementMap.has(node)) found.push(node);
                }
                return found;
            };
            return {
                flattenedDoc: cloneRoot,
                map: elementMap,
                findClone: original => originalToClone.get(original),
                findAllClones,
                findOriginalBySelector: selector => elementMap.get(cloneRoot.querySelector(selector)) || null,
                findOriginalByXPath: xpath => elementMap.get(
                    cloneRoot.evaluate(xpath, cloneRoot, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) || null,
                findAllOriginalBySelector: selector => findAllClones(selector, false).map(clone => elementMap.get(clone)),
                findAllOriginalByXPath: xpath => findAllClones(xpath, true).map(clone => elementMap.get(clone)),
                findAllOriginal: selector => findAllClones(selector).map(clone => elementMap.get(clone))
            };
        },

        findAllOriginal: function (selector) {
            return this.flattenMultiFrameDOM().findAllOriginal(selector);
        },

        isVisible: function (element) {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
            try {
                const win = element.ownerDocument.defaultView;
                if (!win || !element.isConnected || !element.getClientRects().length) return false;
                for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement || node.getRootNode().host) {
                    const style = win.getComputedStyle(node);
                    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0 || node.hasAttribute("hidden")) return false;
                }
                let frame = win.frameElement;
                while (frame) {
                    if (!this.isVisible(frame)) return false;
                    frame = frame.ownerDocument.defaultView.frameElement;
                }
                return true;
            } catch { return false; }
        },

        isClickable: function (element) {
            if (!this.isVisible(element) || element.matches(":disabled") || element.closest("[inert]") || element.getAttribute("aria-disabled") === "true") return false;
            const win = element.ownerDocument.defaultView;
            if (win.getComputedStyle(element).pointerEvents === "none") return false;
            const rect = element.getBoundingClientRect();
            const x = Math.max(0, Math.min(win.innerWidth - 1, rect.left + rect.width / 2));
            const y = Math.max(0, Math.min(win.innerHeight - 1, rect.top + rect.height / 2));
            if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= win.innerWidth || rect.top >= win.innerHeight) return false;
            let hit = element.ownerDocument.elementFromPoint(x, y);
            while (hit && hit.shadowRoot) hit = hit.shadowRoot.elementFromPoint(x, y) || hit;
            return !!hit && (element === hit || element.contains(hit) || hit.contains(element));
        },

        locatorStatus: function (locator, target, snapshot) {
            try {
                const matches = (snapshot || this.flattenMultiFrameDOM()).findAllOriginal(locator);
                const matched = target ? matches.filter(el => el === target) : matches;
                return {
                    matchesTarget: matched.length > 0,
                    visible: matched.some(el => this.isVisible(el)),
                    clickable: matched.some(el => this.isClickable(el))
                };
            } catch { return { matchesTarget: false, visible: false, clickable: false }; }
        },

        clearLocatorHighlights: function () {
            for (const item of this.locatorHighlights) {
                try { item.element.style.outline = item.outline; } catch {}
            }
            this.locatorHighlights = [];
        },

        highlightLocator: function (locator) {
            const matches = this.findAllOriginal(locator);
            this.highlightMatches(matches);
            return matches.length;
        },

        testLocator: function (locator, selectionIndex) {
            try {
                const matches = this.findAllOriginal(locator);
                this.highlightMatches(matches);
                const selected = this.selectionElements[selectionIndex] || null;
                return {
                    count: matches.length,
                    selectedElementMatched: !!selected && matches.includes(selected),
                    visible: matches.some(element => this.isVisible(element)),
                    clickable: matches.some(element => this.isClickable(element)),
                    error: null
                };
            } catch (error) {
                this.clearLocatorHighlights();
                return { count: 0, selectedElementMatched: false, visible: false,
                    clickable: false, error: error.message || String(error) };
            }
        },

        highlightMatches: function (matches) {
            this.clearHighlight();
            this.clearLocatorHighlights();
            for (const element of matches) {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) continue;
                this.locatorHighlights.push({ element, outline: element.style.outline });
                element.style.outline = "3px solid #00aa00";
            }
            if (matches[0] && matches[0].nodeType === Node.ELEMENT_NODE) {
                try {
                    matches[0].scrollIntoView({ block: "center", inline: "center" });
                    let frame = matches[0].ownerDocument.defaultView.frameElement;
                    while (frame) {
                        frame.scrollIntoView({ block: "center", inline: "center" });
                        frame = frame.ownerDocument.defaultView.frameElement;
                    }
                } catch {}
            }
        },

        parentForLocator: function (element) {
            if (element.parentElement) return element.parentElement;
            const root = element.getRootNode();
            return root && root.host ? root.host : null;
        },

        relationshipNodeOptions: function (node) {
            const tag = node.tagName.toLowerCase();
            const options = [{ xpath: tag, css: tag, score: 45, reason: "element tag" }];
            const attributes = [
                ["data-testid", 96], ["data-test-id", 96], ["data-cy", 94],
                ["data-qa", 92], ["part", 93], ["id", 91], ["name", 83],
                ["aria-label", 82], ["title", 73], ["role", 65], ["type", 60]
            ];
            for (const [name, score] of attributes) {
                const value = node.getAttribute(name);
                if (!value || value.length > 100 || this.isProbablyGenerated(value)) continue;
                options.push({
                    xpath: tag + "[@" + name + "=" + this.xpathLiteral(value) + "]",
                    css: tag + "[" + name + '="' + this.cssAttributeEscape(value) + '"]',
                    score, reason: "@" + name
                });
            }
            const cls = this.stableClasses(node)[0];
            if (cls) options.push({
                xpath: tag + "[contains(concat(' ',normalize-space(@class),' ')," + this.xpathLiteral(" " + cls + " ") + ")]",
                css: tag + "." + CSS.escape(cls), score: 67, reason: "stable class"
            });
            const text = (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ");
            if (text && text.length <= 75 && !node.children.length)
                options.push({ xpath: tag + "[normalize-space(.)=" + this.xpathLiteral(text) + "]",
                    css: null, score: 79, reason: "element text" });
            return options;
        },

        relationshipTextClues: function (node, target) {
            const clues = [];
            const add = value => {
                const text = (value || "").trim().replace(/\s+/g, " ");
                if (text.length >= 3 && text.length <= 100 && !clues.includes(text)) clues.push(text);
            };
            const branch = Array.from(node.children).find(child => child.contains(target));
            const start = branch && branch !== target ? branch : node;
            const pending = [start];
            let visited = 0;
            while (pending.length && visited++ < 500 && clues.length < 6) {
                const current = pending.pop();
                if (current === target) continue;
                if (current.nodeType === Node.TEXT_NODE) {
                    add(current.nodeValue);
                    continue;
                }
                if (current.nodeType !== Node.ELEMENT_NODE && current.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) continue;
                if (current.nodeType === Node.ELEMENT_NODE &&
                    /^(LABEL|LEGEND|STRONG|SPAN|P|H[1-6])$/.test(current.tagName) &&
                    !current.contains(target)) add(current.textContent);
                const children = Array.from(current.childNodes);
                if (current.shadowRoot) children.unshift(...current.shadowRoot.childNodes);
                for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
            }
            return clues;
        },

        relationshipAnchors: function (node, target, query) {
            const tag = node.tagName.toLowerCase();
            const result = [];
            const add = (xpath, css, score, reason) => {
                if (!result.some(x => x.xpath === xpath)) result.push({ xpath, css, score, reason });
            };
            for (const option of this.relationshipNodeOptions(node).slice(1)) {
                if (option.reason === "@type") continue;
                add(".//" + option.xpath, option.css, option.score, option.reason);
            }
            const identifyingOptions = this.relationshipNodeOptions(node).slice(1)
                .filter(option => option.score >= 67 && option.reason !== "element text");
            if (identifyingOptions.length) {
                for (const clue of this.relationshipTextClues(node, target)) {
                    const literal = this.xpathLiteral(clue);
                    for (const option of identifyingOptions.slice(0, 3)) {
                        // Exact text nodes cover a label beside an input;
                        // an exact descendant covers text split across children.
                        for (const predicate of [".//text()[normalize-space(.)=" + literal + "]",
                            ".//*[normalize-space(.)=" + literal + "]"]) {
                            add(".//" + option.xpath + "[" + predicate + "]", null,
                                option.score + 12, option.reason + " + nearby text: " + clue);
                        }
                    }
                }
            }
            const directText = Array.from(node.childNodes)
                .filter(x => x.nodeType === Node.TEXT_NODE)
                .map(x => x.nodeValue.trim().replace(/\s+/g, " "))
                .find(x => x.length > 0 && x.length <= 70);
            if (directText) add(".//" + tag + "[text()[normalize-space(.)=" +
                this.xpathLiteral(directText) + "]]", null, 82, "parent's direct text");
            const markers = Array.from(node.querySelectorAll("label,legend,h1,h2,h3,h4,span,strong,[data-testid],[data-cy]"))
                .filter(x => !x.contains(target) && !target.contains(x))
                .slice(0, 30);
            let markerCount = 0;
            for (const marker of markers) {
                if (markerCount >= 3) break;
                const mt = marker.tagName.toLowerCase();
                const value = (marker.innerText || marker.textContent || "").trim().replace(/\s+/g, " ");
                if (value && value.length <= 70 && marker.children.length === 0) {
                    add(".//" + tag + "[.//" + mt + "[normalize-space(.)=" + this.xpathLiteral(value) + "]]",
                        null, 84, "sibling " + mt + " text: " + value);
                    markerCount++;
                }
            }
            // A unique container tag is a useful last stable anchor even when
            // that container has no identifying attributes or label.
            const matchingTags = tag === "body" || tag === "html" ? [] : query(".//" + tag);
            if (tag === "body" || (matchingTags.length === 1 && matchingTags[0] === node))
                add(".//" + tag, tag, tag === "body" ? 35 : 58, "unique container tag");
            return result.sort((a, b) => b.score - a.score);
        },

        addDeepParentCandidates: function (element, add, query) {
            const targetOptions = this.relationshipNodeOptions(element).slice(0, 10);
            const checked = new Map();
            const uniqueForTarget = value => {
                if (checked.has(value)) return checked.get(value);
                try {
                    const matches = query(value);
                    const unique = matches.length === 1 && matches[0] === element;
                    checked.set(value, unique);
                    return unique;
                } catch { checked.set(value, false); return false; }
            };
            const tagOf = node => node.tagName.toLowerCase();
            const structuralStep = node => {
                const tag = tagOf(node);
                const parent = this.parentForLocator(node);
                if (!parent) return tag;
                const siblings = Array.from(parent.children).filter(x => x.tagName === node.tagName);
                return siblings.length > 1 ? tag + "[" + (siblings.indexOf(node) + 1) + "]" : tag;
            };
            let route = [element];
            let ancestor = this.parentForLocator(element);
            let depth = 0;
            let fallback = null;
            const collected = [];
            while (ancestor && ancestor.nodeType === Node.ELEMENT_NODE && depth < 18) {
                    depth++;
                    route.unshift(ancestor);
                    const anchors = this.relationshipAnchors(ancestor, element, query).slice(0, 18);
                    const found = [];
                    for (const anchor of anchors) {
                        for (const target of targetOptions) {
                            const xpath = anchor.xpath + "//" + target.xpath;
                            if (uniqueForTarget(xpath)) found.push({ type: "XPATH", value: xpath,
                                score: Math.min(91, (anchor.score + target.score) / 2 + 7 - depth),
                                reason: anchor.reason + " + " + target.reason });
                            if (anchor.css && target.css) {
                                const css = anchor.css + (depth === 1 ? " > " : " ") + target.css;
                                if (uniqueForTarget(css)) found.push({ type: "CSS", value: css,
                                    score: Math.min(90, (anchor.score + target.score) / 2 + 5 - depth),
                                    reason: anchor.reason + " + " + target.reason });
                            }
                        }
                        if (found.length >= 4) break;
                        // If the short descendant expression is still ambiguous,
                        // include the actual intermediate parent/child chain.
                        const chain = anchor.xpath + "/" + route.slice(1).map(tagOf).join("/");
                        if (uniqueForTarget(chain)) found.push({ type: "XPATH", value: chain,
                            score: Math.min(78, anchor.score - depth), reason: anchor.reason + " + direct child chain" });
                        if (found.length >= 4) break;
                        const parts = route.slice(1).map(tagOf);
                        for (let i = parts.length - 2; i >= 0 && found.length < 4; i--) {
                            for (const option of this.relationshipNodeOptions(route[i + 1]).slice(1, 4)) {
                                const refined = parts.slice();
                                refined[i] = option.xpath;
                                const value = anchor.xpath + "/" + refined.join("/");
                                if (uniqueForTarget(value)) found.push({ type: "XPATH", value,
                                    score: Math.min(81, (anchor.score + option.score) / 2 - depth),
                                    reason: anchor.reason + " + intermediate " + option.reason });
                            }
                        }
                        if (!fallback) {
                            const positional = anchor.xpath + "/" + route.slice(1).map(structuralStep).join("/");
                            if (uniqueForTarget(positional)) fallback = { value: positional, depth,
                                reason: anchor.reason + " + sibling positions" };
                        }
                    }
                    if (found.length) {
                        found.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
                        for (const candidate of found.slice(0, 4))
                            collected.push({ ...candidate, depth });
                        const partCandidate = found.find(candidate => candidate.reason.startsWith("@part + nearby text:"));
                        if (partCandidate) {
                            if (!collected.some(candidate => candidate.value === partCandidate.value))
                                collected.push({ ...partCandidate, depth });
                            break;
                        }
                    }
                    ancestor = this.parentForLocator(ancestor);
            }
            collected.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
            const textScoped = collected.filter(candidate => candidate.reason.includes(" + nearby text:"));
            const others = collected.filter(candidate => !candidate.reason.includes(" + nearby text:"));
            const partScoped = textScoped.filter(candidate => candidate.reason.startsWith("@part + nearby text:"));
            const prioritized = [...partScoped.slice(0, 3),
                ...textScoped.filter(candidate => !partScoped.includes(candidate)).slice(0, 9),
                ...others.slice(0, 12)];
            for (const candidate of prioritized)
                add("Deep parent relationship", candidate.type, candidate.value,
                    Math.max(35, candidate.score - 10),
                    "Climbed " + candidate.depth + " parent level(s): " + candidate.reason +
                    ". This complete relationship uniquely matches the selected element.");
            if (!collected.length && fallback) add("Deep parent relationship", "XPATH", fallback.value, 38,
                "Climbed " + fallback.depth + " parent level(s). No stable relationship was unique; sibling positions are the fallback.");
        },

        addContainerCandidates: function (element, add) {
            const tag = element.tagName.toLowerCase();
            const ownText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
            const anchors = [];
            for (let parent = element.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
                if (["body", "html"].includes(parent.tagName.toLowerCase())) break;
                const ptag = parent.tagName.toLowerCase();
                let parentBase = null;
                for (const attr of ["data-testid", "data-test-id", "data-cy", "id", "aria-label", "role"]) {
                    const value = parent.getAttribute(attr);
                    if (value && !this.isProbablyGenerated(value)) {
                        parentBase = ".//" + ptag + "[@" + attr + "=" + this.xpathLiteral(value) + "]";
                        break;
                    }
                }
                if (parentBase) anchors.push({ base: parentBase, score: 88, reason: "Stable container attribute" });
                const label = Array.from(parent.querySelectorAll("label, legend, h1, h2, h3, h4, strong, span, div"))
                    .filter(node => node !== element && !node.contains(element) && !element.contains(node))
                    .map(node => ({ tag: node.tagName.toLowerCase(), text: (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ") }))
                    .find(item => item.text.length > 0 && item.text.length <= 65);
                if (label) anchors.push({ base: ".//" + ptag + "[.//" + label.tag + "[normalize-space(.)=" + this.xpathLiteral(label.text) + "]]", score: 84, reason: "Container text: " + label.text });
                if (parent.children.length < 15) {
                    const directText = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.nodeValue).join(" ").trim().replace(/\s+/g, " ");
                    if (directText && directText.length <= 65)
                        anchors.push({ base: ".//" + ptag + "[contains(normalize-space(.)," + this.xpathLiteral(directText) + ")]", score: 72, reason: "Container's direct text: " + directText });
                }
            }
            const targetParts = [];
            for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label", "type", "placeholder", "role"]) {
                const value = element.getAttribute(attr);
                if (value && !this.isProbablyGenerated(value)) targetParts.push({ part: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]", score: 90 });
            }
            if (ownText && ownText.length <= 65 && element.children.length === 0)
                targetParts.push({ part: tag + "[normalize-space(.)=" + this.xpathLiteral(ownText) + "]", score: 86 });
            targetParts.push({ part: tag, score: 62 });
            for (const anchor of anchors.slice(0, 12)) {
                for (const target of targetParts.slice(0, 6))
                    add("Reusable container", "XPATH", anchor.base + "//" + target.part, Math.min(anchor.score, target.score), anchor.reason + "; scoped to the target within that container.");
            }
            // Associated labels may point to controls by @for instead of nesting them.
            if (["input", "textarea", "select"].includes(tag) && element.id) {
                const label = element.ownerDocument.querySelector('label[for="' + this.cssAttributeEscape(element.id) + '"]');
                if (label) {
                    const labelText = (label.innerText || label.textContent || "").trim().replace(/\s+/g, " ");
                    for (let parent = element.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
                        if (!labelText || parent.tagName.toLowerCase() === "body") break;
                        if (parent.contains(label))
                            add("Reusable field container", "XPATH", ".//" + parent.tagName.toLowerCase() + "[.//label[normalize-space(.)=" + this.xpathLiteral(labelText) + "]]//" + tag, 92, "Finds the field inside the container holding its associated label.");
                    }
                }
            }
        },

        addReusableSectionCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            const targetParts = [];
            const targetText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
            if (targetText && targetText.length <= 90 && !element.children.length)
                targetParts.push({ value: tag + "[normalize-space(.)=" + this.xpathLiteral(targetText) + "]", score: 89,
                    reason: "target text" });
            for (const attr of ["data-testid", "data-test-id", "data-cy", "aria-label", "name", "value", "placeholder", "href", "type"]) {
                const value = element.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    targetParts.push({ value: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                        score: attr === "type" ? 59 : 77, reason: "target @" + attr });
            }
            targetParts.push({ value: tag, score: 45, reason: "target tag" });

            for (let parent = this.parentForLocator(element), depth = 1;
                parent && parent.nodeType === Node.ELEMENT_NODE && depth <= 14;
                parent = this.parentForLocator(parent), depth++) {
                const parentTag = parent.tagName.toLowerCase();
                if (parentTag === "body" || parentTag === "html") break;
                const classes = this.stableClasses(parent);
                const anchors = [];
                for (const cls of classes.slice(0, 2)) {
                    const classPredicate = parent.getAttribute("class") === cls
                        ? "@class=" + this.xpathLiteral(cls)
                        : "contains(concat(' ',normalize-space(@class),' ')," + this.xpathLiteral(" " + cls + " ") + ")";
                    anchors.push({ value: "//" + parentTag + "[" + classPredicate + "]",
                        score: 87 - depth, reason: "container class " + cls });
                }
                for (const attr of ["data-testid", "data-test-id", "data-cy", "aria-label", "role"]) {
                    const value = parent.getAttribute(attr);
                    if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                        anchors.push({ value: "//" + parentTag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                            score: 88 - depth, reason: "container @" + attr });
                }
                if (!anchors.length) continue;

                // A heading on the same branch as the target identifies a
                // product card or named panel, rather than an unrelated panel
                // elsewhere in a broad sidebar or page wrapper.
                const branch = Array.from(parent.children).find(child => child.contains(element));
                const markers = Array.from(parent.querySelectorAll("h1,h2,h3,h4,h5,h6,label,legend,strong,.product-title a,.title a"))
                    .filter(marker => marker !== element && !marker.contains(element) &&
                        !element.contains(marker) && (!branch || branch.contains(marker)))
                    .map(marker => ({ tag: marker.tagName.toLowerCase(),
                        text: (marker.innerText || marker.textContent || "").trim().replace(/\s+/g, " ") }))
                    .filter(marker => marker.text && marker.text.length <= 75)
                    .slice(0, 2);

                for (const anchor of anchors) {
                    const scoped = [anchor];
                    for (const marker of markers)
                        scoped.push({ value: anchor.value + "[.//" + marker.tag +
                            "[normalize-space(.)=" + this.xpathLiteral(marker.text) + "]]",
                            score: anchor.score + 5, reason: anchor.reason + " and nearby " + marker.tag + " text" });
                    for (const container of scoped) {
                        for (const target of targetParts) {
                            const locator = container.value + "//" + target.value;
                            let matches;
                            try { matches = query(locator); } catch { continue; }
                            if (matches.length !== 1 || matches[0] !== element) continue;
                            add("Reusable container", "XPATH", locator,
                                Math.min(91, (container.score + target.score) / 2),
                                "Scopes " + target.reason + " within " + container.reason +
                                "; uniquely identifies the selected element.");
                        }
                    }
                }
            }
        },

        addChildTextCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            const bases = [];
            for (const attr of ["role", "data-testid", "data-test-id", "data-cy", "part", "aria-label"]) {
                const value = element.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    bases.push({ value: "//" + tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                        score: attr === "role" ? 87 : 82, reason: "@" + attr });
            }
            const stableClass = this.stableClasses(element)[0];
            if (stableClass) bases.push({
                value: "//" + tag + "[contains(concat(' ',normalize-space(@class),' ')," +
                    this.xpathLiteral(" " + stableClass + " ") + ")]",
                score: 72, reason: "stable class"
            });
            bases.push({ value: "//" + tag, score: 62, reason: "element tag" });

            const clues = [];
            const note = text => {
                const value = (text || "").trim().replace(/\s+/g, " ");
                if (value.length >= 2 && value.length <= 100 && !clues.includes(value)) clues.push(value);
            };
            const pending = Array.from(element.childNodes).reverse();
            if (element.shadowRoot) pending.push(...Array.from(element.shadowRoot.childNodes).reverse());
            let visited = 0;
            while (pending.length && visited++ < 500 && clues.length < 8) {
                const node = pending.pop();
                if (node.nodeType === Node.TEXT_NODE) { note(node.nodeValue); continue; }
                if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) continue;
                if (node.nodeType === Node.ELEMENT_NODE) note(node.innerText || node.textContent);
                const children = Array.from(node.childNodes);
                if (node.shadowRoot) children.unshift(...node.shadowRoot.childNodes);
                for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
            }

            for (const clue of clues) {
                const literal = this.xpathLiteral(clue);
                for (const base of bases.slice(0, 6)) {
                    // The descendant may be a span, a text node directly in a
                    // child, or an open shadow-root child in the flattened DOM.
                    for (const predicate of [".//*[normalize-space(.)=" + literal + "]",
                        ".//text()[normalize-space(.)=" + literal + "]"]) {
                        const locator = base.value + "[" + predicate + "]";
                        let matches;
                        try { matches = query(locator); } catch { continue; }
                        if (matches.length !== 1 || matches[0] !== element) continue;
                        add("Child element text", "XPATH", locator, base.score,
                            "Uses descendant text '" + clue + "' together with the selected " +
                            base.reason + "; uniquely matches this element.");
                    }
                }
            }
        },

        meaningfulText: function (node) {
            const direct = Array.from(node.childNodes || [])
                .filter(child => child.nodeType === Node.TEXT_NODE)
                .map(child => child.nodeValue).join(" ").trim().replace(/\s+/g, " ");
            const tag = node.tagName.toLowerCase();
            const text = direct || ((node.children.length <= 2 ||
                /^(label|legend|strong|h[1-6]|td|th|a)$/.test(tag))
                ? (node.textContent || "").trim().replace(/\s+/g, " ") : "");
            if (text.length < 3 || text.length > 80 ||
                /^(?:edit|view|save|next|more|submit|cancel)$/i.test(text)) return "";
            return text;
        },

        stableContainerAnchors: function (node) {
            const tag = node.tagName.toLowerCase();
            const anchors = [];
            for (const [attr, score] of [["data-testid", 92], ["data-test-id", 92],
                ["data-cy", 91], ["data-qa", 89], ["part", 87], ["id", 88],
                ["name", 78], ["aria-label", 80], ["role", 69]]) {
                const value = node.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    anchors.push({ value: "//" + tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                        score, reason: "container @" + attr });
            }
            for (const cls of this.stableClasses(node).slice(0, 2)) {
                const predicate = node.getAttribute("class") === cls
                    ? "@class=" + this.xpathLiteral(cls)
                    : "contains(concat(' ',normalize-space(@class),' ')," + this.xpathLiteral(" " + cls + " ") + ")";
                anchors.push({ value: "//" + tag + "[" + predicate + "]", score: 85,
                    reason: "container class " + cls });
            }
            if (!anchors.length) anchors.push({ value: "//" + tag, score: 60, reason: "container tag" });
            return anchors.slice(0, 4);
        },

        targetParts: function (element) {
            const tag = element.tagName.toLowerCase();
            const parts = [];
            const text = this.meaningfulText(element);
            if (text) parts.push({ value: tag + "[normalize-space(.)=" + this.xpathLiteral(text) + "]", score: 88 });
            for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label", "value", "type"]) {
                const value = element.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    parts.push({ value: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                        score: attr === "type" ? 62 : 83 });
            }
            parts.push({ value: tag, score: 58 });
            return [...parts.slice(0, 4), parts[parts.length - 1]];
        },

        textDistance: function (marker, target, container) {
            const path = new Map();
            let distance = 0;
            for (let node = marker; node; node = node.parentElement) {
                path.set(node, distance++);
                if (node === container) break;
            }
            distance = 0;
            for (let node = target; node; node = node.parentElement) {
                if (path.has(node)) return distance + path.get(node);
                if (node === container) break;
                distance++;
            }
            return 100;
        },

        nearestTextMarkers: function (container, target, tags, limit = 2) {
            return Array.from(container.querySelectorAll(tags)).slice(0, 1000)
                .filter(node => node !== target && !node.contains(target) && !target.contains(node))
                .map(node => ({ node, text: this.meaningfulText(node),
                    distance: this.textDistance(node, target, container) }))
                .filter(item => item.text && item.distance <= 12)
                .sort((a, b) => a.distance - b.distance || a.text.length - b.text.length)
                .slice(0, limit);
        },

        addCompositeCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            let produced = 0;
            const attrs = ["data-testid", "data-test-id", "data-cy", "name", "aria-label",
                "role", "autocomplete", "placeholder", "type", "part", "value"]
                .map(name => ({ name, value: element.getAttribute(name) }))
                .filter(item => item.value && item.value.length <= 100 && !this.isProbablyGenerated(item.value))
                .slice(0, 8);
            for (let i = 0; i < attrs.length; i++) {
                for (let j = i + 1; j < attrs.length; j++) {
                    if (produced >= 12) return;
                    const a = attrs[i], b = attrs[j];
                    const css = tag + "[" + a.name + '="' + this.cssAttributeEscape(a.value) + '"]' +
                        "[" + b.name + '="' + this.cssAttributeEscape(b.value) + '"]';
                    const xpath = "//" + tag + "[@" + a.name + "=" + this.xpathLiteral(a.value) +
                        " and @" + b.name + "=" + this.xpathLiteral(b.value) + "]";
                    for (const [type, locator] of [["CSS", css], ["XPATH", xpath]]) {
                        try {
                            const matches = query(locator);
                            if (matches.length === 1 && matches[0] === element) {
                                add("Combined attributes", type, locator, 85,
                                    "Combines @" + a.name + " and @" + b.name + " on the selected element.");
                                produced++;
                            }
                        } catch {}
                    }
                }
            }
        },

        addAssociatedLabelCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            if (!["input", "textarea", "select"].includes(tag)) return;
            const doc = element.ownerDocument;
            if (element.id) {
                for (const label of Array.from(doc.querySelectorAll("label[for]")).filter(node =>
                    node.getAttribute("for") === element.id)) {
                    const text = (label.textContent || "").trim().replace(/\s+/g, " ");
                    if (!text || text.length > 80) continue;
                    const xpath = "//" + tag + "[@id=//label[normalize-space(.)=" +
                        this.xpathLiteral(text) + "]/@for]";
                    try {
                        if (query(xpath).length === 1 && query(xpath)[0] === element)
                            add("Associated label", "XPATH", xpath, 95,
                                "Follows the label's @for reference to the selected field.");
                    } catch {}
                }
            }
            const ids = (element.getAttribute("aria-labelledby") || "").trim().split(/\s+/).filter(Boolean);
            for (const id of ids.slice(0, 4)) {
                for (const reference of Array.from(doc.querySelectorAll("[id]")).filter(node => node.id === id)) {
                    const text = this.meaningfulText(reference);
                    if (!text) continue;
                    const ref = "//" + reference.tagName.toLowerCase() +
                        "[normalize-space(.)=" + this.xpathLiteral(text) + "]/@id";
                    const predicate = ids.length === 1 ? "@aria-labelledby=" + ref :
                        "contains(concat(' ',normalize-space(@aria-labelledby),' '),concat(' '," + ref + ",' '))";
                    const xpath = "//" + tag + "[" + predicate + "]";
                    try {
                        if (query(xpath).length === 1 && query(xpath)[0] === element)
                            add("Associated label", "XPATH", xpath, 92,
                                "Uses the text referenced by @aria-labelledby.");
                    } catch {}
                }
            }
        },

        addNearestContainerCandidates: function (element, add, query) {
            const parts = this.targetParts(element);
            let produced = 0;
            for (let parent = element.parentElement, depth = 1; parent && depth <= 10;
                parent = parent.parentElement, depth++) {
                if (produced >= 20) break;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                let parentResults = 0;
                const markers = this.nearestTextMarkers(parent, element,
                    "div,label,legend,h1,h2,h3,h4,h5,h6,span,strong,p,td,th", 2);
                for (const marker of markers) {
                    const mt = marker.node.tagName.toLowerCase();
                    const condition = "[.//" + mt + "[normalize-space(.)=" + this.xpathLiteral(marker.text) + "]]";
                    for (const anchor of this.stableContainerAnchors(parent)) {
                        for (const part of parts) {
                            if (parentResults >= 4) break;
                            const xpath = anchor.value + condition + "//" + part.value;
                            try {
                                const matches = query(xpath);
                                if (matches.length === 1 && matches[0] === element) {
                                    add("Nearest text container", "XPATH", xpath,
                                        Math.min(96, (anchor.score + part.score) / 2 + 7 - depth - marker.distance),
                                        "Uses nearby '" + marker.text + "' inside the smallest matching " +
                                        parent.tagName.toLowerCase() + " container.");
                                    produced++;
                                    parentResults++;
                                }
                            } catch {}
                        }
                    }
                }
            }
        },

        addSiblingTextCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            for (let wrapper = element, depth = 0; wrapper && depth < 5;
                wrapper = wrapper.parentElement, depth++) {
                const preceding = wrapper.previousElementSibling;
                if (!preceding) continue;
                const marker = this.meaningfulText(preceding) ? preceding :
                    Array.from(preceding.querySelectorAll("div,label,span,strong,h1,h2,h3,h4"))
                        .find(node => this.meaningfulText(node));
                if (!marker) continue;
                const text = this.meaningfulText(marker);
                if (!text) continue;
                const markerTag = marker.tagName.toLowerCase();
                const wrapperTag = wrapper.tagName.toLowerCase();
                const precedingTag = preceding.tagName.toLowerCase();
                const anchor = marker === preceding
                    ? "//" + precedingTag + "[normalize-space(.)=" + this.xpathLiteral(text) + "]"
                    : "//" + precedingTag + "[.//" + markerTag +
                        "[normalize-space(.)=" + this.xpathLiteral(text) + "]]";
                const xpath = anchor + "/following-sibling::" + wrapperTag + "[1]" +
                    (wrapper === element ? "" : "//" + tag);
                try {
                    if (query(xpath).length === 1 && query(xpath)[0] === element)
                        add("Sibling text", "XPATH", xpath, 82 - depth * 3,
                            "The field wrapper directly follows the text '" + text + "'.");
                } catch {}
            }
        },

        addRepeatedItemCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            let produced = 0;
            for (let parent = element.parentElement, depth = 1; parent && depth <= 8;
                parent = parent.parentElement, depth++) {
                if (produced >= 12) break;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                const parentTag = parent.tagName.toLowerCase();
                if (!["tr", "li", "article", "section"].includes(parentTag) &&
                    !/(?:item|card|row|tile|product|record|entry)/i.test(parent.getAttribute("class") || "")) continue;
                for (const marker of this.nearestTextMarkers(parent, element,
                    "td,th,h1,h2,h3,h4,h5,h6,a,strong", 2)) {
                    const markerTag = marker.node.tagName.toLowerCase();
                    const anchors = this.stableContainerAnchors(parent);
                    for (const anchor of anchors) {
                        for (const part of this.targetParts(element).slice(0, 3)) {
                            if (produced >= 12) break;
                            const xpath = anchor.value + "[.//" + markerTag +
                                "[normalize-space(.)=" + this.xpathLiteral(marker.text) + "]]//" + part.value;
                            try {
                                if (query(xpath).length === 1 && query(xpath)[0] === element) {
                                    add("Repeated item", "XPATH", xpath,
                                        Math.min(94, (anchor.score + part.score) / 2 + 6 - depth),
                                        "Identifies the " + parentTag + " by '" + marker.text +
                                        "', then locates its control.");
                                    produced++;
                                }
                            } catch {}
                        }
                    }
                }
            }
        },

        addRelationalCssCandidates: function (element, add, query) {
            const tag = element.tagName.toLowerCase();
            let produced = 0;
            const targetName = element.getAttribute("name");
            const targetCss = tag + (targetName && !this.isProbablyGenerated(targetName)
                ? '[name="' + this.cssAttributeEscape(targetName) + '"]' : "");
            for (let parent = element.parentElement, depth = 1; parent && depth <= 5;
                parent = parent.parentElement, depth++) {
                if (produced >= 8) break;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                const cls = this.stableClasses(parent)[0];
                const id = parent.getAttribute("data-testid");
                const base = id ? parent.tagName.toLowerCase() + '[data-testid="' +
                    this.cssAttributeEscape(id) + '"]' : cls ? parent.tagName.toLowerCase() + "." + CSS.escape(cls) : null;
                if (!base) continue;
                const markers = Array.from(parent.querySelectorAll("label[for],[data-testid],[data-cy]"))
                    .filter(node => node !== element && !node.contains(element) && !element.contains(node)).slice(0, 12);
                for (const marker of markers) {
                    const attr = ["for", "data-testid", "data-cy"].find(name => marker.getAttribute(name));
                    if (!attr) continue;
                    const css = base + ":has(" + marker.tagName.toLowerCase() + "[" + attr + '="' +
                        this.cssAttributeEscape(marker.getAttribute(attr)) + '"]) ' + targetCss;
                    try {
                        if (query(css).length === 1 && query(css)[0] === element) {
                            add("CSS container relationship", "CSS", css, 78 - depth,
                                "Scopes the target to a container holding a related " + marker.tagName.toLowerCase() + ".");
                            produced++;
                        }
                    } catch {} // Browsers without :has() support simply omit this candidate.
                }
            }
        },

        buildDetailedCandidates: function (element, candidates, snapshot) {
            const out = [];
            const query = value => this.matchingClones(value, snapshot);
            const original = snapshot.map.get(element);
            const visible = this.isVisible(original);
            const clickable = this.isClickable(original);
            const add = (category, type, value, base, rationale) => {
                if (!value || out.some(x => x.value === value && x.type === type)) return;
                let matches;
                try { matches = query(value); } catch { return; }
                if (!matches.includes(element)) return;
                const unique = matches.length === 1;
                out.push({ category, type, value, score: this.candidateScore(value, base, unique),
                    unique, visible, clickable, rationale });
            };
            candidates.forEach(c => out.push({ category: "Direct attributes / text / structure", type: c.type,
                value: c.value, score: c.score, unique: c.unique, visible, clickable,
                rationale: "Generated from the element's own attributes, text, or DOM structure." }));

            const tag = element.tagName.toLowerCase();
            const attrs = ["id", "name", "type", "placeholder", "aria-label", "title", "role", "data-testid", "data-test-id", "data-cy", "value", "autocomplete"];
            for (const attr of attrs) {
                const value = element.getAttribute(attr);
                if (!value || (attr === "id" && this.isProbablyGenerated(value))) continue;
                const lit = this.xpathLiteral(value);
                add("Element attribute", "XPATH", "//" + tag + "[@" + attr + "=" + lit + "]", attr.startsWith("data-") ? 88 : attr === "id" ? 90 : 76, "Uses the element's @" + attr + " attribute.");
            }

            const ownText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
            if (ownText && ownText.length <= 100 && !element.children.length) {
                add("Element text", "XPATH", "//" + tag + "[normalize-space(.)=" + this.xpathLiteral(ownText) + "]", 68, "Matches the element's own visible text.");
            }

            for (const child of Array.from(element.querySelectorAll("*"))) {
                const childText = (child.innerText || child.textContent || "").trim().replace(/\s+/g, " ");
                if (childText && childText.length <= 60) {
                    const childTag = child.tagName.toLowerCase();
                    const xpath = "//" + tag + "[.//" + childTag + "[normalize-space(.)=" + this.xpathLiteral(childText) + "]]";
                    add("Child element text", "XPATH", xpath, 64, "Identifies the target tag using descendant <" + childTag + "> text: " + childText);
                }
                for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label", "title", "id"]) {
                    const val = child.getAttribute(attr);
                    if (!val || (attr === "id" && this.isProbablyGenerated(val))) continue;
                    const xpath = "//" + tag + "[.//" + child.tagName.toLowerCase() + "[@" + attr + "=" + this.xpathLiteral(val) + "]]";
                    add("Child element attribute", "XPATH", xpath, attr.startsWith("data-") ? 74 : 60, "Uses descendant <" + child.tagName.toLowerCase() + "> @" + attr + "=" + val + " as a distinguishing clue.");
                }
            }
            this.addChildTextCandidates(element, add, query);

            const parent = element.parentElement;
            if (parent && parent.tagName.toLowerCase() !== "body" && parent.tagName.toLowerCase() !== "html") {
                const ptag = parent.tagName.toLowerCase();
                for (const attr of ["id", "data-testid", "data-test-id", "data-cy", "name", "aria-label", "role"]) {
                    const val = parent.getAttribute(attr);
                    if (!val || (attr === "id" && this.isProbablyGenerated(val))) continue;
                    const xp = "//" + ptag + "[@" + attr + "=" + this.xpathLiteral(val) + "]//" + tag;
                    add("Relative to parent", "XPATH", xp, 82, "Scopes the target tag beneath a parent identified by @" + attr + ".");
                }
            }

            if (tag === "input" || tag === "textarea" || tag === "select") {
                let label = null;
                if (element.id) {
                    try { label = element.ownerDocument.querySelector('label[for="' + this.cssAttributeEscape(element.id) + '"]'); } catch {}
                }
                if (!label) label = element.closest("label");
                if (label) {
                    const labelText = (label.innerText || label.textContent || "").trim().replace(/\s+/g, " ");
                    if (labelText) {
                        const xp = "//label[normalize-space(.)=" + this.xpathLiteral(labelText) + "]//" + tag;
                        add("Reusable label-based locator", "XPATH", xp, 94, "Uses associated label text '" + labelText + "' to locate the form control; suitable for reusable page-object methods when label text is stable.");
                    }
                }
                const placeholder = element.getAttribute("placeholder");
                if (placeholder) add("Reusable form locator", "XPATH", "//" + tag + "[@placeholder=" + this.xpathLiteral(placeholder) + "]", 78, "Uses placeholder; useful when stable, but may change with UX copy or localization.");
            }

            this.addCompositeCandidates(element, add, query);
            this.addAssociatedLabelCandidates(element, add, query);
            this.addNearestContainerCandidates(element, add, query);
            this.addSiblingTextCandidates(element, add, query);
            this.addRepeatedItemCandidates(element, add, query);
            this.addRelationalCssCandidates(element, add, query);
            this.addContainerCandidates(element, add);
            this.addReusableSectionCandidates(element, add, query);
            this.addDeepParentCandidates(element, add, query);
            return out.sort((a,b) => b.score-a.score || Number(b.unique)-Number(a.unique));
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
            let positionalFallback = null;

            while (
                current &&
                current.nodeType === Node.ELEMENT_NODE &&
                current !== (this._analysisSnapshot?.flattenedDoc.body || document.body)
            ) {
                let selector = current.tagName.toLowerCase();

                if (current.id && !this.isProbablyGenerated(current.id)) {
                    selector += "#" + CSS.escape(current.id);
                }

                const stableClasses = this.stableClasses(current);

                if (stableClasses.length) {
                    selector += stableClasses
                        .slice(0, 2)
                        .map(c => "." + CSS.escape(c))
                        .join("");
                }

                const withoutPosition = [selector, ...parts].join(" > ");
                try {
                    const matches = this.matchingClones(withoutPosition);
                    if (matches.length === 1 && matches[0] === element) return withoutPosition;
                } catch {}

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
                const withPosition = parts.join(" > ");
                try {
                    const matches = this.matchingClones(withPosition);
                    if (!positionalFallback && matches.length === 1 && matches[0] === element)
                        positionalFallback = withPosition;
                } catch {}
                current = parent;
            }

            return positionalFallback || parts.join(" > ");
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

            const text = (element.textContent || "").trim().replace(/\s+/g, " ");

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
            let positionalFallback = null;

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

                // Prefer a short path under a real identifying ancestor.
                if (current !== element && this._analysisSnapshot.map.has(current)) {
                    for (const anchor of this.stableContainerAnchors(current)) {
                        if (anchor.reason === "container tag") continue;
                        const scoped = anchor.value + "/" + parts.slice(1).join("/");
                        try {
                            const matches = this.matchingClones(scoped);
                            if (matches.length === 1 && matches[0] === element) return scoped;
                        } catch {}
                    }
                }
                const suffix = "//" + parts.join("/");
                try {
                    const matches = this.matchingClones(suffix);
                    if (!positionalFallback && matches.length === 1 && matches[0] === element)
                        positionalFallback = suffix;
                } catch {}

                current = current.parentElement;
            }

            return positionalFallback || "/" + parts.join("/");
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

                    return !this.isProbablyGenerated(c) &&
                        !/^css-[a-z0-9]+$/i.test(c) &&
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
                /^(?:react-aria-|radix-|headlessui-|mui-)/i.test(value) ||
                /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ||
                /^css-[a-z0-9]+$/i.test(value) ||
                /^[a-f0-9]{12,}$/i.test(value) ||
                /_\d{4,}$/.test(value)
            );
        },

        cssAttributeEscape: function (value) {
            return String(value)
                .replace(/[\u0000-\u001f\u007f"\\]/g, character => {
                    if (character === "\\") return "\\\\";
                    if (character === '"') return '\\"';
                    return "\\" + character.codePointAt(0).toString(16) + " ";
                });
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
                return this.matchingClones(selector, this._analysisSnapshot || this.flattenMultiFrameDOM()).length;
            } catch {
                return 0;
            }
        },

        xpathCount: function (xpath) {
            try {
                return this.matchingClones(xpath, this._analysisSnapshot || this.flattenMultiFrameDOM()).length;
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

            const best = candidates.slice().sort((a, b) => b.score - a.score)[0] || null;
            const indexy = best && (best.value.includes(":nth-of-type(") ||
                /\/\w+\[\d+\]/.test(best.value));

            if (indexy) {
                warnings.push("A candidate depends on a DOM position/index.");
            }

            if (element.closest && element.closest("[role]")) {
                positive.push("Semantic role information is available.");
            }

            let rating = "Medium";

            if (best && best.unique && best.score >= 90 && !indexy) {
                rating = "High";
            } else if (!best || !best.unique || best.score < 55 || warnings.length >= 2) {
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
