// Executes the production analyser's scoring, root checks, code generation and
// container generator. XPath fixture queries use Python/lxml, not a browser DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '../JavaScript/locator-inspector.js'), 'utf8');
const context = { window: {}, document: {}, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, XPathResult: { ORDERED_NODE_ITERATOR_TYPE: 5 }, Map, Set };
vm.runInNewContext(source, context);
const inspector = context.window.__seleniumLocatorInspector;
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function fixture(html) {
  const result = spawnSync('python3', [path.join(__dirname, 'locator-xpath-fixture.py'), 'tree'], { input: html, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const roots = {};
  const nodes = [];
  function build(data, parent = null) {
    const attrs = data.attrs;
    const node = { tagName: data.tag.toUpperCase(), nodeType: 1, parentElement: parent,
      attributes: Object.entries(attrs).map(([name,value]) => ({ name,value })),
      getAttribute: name => attrs[name] ?? null, id: attrs.id || '',
      getRootNode: () => roots, closest(selector) {
        for (let n = this; n; n = n.parentElement) {
          if (selector.split(',').some(s => s === n.tagName.toLowerCase() ||
              (s === '[hidden]' && n.getAttribute('hidden') !== null) ||
              /^\[([\w-]+)="([^"]+)"\]$/.test(s) && n.getAttribute(RegExp.$1) === RegExp.$2)) return n;
        }
        return null;
      }, contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; },
      querySelectorAll(selector) { return nodes.filter(n => n !== this && this.contains(n) &&
        (selector === '*' || selector.split(',').includes(n.tagName.toLowerCase()))); }
    };
    nodes.push(node);
    node.classList = (attrs.class || '').split(/\s+/).filter(Boolean);
    node.children = data.children.map(child => build(child, node));
    node.childNodes = [...(data.direct ? [{ nodeType: 3, nodeValue: data.direct }] : []), ...node.children];
    node.textContent = data.text;
    return node;
  }
  const root = build(JSON.parse(result.stdout));
  const queryCache = new Map();
  const query = xpath => {
    if (!queryCache.has(xpath)) {
      const r = spawnSync('python3', [path.join(__dirname, 'locator-xpath-fixture.py'), 'query', xpath], { input: html, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr + '\n' + xpath);
      queryCache.set(xpath, JSON.parse(r.stdout).map(i => nodes[i]));
    }
    return queryCache.get(xpath);
  };
  inspector._analysisSnapshot = { map: new Map(nodes.map(n => [n,n])) };
  inspector.isVisible = () => true;
  return { nodes, root, query };
}
const currentInspector = context.window.__seleniumLocatorInspector;
vm.runInNewContext(source, context);
check(context.window.__seleniumLocatorInspector === currentInspector, 'reinjection preserves the current version and its state');
let cleaned = 0;
const upgradeContext = {...context, window: { __seleniumLocatorInspector: {stop: () => cleaned++, stopRectangleSelection: () => cleaned++} }};
vm.runInNewContext(source, upgradeContext);
check(cleaned === 2 && upgradeContext.window.__seleniumLocatorInspector.version === 24, 'upgrades stale inspector and cleans old listeners');
const html = `<html><body><section><h2>Billing</h2><div class="field"><div class="price">$123.45</div><label for="billing">Email address</label><input id="billing" type="text"/></div></section><section><h2>Shipping</h2><div class="field"><label for="shipping">Email address</label><input id="shipping" type="text"/></div></section></body></html>`;
const f = fixture(html);
const target = f.nodes.find(n => n.id === 'billing');
const candidates = [];
inspector.addMeaningfulRelationships(target, (category,type,value,score,rationale,evidence) => candidates.push({category,type,value,score,rationale,...evidence}), f.query);
check(candidates.length > 0, 'generates meaningful relationships');
check(candidates.every(c => f.query(c.value).length === 1 && f.query(c.value)[0] === target), 'generated relationships uniquely select the intended target');
check(!candidates.some(c => c.value.includes('$123')), 'rejects price as an identity marker');
check(candidates.some(c => c.category === 'Section and field relationship' && c.value.includes('Billing') && c.value.includes('Email address')), 'adds section only to disambiguate repeated fields');
check(inspector.textIdentity(f.nodes.find(n => n.tagName === 'LABEL'), target).associated, 'explicit label relationship recognised');
const label = f.nodes.find(n => n.tagName === 'LABEL');
const previousRoot = label.getRootNode;
label.getRootNode = () => ({ different: true });
check(!inspector.textIdentity(label,target).associated, 'identical IDs in another original root do not establish label association');
label.getRootNode = previousRoot;
const checkbox = fixture(`<html><body><div part="checkbox-container"><div>I have read and agree to the terms.</div><input type="checkbox"/></div></body></html>`);
const box = checkbox.nodes.find(n => n.tagName === 'INPUT');
const checkboxCandidates = [];
inspector.addMeaningfulRelationships(box, (category,type,value) => checkboxCandidates.push(value), checkbox.query);
check(checkboxCandidates.some(v => v.includes("@part='checkbox-container'") && v.includes('I have read and agree') && v.endsWith('//input')), 'custom component with meaningful div text yields reusable relationship');
check(inspector.normalizedTextPredicate('Account name').includes('translate'), 'handles non-breaking spaces in text predicates');
const quoted = fixture(`<html><body><div><div>User's &quot;Legal&quot;\u00a0Name</div><input/></div></body></html>`);
const quotedTarget = quoted.nodes.find(n => n.tagName === 'INPUT');
const quotedCandidates = [];
inspector.addMeaningfulRelationships(quotedTarget, (category,type,value) => quotedCandidates.push(value), quoted.query);
check(quotedCandidates.some(v => v.includes('concat(') && quoted.query(v)[0] === quotedTarget), 'quoted marker and non-breaking spaces resolve using real XPath');
const records = fixture(`<html><body><table><tr><td>Acme Corporation</td><td><button>Edit</button></td></tr><tr><td>Other Company</td><td><button>Edit</button></td></tr></table></body></html>`);
const recordTarget = records.nodes.find(n => n.tagName === 'BUTTON');
const recordCandidates = [];
inspector.addRepeatedItemCandidates(recordTarget, (category,type,value) => recordCandidates.push(value), records.query);
check(recordCandidates.some(v => v.includes('Acme Corporation') && records.query(v)[0] === recordTarget), 'repeated actions identified by record text rather than row position');
const productHtml = `<html><body><ul><li ng-repeat="product in products"><a class="productName">Bose Soundlink Bluetooth Speaker III</a><a class="productPrice">299.99</a><img src="bose.png"/></li><li ng-repeat="product in products"><a class="productName">Other Speaker</a><a class="productPrice">199.99</a><img src="other.png"/></li></ul></body></html>`;
function productCandidates(html, pick) {
  const product = fixture(html);
  const selected = product.nodes.find(pick);
  const out = [];
  inspector.addRepeatedItemCandidates(selected, (category,type,value,score,rationale,evidence) => out.push({category,type,value,score,rationale,...evidence}), product.query);
  return { product, selected, out };
}
const price = productCandidates(productHtml, n => n.getAttribute('class') === 'productPrice');
const priceLocator = price.out.find(c => c.value.includes('@ng-repeat') && c.value.includes('Bose Soundlink Bluetooth Speaker III') && c.value.includes('productPrice'));
check(!!priceLocator, 'repeater presence plus product identity plus price class');
check(price.product.query(priceLocator.containerLocator).length === 1, 'item container is independently unique');
check(!priceLocator.value.includes('299.99'), 'price child does not depend on current amount');
check(price.out.every(c => !c.marker.includes('299.99') && price.product.query(c.value)[0] === price.selected), 'changing prices cannot become product identities');
const image = productCandidates(productHtml, n => n.tagName === 'IMG');
check(image.out.some(c => c.value.includes('@ng-repeat') && c.value.endsWith('//img')), 'image resolved through unique repeated product');
const card = productCandidates(productHtml, n => n.tagName === 'LI');
check(card.out.some(c => c.value.includes('@ng-repeat') && !c.value.endsWith('//li')), 'selecting the repeated card generates the container itself');
const name = productCandidates(productHtml, n => n.getAttribute('class') === 'productName');
check(name.out.some(c => c.containerLocator.includes('@ng-repeat') && c.value.includes('productName')), 'selected product name can also identify its owning repeated card');
const changedPrice = productCandidates(productHtml.replace('299.99','1.00'), n => n.getAttribute('class') === 'productPrice');
check(changedPrice.product.query(priceLocator.value)[0] === changedPrice.selected, 'price locator survives changing amount');
const duplicate = productCandidates(productHtml.replace('Other Speaker','Bose Soundlink Bluetooth Speaker III'), n => n.getAttribute('class') === 'productPrice');
check(duplicate.out.length === 0, 'duplicate product identities are not claimed as unique item locators');
const classChange = productCandidates(productHtml.replace('class="productPrice"','class="productPrice active extra"'), n => (n.getAttribute('class') || '').includes('productPrice'));
check(classChange.product.query(priceLocator.value)[0] === classChange.selected, 'class token survives extra transient classes');
const alternate = productCandidates(productHtml.replaceAll('ng-repeat','data-ng-repeat'), n => n.tagName === 'IMG');
check(alternate.out.some(c => c.value.includes('@data-ng-repeat')), 'recognises alternative repeating-template attributes by presence');
inspector.matchingClones = value => value === 'ambiguous' ? [target, label] : [target];
inspector.isClickable = () => false;
inspector.candidateExecution = () => 'WebDriver';
const snapshot = { map: new Map([[target,target],[label,label]]) };
function candidate(value,category='Direct attributes / text / structure') {
  return inspector.evaluateCandidate({type:'XPATH',value,category}, target,snapshot);
}
const stable = candidate("//input[@data-testid='billing-email']");
const positional = candidate('/html/body/section[1]/div/input');
const mutable = candidate("//input[@value='user@example.com']");
const meaningful = candidate("//div[.//label[normalize-space(.)='Email address']]//input", 'Meaningful container');
const ambiguous = candidate('ambiguous');
check(stable.score > positional.score, 'stable identity outranks structural paths');
check(meaningful.score > mutable.score, 'meaningful relationship outranks mutable field value');
check(!ambiguous.unique && ambiguous.matches === 2 && ambiguous.score <= 49, 'ambiguity explicitly measured and capped');
check(stable.selectedTargetMatched && stable.matches === 1, 'selected identity checked separately from match count');
check(mutable.risk.includes('field value'), 'mutable value risk explained');
inspector.testCandidateResilience = () => {};
const ranked = inspector.rankCandidates([ambiguous,positional,stable], target,snapshot);
check(ranked[0].value === stable.value && ranked[0].recommendation.includes('Best overall'), 'rankings select stable unique recommendation');
const code = inspector.generateRecommendedCode(stable, []);
check(code.includes('By.XPath(') && code.includes(JSON.stringify(stable.value)), 'generated code uses actual recommended expression');
const flatCode = inspector.generateRecommendedCode({...stable,execution:'Flattened resolver'}, []);
check(flatCode.includes('findAllOriginal(arguments[0])') && flatCode.includes('matches.length !== 1'), 'flattened code resolves originals and guards ambiguity');
const frameCode = inspector.generateRecommendedCode({...stable,execution:'Frame-scoped WebDriver'}, ['iframe[name="account"]']);
check(frameCode.includes('SwitchTo().Frame') && frameCode.includes('By.XPath'), 'native frame execution includes frame context');
check(inspector.generateRecommendedCode(null,[]).includes('No unique locator'), 'no silent generated-code fallback on ambiguity');
console.log(`Passed ${checks} locator quality checks (production JS + lxml fixtures).`);
