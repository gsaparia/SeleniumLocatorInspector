// Optional integration tests: npm install playwright; npx playwright install chromium
// node Verification/locator-analysis.browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<section><h2>Billing</h2><div class="field"><div class="price">$123.45</div><label for="billing">Email address</label><input id="billing" type="text"></div></section>
      <section><h2>Shipping</h2><div class="field"><label for="shipping">Email address</label><input id="shipping" type="text"></div></section>
      <button data-testid="save-account">Save</button>
      <table><tbody><tr><td>Acme Corporation</td><td><button>Edit</button></td></tr><tr><td>Other Company</td><td><button>Edit</button></td></tr></tbody></table>
      <ul><li ng-repeat="product in products"><a class="productName">Bose Soundlink Bluetooth Speaker III</a><a class="productPrice">299.99</a><img alt="Bose speaker"></li><li ng-repeat="product in products"><a class="productName">Other Speaker</a><a class="productPrice">199.99</a><img alt="Other speaker"></li></ul>
      <div id="shadow-host"></div><iframe name="account" srcdoc="<input data-testid='frame-input'>"></iframe>`);
    await page.waitForFunction(() => document.querySelector('iframe').contentDocument?.querySelector('input'));
    await page.evaluate(() => {
      document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML = '<div part="checkbox-container"><span>I agree to terms.</span><input type="checkbox"></div>';
    });
    await page.addScriptTag({content:source});
    const result = await page.evaluate(() => {
      const analyser = window.__seleniumLocatorInspector;
      const before = document.body.outerHTML;
      const billing = analyser.generateLocators(document.querySelector('#billing'));
      const save = analyser.generateLocators(document.querySelector('[data-testid="save-account"]'));
      const row = analyser.generateLocators(document.querySelector('tr button'));
      const shadow = analyser.generateLocators(document.querySelector('#shadow-host').shadowRoot.querySelector('input'));
      const frame = analyser.generateLocators(document.querySelector('iframe').contentDocument.querySelector('input'));
      const productPrice = analyser.generateLocators(document.querySelector('a.productPrice'));
      const productImage = analyser.generateLocators(document.querySelector('li img'));
      const productCard = analyser.generateLocators(document.querySelector('li'));
      const consistent = [billing,save,row,shadow,frame,productPrice,productImage,productCard].every(r => {
        const best = r.detailedCandidates.find(c => c.recommendation.includes('Best overall'));
        return best && analyser.findAllOriginal(best.value).length === 1 && r.seleniumCode.includes(JSON.stringify(best.value)) &&
          r.css === r.detailedCandidates.find(c => c.unique && c.type === 'CSS')?.value &&
          r.xpath === r.detailedCandidates.find(c => c.unique && c.type === 'XPATH')?.value;
      });
      return {billing,save,row,shadow,frame,productPrice,productImage,productCard,consistent,unchanged:before===document.body.outerHTML};
    });
    assert.ok(result.unchanged, 'clone resilience checks must not modify the live page');
    assert.ok(result.consistent, 'recommendations, main locators and generated code agree');
    assert.ok(result.billing.detailedCandidates.some(c => c.category==='Section and field relationship' && c.value.includes('Billing') && c.value.includes('Email address')));
    assert.ok(!result.billing.detailedCandidates.some(c => c.recommendation && c.value.includes('$123')));
    assert.ok(result.save.detailedCandidates[0].value.includes('data-testid'));
    assert.ok(result.save.detailedCandidates[0].resilience.includes('4/4'));
    assert.ok(result.row.detailedCandidates.some(c => c.category==='Repeated item' && c.value.includes('Acme Corporation')));
    assert.ok(result.shadow.insideShadowDom);
    assert.ok(result.shadow.detailedCandidates[0].execution==='Flattened resolver');
    assert.ok(result.shadow.seleniumCode.includes('findAllOriginal'));
    assert.ok(result.frame.insideIframe && result.frame.framePath.length===1);
    assert.ok(result.frame.detailedCandidates[0].execution==='Frame-scoped WebDriver');
    assert.ok(result.productPrice.detailedCandidates.some(c => c.category==='Repeated item' && c.value.includes('@ng-repeat') && c.value.includes('productPrice') && !c.value.includes('299.99')));
    assert.ok(result.productImage.detailedCandidates.some(c => c.category==='Repeated item' && c.value.includes('@ng-repeat') && c.value.endsWith('//img')));
    assert.ok(result.productCard.detailedCandidates.some(c => c.category==='Repeated item' && c.value===c.containerLocator));
    console.log('Passed browser integration fixtures: fields, actions, rows, shadow DOM, frames, clone isolation and recommendation consistency.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
