// NODE_PATH=/path/to/node_modules PAGE_CLASS_FIXTURES=/output node Verification/reusable-components.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const base=fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8');
const analyser=fs.readFileSync(path.join(__dirname,'../JavaScript/page-class-analyser.js'),'utf8');
let checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++};
function analyse(name,html){const w=new JSDOM(html,{url:'https://components.test',runScripts:'outside-only'}).window;
w.HTMLElement.prototype.getBoundingClientRect=()=>({width:100,height:30,left:0,top:0,right:100,bottom:30});w.HTMLElement.prototype.scrollIntoView=()=>{};
w.eval(base);w.eval(analyser);const i=w.__seleniumLocatorInspector;i.isVisible=e=>{for(let p=e;p&&p.nodeType===1;p=p.parentElement)if(p.hidden||p.style.display==='none')return false;return true};
const before=w.document.documentElement.outerHTML,p=i.analysePage();check(before===w.document.documentElement.outerHTML,'analysis read only');
for(const f of p.fields){check(i.findAllOriginal(f.locator).length===1,'unique field '+f.key);for(const o of f.options)check(i.findAllOriginal(o.locator).length===1,'unique radio option');}
for(const r of p.repeaters){check(i.findAllOriginal(r.locator).length===r.sampleCount,'row count');for(const c of r.children)check(!c.locator.includes('translate('),'no translate');}
if(process.env.PAGE_CLASS_FIXTURES){fs.mkdirSync(process.env.PAGE_CLASS_FIXTURES,{recursive:true});fs.writeFileSync(path.join(process.env.PAGE_CLASS_FIXTURES,name+'.json'),JSON.stringify(p,null,2));}
return {w,i,p};}
const group=(label,body)=>`<div class="oxd-input-group"><div><label>${label}</label></div><div>${body}</div></div>`;
let a=analyse('ariaChoices',`<form aria-label="Filters"><label for="role">Role</label><div id="role" role="combobox" aria-label="Role" aria-controls="role-list" tabindex="0">Admin</div><div id="role-list" role="listbox"><div role="option">Admin</div><div role="option">User</div></div><label for="person">Employee</label><input id="person" role="combobox" aria-autocomplete="list" aria-controls="people"><div id="people" role="listbox"><div role="option">Person A</div></div></form>`);
check(a.p.fields.find(f=>f.key==='Role').kind==='custom-select','generic ARIA select');check(a.p.fields.find(f=>f.key==='Employee').kind==='autocomplete','generic ARIA autocomplete');
for(const f of a.p.fields)check(a.i.findAllOriginal(f.optionLocator).length>0,'options own scoped popup');
a=analyse('compoundForms',`<div><h6>Personal Details</h6><form>${group('Employee Full Name','<input name="firstName" placeholder="First Name"><input name="middleName" placeholder="Middle Name"><input name="lastName" placeholder="Last Name">')}${group('Gender','<label><input type="radio" value="1">Male</label><label><input type="radio" value="2">Female</label>')}<button>Save</button></form></div><div><h6>Custom Fields</h6><form>${group('Gender','<label><input type="radio" value="a">A</label><label><input type="radio" value="b">B</label>')}<button>Save</button></form></div>`);
check(a.p.fields.some(f=>f.key==='Employee Full Name / First Name'),'compound first name');check(a.p.fields.filter(f=>f.kind==='radio').length===2,'separate nameless groups');check(a.p.fields.some(f=>f.key==='Personal Details / Gender'),'duplicate group section qualification');
check(a.p.sections.length===2,'forms as sections');check(a.p.elements.filter(e=>e.name==='Save').every(e=>!e.locator.includes('[1]')&&!e.locator.includes('[2]')),'Save has semantic section scope');
a=analyse('dateRange',`<form aria-label="Recruitment"><div class="date-range">${group('Date of Application','<input placeholder="From" class="date-input">')}${group(' ','<input placeholder="To" class="date-input">')}</div><label>Native date<input type="date" name="birth"></label></form>`);
check(a.p.fields.some(f=>f.key==='Date of Application / From'&&f.kind==='date'),'from grouped');check(a.p.fields.some(f=>f.key==='Date of Application / To'&&f.kind==='date'),'blank to grouped');
a=analyse('emptyMatrix','<h2>Timesheet</h2><table><thead><tr><th>Project</th><th>Activity</th><th>28Mon</th><th>29Tue</th></tr></thead><tbody><tr><td colspan="4">No Records Found</td></tr></tbody></table>');
check(a.p.repeaters.length===1&&a.p.repeaters[0].sampleCount===0,'empty schema preserved');check(a.p.repeaters[0].children.length===4,'empty table columns preserved');check(a.p.repeaters[0].matrix,'matrix classified');
const table=(reverse=false)=>`<div role="table" aria-label="Employees"><div role="row"><div role="columnheader">${reverse?'Status':'Id'}<div style="display:none">AscendingDescending</div></div><div role="columnheader">${reverse?'Id':'Status'}</div></div><div role="row"><div role="cell">${reverse?'Enabled':'A'}</div><div role="cell">${reverse?'A':'Enabled'}</div></div><div role="row"><div role="cell">${reverse?'Disabled':'A'}</div><div role="cell">${reverse?'A':'Disabled'}</div></div></div>`;
a=analyse('duplicateKeys',table());let r=a.p.repeaters[0];check(!r.keyColumns.includes('Id'),'duplicate Id not advertised unique');check(r.keyColumns.includes('Status'),'sample uniqueness');
check(r.children.some(c=>c.name==='Id')&&!r.children.some(c=>c.name.includes('Ascending')),'hidden sort excluded');
let id=r.children.find(c=>c.name==='Id').locator;
const local=(w,x,node)=>w.document.evaluate(x,node,null,w.XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
check(local(a.w,id,a.w.document.querySelectorAll('[role="row"]')[1]).textContent==='A','header-derived Id');
let b=analyse('reorderedHeaders',table(true));check(local(b.w,id,b.w.document.querySelectorAll('[role="row"]')[1]).textContent==='A','column reorder keeps key relationship');
check(a.i.highlightRelationship(r.locator,id)===2,'highlight relative column across rows');
check(a.w.document.querySelectorAll('[role="cell"][style]').length===2,'both original cells highlighted');
assert.throws(()=>a.i.highlightRelationship('//does-not-exist','[bad'),undefined,'invalid child locator rejected even with no parents');checks++;
a=analyse('clickMenus',`<nav aria-label="Topbar Menu"><ul><li><span class="oxd-topbar-body-nav-tab-item">User Management</span><ul role="menu"><li role="menuitem"><a>Users</a></li></ul></li></ul></nav>`);
let menu=a.p.menus.find(m=>m.key==='Users');check(menu.path.length===2&&menu.actions.join(',')==='click,click','click parent preserved');
a=analyse('widgetSections','<div class="orangehrm-dashboard-widget"><div class="orangehrm-dashboard-widget"><div class="orangehrm-dashboard-widget-header"><p>Time at Work</p></div><div class="orangehrm-dashboard-widget-body"><p>Today</p></div></div></div><section role="region"><h2>Balance</h2><dl><dt>Total</dt><dd>42</dd></dl></section>');
check(a.p.sections.filter(s=>s.name==='Time at Work').length===1,'inner widget only');check(a.p.sections.some(s=>s.name==='Balance'),'generic region widget');check(a.p.sections.find(s=>s.name==='Balance').children.some(c=>c.name==='Total'),'named readonly metric');
a=analyse('unsupportedCoverage','<div role="slider" aria-label="Volume" tabindex="0"></div><canvas></canvas><label>Read only<input name="ro" readonly></label>');
check(a.p.fields[0].readOnly,'readonly metadata');check(a.p.elements.some(e=>e.name==='Volume'),'unsupported locator retained');
check(a.p.coverage.locatorOnly>=1,'coverage reports locator-only');
console.log(`Passed ${checks} reusable-component and highlighting checks.`);
