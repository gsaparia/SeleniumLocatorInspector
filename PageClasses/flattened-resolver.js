// Standalone flattened resolver. XPath is data, never interpolated JavaScript.
const flatten = function (rootWindow = window) {
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
        };
const snapshot = flatten(window);
const locator = arguments[0], search = arguments[1], relative = arguments[2], countOnly = arguments[3], displayOnly = arguments[4], fingerprint = arguments[5];
let matches = snapshot.findAllOriginal(locator);
const exactText=arguments[6];
const text = n => (n.innerText || n.textContent || '').replace(/\s+/g,' ').trim();
if (displayOnly || search != null) matches = matches.filter(n => {
    const w = n.ownerDocument.defaultView, style = w.getComputedStyle(n), rect = n.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 &&
        (search == null || text(n).toLowerCase().includes(search.replace(/\s+/g,' ').trim().toLowerCase()));
});
if(exactText!=null)matches=matches.filter(n=>text(n)===String(exactText).replace(/\s+/g,' ').trim());
if(fingerprint) return matches.map(n => text(n)+'|'+Array.from(n.querySelectorAll('[aria-current],.active,.current-page,.oxd-pagination-page-item--page-selected')).map(c=>c.textContent+'='+c.getAttribute('aria-current')+'='+c.className).join(',')).join('\n');
if (countOnly) return matches.length;
if (!matches.length) return null;
if (matches.length !== 1) return {error:'Expected one match, found '+matches.length+': '+locator};
let element = matches[0];
if (relative != null) {
    const clone = snapshot.findClone(element);
    const isXPath=/^(?:\.?\/|\(|\.\.?$|(?:ancestor|descendant|self|parent|following|preceding|child|attribute)(?:-sibling|-or-self)?::|\*\[@)/.test(relative.trim());
    const children=[];
    if(isXPath) {
        const result=snapshot.flattenedDoc.evaluate(relative,clone,null,XPathResult.ORDERED_NODE_ITERATOR_TYPE,null);
        let node;while((node=result.iterateNext()))if(snapshot.map.has(node)&&(node===clone||clone.contains(node)))children.push(snapshot.map.get(node));
    } else for(const node of clone.querySelectorAll(relative))if(snapshot.map.has(node))children.push(snapshot.map.get(node));
    if (!children.length) return null;
    if (children.length !== 1) return {error:'Ambiguous row child: '+relative};
    element = children[0];
}
const frames = [];
for (let w = element.ownerDocument.defaultView; w && w !== window; w = w.parent) {
    if (!w.frameElement) return {error:'Unable to determine owning frame.'};
    frames.unshift(w.frameElement);
}
return {element,frames};
