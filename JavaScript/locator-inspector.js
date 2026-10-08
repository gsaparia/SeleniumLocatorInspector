(function () {
    const previous = window.__seleniumLocatorInspector;
    if (previous?.version === 36) return;
    // A hooked browser may still have an older inspector installed. Remove
    // its listeners/highlights before replacing it with the new analyser.
    if (previous) {
        previous.stop?.();
        previous.stopRectangleSelection?.();
        previous.clearLocatorHighlights?.();
    }

    window.__seleniumLocatorInspector = {
        version: 36,
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
        selectionGeneration: 0,
        selectionStatus: {phase:'idle',completed:0,total:0,error:''},

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

            this.selectionStatus={phase:'picking',completed:0,total:0,error:''};
            this.active = true;

            this.moveHandler = this.onMouseMove.bind(this);
            this.clickHandler = this.onClick.bind(this);

            document.addEventListener("mousemove", this.moveHandler, true);
            document.addEventListener("click", this.clickHandler, true);
        },

        stop: function () {
            ++this.selectionGeneration;
            this.selectionStatus={phase:'idle',completed:0,total:0,error:''};
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

            this.selectionStatus={phase:'rectangle',completed:0,total:0,error:''};
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
            ++this.selectionGeneration;
            this.selectionStatus={phase:'idle',completed:0,total:0,error:''};
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

            // Let the browser process queued WebDriver reads/paint between analyses.
            this.analyseSelection(this.findElementsInRectangle(box),true);
        },

        analyseSelection: async function (elements, rectangle) {
            const generation=++this.selectionGeneration;
            this.selectionElements=elements;
            this.result=null;window.__seleniumLocatorResult=null;
            this.selectionStatus={phase:'analysing',completed:0,total:elements.length,error:''};
            const yieldBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
            const results=[],errors=[];
            try {
                await yieldBrowser();
                if(generation!==this.selectionGeneration)return;
                const snapshot=elements.length?this.flattenMultiFrameDOM():null;
                for(let index=0;index<elements.length;index++) {
                    await yieldBrowser();
                    if(generation!==this.selectionGeneration)return;
                    try {
                        const steps=this.generateLocatorsSteps(elements[index],index,snapshot);
                        let step, deadline=performance.now()+8;
                        try {
                            do {
                                if(generation!==this.selectionGeneration)return;
                                step=steps.next();
                                if(!step.done && performance.now()>=deadline) {
                                    await yieldBrowser();deadline=performance.now()+8;
                                }
                            } while(!step.done);
                            results.push(step.value);
                        } finally {steps.return();}
                    }
                    catch(error) {errors.push('Element '+(index+1)+': '+(error.message||String(error)));if(!rectangle)throw error;}
                    this.selectionStatus.completed=index+1;
                }
                if(generation!==this.selectionGeneration)return;
                if(errors.length&&!results.length)throw new Error(errors[0]);
                this.result=rectangle?Object.assign({},results[0]||{tagName:'',text:'No elements',candidates:[],selectionIndex:-1},
                    {isRectangleSelection:true,rectangleResults:results}):results[0];
                window.__seleniumLocatorResult=this.result;
                this.selectionStatus={phase:'ready',completed:elements.length,total:elements.length,error:errors.length?errors.length+' element(s) could not be analysed. '+errors.slice(0,3).join('; '):''};
            } catch(error) {
                if(generation===this.selectionGeneration)this.selectionStatus={phase:'failed',completed:results.length,total:elements.length,error:error.message||String(error)};
            }
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
                    result.push({element,rect,enclosed:rect.left>=box.left && rect.right<=box.right &&
                        rect.top>=box.top && rect.bottom<=box.bottom});
                }
            }

            const enclosingPartialAncestors = new Set();
            for (const entry of result) {
                for(let parent=entry.element.parentElement || entry.element.getRootNode().host;
                    parent;parent=parent.parentElement || parent.getRootNode().host)
                    enclosingPartialAncestors.add(parent);
            }
            // A small cell rectangle must not select the entire table, example,
            // main panel and page. Keep enclosed elements, plus partially enclosed
            // leaf targets at the edges. Fully enclosed containers stay inspectable.
            return result.filter(entry=>entry.enclosed || (!enclosingPartialAncestors.has(entry.element) &&
                    (Math.min(entry.rect.right,box.right)-Math.max(entry.rect.left,box.left))*
                    (Math.min(entry.rect.bottom,box.bottom)-Math.max(entry.rect.top,box.top)) >=
                    Math.min(entry.rect.width*entry.rect.height,box.width*box.height)*0.1))
                .sort((a,b)=>(a.rect.top-b.rect.top)||(a.rect.left-b.rect.left))
                .map(entry=>entry.element);
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

            this.stop();
            this.analyseSelection([element],false);
        },

        /*
         * Walk through open shadow roots under the mouse.
         * elementFromPoint() on a document can return the shadow host;
         * calling elementFromPoint() against the open shadow root lets us
         * continue into the shadow tree.
         */
        deepElementFromPoint: function (x, y, root = document) {
            let element;
            try {element=root.elementFromPoint(x,y);} catch {return null;}
            const visited = new Set();
            while(element && element.shadowRoot && !visited.has(element)) {
                visited.add(element);
                let inside;
                try {inside=element.shadowRoot.elementFromPoint?.(x,y);} catch {break;}
                // A shadow hit test can return null or the host itself. Neither
                // advances the traversal. Never spin on the unchanged host.
                if(!inside || inside===element || visited.has(inside))break;
                element=inside;
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

        drainAnalysisSteps: function (steps) {
            let step;
            do {step=steps.next();} while(!step.done);
            return step.value;
        },

        generateLocators: function (element, selectionIndex, snapshot = this.flattenMultiFrameDOM()) {
            return this.drainAnalysisSteps(this.generateLocatorsSteps(element, selectionIndex, snapshot));
        },

        generateLocatorsSteps: function* (element, selectionIndex, snapshot = this.flattenMultiFrameDOM()) {
            yield;
            const selectedClone = snapshot.findClone(element);
            if (!selectedClone)
                throw new Error("The selected element is no longer present in the accessible flattened DOM.");

            this._analysisSnapshot = snapshot;
            this._analysisQueryCache = new Map();
            this._analysisVisibilityCache = new WeakMap();
            this._analysisClickabilityCache = new WeakMap();
            try {
                const fallbackCss = this.bestCss(selectedClone);
                const fallbackXPath = this.bestXPath(selectedClone);
                const shadowPath = this.getShadowPath(element);
                const framePath = this.getFramePath(element);

                const initial = this.buildCandidates(selectedClone);
                const detailedCandidates = yield* this.rankCandidatesSteps((yield* this.buildDetailedCandidatesSteps(selectedClone, initial, snapshot)), selectedClone, snapshot);
                const candidates = detailedCandidates;
                const best = candidates.find(c => c.unique);
                const css = candidates.find(c => c.unique && c.type === "CSS")?.value || fallbackCss;
                const xpath = candidates.find(c => c.unique && c.type === "XPATH")?.value || fallbackXPath;
                const status = best ? this.locatorStatus(best.value, element, snapshot) :
                    { visible: false, clickable: false };
                const stability = this.analyzeStability(selectedClone, detailedCandidates);

                return {
                    tagName: selectedClone.tagName.toLowerCase(),
                    text: (selectedClone.textContent || "")
                        .trim().replace(/\s+/g, " ").substring(0, 500),
                    css, xpath,
                    cssUnique: this.cssCount(css) === 1,
                    xpathUnique: this.xpathCount(xpath) === 1,
                    insideShadowDom: !!element.getRootNode().host,
                    insideIframe: framePath.length > 0,
                    shadowPath, framePath, candidates,
                    visible: status.visible,
                    clickable: status.clickable,
                    detailedCandidates,
                    stability,
                    seleniumCode: this.generateRecommendedCode(best, framePath),
                    selectionIndex: Number.isInteger(selectionIndex) ? selectionIndex : -1
                };
            } finally {
                if(this._analysisSnapshot===snapshot) {
                    this._analysisSnapshot = null;
                    this._analysisQueryCache = null;
                    this._analysisVisibilityCache = null;
                    this._analysisClickabilityCache = null;
                }
            }
        },

        matchingClones: function (value, snapshot = this._analysisSnapshot) {
            const cache = snapshot === this._analysisSnapshot ? this._analysisQueryCache : null;
            if (cache && cache.has(value)) return cache.get(value);
            const matches = snapshot.findAllClones(value);
            if (cache) cache.set(value, matches);
            return matches;
        },

        sameOriginalRoot: function (a, b) {
            const map = this._analysisSnapshot?.map;
            const first = map?.get(a), second = map?.get(b);
            return !!(first && second && first.getRootNode() === second.getRootNode());
        },

        textIdentity: function (node, target) {
            const text = this.meaningfulText(node);
            if (!text || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(node.tagName)) return null;
            if (node.closest('[aria-hidden="true"],[hidden],[role="alert"],[role="status"]')) return null;
            const classes = node.getAttribute("class") || "";
            if (/(?:price|amount|counter|timestamp)/i.test(classes) ||
                /(?:^|[ _-])(?:validation|error-message|toast)(?:[ _-]|$)/i.test(classes) ||
                /^(?:[$£€]\s*[\d,.]+|[\d,.]+\s*(?:%|USD|AUD|EUR)|\d+[/-]\d+[/-]\d+|\d+:\d+(?::\d+)?)$/i.test(text)) return null;
            const original = this._analysisSnapshot?.map.get(node);
            const selected = this._analysisSnapshot?.map.get(target);
            if (original && !this.analysisVisible(original)) return null;
            const sameRoot = original && selected && original.getRootNode() === selected.getRootNode();
            if (sameRoot && node.tagName === "LABEL" && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) &&
                ((original.control && original.control !== selected) ||
                    (target.id && node.getAttribute("for") && node.getAttribute("for") !== target.id))) return null;
            const associated = sameRoot && node.tagName === "LABEL" &&
                ((target.id && node.getAttribute("for") === target.id) || node.contains(target));
            const ids = (target.getAttribute("aria-labelledby") || "").split(/\s+/);
            const referenced = sameRoot && node.id && ids.includes(node.id);
            let score = associated || referenced ? 98 : /^(LABEL|LEGEND)$/.test(node.tagName) ? 88 :
                /^H[1-6]$/.test(node.tagName) ? 86 : /^(TH|TD)$/.test(node.tagName) ? 78 : 68;
            if (/^\d[\d,.\s]*$/.test(text)) score -= 35;
            if (/\b(?:required|invalid|please enter|must be|characters remaining)\b/i.test(text)) score -= 35;
            return { node, text, score, associated: !!(associated || referenced) };
        },

        addMeaningfulRelationships: function (element, add, query) {
            return this.drainAnalysisSteps(this.addMeaningfulRelationshipsSteps(element, add, query));
        },

        addMeaningfulRelationshipsSteps: function* (element, add, query) {
            yield;
            const parts = this.targetParts(element);
            const local = [];
            let generated = 0;
            for (let parent = element.parentElement, depth = 1; parent && depth <= 14;
                parent = parent.parentElement, depth++) {
                yield;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                const markers = Array.from(parent.querySelectorAll("label,legend,h1,h2,h3,h4,h5,h6,div,span,strong,td,th,p"))
                    .filter(n => n !== element && !n.contains(element) && !element.contains(n))
                    .slice(0, 1000).map(n => this.textIdentity(n, element)).filter(Boolean)
                    .map(m => ({ ...m, distance: this.textDistance(m.node, element, parent) }))
                    .filter(m => m.distance <= 14)
                    .sort((a,b) => b.score - a.score || a.distance - b.distance).slice(0, 8);
                const anchors = this.stableContainerAnchors(parent);
                // Always compare a plain semantic container: an incidental ID or
                // class must not prevent a shorter label-based relationship.
                anchors.push({ value: "//" + parent.tagName.toLowerCase(), score: 65, reason: "container tag" });
                for (const marker of markers) {
                yield;
                    const condition = "[.//" + marker.node.tagName.toLowerCase() + "[" + this.normalizedTextPredicate(marker.text, marker.node) + "]]";
                    for (const anchor of anchors) {
                yield;
                        const container = anchor.value + condition;
                        const containers = query(container);
                        if (!containers.includes(parent)) continue;
                        for (const part of parts) {
                yield;
                            if (generated >= 100) break;
                            const value = container + "//" + part.value;
                            const matches = query(value);
                            if (!matches.includes(element)) continue;
                            const ownControls = matches.filter(n => parent.contains(n)).length;
                            const base = Math.min(94, 68 + marker.score / 5 +
                                (marker.associated ? 8 : 0) + (containers.length === 1 ? 5 : -8) -
                                Math.max(0, depth - 2) - Math.max(0, ownControls - 1) * 8);
                            const evidence = { containerCount: containers.length, container, marker: marker.text,
                                association: marker.associated, markerScore: marker.score, depth, controls: ownControls };
                            if (matches.length === 1) {
                                add("Meaningful container", "XPATH", value, base,
                                    "Identifies '" + marker.text + "' in a " + parent.tagName.toLowerCase() +
                                    " container, then its " + element.tagName.toLowerCase() + ". " +
                                    (marker.associated ? "The marker explicitly labels the control. " : "The marker and target share this container. ") +
                                    "Container matches: " + containers.length + "; matching controls in this container: " + ownControls + ".",
                                    evidence);
                                generated++;
                            } else if (depth <= 6 && ownControls === 1 && marker.score >= 78 && local.length < 25) {
                                local.push({ value, parent, marker, base, evidence });
                            }
                        }
                    }
                }
                // Disambiguate repeated local fields using a named outer section.
                for (const field of local.filter(f => f.parent !== parent && parent.contains(f.parent))) {
                yield;
                    for (const marker of markers.filter(m => /^H[1-6]$|^(LEGEND|LABEL)$/.test(m.node.tagName) && m.text !== field.marker.text)) {
                yield;
                        for (const anchor of anchors.slice(0, 3)) {
                yield;
                            if (generated >= 140) break;
                            const outer = anchor.value + "[.//" + marker.node.tagName.toLowerCase() + "[" + this.normalizedTextPredicate(marker.text, marker.node) + "]]";
                            const value = outer + field.value;
                            const matches = query(value);
                            if (matches.length !== 1 || matches[0] !== element) continue;
                            add("Section and field relationship", "XPATH", value, Math.min(96, field.base + 8),
                                "Identifies section '" + marker.text + "', then field '" + field.marker.text +
                                "', then the selected control. Adds section context because the field alone is repeated.",
                                { ...field.evidence, containerCount: query(outer + field.evidence.container).length,
                                    section: marker.text });
                            generated++;
                        }
                    }
                }
            }
        },

        normalizedTextPredicate: function (text, node) {
            const raw = node?.textContent ?? text;
            // XPath 1.0 normalizes XML whitespace only. Preserve NBSP in the
            // literal instead of introducing a translate() workaround.
            const normalized = raw.replace(/[ \t\r\n]+/g," ").replace(/^ +| +$/g,"");
            return (raw === normalized ? "." : "normalize-space(.)") + "=" + this.xpathLiteral(normalized);
        },

        candidateExecution: function (candidate, original) {
            if (original.getRootNode().host) return "Flattened resolver";
            try {
                const doc = original.ownerDocument;
                let found;
                if (candidate.type === "CSS") found = Array.from(doc.querySelectorAll(candidate.value));
                else {
                    found = [];
                    const it = doc.evaluate(candidate.value, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                    let node; while ((node = it.iterateNext())) found.push(node);
                }
                if (found.length === 1 && found[0] === original)
                    return doc === document ? "WebDriver" : "Frame-scoped WebDriver";
            } catch {}
            return "Flattened resolver";
        },

        analysisVisible: function (element) {
            if(!element)return false;
            const cache=this._analysisVisibilityCache;
            if(cache?.has(element))return cache.get(element);
            const value=this.isVisible(element);
            cache?.set(element,value);
            return value;
        },

        analysisClickable: function (element) {
            if(!element)return false;
            const cache=this._analysisClickabilityCache;
            if(cache?.has(element))return cache.get(element);
            const value=this.isClickable(element);
            cache?.set(element,value);
            return value;
        },

        evaluateCandidate: function (candidate, element, snapshot) {
            return this.drainAnalysisSteps(this.evaluateCandidateSteps(candidate,element,snapshot));
        },

        evaluateCandidateSteps: function* (candidate, element, snapshot) {
            const matches = this.matchingClones(candidate.value, snapshot);
            candidate.matches = matches.length;
            candidate.selectedTargetMatched = matches.includes(element);
            candidate.unique = candidate.selectedTargetMatched && matches.length === 1;
            let visible=0,clickable=0;
            for(const clone of matches) {
                yield;
                const original=snapshot.map.get(clone);
                if(this.analysisVisible(original))visible++;
                if(this.analysisClickable(original))clickable++;
            }
            candidate.visible = visible>0;
            candidate.clickable = clickable>0;
            candidate.visibleMatches = visible;
            candidate.clickableMatches = clickable;
            const risks = [];
            const value = candidate.value;
            let identity = /data-(?:testid|test-id|cy|qa)/.test(value) ? 38 :
                /(?:@id=|#[\w-]+)/.test(value) ? 35 :
                /Associated label/.test(candidate.category) ? 36 :
                candidate.association ? 36 : /@name=|\[name=/.test(value) ? 30 :
                /normalize-space\(\s*\.\s*\)|\.\s*=|text\(\)\s*=|@aria-label|aria-labelledby/.test(value) ? 29 : 18;
            if (candidate.repeater) identity = Math.max(identity, 34);
            let stability = 25;
            const ownText = this.meaningfulText(element);
            if (ownText && value.includes(this.xpathLiteral(ownText)) &&
                (/(?:price|amount|counter|timestamp)/i.test(element.getAttribute("class") || "") ||
                    /^(?:[$£€]\s*[\d,.]+|[\d,.]+\s*(?:%|USD|AUD|EUR))$/i.test(ownText))) {
                stability -= 15; risks.push("Depends on a changing price, amount or counter");
            }
            if (/nth-(?:of-type|child)|\[\s*\d+\s*\]|^\/(?!\/)/.test(value)) {
                stability -= 18; risks.push("Depends on DOM position or a structural path");
            }
            if (/@class\s*=/.test(value)) { stability -= 7; risks.push("Requires an exact class list"); }
            if (/data-frame/.test(value)) { stability -= 20; risks.push("Depends on flattened frame metadata"); }
            if (/@(?:value|placeholder)=|\[(?:value|placeholder)=/.test(value) &&
                !/^(BUTTON)$/.test(element.tagName) && !/^(?:button|submit|reset|checkbox|radio)$/i.test(element.getAttribute("type") || "")) {
                stability -= 13; risks.push("Depends on field value or placeholder copy");
            }
            for (const node of [element, ...this.ancestorList(element)]) {
                for (const attr of Array.from(node.attributes || [])) {
                    if (attr.value && value.includes(attr.value) && this.isProbablyGenerated(attr.value)) {
                        stability -= 14; risks.push("Uses a generated-looking attribute"); break;
                    }
                }
            }
            if (/normalize-space\(\s*\.\s*\)|\.\s*=|text\(\)\s*=/.test(value)) risks.push("Depends on displayed text; language changes may affect it");
            let relationship = /container|section|label|Repeated item|Child element text/i.test(candidate.category) ? 16 : 10;
            if (candidate.containerCount > 1) { relationship -= 5; risks.push("Container expression matches multiple ancestors/components"); }
            if (candidate.controls > 1) relationship -= 5;
            if (candidate.repeater && candidate.containerCount === 1) relationship += 4;
            if (candidate.markerScore) relationship += Math.min(5, Math.max(-5, (candidate.markerScore - 68) / 6));
            if (candidate.depth > 4) relationship -= Math.min(6, candidate.depth - 4);
            const simplicity = Math.max(2, 10 - Math.floor(value.length / 90));
            candidate.execution = this.candidateExecution(candidate, snapshot.map.get(element));
            candidate.scope = candidate.section || candidate.marker || (snapshot.map.get(element).getRootNode().host ? "Shadow component" : "Document");
            candidate.risk = [...new Set(risks)].join("; ") || "No structural dependency detected; stability is heuristic";
            candidate.score = Math.round(identity + Math.max(0, stability) + relationship + simplicity + (candidate.unique ? 6 : -25));
            candidate.score = Math.max(0, Math.min(candidate.unique ? 95 : 49, candidate.score));
            candidate.recommendation = "";
            candidate.resilience = "Not tested";
            return candidate;
        },

        ancestorList: function (element) {
            const result = [];
            for (let p = element.parentElement; p && result.length < 18; p = p.parentElement) result.push(p);
            return result;
        },

        canonicalLocatorKey: function (candidate) {
            const type = (candidate.type || "").toUpperCase();
            const value = (candidate.value || "").trim();
            if (type !== "XPATH") return JSON.stringify([type, value]);
            // XPath is evaluated with the flattened DOCUMENT as its context.
            // Tokenise instead of stripping all spaces: quoted text is data,
            // and whitespace can separate identifiers/operators.
            const tokens = [];
            for (let i = 0; i < value.length;) {
                const ch = value[i];
                if (/\s/.test(ch)) { i++; continue; }
                if (ch === "'" || ch === '"') {
                    const end = value.indexOf(ch, i + 1);
                    if (end < 0) return JSON.stringify([type, value]);
                    tokens.push(["literal", value.slice(i + 1, end)]);
                    i = end + 1;
                    continue;
                }
                const word = value.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
                const number = value.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
                const pair = value.slice(i, i + 2);
                const token = word?.[0] || number?.[0] ||
                    (["//", "..", "::", "!=", "<=", ">="].includes(pair) ? pair : ch);
                tokens.push(["syntax", token]);
                i += token.length;
            }
            // Canonicalise ONLY the outer document-relative prefix. A .//
            // inside a predicate is scoped to that element and must remain.
            let prefix = 0;
            while (tokens[prefix]?.[0] === "syntax" && tokens[prefix]?.[1] === "(") prefix++;
            if (tokens[prefix]?.[0] === "syntax" && tokens[prefix]?.[1] === "." &&
                tokens[prefix + 1]?.[0] === "syntax" && tokens[prefix + 1]?.[1] === "//")
                tokens.splice(prefix, 1);
            return JSON.stringify([type, tokens]);
        },

        deduplicateCandidates: function (candidates) {
            // Input is recommendation-sorted, so the strongest representative
            // retains its rationale, category and score.
            const representatives = new Map();
            for (const candidate of candidates) {
                const key = this.canonicalLocatorKey(candidate);
                const kept = representatives.get(key);
                if (!kept) representatives.set(key, candidate);
                else if (!kept.containerLocator && candidate.containerLocator)
                    kept.containerLocator = candidate.containerLocator;
            }
            return Array.from(representatives.values());
        },

        simplifyTextLocator: function (candidate, snapshot) {
            if (candidate.type !== "XPATH") return candidate;
            let value = candidate.value;
            const positions = [];
            for (let i = 0; i < value.length;) {
                if (value[i] === "'" || value[i] === '"') {
                    const end = value.indexOf(value[i], i + 1);
                    if (end < 0) break;
                    i = end + 1; continue;
                }
                const match = value.slice(i).match(/^normalize-space\(\s*(\.|@[\w:-]+)\s*\)/);
                if (match) { positions.push({start:i,length:match[0].length,argument:match[1]}); i += match[0].length; }
                else i++;
            }
            const original = this.matchingClones(value, snapshot);
            for (const part of positions.reverse()) {
                const simplified = value.slice(0,part.start) + part.argument + value.slice(part.start+part.length);
                try {
                    const matches = this.matchingClones(simplified, snapshot);
                    if (original.length && matches.length === original.length && original.every(n => matches.includes(n)))
                        value = simplified;
                } catch {}
            }
            candidate.value = value;
            return candidate;
        },

        executeLocatorJavaScript: async function (locator, script) {
            let matches = [];
            try {
                matches = this.findAllOriginal(locator);
                if (!matches.length) throw new Error("The locator returned no elements.");
                const element = matches[0];
                if (element.nodeType !== Node.ELEMENT_NODE) throw new Error("The locator must match an element.");
                const win = element.ownerDocument.defaultView;
                const notify = () => {
                    element.dispatchEvent(new win.Event("input", {bubbles:true, composed:true}));
                    element.dispatchEvent(new win.Event("change", {bubbles:true, composed:true}));
                };
                const setValue = value => {
                    if (element.disabled || element.readOnly) throw new Error("The field is disabled or read-only.");
                    if (!/^(INPUT|TEXTAREA)$/.test(element.tagName)) throw new Error("setValue requires an input or textarea.");
                    const proto = element.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
                    if (setter) setter.call(element,String(value)); else element.value = String(value);
                    notify(); return element.value;
                };
                const setChecked = checked => {
                    if (element.tagName !== "INPUT" || element.type !== "checkbox") throw new Error("setChecked requires a checkbox.");
                    if (element.disabled) throw new Error("The checkbox is disabled.");
                    if (element.checked !== !!checked) element.click();
                    if (element.checked !== !!checked) throw new Error("The checkbox did not reach the requested state.");
                    return element.checked;
                };
                const selectValue = value => {
                    if (element.tagName !== "SELECT") throw new Error("selectValue requires a native select dropdown.");
                    if (element.disabled) throw new Error("The dropdown is disabled.");
                    const option = Array.from(element.options).find(o => o.value === String(value));
                    if (!option || option.disabled || option.parentElement?.disabled) throw new Error("No enabled option has that value.");
                    element.value = option.value; notify(); return element.value;
                };
                const getText = () => {
                    if (/^(INPUT|TEXTAREA)$/.test(element.tagName)) return element.value ?? "";
                    if (element.tagName === "SELECT") return Array.from(element.selectedOptions || []).map(o => o.textContent || "").join("\n");
                    const rendered = element.innerText;
                    if (typeof rendered === "string" && rendered.trim()) return rendered;
                    const content = element.textContent;
                    if (typeof content === "string" && content.trim()) return content;
                    const pieces = [], seen = new Set();
                    const visit = node => {
                        if (!node || seen.has(node)) return;
                        seen.add(node);
                        if (node.nodeType === Node.TEXT_NODE) { pieces.push(node.nodeValue || ""); return; }
                        if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName || "")) return;
                        if (node.tagName === "SLOT" && node.assignedNodes?.().length) {
                            for (const child of node.assignedNodes()) visit(child);
                        } else {
                            for (const child of Array.from(node.shadowRoot?.childNodes || node.childNodes || [])) visit(child);
                        }
                    };
                    visit(element);
                    return pieces.join("");
                };
                const ScriptFunction = win.Function || Function;
                const run = new ScriptFunction("element","elements","locator","setValue","setChecked","selectValue","getText",
                    "return (async function(){\n" + script + "\n}).call(element);");
                const result = await run(element,matches,locator,setValue,setChecked,selectValue,getText);
                let display;
                if (result === undefined) display = "Completed (no return value).";
                else if (typeof result === "string") display = result;
                else { try { display = JSON.stringify(result,null,2) ?? String(result); } catch { display = String(result); } }
                return {success:true,count:matches.length,result:display,error:null};
            } catch (error) {
                return {success:false,count:matches.length,result:"",error:error.message || String(error)};
            }
        },

        containerTargetFamily: function (candidate) {
            if (candidate.type !== "XPATH" || !candidate.unique || !candidate.selectedTargetMatched) return null;
            const value = candidate.value.trim();
            let bracket = 0, paren = 0, start = -1;
            for (let i = 0; i < value.length; i++) {
                const ch = value[i];
                if (ch === "'" || ch === '"') {
                    const end = value.indexOf(ch,i+1);
                    if (end < 0) return null;
                    i = end; continue;
                }
                if (ch === "[") bracket++;
                else if (ch === "]") bracket--;
                else if (ch === "(") paren++;
                else if (ch === ")") paren--;
                else if (ch === "/" && bracket === 0 && paren === 0) {
                    if (value[i+1] === "/") i++;
                    start = i + 1;
                }
                if (bracket < 0 || paren < 0) return null;
            }
            if (start < 0 || bracket || paren) return null;
            const prefix = value.slice(0,start);
            // A scope predicate must belong to the container, rather than the
            // target itself. Keep independent direct-attribute strategies.
            if (!prefix.includes("[")) return null;
            const target = value.slice(start).match(/^([A-Za-z_][\w:.-]*)(.*)$/);
            if (!target || (target[2] && !(target[2].startsWith("[") && target[2].endsWith("]")))) return null;
            return this.canonicalLocatorKey({type:"XPATH",value:prefix+target[1]});
        },

        keepShortestContainerTargets: function (candidates) {
            const shortest = new Map();
            for (const candidate of candidates) {
                const family = this.containerTargetFamily(candidate);
                if (!family) continue;
                const previous = shortest.get(family);
                if (!previous || candidate.value.length < previous.value.length) shortest.set(family,candidate);
            }
            return candidates.filter(candidate => {
                const family = this.containerTargetFamily(candidate);
                return !family || shortest.get(family) === candidate;
            });
        },

        rankCandidates: function (candidates, element, snapshot) {
            return this.drainAnalysisSteps(this.rankCandidatesSteps(candidates, element, snapshot));
        },

        rankCandidatesSteps: function* (candidates, element, snapshot) {
            yield;
            for (const candidate of candidates) {
                yield;
                this.simplifyTextLocator(candidate, snapshot);
                if (candidate.containerLocator)
                    candidate.containerLocator = this.simplifyTextLocator({type:"XPATH",value:candidate.containerLocator}, snapshot).value;
            }
            for (const candidate of candidates) {
                yield;
                yield* this.evaluateCandidateSteps(candidate,element,snapshot);
            }
            const compare = (a,b) => Number(b.unique) - Number(a.unique) || b.score - a.score ||
                Number(/data-(?:testid|test-id|cy|qa)/.test(b.value)) - Number(/data-(?:testid|test-id|cy|qa)/.test(a.value)) ||
                Number(!!b.repeaterAttribute) - Number(!!a.repeaterAttribute) || a.value.length - b.value.length;
            candidates.sort(compare);
            candidates = this.deduplicateCandidates(candidates);
            candidates = this.keepShortestContainerTargets(candidates);
            const shortlist = candidates.filter(c => c.unique && !/data-frame/.test(c.value)).slice(0, 12);
            yield* this.testCandidateResilienceSteps(shortlist, element, snapshot);
            candidates.sort(compare);
            const best = candidates.find(c => c.unique);
            const css = candidates.find(c => c.unique && c.type === "CSS");
            const xpath = candidates.find(c => c.unique && c.type === "XPATH");
            const reusable = candidates.find(c => c.unique && /container|section|Repeated item/i.test(c.category) &&
                !/nth-|\[\d+\]/.test(c.value));
            for (const [candidate, label] of [[best,"Best overall"],[css,"Best CSS"],[xpath,"Best XPath"],[reusable,"Best reusable"]])
                if (candidate) candidate.recommendation += (candidate.recommendation ? "; " : "") + label;
            return candidates;
        },

        testCandidateResilience: function (candidates, element, snapshot) {
            return this.drainAnalysisSteps(this.testCandidateResilienceSteps(candidates, element, snapshot));
        },

        testCandidateResilienceSteps: function* (candidates, element, snapshot) {
            yield;
            if (!candidates.length) return;
            const outcomes = new Map(candidates.map(c => [c, []]));
            const mutations = [
                ["extra classes", function* (doc, target) {
                    for (const n of doc.querySelectorAll("[class]")) n.classList.add("inspector-neutral-class");
                }],
                ["sibling reorder", function* (doc, target) {
                    for (const p of Array.from(doc.querySelectorAll("*")))
                        if (p.children.length > 1) for (const child of Array.from(p.children).reverse()) p.appendChild(child);
                }],
                ["neutral wrapper", function* (doc, target) {
                    const wrapper = doc.createElement("inspector-neutral-wrapper");
                    target.parentNode.insertBefore(wrapper, target); wrapper.appendChild(target);
                }],
                ["transient attributes", function* (doc, target) {
                    for (const n of doc.querySelectorAll("*")) {
                yield;
                        if (this.isProbablyGenerated(n.id)) n.removeAttribute("id");
                        for (const cls of Array.from(n.classList))
                            if (this.isProbablyGenerated(cls) || /^(?:active|selected|focused|is-loading)$/.test(cls)) n.classList.remove(cls);
                    }
                }]
            ];
            const targetIndex = Array.from(snapshot.flattenedDoc.body.querySelectorAll("*")).indexOf(element);
            for (const [name, mutate] of mutations) {
                yield;
                const doc = document.implementation.createHTMLDocument("Locator resilience copy");
                const copied = snapshot.flattenedDoc.body.cloneNode(true);
                doc.documentElement.replaceChild(doc.adoptNode(copied), doc.body);
                // Preserve target identity through cloning without inserting selector-visible attributes.
                const clones = Array.from(doc.body.querySelectorAll("*"));
                const target = clones[targetIndex];
                if (!target) continue;
                yield* mutate.call(this,doc, target);
                for (const candidate of candidates) {
                yield;
                    let found = [];
                    try {
                        if (candidate.type === "CSS") found = Array.from(doc.querySelectorAll(candidate.value));
                        else {
                            const it = doc.evaluate(candidate.value, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                            let node; while ((node = it.iterateNext())) found.push(node);
                        }
                    } catch {}
                    outcomes.get(candidate).push({ name, passed: found.length === 1 && found[0] === target });
                }
            }
            for (const candidate of candidates) {
                yield;
                const results = outcomes.get(candidate);
                const passed = results.filter(r => r.passed).length;
                candidate.resilience = passed + "/" + results.length + " clone checks passed";
                candidate.score = Math.min(99, Math.max(0, candidate.score + passed - (results.length - passed) * 6));
                const failed = results.filter(r => !r.passed).map(r => r.name);
                if (failed.length) candidate.risk += "; Failed clone checks: " + failed.join(", ");
            }
        },

        generateRecommendedCode: function (candidate, framePath) {
            if (!candidate) return "// No unique locator could be recommended.";
            const literal = JSON.stringify(candidate.value);
            if (candidate.execution === "Flattened resolver")
                return "// Install the inspector JavaScript (including findAllOriginal) in this browser context first.\n" +
                    'var element = (IWebElement)((IJavaScriptExecutor)driver).ExecuteScript("' +
                    "var inspector = window.__seleniumLocatorInspector; if (!inspector) throw new Error('Install inspector JavaScript first'); " +
                    "var matches = inspector.findAllOriginal(arguments[0]); if (matches.length !== 1) throw new Error('Expected exactly one locator match'); return matches[0];" +
                    '", ' + literal + ");";
            let code = "";
            if (candidate.execution === "Frame-scoped WebDriver")
                for (const frame of framePath) code += "driver.SwitchTo().Frame(driver.FindElement(By.CssSelector(" + JSON.stringify(frame) + ")));\n";
            return code + "var element = driver.FindElement(By." + (candidate.type === "CSS" ? "CssSelector" : "XPath") + "(" + literal + "));";
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
            if (!this.analysisVisible(element) || element.matches(":disabled") || element.closest("[inert]") || element.getAttribute("aria-disabled") === "true") return false;
            const win = element.ownerDocument.defaultView;
            if (win.getComputedStyle(element).pointerEvents === "none") return false;
            const rect = element.getBoundingClientRect();
            const x = Math.max(0, Math.min(win.innerWidth - 1, rect.left + rect.width / 2));
            const y = Math.max(0, Math.min(win.innerHeight - 1, rect.top + rect.height / 2));
            if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= win.innerWidth || rect.top >= win.innerHeight) return false;
            const hit = this.deepElementFromPoint(x,y,element.ownerDocument);
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

        relationshipMatches: function (locator, relative) {
            const snapshot=this.flattenMultiFrameDOM();
            const contexts=snapshot.findAllClones(locator),matches=new Set();
            const isXPath=relative && /^(?:\.?\/|\(|\.\.?$|(?:ancestor|descendant|self|parent|following|preceding|child|attribute)(?:-sibling|-or-self)?::|\*\[@)/.test(relative.trim());
            const select=context=>{
                if(!relative)return [context];
                if(!isXPath)return Array.from(context.querySelectorAll(relative));
                const result=snapshot.flattenedDoc.evaluate(relative,context,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
                return Array.from({length:result.snapshotLength},(_,i)=>result.snapshotItem(i));
            };
            // Syntax validation also happens when the parent currently has no matches.
            if(relative)select(snapshot.flattenedDoc.body);
            for(const context of contexts)for(const clone of select(context))
                if((clone===context||context.contains(clone))&&snapshot.map.has(clone))matches.add(clone);
            return {snapshot,contexts,clones:Array.from(matches),originals:Array.from(matches).map(n=>snapshot.map.get(n))};
        },
        highlightRelationship: function (locator, relative) {
            const result=this.relationshipMatches(locator,relative);
            this.highlightMatches(result.originals);return result.originals.length;
        },
        reviewRelationship: function (locator, relative) {
            let result;
            try {result=this.relationshipMatches(locator,relative);}
            catch(error){this.clearLocatorHighlights();return {valid:false,count:0,error:'Invalid XPath/CSS: '+error.message,css:'',cssNote:''};}
            if(result.clones.some(n=>n.nodeType!==Node.ELEMENT_NODE)){this.clearLocatorHighlights();return {valid:false,count:0,error:'Locator selects non-element nodes. Select browser elements for page-class operations.',css:'',cssNote:''};}
            this.highlightMatches(result.originals);
            if(!result.clones.length)return {valid:true,count:0,error:'',css:'',cssNote:'Valid syntax, but no current matches to verify a CSS alternative.'};
            const first=result.clones[0],tag=first.tagName.toLowerCase(),candidates=[];
            const attr=(name,value)=>'['+name+'="'+this.cssAttributeEscape(value)+'"]';
            for(const name of ['data-testid','data-test','data-qa','id','name','aria-label','title','type','role']) {
                const value=first.getAttribute(name);
                if(value&&!this.isProbablyGenerated(value)){candidates.push(tag+attr(name,value));if(name!=='type'&&name!=='role')candidates.push(attr(name,value));}
            }
            for(const name of this.stableClasses(first).slice(0,4))candidates.push(tag+'.'+CSS.escape(name),'.'+CSS.escape(name));
            candidates.push(tag);
            const expected=new Set(result.clones);
            const scope=relative?result.contexts:[result.snapshot.flattenedDoc];
            const equal=css=>{
                try {const actual=new Set(scope.flatMap(n=>Array.from(n.querySelectorAll(css))).filter(n=>result.snapshot.map.has(n)));
                    return actual.size===expected.size&&Array.from(actual).every(n=>expected.has(n));} catch{return false;}
            };
            const rank=css=>/\[data-(testid|test|qa)=/.test(css)?0:/\[(id|name|aria-label|title)=/.test(css)?1:css.includes('.')?2:css.includes('[')?3:5;
            const css=Array.from(new Set(candidates)).filter(equal).sort((a,b)=>rank(a)-rank(b)||a.length-b.length)[0]||'';
            return {valid:true,count:result.clones.length,error:'',css,cssNote:css
                ? 'CSS matches the same elements in this snapshot'+(relative?' within each parent.':'.')+' Text/ancestor relationships may still make XPath preferable.'
                : 'Keep XPath: no simple stable CSS selector matched the same elements.'};
        },

        testLocator: function (locator, selectionIndex) {
            try {
                const matches = this.findAllOriginal(locator);
                this.highlightMatches(matches);
                const selected = this.selectionElements[selectionIndex] || null;
                const measured = selected && matches.includes(selected) ? selected : matches[0];
                const bounds = measured?.getBoundingClientRect?.();
                return {
                    width: bounds ? Math.round(bounds.width * 100) / 100 : null,
                    height: bounds ? Math.round(bounds.height * 100) / 100 : null,
                    dimensionsOf: measured === selected && selected ? "Selected match" : measured ? "First match" : "No match",
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
            return this.drainAnalysisSteps(this.addDeepParentCandidatesSteps(element, add, query));
        },

        addDeepParentCandidatesSteps: function* (element, add, query) {
            yield;
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
                yield;
                    depth++;
                    route.unshift(ancestor);
                    const anchors = this.relationshipAnchors(ancestor, element, query).slice(0, 18);
                    const found = [];
                    for (const anchor of anchors) {
                yield;
                        for (const target of targetOptions) {
                yield;
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
                yield;
                            for (const option of this.relationshipNodeOptions(route[i + 1]).slice(1, 4)) {
                yield;
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
            return this.drainAnalysisSteps(this.addContainerCandidatesSteps(element, add));
        },

        addContainerCandidatesSteps: function* (element, add) {
            yield;
            const tag = element.tagName.toLowerCase();
            const ownText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
            const anchors = [];
            for (let parent = element.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
                yield;
                if (["body", "html"].includes(parent.tagName.toLowerCase())) break;
                const ptag = parent.tagName.toLowerCase();
                let parentBase = null;
                for (const attr of ["data-testid", "data-test-id", "data-cy", "id", "aria-label", "role"]) {
                yield;
                    const value = parent.getAttribute(attr);
                    if (value && !this.isProbablyGenerated(value)) {
                        parentBase = ".//" + ptag + "[@" + attr + "=" + this.xpathLiteral(value) + "]";
                        break;
                    }
                }
                if (parentBase) anchors.push({ base: parentBase, score: 88, reason: "Stable container attribute" });
                for (const marker of this.nearestTextMarkers(parent, element,
                    "label,legend,h1,h2,h3,h4,h5,h6,strong,span,div", 3))
                    anchors.push({ base: ".//" + ptag + "[.//" + marker.node.tagName.toLowerCase() +
                        "[" + this.normalizedTextPredicate(marker.text, marker.node) + "]]", score: 84,
                        reason: "Meaningful container text: " + marker.text });
                if (parent.children.length < 15) {
                    const directText = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.nodeValue).join(" ").trim().replace(/\s+/g, " ");
                    if (directText && directText.length <= 65)
                        anchors.push({ base: ".//" + ptag + "[contains(normalize-space(.)," + this.xpathLiteral(directText) + ")]", score: 72, reason: "Container's direct text: " + directText });
                }
            }
            const targetParts = [];
            for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label", "type", "placeholder", "role"]) {
                yield;
                const value = element.getAttribute(attr);
                if (value && !this.isProbablyGenerated(value)) targetParts.push({ part: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]", score: 90 });
            }
            if (ownText && ownText.length <= 65 && element.children.length === 0)
                targetParts.push({ part: tag + "[normalize-space(.)=" + this.xpathLiteral(ownText) + "]", score: 86 });
            targetParts.push({ part: tag, score: 62 });
            for (const anchor of anchors.slice(0, 12)) {
                yield;
                for (const target of targetParts.slice(0, 6))
                    add("Reusable container", "XPATH", anchor.base + "//" + target.part, Math.min(anchor.score, target.score), anchor.reason + "; scoped to the target within that container.");
            }
            // Associated labels may point to controls by @for instead of nesting them.
            if (["input", "textarea", "select"].includes(tag) && element.id) {
                const label = element.ownerDocument.querySelector('label[for="' + this.cssAttributeEscape(element.id) + '"]');
                if (label) {
                    const labelText = (label.innerText || label.textContent || "").trim().replace(/\s+/g, " ");
                    for (let parent = element.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
                yield;
                        if (!labelText || parent.tagName.toLowerCase() === "body") break;
                        if (parent.contains(label))
                            add("Reusable field container", "XPATH", ".//" + parent.tagName.toLowerCase() + "[.//label[normalize-space(.)=" + this.xpathLiteral(labelText) + "]]//" + tag, 92, "Finds the field inside the container holding its associated label.");
                    }
                }
            }
        },

        addReusableSectionCandidates: function (element, add, query) {
            return this.drainAnalysisSteps(this.addReusableSectionCandidatesSteps(element, add, query));
        },

        addReusableSectionCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            const targetParts = [];
            const targetText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
            if (targetText && targetText.length <= 90 && !element.children.length)
                targetParts.push({ value: tag + "[normalize-space(.)=" + this.xpathLiteral(targetText) + "]", score: 89,
                    reason: "target text" });
            for (const attr of ["data-testid", "data-test-id", "data-cy", "aria-label", "name", "value", "placeholder", "href", "type"]) {
                yield;
                const value = element.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    targetParts.push({ value: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]",
                        score: attr === "type" ? 59 : 77, reason: "target @" + attr });
            }
            targetParts.push({ value: tag, score: 45, reason: "target tag" });

            for (let parent = this.parentForLocator(element), depth = 1;
                parent && parent.nodeType === Node.ELEMENT_NODE && depth <= 14;
                parent = this.parentForLocator(parent), depth++) {
                yield;
                const parentTag = parent.tagName.toLowerCase();
                if (parentTag === "body" || parentTag === "html") break;
                const classes = this.stableClasses(parent);
                const anchors = [];
                for (const cls of classes.slice(0, 2)) {
                yield;
                    const classPredicate = parent.getAttribute("class") === cls
                        ? "@class=" + this.xpathLiteral(cls)
                        : "contains(concat(' ',normalize-space(@class),' ')," + this.xpathLiteral(" " + cls + " ") + ")";
                    anchors.push({ value: "//" + parentTag + "[" + classPredicate + "]",
                        score: 87 - depth, reason: "container class " + cls });
                }
                for (const attr of ["data-testid", "data-test-id", "data-cy", "aria-label", "role"]) {
                yield;
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
                yield;
                    const scoped = [anchor];
                    for (const marker of markers)
                        scoped.push({ value: anchor.value + "[.//" + marker.tag +
                            "[normalize-space(.)=" + this.xpathLiteral(marker.text) + "]]",
                            score: anchor.score + 5, reason: anchor.reason + " and nearby " + marker.tag + " text" });
                    for (const container of scoped) {
                yield;
                        for (const target of targetParts) {
                yield;
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
            return this.drainAnalysisSteps(this.addChildTextCandidatesSteps(element, add, query));
        },

        addChildTextCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            const bases = [];
            for (const attr of ["role", "data-testid", "data-test-id", "data-cy", "part", "aria-label"]) {
                yield;
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
                yield;
                const node = pending.pop();
                if (node.nodeType === Node.TEXT_NODE) { note(node.nodeValue); continue; }
                if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) continue;
                if (node.nodeType === Node.ELEMENT_NODE) note(node.innerText || node.textContent);
                const children = Array.from(node.childNodes);
                if (node.shadowRoot) children.unshift(...node.shadowRoot.childNodes);
                for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
            }

            for (const clue of clues) {
                yield;
                const literal = this.xpathLiteral(clue);
                for (const base of bases.slice(0, 6)) {
                yield;
                    // The descendant may be a span, a text node directly in a
                    // child, or an open shadow-root child in the flattened DOM.
                    for (const predicate of [".//*[normalize-space(.)=" + literal + "]",
                        ".//text()[normalize-space(.)=" + literal + "]"]) {
                yield;
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
                const predicate = "contains(concat(' ',normalize-space(@class),' ')," + this.xpathLiteral(" " + cls + " ") + ")";
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
                if (attr === "value" && !/^(BUTTON)$/.test(element.tagName) && !/^(?:button|submit|reset|checkbox|radio)$/i.test(element.getAttribute("type") || "")) continue;
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
                .map(node => this.textIdentity(node, target)).filter(Boolean)
                .map(item => ({ ...item, distance: this.textDistance(item.node, target, container) }))
                .filter(item => item.text && item.distance <= 12)
                .sort((a, b) => b.score - a.score || a.distance - b.distance || a.text.length - b.text.length)
                .slice(0, limit);
        },

        addCompositeCandidates: function (element, add, query) {
            return this.drainAnalysisSteps(this.addCompositeCandidatesSteps(element, add, query));
        },

        addCompositeCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            let produced = 0;
            const attrs = ["data-testid", "data-test-id", "data-cy", "name", "aria-label",
                "role", "autocomplete", "placeholder", "type", "part", "value"]
                .map(name => ({ name, value: element.getAttribute(name) }))
                .filter(item => item.value && item.value.length <= 100 && !this.isProbablyGenerated(item.value))
                .slice(0, 8);
            for (let i = 0; i < attrs.length; i++) {
                yield;
                for (let j = i + 1; j < attrs.length; j++) {
                yield;
                    if (produced >= 12) return;
                    const a = attrs[i], b = attrs[j];
                    const css = tag + "[" + a.name + '="' + this.cssAttributeEscape(a.value) + '"]' +
                        "[" + b.name + '="' + this.cssAttributeEscape(b.value) + '"]';
                    const xpath = "//" + tag + "[@" + a.name + "=" + this.xpathLiteral(a.value) +
                        " and @" + b.name + "=" + this.xpathLiteral(b.value) + "]";
                    for (const [type, locator] of [["CSS", css], ["XPATH", xpath]]) {
                yield;
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
            return this.drainAnalysisSteps(this.addAssociatedLabelCandidatesSteps(element, add, query));
        },

        addAssociatedLabelCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            if (!["input", "textarea", "select"].includes(tag)) return;
            const doc = element.ownerDocument;
            if (element.id) {
                for (const label of Array.from(doc.querySelectorAll("label[for]")).filter(node =>
                    node.getAttribute("for") === element.id && this.sameOriginalRoot(node, element))) {
                yield;
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
                yield;
                for (const reference of Array.from(doc.querySelectorAll("[id]")).filter(node => node.id === id && this.sameOriginalRoot(node, element))) {
                yield;
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
            return this.drainAnalysisSteps(this.addNearestContainerCandidatesSteps(element, add, query));
        },

        addNearestContainerCandidatesSteps: function* (element, add, query) {
            yield;
            const parts = this.targetParts(element);
            let produced = 0;
            for (let parent = element.parentElement, depth = 1; parent && depth <= 10;
                parent = parent.parentElement, depth++) {
                yield;
                if (produced >= 20) break;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                let parentResults = 0;
                const markers = this.nearestTextMarkers(parent, element,
                    "div,label,legend,h1,h2,h3,h4,h5,h6,span,strong,p,td,th", 2);
                for (const marker of markers) {
                yield;
                    const mt = marker.node.tagName.toLowerCase();
                    const condition = "[.//" + mt + "[normalize-space(.)=" + this.xpathLiteral(marker.text) + "]]";
                    for (const anchor of this.stableContainerAnchors(parent)) {
                yield;
                        for (const part of parts) {
                yield;
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
            return this.drainAnalysisSteps(this.addSiblingTextCandidatesSteps(element, add, query));
        },

        addSiblingTextCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            for (let wrapper = element, depth = 0; wrapper && depth < 5;
                wrapper = wrapper.parentElement, depth++) {
                yield;
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

        repeaterAttributes: function (node) {
            // Presence expresses a repeating template; the expression itself
            // often embeds application-specific variable names and filters.
            return ["ng-repeat", "data-ng-repeat", "x-ng-repeat", "ng:repeat", "v-for", "data-repeat"]
                .filter(name => node.getAttribute(name) !== null);
        },

        repeatedChildParts: function (element) {
            const tag = element.tagName.toLowerCase();
            const parts = [];
            for (const attr of ["data-testid", "data-test-id", "data-cy", "data-qa", "name", "aria-label", "role", "type", "part"]) {
                const value = element.getAttribute(attr);
                if (value && value.length <= 100 && !this.isProbablyGenerated(value))
                    parts.push({ value: tag + "[@" + attr + "=" + this.xpathLiteral(value) + "]", basis: "child @" + attr });
            }
            for (const cls of this.stableClasses(element).slice(0, 3))
                parts.push({ value: tag + "[contains(concat(' ',normalize-space(@class),' ')," +
                    this.xpathLiteral(" " + cls + " ") + ")]", basis: "child class token " + cls });
            // A tag is sufficient for a single image/control in a named card.
            parts.push({ value: tag, basis: "unique child tag" });
            return parts;
        },

        addRepeatedItemCandidates: function (element, add, query) {
            return this.drainAnalysisSteps(this.addRepeatedItemCandidatesSteps(element, add, query));
        },

        addRepeatedItemCandidatesSteps: function* (element, add, query) {
            yield;
            let produced = 0;
            for (let parent = element, depth = 0; parent && depth <= 10;
                parent = parent.parentElement, depth++) {
                yield;
                if (produced >= 36) break;
                if (!this._analysisSnapshot.map.has(parent) || /^(BODY|HTML)$/.test(parent.tagName)) break;
                const tag = parent.tagName.toLowerCase();
                const attrs = this.repeaterAttributes(parent);
                if (!attrs.length && /^(A|BUTTON|IMG|INPUT|SELECT|TEXTAREA)$/.test(parent.tagName)) continue;
                const classes = this.stableClasses(parent);
                const semantic = ["tr", "li", "article"].includes(tag) ||
                    /^(?:row|listitem)$/.test(parent.getAttribute("role") || "") ||
                    /(?:item|card|row|tile|product|record|entry)/i.test(parent.getAttribute("class") || "");
                const siblings = Array.from(parent.parentElement?.children || []).filter(n =>
                    n.tagName === parent.tagName && this._analysisSnapshot.map.has(n) &&
                    (classes.length ? classes.some(cls => Array.from(n.classList).includes(cls)) : true));
                if (!attrs.length && !semantic && !(siblings.length > 1 && classes.length)) continue;
                // Do not mistake a collection wrapper for one repeated item.
                if (!attrs.length && parent.querySelectorAll("li,tr,article").length > 1 &&
                    !["li", "tr", "article"].includes(tag)) continue;
                const anchors = attrs.filter(name => !name.includes(":"))
                    .map(name => ({ value: "//" + tag + "[@" + name + "]", reason: "repeater @" + name, attribute: name }));
                anchors.push(...this.stableContainerAnchors(parent));
                // Comparing a plain tag avoids coupling to incidental styling.
                anchors.push({value: "//" + tag, reason: "item tag"});
                const markers = Array.from(parent.querySelectorAll("a,h1,h2,h3,h4,h5,h6,td,th,strong,label,span,div"))
                    .slice(0, 500).filter(n => n === element || (!n.contains(element) &&
                        (parent === element || !element.contains(n))))
                    .map(n => this.textIdentity(n, element)).filter(Boolean)
                    .filter(m => m.score >= 60)
                    .filter(m => {
                        for (let owner = m.node.parentElement; owner && owner !== parent; owner = owner.parentElement)
                            if (this.repeaterAttributes(owner).length || /^(LI|TR|ARTICLE)$/.test(owner.tagName)) return false;
                        return true;
                    })
                    .filter(m => !/^(?:add to cart|buy now|details|read more|remove|delete|compare|wishlist|in stock|out of stock)$/i.test(m.text))
                    .map(m => ({...m, score: m.score +
                        (/^(A|H[1-6]|TD|TH)$/.test(m.node.tagName) ? 12 : 0) +
                        (/(?:product.?name|product.?title|record.?name|item.?name)/i.test(m.node.getAttribute("class") || "") ? 18 : 0),
                        distance: this.textDistance(m.node, element, parent)}))
                    .sort((a,b) => b.score - a.score || a.distance - b.distance).slice(0, 4);
                for (const marker of markers) {
                yield;
                    for (const anchor of anchors) {
                yield;
                        if (produced >= 36) break;
                        const container = anchor.value + "[.//" + marker.node.tagName.toLowerCase() +
                            "[" + this.normalizedTextPredicate(marker.text, marker.node) + "]]";
                        const containers = query(container);
                        // A unique child alone is insufficient: establish a
                        // unique business item before building the child path.
                        if (containers.length !== 1 || containers[0] !== parent) continue;
                        const parts = parent === element ? [{ value: "", basis: "selected item container" }] :
                            this.repeatedChildParts(element);
                        for (const part of parts) {
                yield;
                            if (produced >= 36) break;
                            const value = container + (part.value ? "//" + part.value : "");
                            const matches = query(value);
                            if (matches.length !== 1 || matches[0] !== element) continue;
                            add("Repeated item", "XPATH", value, 94,
                                "Identifies one repeated item by '" + marker.text + "' using " + anchor.reason +
                                (part.value ? ", then locates its " + part.basis : "; selects the container itself") +
                                ". Container matches: 1; target matches: 1. Reusable item identity is separate from child identity.",
                                {marker: marker.text, markerScore: marker.score, depth, containerCount: 1,
                                    containerLocator: container, repeater: true, repeaterAttribute: anchor.attribute || "", childBasis: part.basis});
                            produced++;
                        }
                    }
                }
            }
        },

        addRelationalCssCandidates: function (element, add, query) {
            return this.drainAnalysisSteps(this.addRelationalCssCandidatesSteps(element, add, query));
        },

        addRelationalCssCandidatesSteps: function* (element, add, query) {
            yield;
            const tag = element.tagName.toLowerCase();
            let produced = 0;
            const targetName = element.getAttribute("name");
            const targetCss = tag + (targetName && !this.isProbablyGenerated(targetName)
                ? '[name="' + this.cssAttributeEscape(targetName) + '"]' : "");
            for (let parent = element.parentElement, depth = 1; parent && depth <= 5;
                parent = parent.parentElement, depth++) {
                yield;
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
                yield;
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
            return this.drainAnalysisSteps(this.buildDetailedCandidatesSteps(element, candidates, snapshot));
        },

        buildDetailedCandidatesSteps: function* (element, candidates, snapshot) {
            yield;
            const out = [];
            const byKey = new Map();
            const query = value => this.matchingClones(value, snapshot);
            const original = snapshot.map.get(element);
            const visible = this.analysisVisible(original);
            const clickable = this.analysisClickable(original);
            const add = (category, type, value, base, rationale, evidence = {}) => {
                if (!value) return;
                const key = this.canonicalLocatorKey({ type, value });
                const existing = byKey.get(key);
                if (existing) {
                    // Retain semantic evidence when a structural generator found
                    // the same expression first.
                    if ((!existing.repeater && evidence.marker) || evidence.repeater || category === "Associated label")
                        Object.assign(existing, { category, rationale, ...evidence });
                    return;
                }
                let matches;
                try { matches = query(value); } catch { return; }
                if (!matches.includes(element)) return;
                const unique = matches.length === 1;
                const row = { category, type, value, score: this.candidateScore(value, base, unique),
                    unique, visible, clickable, rationale, ...evidence };
                out.push(row);
                byKey.set(key, row);
            };
            candidates.forEach(c => {
                const key = this.canonicalLocatorKey(c);
                if (byKey.has(key)) return;
                const row = { category: "Direct attributes / text / structure", type: c.type,
                    value: c.value, score: c.score, unique: c.unique, visible, clickable,
                    rationale: "Generated from the element's own attributes, text, or DOM structure." };
                out.push(row);
                byKey.set(key, row);
            });

            const tag = element.tagName.toLowerCase();
            const attrs = ["id", "name", "type", "placeholder", "aria-label", "title", "role", "data-testid", "data-test-id", "data-cy", "value", "autocomplete"];
            for (const attr of attrs) {
                yield;
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
                yield;
                const childText = (child.innerText || child.textContent || "").trim().replace(/\s+/g, " ");
                if (childText && childText.length <= 60) {
                    const childTag = child.tagName.toLowerCase();
                    const xpath = "//" + tag + "[.//" + childTag + "[normalize-space(.)=" + this.xpathLiteral(childText) + "]]";
                    add("Child element text", "XPATH", xpath, 64, "Identifies the target tag using descendant <" + childTag + "> text: " + childText);
                }
                for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label", "title", "id"]) {
                yield;
                    const val = child.getAttribute(attr);
                    if (!val || (attr === "id" && this.isProbablyGenerated(val))) continue;
                    const xpath = "//" + tag + "[.//" + child.tagName.toLowerCase() + "[@" + attr + "=" + this.xpathLiteral(val) + "]]";
                    add("Child element attribute", "XPATH", xpath, attr.startsWith("data-") ? 74 : 60, "Uses descendant <" + child.tagName.toLowerCase() + "> @" + attr + "=" + val + " as a distinguishing clue.");
                }
            }
            yield* this.addChildTextCandidatesSteps(element, add, query);

            const parent = element.parentElement;
            if (parent && parent.tagName.toLowerCase() !== "body" && parent.tagName.toLowerCase() !== "html") {
                const ptag = parent.tagName.toLowerCase();
                for (const attr of ["id", "data-testid", "data-test-id", "data-cy", "name", "aria-label", "role"]) {
                yield;
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

            yield* this.addMeaningfulRelationshipsSteps(element, add, query);
            yield* this.addCompositeCandidatesSteps(element, add, query);
            yield* this.addAssociatedLabelCandidatesSteps(element, add, query);
            yield* this.addNearestContainerCandidatesSteps(element, add, query);
            yield* this.addSiblingTextCandidatesSteps(element, add, query);
            yield* this.addRepeatedItemCandidatesSteps(element, add, query);
            yield* this.addRelationalCssCandidatesSteps(element, add, query);
            yield* this.addContainerCandidatesSteps(element, add);
            yield* this.addReusableSectionCandidatesSteps(element, add, query);
            yield* this.addDeepParentCandidatesSteps(element, add, query);
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

                if (!root.host)
                    break;

                result.unshift(this.simpleCss(current));

                current = root.host;
            }

            return result;
        },

        getFramePath: function (element) {
            const result = [];

            try {
                let win = element?.ownerDocument.defaultView || window;

                while (win !== window && win !== win.parent) {
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

            const best = candidates.find(c => c.recommendation?.includes("Best overall")) ||
                candidates.find(c => c.unique) || candidates[0] || null;
            if (best?.risk) warnings.push("Recommended locator: " + best.risk);
            if (best?.resilience && best.resilience !== "Not tested") positive.push(best.resilience + " (inert DOM copies only).");
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
