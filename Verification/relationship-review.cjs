// npm install jsdom@26; NODE_PATH=/path/to/node_modules node Verification/relationship-review.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const w=new JSDOM(`<form><label>Email<input name="email"></label><input name="other"></form><div role="listbox"><div role="option">Admin</div><div role="option">User</div></div><div class="card"><span class="price">10</span></div><div class="card"><span class="price">20</span></div><div><span>One</span><span>Two</span></div>`,{runScripts:'outside-only'}).window;
w.CSS={escape:s=>s.replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c)};
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30,left:0,top:0,right:100,bottom:30});
w.eval(fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8'));
const i=w.__seleniumLocatorInspector;
let checks=0;const check=(ok,msg)=>{assert.ok(ok,msg);checks++};
for(const selector of ['//input[','input[',"//input[@name='email'",'.foo:unknown(']){
const r=i.reviewRelationship(selector,null);check(!r.valid&&!!r.error&&!r.css,'invalid syntax is reported, not a zero-match success');}
let r=i.reviewRelationship("//input[@name='email']",null);check(r.valid&&r.count===1,'valid XPath');check(r.css.includes('name='),'stable attribute CSS');
check(i.findAllOriginal(r.css)[0]===w.document.querySelector('[name=email]'),'CSS equivalent original');
r=i.reviewRelationship("//input[@name='missing']",null);check(r.valid&&r.count===0&&!r.css,'zero matches are distinct from syntax errors');
r=i.reviewRelationship('//div[@class="card"]','.//span[@class="price"]');check(r.valid&&r.count===2&&!!r.css,'relative CSS suggestion for each parent');
check(i.reviewRelationship('.card',r.css).count===2,'relative CSS scope works');
check(w.document.querySelectorAll('span.price[style]').length===2,'both original elements highlighted');
r=i.reviewRelationship('//none','span[');check(!r.valid,'invalid CSS is caught with zero parent matches');
r=i.reviewRelationship('//none','.//span[');check(!r.valid,'invalid XPath is caught with zero parent matches');
r=i.reviewRelationship("//span[.='One']",null);check(r.valid&&!r.css,'no false CSS alternative for unique text among same-tag siblings');
const resolver=fs.readFileSync(path.join(__dirname,'../PageClasses/flattened-resolver.js'),'utf8');
const resolve=w.Function(resolver);
const found=resolve('.card', '10', '.price', false, false);
check(found.element===w.document.querySelector('.price'),'exported resolver accepts relative CSS');
check(i.reviewRelationship('input',null).count===2,'multiple CSS matches valid');
check(resolve('[role=option]',null,null,false,true,false,'User').element.textContent==='User','CSS choice options retain exact text filtering');
check(resolve('[role=option]',null,null,true,true,false,'User')===1,'CSS exact option count');
check(!i.reviewRelationship('//text()',null).valid,'non-element targets give a useful error');
console.log(`Passed ${checks} relationship validation/CSS checks.`);
