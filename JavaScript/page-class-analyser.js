(function () {
    const inspector = window.__seleniumLocatorInspector;
    if (!inspector) throw new Error('Install the locator inspector first.');
    inspector.analysePage = function () {
        const snapshot = this.flattenMultiFrameDOM();
        const doc = snapshot.flattenedDoc;
        const nodes = Array.from(doc.querySelectorAll('*')).filter(n => snapshot.map.has(n));
        const warnings = [];
        const clean = text => (text || '').replace(/\s+/g, ' ').trim().replace(/[:*]\s*$/, '').trim();
        const rawText = n => n?.textContent || '';
        const visibleText = n => {
            if (!n) return '';
            if (n.nodeType === 3) return n.nodeValue || '';
            if (n.nodeType !== 1) return '';
            const original=snapshot.map.get(n);
            if(n.hidden || n.getAttribute('aria-hidden')==='true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute('style')||''))return '';
            try { const style=original?.ownerDocument.defaultView.getComputedStyle(original); if(style?.display==='none'||style?.visibility==='hidden')return ''; } catch {}
            return Array.from(n.childNodes).map(visibleText).join('');
        };
        const caption = n => clean(visibleText(n));
        const literal = text => this.xpathLiteral(text);
        const predicate = n => this.normalizedTextPredicate(rawText(n), n);
        const queryCache = new Map();
        const query = xp => { if(queryCache.has(xp)) return queryCache.get(xp); let found=[]; try { found=snapshot.findAllClones(xp); } catch {} queryCache.set(xp,found); return found; };
        const exact = (xp, target) => { const found = query(xp); return found.length === 1 && found[0] === target; };
        const visible = n => {
            const original = snapshot.map.get(n);
            if (!original || n.getAttribute('type') === 'hidden') return false;
            try {
                if (this.isVisible(original)) return true;
                if (/^(checkbox|radio)$/.test(n.getAttribute('type') || '')) {
                    const label = associatedLabel(n);
                    return !!label && this.isVisible(snapshot.map.get(label));
                }
            } catch { }
            return false;
        };
        const editable = n => /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)
            && !/^(hidden|submit|button|reset|image)$/.test(n.getAttribute('type') || '');
        const allControls = nodes.filter(editable);
        const supportedType = n => n.tagName !== 'INPUT' || /^(text|email|password|search|tel|url|number|checkbox|radio)$/.test(n.getAttribute('type') || 'text');
        const controls = allControls.filter(n => visible(n) && supportedType(n)).slice(0, 500);
        if (allControls.filter(visible).length > 500) warnings.push('Field analysis limited to the first 500 visible controls.');
        function associatedLabel(control) {
            const original = snapshot.map.get(control);
            const root = original?.getRootNode();
            const id = control.getAttribute('id');
            if (id && root?.querySelectorAll) {
                const labels = Array.from(root.querySelectorAll('label')).filter(l => l.getAttribute('for') === id);
                if (labels.length === 1) return snapshot.findClone(labels[0]);
            }
            for (let p = control.parentElement; p && snapshot.map.has(p); p = p.parentElement)
                if (p.tagName === 'LABEL') return p;
            return null;
        }
        const stable = value => !!value && !this.isProbablyGenerated(value);
        const classStep = n => {
            const cls = Array.from(n.classList).filter(c => stable(c) && !/^(active|selected|ng-|focus|hover)/i.test(c))[0];
            return cls ? n.tagName.toLowerCase() + "[contains(concat(' ',normalize-space(@class),' ')," + literal(' ' + cls + ' ') + ')]' : n.tagName.toLowerCase();
        };
        const localBases = n => {
            const tag = n.tagName.toLowerCase();
            const out = [];
            for (const attr of ['data-testid','data-test','data-qa','aria-label','title','name','id','part','role']) {
                const value = n.getAttribute(attr);
                if (stable(value)) out.push(tag + '[@' + attr + '=' + literal(value) + ']');
            }
            const cls = classStep(n);
            if (cls !== tag) out.push(cls);
            out.push(tag);
            return out;
        };
        const locatorRank = xp => /@data-(?:testid|test|qa)=/.test(xp) ? 0 : /@(?:aria-label|name|id|part)=/.test(xp) ? 1 : /\[\.?=|normalize-space\(\.\)=/.test(xp) ? 2 : /@role=|@class/.test(xp) ? 3 : 6;
        const pathCache = new Map();
        const pathFor = target => {
            if (pathCache.has(target)) return pathCache.get(target);
            let suffix = '';
            for (let current = target, depth = 0; current && snapshot.map.has(current) && depth < 35; current = current.parentElement, depth++) {
                const scoped=[];
                const heading=Array.from(current.children).find(c=>c.matches('h1,h2,h3,h4,h5,h6,legend')&&caption(c));
                if(heading && current!==target) for(const base of localBases(current))scoped.push(current.tagName.toLowerCase()+'[./'+heading.tagName.toLowerCase()+'['+predicate(heading)+']]'+suffix);
                const semantic = current === target && current.matches('a,button,[role="button"],[role="tab"]') && caption(current) && caption(current).length < 100 ? [current.tagName.toLowerCase()+'['+predicate(current)+']'] : [];
                const possible = [...scoped.map(base=>'//'+base),...[...semantic,...localBases(current)].map(base => '//' + base + suffix)]
                    .filter(xp => exact(xp, target)).sort((a,b) => locatorRank(a)-locatorRank(b) || a.length - b.length);
                if (possible.length) { if(/\[\d+\]/.test(possible[0]))warnings.push('Positional relationship needs review: '+possible[0]); pathCache.set(target, possible[0]); return possible[0]; }
                const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(n => n.tagName === current.tagName) : [current];
                suffix = '/' + current.tagName.toLowerCase() + (siblings.length > 1 ? '[' + (siblings.indexOf(current)+1) + ']' : '') + suffix;
            }
            // Frame wrapper positions are resolver context, not website attributes.
            const wrapper = target.closest('[data-frame]');
            const wrappers = Array.from(doc.body.children).filter(n => n.hasAttribute('data-frame'));
            const fallback = '//div[@data-frame][' + (wrappers.indexOf(wrapper)+1) + ']' + suffix;
            if (exact(fallback, target)) {
                warnings.push('A locator needs a positional/frame-context fallback: ' + fallback);
                pathCache.set(target, fallback); return fallback;
            }
            return '';
        };
        const sectionOf = n => {
            for (let branch = n, p = n.parentElement, depth = 0; p && snapshot.map.has(p) && depth < 12; branch = p, p = p.parentElement, depth++) {
                for (let previous = branch.previousElementSibling; previous; previous = previous.previousElementSibling) {
                    if (previous.matches('h1,h2,h3,h4,h5,h6,legend,.title,.aos-nav-headline') && caption(previous)) return caption(previous);
                }
                const direct = Array.from(p.children).find(c => /^(LEGEND|H[1-6])$/.test(c.tagName))
                    || Array.from(p.children).find(c => c.classList.contains('title') || c.classList.contains('aos-nav-headline'));
                if (direct && caption(direct) && !direct.contains(n)) return caption(direct);
                if (p.tagName === 'FORM' && p.getAttribute('aria-label')) return clean(p.getAttribute('aria-label'));
            }
            return '';
        };
        const markerInLabel = (label, control) => {
            const named = Array.from(label.querySelectorAll('h1,h2,h3,h4,h5,h6,span,strong')).find(n =>
                !n.contains(control) && caption(n) && !n.querySelector('input,select,textarea'));
            if (named) return named;
            return caption(label) && !label.querySelector('select') ? label : null;
        };
        const relation = (control, marker, container, evidence) => {
            const tag = control.tagName.toLowerCase();
            const expressions = [];
            if (marker.tagName === 'LABEL' && marker.getAttribute('for'))
                expressions.push('//' + tag + '[@id=//label[' + predicate(marker) + ']/@for]');
            if (marker.contains(control)) expressions.push('//label[' + predicate(marker) + ']//' + tag);
            const markerStep = marker.tagName.toLowerCase() + '[' + predicate(marker) + ']';
            for (let p = container || control.parentElement, depth = 0; p && snapshot.map.has(p) && depth < 8; p = p.parentElement, depth++) {
                if (!p.contains(marker)) continue;
                for (const base of localBases(p)) {
                    for(const child of localBases(control)) expressions.push('//' + base + '[.//' + markerStep + ']//' + child);
                    if (p === marker) expressions.push('//' + markerStep + '//' + tag);
                }
            }
            const good = expressions.filter(xp => exact(xp, control)).sort((a,b) => a.length-b.length);
            if (good.length) return { label:caption(marker), locator:good[0], evidence };
            const fallback = pathFor(control);
            return fallback ? {label:caption(marker), locator:fallback, evidence:evidence + '; stable scoped fallback'} : null;
        };
        const identify = control => {
            const label = associatedLabel(control);
            if (label) {
                const marker = markerInLabel(label, control);
                if (marker) {
                    const found = relation(control, marker, label.contains(control) ? label : control.parentElement,
                        label.getAttribute('for') ? 'Associated label' : 'Text inside wrapping label');
                    if (found) return found;
                }
            }
            const original = snapshot.map.get(control);
            const root = original.getRootNode();
            const labelledBy = (control.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
            if (labelledBy.length) {
                const referenced = labelledBy.map(id => Array.from(root.querySelectorAll('[id]')).find(n => n.id === id)).filter(Boolean);
                const name = clean(referenced.map(n => n.textContent).join(' '));
                if (name) return {label:name, locator:pathFor(control), evidence:'aria-labelledby association'};
            }
            if (control.getAttribute('aria-label')) return {label:clean(control.getAttribute('aria-label')), locator:pathFor(control), evidence:'Accessible label'};
            for (let p = control.parentElement, depth = 0; p && snapshot.map.has(p) && depth < 7; p = p.parentElement, depth++) {
                const localControls = Array.from(p.querySelectorAll('input,select,textarea,[role="combobox"]:not(input):not(select),.oxd-select-text-input')).filter(n=>editable(n)||n.matches('[role="combobox"],.oxd-select-text-input'));
                if (localControls.length !== 1) continue;
                const markers = Array.from(p.querySelectorAll('label,legend,h1,h2,h3,h4,h5,h6,span,strong,div,p'))
                    .filter(n => !n.contains(control) && !control.contains(n) && caption(n) && caption(n).length <= 120 && !n.closest('button') && !n.querySelector('input,select,textarea,button') && !n.matches('.field-validation-error,.field-validation-valid,[data-valmsg-for],.required'));
                for (const marker of markers) {
                    const found = relation(control, marker, p, 'Nearest single-control container text');
                    if (found) return found;
                }
            }
            const placeholder = clean(control.getAttribute('placeholder'));
            if (placeholder) {
                const xp = '//' + control.tagName.toLowerCase() + '[@placeholder=' + literal(control.getAttribute('placeholder')) + ']';
                return {label:placeholder, locator:exact(xp, control) ? xp : pathFor(control), evidence:'Placeholder fallback (no textual label)'};
            }
            return null;
        };
        const fields = [];
        const handled = new Set();
        const rootIds = new WeakMap(); let rootId = 0;
        const radioGroups = new Map();
        const inferredRadioOwners = new Map();
        for (const c of controls.filter(n => n.getAttribute('type') === 'radio')) {
            const original = snapshot.map.get(c);
            const root = original.form || original.getRootNode();
            if (!rootIds.has(root)) rootIds.set(root, ++rootId);
            let name = c.getAttribute('name');
            let owner=null;
            if(!name) for(let p=c.parentElement;p&&snapshot.map.has(p)&&p.tagName!=='FORM';p=p.parentElement) {
                const radios=Array.from(p.querySelectorAll('input[type="radio"]')).filter(visible);
                const marker=Array.from(p.querySelectorAll('label,legend,[role="heading"]')).find(n=>caption(n)&&!n.querySelector('input')&&!n.hasAttribute('for'));
                if(radios.length>=2 && marker && !p.querySelector('input:not([type="radio"]),select,textarea')) {owner=p;name=caption(marker);break;}
            }
            if(!name)continue;
            if(owner)inferredRadioOwners.set(c,owner);
            if(owner&&!rootIds.has(owner))rootIds.set(owner,++rootId);
            const key = rootIds.get(owner||root) + ':' + name;
            if (!radioGroups.has(key)) radioGroups.set(key, []);
            radioGroups.get(key).push(c);
        }
        for (const group of radioGroups.values()) {
            if (group.length < 2) continue;
            let container = group[0].parentElement;
            while (container && !group.every(n => container.contains(n))) container = container.parentElement;
            container=inferredRadioOwners.get(group[0])||container;
            if (!container || !snapshot.map.has(container)) continue;
            const marker = Array.from(container.querySelectorAll('label,legend,h1,h2,h3,h4,h5,h6,strong'))
                .find(n => caption(n) && !n.getAttribute('for') && !n.querySelector('input,select,textarea') && !n.closest('.gender'));
            const name = marker ? caption(marker) : clean(container.getAttribute('aria-label') || group[0].getAttribute('name'));
            let bases = marker ? localBases(container).map(base => '//' + base + '[.//' + marker.tagName.toLowerCase() + '[' + predicate(marker) + ']]') : [];
            bases = bases.filter(xp => exact(xp, container)).sort((a,b) => a.length-b.length);
            const base = bases[0] || pathFor(container);
            const options = [];
            for (const control of group) {
                const label = associatedLabel(control);
                let option = label ? caption(label) : clean(control.getAttribute('aria-label') || control.getAttribute('value'));
                let candidates = [];
                if (label) {
                    if (label.contains(control)) candidates.push(base + '//label[' + predicate(label) + ']//input');
                    else {
                        candidates.push(base + '//input[following-sibling::label[' + predicate(label) + ']]');
                        candidates.push(base + '//input[preceding-sibling::label[' + predicate(label) + ']]');
                        candidates.push(base + '//input[@id=' + base + '//label[' + predicate(label) + ']/@for]');
                    }
                }
                const xp = candidates.filter(x => exact(x, control)).sort((a,b) => a.length-b.length)[0] || pathFor(control);
                if (!option || !xp || options.some(o => o.label.toLowerCase() === option.toLowerCase())) { options.length = 0; break; }
                options.push({label:option, locator:xp});
            }
            if (base && options.length === group.length) {
                fields.push({key:name,label:name,section:sectionOf(container),kind:'radio',locator:base,options,aliases:[],evidence:marker ? 'Group caption → option label → associated radio' : 'Radio group name → option label'});
                if (!marker && !container.getAttribute('aria-label')) warnings.push('Radio group has no readable group caption; using its name: ' + name);
                group.forEach(n => handled.add(n));
            } else warnings.push('Radio group could not be uniquely associated: ' + name);
        }
        for (const control of controls.filter(n => !handled.has(n) && !n.closest('table,[role="table"],[role="grid"]'))) {
            const identity = identify(control);
            if (!identity?.locator) continue;
            const type = (control.getAttribute('type') || 'text').toLowerCase();
            if (type === 'radio') { warnings.push('Unresolved radio kept as an individual element: ' + identity.label); continue; }
            let groupName='';
            for(let p=control.parentElement;p&&snapshot.map.has(p)&&!p.matches('form,fieldset,body,html');p=p.parentElement) {
                const marker=Array.from(p.children).flatMap(c=>c.matches('label,legend')?[c]:Array.from(c.children).filter(n=>n.matches('label,legend'))).find(n=>caption(n)&&!n.querySelector('input,select,textarea'));
                if(marker&&Array.from(p.querySelectorAll('input,select,textarea')).filter(editable).length>1){groupName=caption(marker);break;}
            }
            const aliases = [];
            const section = sectionOf(control);
            if (section && section !== identity.label) {
                for (let p = control.parentElement; p && snapshot.map.has(p); p = p.parentElement) {
                    if (Array.from(p.querySelectorAll('input,select,textarea')).filter(editable).length !== 1) continue;
                    const heading = Array.from(p.querySelectorAll('h1,h2,h3,h4,h5,h6,strong')).find(n => caption(n) === section);
                    if (heading) { aliases.push(section); break; }
                }
            }
            const autocomplete=control.matches('[aria-autocomplete]') || !!control.closest('.oxd-autocomplete-wrapper,.autocomplete,[data-component="autocomplete"]') || !!control.getAttribute('aria-controls') && control.getAttribute('role')==='combobox';
            const date=type==='date'||!!control.closest('.oxd-date-input,.datepicker,.react-datepicker__input-container,[data-component="datepicker"]');
            const owner=control.closest('.oxd-autocomplete-wrapper,.autocomplete,[data-component="autocomplete"]')||control.parentElement;
            const ownerPath=autocomplete?pathFor(owner):'';
            const popupId=control.getAttribute('aria-controls')||control.getAttribute('aria-owns');
            const optionLocator=popupId?'('+identity.locator+')/ancestor::div[@data-frame][1]//*[@id='+literal(popupId)+']//*[@role="option"]':ownerPath+"//*[@role='option']";
            const groupKey=groupName&&groupName!==identity.label?groupName+' / '+identity.label:identity.label;
            fields.push({key:groupKey,label:identity.label,group:groupName,section,kind:control.tagName === 'SELECT' ? 'select' : type === 'checkbox' ? 'checkbox' : autocomplete?'autocomplete':date?'date':'text',locator:identity.locator,optionLocator:autocomplete?optionLocator:'',readOnly:control.hasAttribute('readonly'),options:[],aliases,evidence:identity.evidence+(autocomplete?'; committed autocomplete selection':date?'; date text adapter':'')});
            handled.add(control);
        }
        // Generic ARIA dropdowns, plus optional DOM adapters for non-ARIA libraries.
        const selectTriggers=nodes.filter(n=>n.matches('[role="combobox"]:not(input):not(select),[aria-haspopup="listbox"]:not(input),.oxd-select-text-input'));
        for(const trigger of selectTriggers) {
            if(!visible(trigger)||handled.has(trigger)||selectTriggers.some(n=>n!==trigger&&n.contains(trigger)))continue;
            const identity=identify(trigger);if(!identity?.locator) {warnings.push('Unlabelled custom choice: '+pathFor(trigger));continue;}
            const owner=trigger.closest('.oxd-select-wrapper')||trigger.parentElement;
            const id=trigger.getAttribute('aria-controls')||trigger.getAttribute('aria-owns');
            const optionLocator=id?'('+identity.locator+')/ancestor::div[@data-frame][1]//*[@id='+literal(id)+']//*[@role="option"]':pathFor(owner)+"//*[@role='option']";
            fields.push({key:identity.label,label:identity.label,section:sectionOf(trigger),kind:'custom-select',locator:identity.locator,optionLocator,aliases:[],options:[],evidence:identity.evidence+'; '+(trigger.matches('.oxd-select-text-input')?'OrangeHRM DOM adapter':'ARIA listbox choice')});
            handled.add(trigger);
        }
        // A blank To label belongs to the adjacent From date group when both share a range row.
        for(const f of fields) {
            const node=query(f.locator)[0]; if(!node||!['From','To'].includes(node.getAttribute('placeholder')))continue;
            let pair=node.closest('.oxd-input-group')?.parentElement;
            for(let depth=0;pair&&depth<3&&(!pair.querySelector('input[placeholder="From"]')||!pair.querySelector('input[placeholder="To"]'));depth++) {pair=pair.parentElement;if(pair?.matches('body,html')){pair=null;break;}}
            if(!pair)continue;
            const from=pair.querySelector('input[placeholder="From"]'),to=pair.querySelector('input[placeholder="To"]');
            const label=Array.from(pair.querySelectorAll('label')).find(n=>caption(n));
            if(from&&to&&label&&(node===from||node===to)){f.group=caption(label);f.kind='date';f.key=f.group+' / '+(node===from?'From':'To');f.label=node===from?'From':'To';}
        }
        const nameCounts = new Map();
        fields.forEach(f => nameCounts.set(f.key.toLowerCase(),(nameCounts.get(f.key.toLowerCase()) || 0)+1));
        const assigned = new Set();
        for (const f of fields) {
            const base = f.key;
            if (nameCounts.get(base.toLowerCase()) > 1) f.key = (f.section || 'Field') + ' / ' + base;
            let key = f.key, number = 2;
            while (assigned.has(key.toLowerCase())) key = f.key + ' (' + number++ + ')';
            if (key !== base) warnings.push('Use qualified field name: ' + key);
            f.key = key; assigned.add(key.toLowerCase());
        }
        const aliases = new Map();
        fields.forEach(f => [f.key,...f.aliases].forEach(k => aliases.set(k.toLowerCase(),(aliases.get(k.toLowerCase()) || 0)+1)));
        fields.forEach(f => f.aliases = f.aliases.filter(a => aliases.get(a.toLowerCase()) === 1 && a.toLowerCase() !== f.key.toLowerCase()));

        const repeaters = [];
        const repeatNodes = new Set();
        const evaluateLocal = (xp, context) => {
            try { const r=doc.evaluate(xp,context,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
                return Array.from({length:r.snapshotLength},(_,i)=>r.snapshotItem(i)); } catch { return []; }
        };
        const cls = name => "contains(concat(' ',normalize-space(@class),' '),"+literal(' '+name+' ')+")";
        const relativeFor = (target,item,items=[item]) => {
            if(target===item) return '.';
            const good=[];
            for(const base of localBases(target)) {
                const xp='.//'+base;
                const matches=evaluateLocal(xp,item);
                if(matches.length===1&&matches[0]===target) good.push(xp);
            }
            // Select the base representation rather than its duplicated hover overlay.
            for(let parent=target.parentElement;parent&&parent!==item;parent=parent.parentElement) {
                for(const base of localBases(parent)) for(const child of localBases(target)) {
                    const xp='.//'+base+'//'+child;
                    const matches=evaluateLocal(xp,item);
                    if(matches.length===1&&matches[0]===target)good.push(xp);
                }
            }
            return good.filter(xp=>items.every(sample=>evaluateLocal(xp,sample).length===1)).sort((a,b)=>locatorRank(a)-locatorRank(b)||a.length-b.length)[0]||'';
        };
        const childrenFor = items => {
            const first=items[0],out=[];
            const add=(name,xp,kind='child')=>{
                if(xp&&items.every(item=>evaluateLocal(xp,item).length===1))out.push({name,locator:xp,kind,evidence:'One matching child in every sampled item'});
            };
            const price=first.querySelector('[data-test="product-price"],[data-testid="price"],.actual-price,.productPrice,.productinfo h2,.card-footer .fw-bold,.card-block h5');
            if(price)add('Price',relativeFor(price,first,items));
            const title=first.querySelector('[data-test="product-name"]')||first.querySelector('.product-title a,.card-title a')||first.querySelector('.card-title,.productinfo p,h2 a,h3 a,h4 a')||first.querySelector('h1,h2,h3,h4,h5,h6,[data-name],p[class*="header"],p[class*="title"],span[class*="title"]')||first.querySelector(':scope > p');
            if(title)add('Name',relativeFor(title,first,items));
            for(const node of first.querySelectorAll('p[class],span[class],[data-field]')) {
                if(node===title||!caption(node)||node.closest('button,a'))continue;
                const field=node.getAttribute('data-field')||Array.from(node.classList).find(c=>/job|location|subtitle|description/i.test(c));
                if(field&&!out.some(c=>c.name===field))add(field,relativeFor(node,first,items));
            }
            add('Image','.//img');
            if(title?.tagName==='A')add('ProductLink',relativeFor(title,first,items),'link');
            else if(first.tagName==='A')add('ProductLink','.','link');
            const actions=Array.from(first.querySelectorAll('button,input[type="button"],a,[role="button"]')).filter(visible);
            const used=new Set(out.map(c=>c.name));
            for(const action of actions) {
                let text=clean(action.getAttribute('aria-label')||action.getAttribute('title')||action.getAttribute('value')||rawText(action));
                const icon=action.querySelector('i');
                const iconActions={'bi-pencil-fill':'Edit','bi-trash':'Delete','bi-eye-fill':'View'};
                const iconName=icon&&Array.from(icon.classList).find(c=>iconActions[c]);
                if(!text&&iconName)text=iconActions[iconName];
                if(!text||text.length>60||action===title||!action.matches('button,input,[role="button"]')&&!action.matches('.btn,.add-to-cart')&&!/^(add to cart|book now|view product|delete|edit|compare)$/i.test(text))continue;
                let name=text.replace(/\b\w/g,c=>c.toUpperCase()).replace(/[^a-zA-Z0-9]/g,'')+'Button';
                if(used.has(name))continue;
                // A caption-relative selector must work for every item, never embed a product ID.
                let xp='.//'+action.tagName.toLowerCase()+'['+(action.getAttribute('aria-label')?'@aria-label='+literal(action.getAttribute('aria-label')):action.getAttribute('value')?'@value='+literal(action.getAttribute('value')):predicate(action))+']';
                if(iconName&&!caption(action))xp='.//button[.//i['+cls(iconName)+']]';
                if(evaluateLocal(xp,first).length!==1)xp=relativeFor(action,first,items);
                if(xp&&items.every(item=>evaluateLocal(xp,item).length===1)){add(name,xp,'action');used.add(name);}
            }
            return out;
        };
        const headerCaption=h=>{
            const direct=Array.from(h.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('');
            return clean(direct)||caption(h);
        };
        const headerPredicate=h=>{
            const direct=Array.from(h.childNodes).filter(n=>n.nodeType===3&&clean(n.nodeValue));
            if(direct.length===1)return 'text()[normalize-space(.)='+literal(clean(direct[0].nodeValue))+']';
            const marker=Array.from(h.querySelectorAll('span,p')).find(n=>caption(n)===headerCaption(h)&&!n.closest('[role="menu"],[role="dropdown"]'));
            return marker?'.//'+marker.tagName.toLowerCase()+'['+predicate(marker)+']':predicate(h);
        };
        for(const table of nodes.filter(n=>n.tagName==='TABLE'||/^(grid|table)$/.test(n.getAttribute('role')||''))) {
            if(!visible(table))continue;
            const native=table.tagName==='TABLE';
            const tableSelector='table,[role="grid"],[role="table"],[role="table"]';
            const rowCandidates=Array.from(table.querySelectorAll('tr,[role="row"]')).filter(r=>r.closest(tableSelector)===table&&!r.closest('thead,tfoot')&&r.querySelector('td,[role="gridcell"],[role="cell"]'));
            const emptyRow=r=>/^(no (?:records|results|data)(?: found| available)?|nothing to display)$/i.test(caption(r)) || !!r.querySelector('[colspan]')&&r.querySelectorAll('td,[role="cell"],[role="gridcell"]').length===1;
            const rows=rowCandidates.filter(r=>!emptyRow(r));
            let base=pathFor(table);if(!base)continue;
            const headerRows=Array.from(table.querySelectorAll('thead tr,[role="row"]')).filter(r=>r.closest(tableSelector)===table&&(r.closest('thead')||r.querySelector('[role="columnheader"]')));
            const headers=headerRows.length===1?Array.from(headerRows[0].children).filter(h=>h.matches('th,td,[role="columnheader"]')):[];
            if(!rows.length&&!headers.length)continue;
            const emptyPred="not(count(*)=1 and *[@colspan]) and not(normalize-space(.)='No Records Found' or normalize-space(.)='No records found' or normalize-space(.)='No Results Found' or normalize-space(.)='No results found' or normalize-space(.)='No data available' or normalize-space(.)='No Data Available' or normalize-space(.)='Nothing to display')";
            const rowLocator=native?'('+base+'/tbody/tr[td] | '+base+'/tr[td])['+emptyPred+']':base+"//*[@role='row'][./*[@role='gridcell' or @role='cell']]["+emptyPred+']';
            if(query(rowLocator).length!==rows.length){warnings.push('Nested or placeholder grid rows require manual scoping: '+base);continue;}
            const children=[],duplicateHeaders=new Set();
            for(const header of headers) {
                const name=headerCaption(header);if(!name||duplicateHeaders.has(name.toLowerCase()))continue;
                if(headers.filter(h=>headerCaption(h).toLowerCase()===name.toLowerCase()).length!==1){warnings.push('Duplicate table header requires review: '+name);continue;}
                duplicateHeaders.add(name.toLowerCase());
                const hp=headerPredicate(header);
                const axis=native?'ancestor::table[1]/thead/tr/*':'ancestor::*[@role="grid" or @role="table"][1]//*[@role="columnheader"]';
                const h=axis+'['+hp+']';
                const cells=native?'./td':'./*[@role="cell" or @role="gridcell"]';
                const xp=cells+'[count('+h+'/preceding-sibling::*)+1][count('+h+')=1]';
                if(rows.every(r=>evaluateLocal(xp,r).length===1))children.push({name,locator:xp,kind:'column',evidence:'Visible/direct header caption → current column index; exact header guard'});
            }
            if(headerRows.length>1||headers.some(h=>h.hasAttribute('colspan')||h.hasAttribute('rowspan'))||rows.some(r=>r.querySelector('[colspan],[rowspan]'))){children.length=0;warnings.push('Merged or multi-level table headers require manual column mapping.');}
            if(rows.length)for(const child of childrenFor(rows))if(child.kind==='action'&&!children.some(c=>c.name===child.name))children.push(child);
            const keyColumns=children.filter(c=>c.kind==='column'&&rows.length>0&&rows.every(r=>caption(evaluateLocal(c.locator,r)[0]))&&new Set(rows.map(r=>caption(evaluateLocal(c.locator,r)[0]))).size===rows.length).map(c=>c.name);
            const matrix=headers.some(h=>/^\d{1,2}\s*(mon|tue|wed|thu|fri|sat|sun)/i.test(headerCaption(h)));
            repeaters.push({name:table.getAttribute('aria-label')||sectionOf(table)||'Table',kind:'table',matrix,keyColumns,tableLocator:base,locator:rowLocator,keyLocator:'',keyNormalize:true,sampleCount:rows.length,evidence:'Header-mapped data rows; '+(rows.length?(keyColumns.length?keyColumns.join(', ')+' unique only in loaded sample':'no individually unique columns; use composite keys'):'empty schema preserved')+(matrix?'; date matrix':''),children});
            rowCandidates.forEach(r=>repeatNodes.add(r));
        }
        const cardGroups=new Map();
        for(const item of nodes.filter(n=>n.matches('[ng-repeat],[data-ng-repeat],[v-for],.product-item,.product-image-wrapper,.room-card,.card,[role="listitem"]'))) {
            if(!visible(item)||item.closest('nav,[role="menu"],.top-menu,table,[role="grid"],[role="table"]')||item.querySelector('.product-item,.product-image-wrapper,.room-card,.card'))continue;
            if(!item.querySelector('img,h1,h2,h3,h4,h5,h6')&&!item.hasAttribute('ng-repeat')&&!item.hasAttribute('v-for'))continue;
            const semanticRoot=item.closest('.product-grid,.product-list,.features_items,.recommended_items,[role="list"],#rooms,#tbodyid');
            let root=semanticRoot||item.parentElement;
            // Bootstrap cards are wrapped in identical grid columns; find their collection root.
            if(!semanticRoot&&root?.parentElement&&root.children.length===1&&root.parentElement.querySelectorAll('.card,.room-card').length>=2)root=root.parentElement;
            if(!root||!snapshot.map.has(root))continue;
            const family=item.classList.contains('product-item')?'product-item':item.classList.contains('product-image-wrapper')?'product-image-wrapper':item.classList.contains('room-card')?'room-card':item.classList.contains('card')?'card':item.hasAttribute('ng-repeat')?'ng-repeat':item.hasAttribute('data-ng-repeat')?'data-ng-repeat':item.getAttribute('role')==='listitem'?'listitem':'v-for';
            if(!cardGroups.has(root))cardGroups.set(root,new Map());
            const groups=cardGroups.get(root);if(!groups.has(family))groups.set(family,[]);groups.get(family).push(item);
        }
        // Infer unfamiliar components from repeated sibling structure and an identity heading.
        // Exclude navigation, forms, tables and wrappers around already-recognised components.
        const knownItems=new Set(Array.from(cardGroups.values()).flatMap(groups=>Array.from(groups.values()).flat()));
        for(const root of nodes) {
            if(root.closest('nav,form,table,footer,header,.footer,.header,[role="grid"],[role="menu"]')||root.children.length<2)continue;
            const siblings=Array.from(root.children).filter(n=>n.matches('div,article,li,section')&&visible(n)&&n.querySelector('h1,h2,h3,h4,h5,h6,p,span')&&(n.querySelector('img,button,a')||n.matches('[role="listitem"]'))&&!n.querySelector('input,select,textarea,form,table')&&!Array.from(knownItems).some(k=>n===k||n.contains(k)||k.contains(n)));
            const schemas=new Map();
            for(const n of siblings) {
                const signature=n.tagName+':'+Array.from(n.children).map(c=>c.tagName).join(',');
                if(!schemas.has(signature))schemas.set(signature,[]);schemas.get(signature).push(n);
            }
            for(const items of schemas.values())if(items.length>=2) {
                const first=items[0],step=classStep(first);
                if(!items.every(n=>n.tagName===first.tagName)||!items.every(n=>evaluateLocal('./'+step,root).includes(n)))continue;
                if(!cardGroups.has(root))cardGroups.set(root,new Map());
                cardGroups.get(root).set('inferred:'+step,items);items.forEach(n=>knownItems.add(n));
            }
        }
        for(const [root,groups] of cardGroups)for(const [family,items] of groups) {
            if(items.length<2||new Set(items.map(n=>n.tagName)).size!==1)continue;
            const first=items[0];
            const step=family.startsWith('inferred:')?family.slice('inferred:'.length):['product-item','product-image-wrapper','room-card','card'].includes(family)?first.tagName.toLowerCase()+'['+cls(family)+']':family==='listitem'?"*[@role='listitem']":first.tagName.toLowerCase()+'[@'+family+']';
            const base=pathFor(root);if(!base)continue;
            const xp=base+'//'+step;
            const all=query(xp);
            if(family.startsWith('inferred:')&&all.length!==items.length)continue;
            // Include hidden carousel copies for schema validation, but match displayed items at runtime.
            if(all.some(n=>n.closest('table,[role="grid"],[role="table"]'))||!items.every(n=>all.includes(n)))continue;
            const children=childrenFor(all);
            const key=children.find(c=>c.name==='Name');
            let keyLocator=key?.locator||'';
            let keyNormalize=true;
            if(keyLocator) {
                const keys=all.map(n=>evaluateLocal(keyLocator,n)[0]);
                keyNormalize=keys.some(n=>rawText(n)!==rawText(n).replace(/\s+/g,' ').trim());
                const values=keys.map(n=>caption(n));
                if(values.some(v=>!v)||new Set(values).size!==values.length){warnings.push('Repeated item names are not unique in '+(sectionOf(root)||family)+'; provide an additional key or narrower scope.');}
            }else warnings.push('No common item-name child validated for '+(sectionOf(root)||family)+'. GetRow remains a text-search fallback.');
            const name=family==='product-item'?'Products':root.querySelector(':scope > h1,:scope > h2,:scope > h3')?caption(root.querySelector(':scope > h1,:scope > h2,:scope > h3')):family==='room-card'?'Rooms':family==='card'?'Products':sectionOf(root)||'Repeated items';
            repeaters.push({name,kind:family==='room-card'?'room':'card',locator:xp,keyLocator,keyNormalize,sampleCount:all.length,evidence:(family.startsWith('inferred:')?'Inferred sibling schema; ':'')+'Common child selectors validated across '+all.length+' loaded items; exact name template',children});
            all.forEach(n=>repeatNodes.add(n));
        }
        const pagers=[];const pagerNames=new Set();
        for(const root of nodes.filter(n=>n.matches('.pagination,.pager,[role="navigation"][aria-label*="pag" i],nav[aria-label*="pag" i]'))) {
            if(!visible(root)||root.closest('.carousel,[data-ride="carousel"]'))continue;
            const base=pathFor(root);if(!base)continue;
            const buttons=Array.from(root.querySelectorAll('a,button,[role="button"]'));
            const identity=n=>clean(n.getAttribute('aria-label')||n.getAttribute('title')||rawText(n));
            const direction=which=>{
                const candidates=buttons.filter(n=>which==='next'?n.querySelector('.bi-chevron-right')||/^(next|next page|›|»|>)$/i.test(identity(n))||n.getAttribute('rel')==='next':n.querySelector('.bi-chevron-left')||/^(previous|prev|previous page|‹|«|<)$/i.test(identity(n))||n.getAttribute('rel')==='prev');
                if(candidates.length===1) {
                    const node=candidates[0];
                    const icon=node.querySelector(which==='next'?'.bi-chevron-right':'.bi-chevron-left');
                    const pred=icon?'.//i['+cls(which==='next'?'bi-chevron-right':'bi-chevron-left')+']':node.getAttribute('aria-label')?'@aria-label='+literal(node.getAttribute('aria-label')):node.getAttribute('rel')?'@rel='+literal(node.getAttribute('rel')):predicate(node);
                    const xp=base+'//'+node.tagName.toLowerCase()+'['+pred+']';
                    return exact(xp,node)?xp:pathFor(node);
                }
                if(candidates.length>1)return '';
                const captionPred=which==='next'?"normalize-space(.)='Next' or normalize-space(.)='Next page'":"normalize-space(.)='Previous' or normalize-space(.)='Prev' or normalize-space(.)='Previous page'";
                warnings.push('Pager '+which+' control absent in this snapshot; boundary locator is inferred and needs checking on another page.');
                return base+"//*[self::a or self::button][@rel='"+(which==='next'?'next':'prev')+"' or @aria-label='"+(which==='next'?'Next':'Previous')+"' or "+captionPred+']';
            };
            const numbered=buttons.filter(n=>/^\d+$/.test(caption(n))||/^Page[- ]\d+$/i.test(identity(n)));
            let pageTemplate='';
            if(numbered.length>=1 && (numbered.length>=2 || Array.from(root.querySelectorAll('.current-page,.active,[aria-current="page"]')).some(n=>/^\d+$/.test(caption(n))))) {
                const tag=numbered[0].tagName.toLowerCase();
                if(numbered.every(n=>n.tagName.toLowerCase()===tag))pageTemplate=base+'//'+tag+'[normalize-space(.)={page}]';
            }
            if(!buttons.length)continue;
            const nextLocator=direction('next'),previousLocator=direction('previous');
            if(!nextLocator&&!previousLocator&&!pageTemplate)continue;
            const candidates=repeaters.filter(r=>query(r.tableLocator||r.locator).some(n=>root.parentElement?.contains(n)));
            let pagerName=root.getAttribute('aria-label')||(candidates.length===1?candidates[0].name:'Pagination');const stem=pagerName;let number=2;while(pagerNames.has(pagerName.toLowerCase()))pagerName=stem+' ('+number+++')';pagerNames.add(pagerName.toLowerCase());
            const current=root.querySelector('[aria-current="page"],.active,.current-page,.oxd-pagination-page-item--page-selected');
            let currentLocator=current?base+'//*['+(current.hasAttribute('aria-current')?'@aria-current="page"':cls(Array.from(current.classList).find(c=>/selected|active|current-page/.test(c))))+']':'';
            if(currentLocator&&query(currentLocator).length!==1){warnings.push('Selected-page state needs review: '+pagerName);currentLocator='';}
            pagers.push({name:pagerName,locator:base,currentLocator,rowLocators:candidates.map(r=>r.locator),nextLocator,previousLocator,pageTemplate,evidence:'Explicit pager region; carousel controls excluded'});
            buttons.forEach(n=>repeatNodes.add(n));
        }
        const menus = [];
        const menuLinks = new Set();
        for (const root of nodes.filter(n => n.matches('nav,[role="menu"],.top-menu,.nav_user_guide_list,.header-links'))) {
            if (!visible(root)) continue;
            const base = pathFor(root); if (!base) continue;
            for (const link of root.querySelectorAll('a,button,[role="menuitem"],li > span[aria-haspopup],li > span.oxd-topbar-body-nav-tab-item')) {
                if (menuLinks.has(link) || !caption(link) || (link.getAttribute('role')==='menuitem' && link.querySelector('a,button'))) continue;
                const ancestors = []; let li = link.parentElement;
                while (li && root.contains(li)) {
                    if (li.tagName === 'LI') {
                        const direct = Array.from(li.children).find(c => c.tagName === 'A' || c.tagName === 'BUTTON' || c.matches('span[aria-haspopup],span.oxd-topbar-body-nav-tab-item'));
                        if (direct && direct !== link) ancestors.unshift(direct);
                    }
                    li = li.parentElement;
                }
                const path = [...ancestors,link];
                const steps = path.map(n => {
                    const local = base + '//' + n.tagName.toLowerCase() + '[' + predicate(n) + ']';
                    return exact(local,n) ? local : pathFor(n);
                });
                if (steps.some(x => !x)) continue;
                menus.push({actions:path.map((n,index)=>index===path.length-1||n.tagName==='SPAN'||n.getAttribute('aria-haspopup')?'click':'hover'),key:caption(link),section:root.getAttribute('aria-label') || sectionOf(root),path:steps,captionPath:path.map(caption).join(' > ')});
                menuLinks.add(link);
            }
        }
        const menuNames = new Map();
        menus.forEach(m => menuNames.set(m.key.toLowerCase(),(menuNames.get(m.key.toLowerCase()) || 0)+1));
        const menuKeys = new Set();
        for (const menu of menus) {
            if (menuNames.get(menu.key.toLowerCase()) > 1) menu.key = (menu.section ? menu.section + ' / ' : '') + menu.captionPath;
            let key = menu.key,i=2; while(menuKeys.has(key.toLowerCase())) key=menu.key+' ('+i+++')';
            menu.key=key; menuKeys.add(key.toLowerCase());
        }
        const elements = [];
        for (const node of nodes.filter(n => n.matches('input,select,textarea,button,a,[role="button"],[role="checkbox"],[role="combobox"],[role="slider"],[role="tab"],[contenteditable="true"]'))) {
            if (handled.has(node) || menuLinks.has(node) || !visible(node) || node.getAttribute('type') === 'hidden') continue;
            if (Array.from(repeatNodes).some(row => row.contains(node))) continue;
            const identity = editable(node) ? identify(node) : null;
            const label = identity?.label || clean(node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('placeholder') || (/^(button|submit|reset)$/.test(node.getAttribute('type') || '') ? node.getAttribute('value') : '') || node.getAttribute('name') || node.getAttribute('id') || rawText(node));
            const xp = identity?.locator || pathFor(node);
            if (!label || !xp) continue;
            const unsupported = /^(combobox|checkbox|slider)$/.test(node.getAttribute('role') || '') || (node.tagName === 'INPUT' && editable(node) && !supportedType(node));
            elements.push({name:label,kind:node.tagName.toLowerCase()+':'+(node.getAttribute('type')||''),locator:xp,evidence:unsupported ? 'Custom/file control: use element property; review interaction' : 'Standalone action or unlabelled control'});
            if (unsupported) warnings.push('Dedicated interaction required: ' + label);
        }
        const sections=[];
        for(const form of nodes.filter(n=>n.tagName==='FORM'&&visible(n))) {
            const name=sectionOf(form.querySelector('input,button')||form)||form.getAttribute('aria-label');
            if(name)sections.push({name,kind:'form',locator:pathFor(form),evidence:'Form owned by nearest section heading'});
        }
        for(const widget of nodes.filter(n=>n.matches('.orangehrm-dashboard-widget,[data-widget],[role="region"],section,article')&&visible(n))) {
            const header=Array.from(widget.children).find(n=>n.matches('.orangehrm-dashboard-widget-header,h1,h2,h3,h4,h5,h6,[role="heading"]'));
            const marker=header?.matches('h1,h2,h3,h4,h5,h6,[role="heading"]')?header:header?.querySelector('p,h1,h2,h3,h4,h5,h6');
            if(!marker||!caption(marker))continue;
            const expressions=localBases(widget).map(b=>'//'+b+'[./'+header.tagName.toLowerCase()+'[.//'+marker.tagName.toLowerCase()+'['+predicate(marker)+']]]');
            const locator=expressions.filter(x=>exact(x,widget)).sort((a,b)=>a.length-b.length)[0]||pathFor(widget);
            const children=[];
            const addMetric=(name,target,relationship='')=>{
                const related=relationship?evaluateLocal(relationship,widget):[];
                const relative=related.length===1&&related[0]===target?relationship:relativeFor(target,widget);
                if(name&&relative&&!children.some(c=>c.name===name||c.locator===relative))children.push({name,locator:relative,kind:'value',evidence:'Read-only metric scoped to its captioned widget'});
            };
            for(const dt of widget.querySelectorAll('dt'))if(dt.nextElementSibling?.tagName==='DD')addMetric(caption(dt),dt.nextElementSibling,'.//dt['+predicate(dt)+']/following-sibling::dd[1]');
            for(const value of widget.querySelectorAll('[data-field],[data-metric]'))addMetric(value.getAttribute('data-field')||value.getAttribute('data-metric'),value);
            const state=widget.querySelector('.orangehrm-attendance-card-state');if(state)addMetric('State',state);
            for(const value of widget.querySelectorAll('.orangehrm-attendance-card-fulltime'))for(let owner=value.parentElement,depth=0;owner&&owner!==widget&&depth<3;owner=owner.parentElement,depth++) {
                const label=Array.from(owner.querySelectorAll('p,span')).find(n=>/^(Today|This Week)$/.test(caption(n))&&!n.contains(value));
                if(label){addMetric(caption(label),value);break;}
            }
            sections.push({name:caption(marker),kind:'widget',locator,children,evidence:'Direct header identifies inner widget; relative metrics validated'});
            if(widget.querySelector('canvas'))warnings.push('Canvas chart data requires an adapter: '+caption(marker));
        }
        const covered=new Set([...handled,...menuLinks]);
        const unresolved=nodes.filter(n=>visible(n)&&n.matches('input,select,textarea,button,[role="combobox"],[role="slider"],[contenteditable="true"],[tabindex="0"]')&&!covered.has(n)&&!Array.from(repeatNodes).some(row=>row.contains(n))&&!elements.some(e=>query(e.locator).includes(n)));
        for(const node of unresolved) {
            const locator=pathFor(node);if(!locator)continue;
            const name=caption(node)||node.getAttribute('aria-label')||node.getAttribute('placeholder')||'Unlabelled '+node.tagName.toLowerCase();
            elements.push({name,kind:'adapter-required',locator,evidence:'Detected visible control has no verified interaction adapter'});
            warnings.push('Interaction review required: '+name);
        }
        const coverage={supportedFields:fields.length,locatorOnly:elements.length,unresolved:unresolved.length,loadedRows:repeaters.reduce((sum,r)=>sum+r.sampleCount,0)};
        const rowNames = new Set();
        for (const row of repeaters) { const base = row.name; let name=base,i=2; while(rowNames.has(name.toLowerCase())) name=base+' ('+i+++')'; row.name=name; rowNames.add(name.toLowerCase()); }
        let inaccessible = 0;
        const countFrames = win => { for(let i=0;i<win.frames.length;i++) { try { void win.frames[i].document.documentElement; countFrames(win.frames[i]); } catch { inaccessible++; } } };
        countFrames(window);
        if (inaccessible) warnings.push(inaccessible + ' cross-origin frame(s) could not be analysed.');
        if (!fields.length && !elements.length && !repeaters.length && !menus.length && !sections.length) warnings.push('No interactive controls detected. Wait for the page to finish rendering, then Reanalyse Page.');
        if(nodes.some(n=>n.matches('[role="dialog"],.modal')&&!visible(n)))warnings.push('Hidden dialogs are outside this snapshot. Open each dialog, then Reanalyse Page to generate its scoped fields.');
        if(nodes.some(n=>n.matches('[role="slider"],.react-datepicker__input-container')))warnings.push('Date pickers and range sliders require a dedicated component interaction; do not assume ordinary text entry covers them.');
        return {title:document.title,url:location.href,fields,elements,repeaters,menus,pagers,sections,coverage,warnings:Array.from(new Set(warnings))};
    };
})();
