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
      const deduplicated = [billing,save,row,shadow,frame,productPrice,productImage,productCard].every(r =>
        new Set(r.detailedCandidates.map(c => analyser.canonicalLocatorKey(c))).size === r.detailedCandidates.length);
      return {billing,save,row,shadow,frame,productPrice,productImage,productCard,consistent,deduplicated,unchanged:before===document.body.outerHTML};
    });
    assert.ok(result.unchanged, 'clone resilience checks must not modify the live page');
    assert.ok(result.deduplicated, 'analysis outputs no equivalent locator rows');
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
    const scriptResults = await page.evaluate(async () => {
      const panel = document.createElement('div');
      panel.innerHTML = '<input id="script-input" style="width:120px;height:25px"><input id="script-checkbox" type="checkbox"><select id="script-select"><option value="one">One</option><option value="two">Two</option></select><button id="script-click">Click</button>';
      document.body.appendChild(panel);
      const analyser = window.__seleniumLocatorInspector;
      let clicks = 0;
      document.querySelector('#script-click').addEventListener('click', () => clicks++);
      const input = await analyser.executeLocatorJavaScript('#script-input', "return setValue('hello');");
      const tick = await analyser.executeLocatorJavaScript('#script-checkbox', 'return setChecked(true);');
      const untick = await analyser.executeLocatorJavaScript('#script-checkbox', 'return setChecked(false);');
      const select = await analyser.executeLocatorJavaScript('#script-select', "return selectValue('two');");
      const click = await analyser.executeLocatorJavaScript('#script-click', 'element.click();');
      const ambiguous = await analyser.executeLocatorJavaScript('input', 'element.click();');
      const measure = analyser.testLocator('#script-input', -1);
      const simple = analyser.generateLocators(document.querySelector('#script-click'));
      const firstDiv = document.createElement('div'); firstDiv.className='script-text'; firstDiv.textContent='First div text';
      const secondDiv = document.createElement('div'); secondDiv.className='script-text'; secondDiv.textContent='Second div text';
      panel.append(firstDiv,secondDiv);
      const divText = await analyser.executeLocatorJavaScript('.script-text','return getText();');
      const shadowDiv = document.createElement('div'); shadowDiv.id='script-shadow-text';
      shadowDiv.attachShadow({mode:'open'}).innerHTML='<span>Shadow div text</span>'; panel.appendChild(shadowDiv);
      const shadowText = await analyser.executeLocatorJavaScript('#script-shadow-text','return getText();');
      return {input,tick,untick,select,click,clicks,ambiguous,measure,divText,shadowText,
        translated:simple.detailedCandidates.some(c => c.value.includes('translate(')),
        textSimplified:simple.detailedCandidates.some(c => c.value.includes("[.='Click']"))};
    });
    assert.ok(scriptResults.input.success && scriptResults.input.result==='hello');
    assert.ok(scriptResults.tick.result==='true' && scriptResults.untick.result==='false');
    assert.ok(scriptResults.select.result==='two');
    assert.ok(scriptResults.click.success && scriptResults.clicks===1);
    assert.ok(scriptResults.ambiguous.success && scriptResults.ambiguous.count>1);
    assert.ok(scriptResults.divText.success && scriptResults.divText.result==='First div text' && scriptResults.divText.count===2);
    assert.ok(scriptResults.shadowText.success && scriptResults.shadowText.result==='Shadow div text');
    assert.ok(scriptResults.measure.width>0 && scriptResults.measure.height>0);
    assert.ok(!scriptResults.translated && scriptResults.textSimplified);
    const shortestResults = await page.evaluate(() => {
      const field = document.createElement('sec-view');
      field.innerHTML = '<label>Email field is required</label><input name="emailContactUs" type="text">';
      document.body.appendChild(field);
      const analyser = window.__seleniumLocatorInspector;
      const analysed = analyser.generateLocators(field.querySelector('input'));
      const base = "//sec-view[.//label[.='Email field is required']]//input";
      return {base, values:analysed.detailedCandidates.filter(c => c.type==='XPATH' && c.value.startsWith(base)).map(c=>c.value)};
    });
    assert.deepEqual(shortestResults.values, [shortestResults.base]);
    console.log('Passed browser integration fixtures: fields, actions, rows, shadow DOM, frames, clone isolation and recommendation consistency.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
