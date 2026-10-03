// npm install jsdom@26; NODE_PATH=/path/to/node_modules node Verification/page-class-analysis.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const base=fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8');
const analyser=fs.readFileSync(path.join(__dirname,'../JavaScript/page-class-analyser.js'),'utf8');
let checks=0;
const check=(ok,msg)=>{assert.ok(ok,msg);checks++;};
function analyse(html,setup) {
    const dom=new JSDOM(html,{url:'https://example.test/page',runScripts:'outside-only'});
    const w=dom.window;
    w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:100,height:30,left:0,top:0,right:100,bottom:30}};
    if(setup)setup(w);
    w.eval(base);w.eval(analyser);
    const i=w.__seleniumLocatorInspector;
    i.isVisible=e=>{for(let n=e;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.style.display==='none')return false;}return true};
    const before=w.document.documentElement.outerHTML;
    const page=i.analysePage();
    check(before===w.document.documentElement.outerHTML,'analysis does not modify the live DOM');
    for(const f of page.fields) {
        check(i.findAllOriginal(f.locator).length===1,'field/container locator unique: '+f.key);
        check(!f.locator.includes('translate('),'no translate text functions');
        for(const option of f.options)check(i.findAllOriginal(option.locator).length===1,'radio option unique');
    }
    for(const e of page.elements)check(i.findAllOriginal(e.locator).length===1,'property unique: '+e.name);
    for(const menu of page.menus)for(const step of menu.path)check(i.findAllOriginal(step).length===1,'menu step unique');
    return {page,w,i};
}
const registration=analyse(`<form><div class="registration-page"><fieldset><legend>Your Personal Details</legend><div class="inputs"><label>Gender:</label><div class="gender"><input type="radio" name="Gender" id="gender-male" value="M"><label for="gender-male">Male</label></div><div class="gender"><input type="radio" name="Gender" id="gender-female" value="F"><label for="gender-female">Female</label></div></div><div><label for="FirstName">First name:</label><input id="FirstName" name="FirstName"></div><div><label for="Email">Email:</label><input id="Email"></div></fieldset><fieldset><legend>Your Password</legend><label for="Password">Password:</label><input id="Password" type="password"></fieldset><input type="submit" value="Register" id="register-button"></div></form>`).page;
check(registration.fields.find(f=>f.key==='Gender').kind==='radio','Gender is one radio group');
check(registration.fields.find(f=>f.key==='Gender').options.map(o=>o.label).join(',')==='Male,Female','radio options use associated text');
check(registration.fields.find(f=>f.key==='Gender').options.every(o=>o.locator.includes('Gender:')&&o.locator.includes('label')),'Gender caption and option label form relationship');
check(registration.elements.some(e=>e.name==='Register'),'submit is a property');
check(registration.repeaters.length===0,'form is not a grid');
const admin=analyse(`<form class="login"><h1>Enter details to login</h1><label><input placeholder="User Name" name="userName"></label><label><input placeholder="Password" type="password" name="password"></label><label><div><input type="checkbox" name="rememberMe"><h3>Remember me</h3></div><div>Forget Password?</div></label><label><input type="submit" value="Sign In"></label></form><div><p class="aos-nav-headline">User Guides</p><ul class="nav_user_guide_list"><li><a href="/guide">Before you begin</a></li></ul></div>`).page;
check(admin.fields.find(f=>f.key==='User Name').evidence.includes('Placeholder'),'empty label uses placeholder');
check(admin.fields.find(f=>f.key==='Remember me').kind==='checkbox','heading-associated checkbox recognized');
check(admin.fields.find(f=>f.key==='Remember me').locator.includes("h3[.='Remember me']"),'Remember me uses text inside wrapping label');
check(admin.menus.some(m=>m.key==='Before you begin'),'guide navigation recognised');
const productResult=analyse(`<ul class="top-menu"><li><a href="/computers">Computers</a><ul><li><a href="/accessories">Accessories</a></li></ul></li></ul><div><span>Sort by</span><select id="orderby"><option>Position</option></select></div><div class="block-newsletter"><div class="title"><strong>Newsletter</strong></div><div><span>Sign up for our newsletter:</span><input name="NewsletterEmail"><input type="button" value="Subscribe"></div></div><div class="product-grid"><div class="product-item"><h2 class="product-title"><a>Product A</a></h2><span class="actual-price">10</span><img><input type="button" value="Add to cart"></div><div class="product-item"><h2 class="product-title"><a>Product B</a></h2><span class="actual-price">20</span><img><input type="button" value="Add to cart"></div></div>`);
const products=productResult.page;
check(products.fields.some(f=>f.key==='Sort by'&&f.kind==='select'),'container span identifies dropdown');
check(products.fields.some(f=>f.key==='Newsletter'||f.aliases.includes('Newsletter')),'section heading provides newsletter name/alias');
check(products.repeaters.length===1&&products.repeaters[0].name==='Products','product cards are one repeater');
check(products.repeaters[0].children.some(c=>c.name==='Price'),'relative price property');
check(products.repeaters[0].children.some(c=>c.name==='AddToCartButton'),'relative action property');
check(!products.elements.some(e=>e.name==='Add to cart'),'repeated actions not individual duplicate properties');
check(products.menus.find(m=>m.key==='Accessories').path.length===2,'submenu includes parent hover path');
const duplicates=analyse(`<section><h2>Billing</h2><label for="bill">Email</label><input id="bill"></section><section><h2>Shipping</h2><label for="ship">Email</label><input id="ship"></section><input type="hidden" name="secret" value="hidden-secret">`).page;
check(duplicates.fields.some(f=>f.key==='Billing / Email')&&duplicates.fields.some(f=>f.key==='Shipping / Email'),'duplicate captions qualify by section');
check(!JSON.stringify(duplicates).includes('hidden-secret'),'hidden data excluded');
const firstDiv=analyse(`<input-container><div>User Name</div><input name="user"></input-container><div role="combobox" aria-label="Custom Choice"></div>`).page;
check(firstDiv.fields.some(f=>f.key==='User Name'&&f.locator.includes('div')),'first div text identifies input container');
check(firstDiv.fields.some(f=>f.key==='Custom Choice'&&f.kind==='custom-select'),'ARIA custom choice recognized');
const contexts=analyse(`<label for="shared">Main email</label><input id="shared"><div id="host"></div><iframe></iframe>`,w=>{
 w.document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<label for="shadow">Shadow field</label><input id="shadow">';
 w.document.querySelector('iframe').contentDocument.body.innerHTML='<label for="shared">Frame email</label><input id="shared">';
}).page;
check(contexts.fields.some(f=>f.key==='Shadow field'),'open shadow field included');
check(contexts.fields.some(f=>f.key==='Frame email'),'same-origin frame field included');
const grid=analyse(`<h2>Accounts</h2><table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>Acme</td><td>Open</td></tr><tr><td>Other</td><td>Closed</td></tr></tbody></table>`).page;
check(grid.repeaters.length===1&&grid.repeaters[0].children.length===2,'table headers map row columns');
const resolver=fs.readFileSync(path.join(__dirname,'../PageClasses/flattened-resolver.js'),'utf8');
function resolve(w,locator,search=null,relative=null,count=false){return w.Function(resolver).apply(null,[locator,search,relative,count]);}
const cards=products.repeaters[0];
check(resolve(productResult.w,cards.locator,'Product',null,true)===2,'standalone resolver counts matching repeated cards');
check(resolve(productResult.w,cards.locator,'Product',null,false).error.includes('Expected one'),'ambiguous row query never picks first');
const price=resolve(productResult.w,cards.locator,'Product A',cards.children.find(c=>c.name==='Price').locator);
check(price.element===productResult.w.document.querySelector('.actual-price'),'row child maps to original price element');
check(resolve(productResult.w,cards.locator,'missing')===null,'no-match resolver result');
const contextResult=analyse('<div id="host"></div><iframe></iframe>',w=>{
 w.document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<label>Shadow<input name="shadow"></label>';
 w.document.querySelector('iframe').contentDocument.body.innerHTML='<label>Framed<input name="framed"></label>';
});
const framed=resolve(contextResult.w,contextResult.page.fields.find(f=>f.key==='Framed').locator);
check(framed.frames.length===1&&framed.frames[0]===contextResult.w.document.querySelector('iframe'),'resolver supplies owning frame chain');
const shadow=resolve(contextResult.w,contextResult.page.fields.find(f=>f.key==='Shadow').locator);
check(shadow.element===contextResult.w.document.querySelector('#host').shadowRoot.querySelector('input'),'resolver maps to original shadow control');
const resultDir=process.env.PAGE_CLASS_FIXTURES;
if(resultDir){fs.mkdirSync(resultDir,{recursive:true});for(const [name,p] of Object.entries({registration,admin,products,duplicates,contexts,grid,firstDiv}))fs.writeFileSync(path.join(resultDir,name+'.json'),JSON.stringify(p,null,2));}
console.log(`Passed ${checks} page-class DOM checks (jsdom).`);
