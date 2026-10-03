// Production analyser/resolver fixtures based on observed public-site structures.
// These are reduced, constructed fixtures, not full captured pages or live Selenium tests.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const base=fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8');
const analyser=fs.readFileSync(path.join(__dirname,'../JavaScript/page-class-analyser.js'),'utf8');
const resolver=fs.readFileSync(path.join(__dirname,'../PageClasses/flattened-resolver.js'),'utf8');
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++};
const fixtures={};
function inspect(name,html){
 const dom=new JSDOM(html,{url:'https://example.test/'+name,runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {width:this.hidden?0:100,height:this.hidden?0:30}};
 w.eval(base);w.eval(analyser);const i=w.__seleniumLocatorInspector;
 i.isVisible=n=>{for(let p=n;p;p=p.parentElement)if(p.hidden||p.style.display==='none')return false;return true};
 const before=w.document.documentElement.outerHTML,page=i.analysePage();
 check(before===w.document.documentElement.outerHTML,name+': analysis is read-only');
 for(const row of page.repeaters){check(i.findAllOriginal(row.locator).length===row.sampleCount,name+': scoped sample count');
  for(const original of i.findAllOriginal(row.locator))for(const child of row.children){const r=i.flattenMultiFrameDOM();check(r.flattenedDoc.evaluate(child.locator,r.findClone(original),null,7,null).snapshotLength===1,name+': common child '+child.name);}}
 fixtures[name]=page;return {page,w,i};
}
function xpathLiteral(value){if(!value.includes("'"))return "'"+value+"'";if(!value.includes('"'))return '"'+value+'"';return 'concat('+value.split("'").map((p,i)=>(i?'"\'", ':'')+"'"+p+"'").join(', ')+')'}
function itemXPath(row,name){return '('+row.locator+')['+row.keyLocator+'['+(row.keyNormalize?'normalize-space(.)':'.')+'='+xpathLiteral(name)+']]'}
function resolve(w,xp,relative=null,count=false){return w.Function(resolver).apply(null,[xp,null,relative,count,true]);}
const shop=inspect('demoWebShop',`<h1>Accessories</h1><div><span>Display</span><select><option>4</option></select></div><div class="product-grid">${['TCP Coaching day','TCP Public Complete'].map((n,i)=>`<div class="item-box"><div class="product-item" data-productid="${100+i}"><div><img></div><h2 class="product-title"><a href="/${i}">${n}</a></h2><span class="actual-price">${10+i}</span><input type="button" value="Add to cart"></div></div>`).join('')}</div><div class="pager"><ul><li><a>1</a></li><li><a>2</a></li><li><a>Next</a></li></ul></div>`);
check(shop.page.repeaters.length===1,'shop: one product family');
check(shop.page.repeaters[0].keyLocator,'shop: exact name key');
check(!JSON.stringify(shop.page.repeaters).includes('100'),'shop: record IDs not embedded');
check(resolve(shop.w,itemXPath(shop.page.repeaters[0],'TCP Coaching day')).element.textContent.includes('TCP Coaching day'),'shop: exact matching card');
check(shop.page.pagers.length===1,'shop: pager detected');
const bank=inspect('xyzBank',`<input placeholder="Search Customer"><table><thead><tr>${['First Name','Last Name','Post Code','Account Number','Delete Customer'].map(n=>'<td><a>'+n+'</a></td>').join('')}</tr></thead><tbody>${[['Harry','Potter','E725JB','1004 1005'],['Harry','Stone','Other','999']].map(r=>'<tr ng-repeat="cust in Customers">'+r.map(v=>'<td>'+v+'</td>').join('')+'<td><button>Delete</button></td></tr>').join('')}</tbody></table>`);
const table=bank.page.repeaters[0];
check(bank.page.repeaters.length===1,'bank: no duplicate ng-repeat/table models');
check(table.children.filter(c=>c.kind==='column').length===5,'bank: td headers detected');
check(table.children.some(c=>c.name==='DeleteButton'),'bank: row action reusable');
const col=name=>table.children.find(c=>c.name===name).locator;
const composite='('+table.locator+')['+col('First Name')+"[normalize-space(.)='Harry'] and "+col('Last Name')+"[normalize-space(.)='Potter']]";
check(resolve(bank.w,composite).element.textContent.includes('Potter'),'bank: composite identity');
const firstRow=bank.w.document.querySelector('tbody tr'),head=bank.w.document.querySelector('thead tr');
for(const row of [head,...bank.w.document.querySelectorAll('tbody tr')])row.insertBefore(row.children[3],row.children[0]);
check(resolve(bank.w,composite,col('Account Number')).element.textContent==='1004 1005','bank: header-based column survives reorder');
head.children[0].textContent='Renamed';
check(resolve(bank.w,composite,col('Account Number'))===null,'bank: missing header never resolves first cell');
const exercise=inspect('automationExercise',`<div class="features_items"><h2>Features Items</h2>${['Blue Top','Men Tshirt'].map(n=>`<div class="product-image-wrapper"><div class="single-products"><div class="productinfo"><img><h2>Rs. 500</h2><p>${n}</p><a class="add-to-cart">Add to cart</a></div><div class="product-overlay"><div><h2>Rs. 500</h2><p>${n}</p><a class="add-to-cart">Add to cart</a></div></div></div><div class="choose"><a>View Product</a></div></div>`).join('')}</div><div class="recommended_items"><h2>Recommended Items</h2>${['Blue Top','Other'].map(n=>`<div class="product-image-wrapper"><div class="productinfo"><img><h2>Rs. 500</h2><p>${n}</p><a class="add-to-cart">Add to cart</a></div></div>`).join('')}</div>`);
check(exercise.page.repeaters.length===2,'exercise: features and recommendations separate');
const featured=exercise.page.repeaters.find(r=>r.name==='Features Items');
check(resolve(exercise.w,itemXPath(featured,'Blue Top'),featured.children.find(c=>c.name==='Price').locator).element.parentElement.className==='productinfo','exercise: price ignores overlay duplicate');
check(featured.children.some(c=>c.name==='AddToCartButton'),'exercise: duplicate action scopes to primary representation');
const tool=inspect('toolshop',`<div class="container">${['Pliers','Long Nose Pliers',`Bob's "Special" Tool`].map((n,i)=>`<a class="card" data-test="product-GENERATED${i}" href="/${i}"><img><button aria-label="Compare" data-test="compare-btn">Compare</button><h5 data-test="product-name"> ${n} </h5><span data-test="product-price">$14</span></a>`).join('')}</div><nav><ul class="pagination"><li class="disabled"><button aria-label="Previous">«</button></li><li class="active"><button aria-label="Page-1">1</button></li><li><button aria-label="Page-2">2</button></li><li><button data-test="pagination-next" aria-label="Next">»</button></li></ul></nav>`);
check(tool.page.repeaters.length===1,'toolshop: a.card collection detected');
check(resolve(tool.w,itemXPath(tool.page.repeaters[0],'Pliers'),null,true)===1,'toolshop: exact key excludes Long Nose Pliers');
check(resolve(tool.w,itemXPath(tool.page.repeaters[0],`Bob's "Special" Tool`),null,true)===1,'toolshop: both quote kinds safely escaped');
check(tool.page.repeaters[0].children.some(c=>c.name==='CompareButton'),'toolshop: Compare is reusable');
check(tool.page.pagers[0].pageTemplate.includes('{page}'),'toolshop: numeric template');
const booking=inspect('restfulBooker',`<section id="rooms"><h2>Our Rooms</h2><div class="row">${['Single','Suite'].map(n=>`<div class="column"><div class="card room-card"><img><h5 class="card-title">${n}</h5><div class="card-footer"><div class="fw-bold">£150 <small>per night</small></div><a class="btn">Book now</a></div></div></div>`).join('')}</div></section><div class="react-datepicker__input-container"><input value="03/10/2026"></div><div role="slider" aria-label="Price"></div>`);
check(booking.page.repeaters[0].kind==='room','booking: room component');
check(booking.page.repeaters[0].children.some(c=>c.name==='BookNowButton'),'booking: parameterized Book now');
check(booking.page.warnings.some(w=>w.includes('Date pickers')),'booking: special interaction warning');
const blaze=inspect('demoblaze',`<nav><div class="carousel"><button>Previous</button><button>Next</button></div></nav><div id="tbodyid">${['Samsung galaxy s6','Nokia lumia 1520'].map(n=>`<div class="column"><div class="card"><a><img></a><div class="card-block"><h4 class="card-title"><a>${n}</a></h4><h5>$360</h5></div></div></div>`).join('')}</div><ul class="pagination"><li><button id="prev2">Previous</button></li><li><button id="next2">Next</button></li></ul><div role="dialog" hidden><h5>Log in</h5><input></div>`);
check(blaze.page.pagers.length===1,'blaze: carousel excluded');
check(blaze.i.findAllOriginal(blaze.page.pagers[0].nextLocator)[0].id==='next2','blaze: actual catalogue Next');
check(blaze.page.warnings.some(w=>w.includes('Hidden dialogs')),'blaze: hidden modal limitation reported');
const sparse=inspect('sparse',`<ul class="pagination"><li><button>1</button></li><li><button>2</button></li></ul>`);
check(sparse.page.pagers.length===1&&sparse.page.repeaters.length===0,'standalone pager without rows');
const merged=inspect('merged',`<table><thead><tr><th colspan="2">Name</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>`);
check(merged.page.repeaters[0].children.filter(c=>c.kind==='column').length===0,'merged table never guesses columns');
const hidden=inspect('hiddenCopy',`<div><div class="card"><h5 class="card-title">A</h5><img></div><div class="card"><h5 class="card-title">B</h5><img></div><div class="card" hidden><h5 class="card-title">A</h5><img></div></div>`);
check(resolve(hidden.w,itemXPath(hidden.page.repeaters[0],'A'),null,true)===1,'runtime filters hidden repeated copies');
const transactions=inspect('applitoolsPattern',`<h6>Recent Transactions</h6><table><thead><tr>${['Status','Date','Description','Category','Amount'].map(n=>'<th>'+n+'</th>').join('')}</tr></thead><tbody><tr><td>Complete</td><td>Today 1:52am</td><td>Starbucks coffee</td><td>Restaurant / Cafe</td><td>+ 1,250 USD</td></tr><tr><td>Pending</td><td>Yesterday 7:45am</td><td>MailChimp Services</td><td>Software</td><td>- 320 USD</td></tr></tbody></table>`);
check(transactions.page.repeaters[0].name==='Recent Transactions','transaction table retains business section name');
check(transactions.page.repeaters[0].children.some(c=>c.name==='Amount'),'transaction header mapping');
const inferred=inspect('inferredInvoices',`<section><h2>Invoices</h2><div><article class="invoice-unit"><h3>INV-001</h3><button>Open</button></article><article class="invoice-unit"><h3>INV-002</h3><button>Open</button></article></div></section>`);
check(inferred.page.repeaters.length===1&&inferred.page.repeaters[0].keyLocator,'unfamiliar repeated sibling structure gets exact key');
check(inferred.page.repeaters[0].evidence.includes('Inferred'),'inference is disclosed');
check(!tool.page.pagers[0].locator.match(/^\/\/ul$/),'meaningful class scope preferred over bare unique tag');
check(tool.page.repeaters[0].keyLocator.includes('product-name'),'stable child test attribute preferred over h5');
check(tool.page.repeaters[0].children.find(c=>c.name==='Price').locator.includes('product-price'),'stable price hook preferred');
const toolItem=itemXPath(tool.page.repeaters[0],'Pliers');
const collection=tool.w.document.querySelector('.container');collection.insertBefore(collection.lastElementChild,collection.firstElementChild);
check(resolve(tool.w,toolItem).element.querySelector('h5').textContent.trim()==='Pliers','item lookup survives reorder');
const escape=resolve(tool.w,toolItem,'//body');
check(escape===null,'relative access cannot escape its matched component');
const boundary=inspect('boundaryPager',`<div class="pager"><ul><li class="current-page"><span>1</span></li><li><a>2</a></li><li><a>Next</a></li></ul></div>`);
check(boundary.page.pagers[0].pageTemplate,'one numbered link plus current span creates template');
check(boundary.page.pagers[0].previousLocator,'previous boundary is inferred explicitly');
check(boundary.page.warnings.some(w=>w.includes('boundary locator')),'unobserved boundary is disclosed');
const navigation=inspect('nativeMenus',`<nav><ul role="menubar"><li role="menuitem"><a href="/">Home</a></li><li role="menuitem"><button>Categories</button></li></ul></nav>`);
check(navigation.page.menus.length===2,'menuitem wrappers do not duplicate native actions');
check(navigation.page.menus.some(m=>m.key==='Categories'),'native menu toggle button included');
check(booking.page.elements.some(e=>e.name==='Price'),'custom slider retained as element property');
const recordHooks=inspect('recordHooks',`<div><article class="invoice-unit"><h3 data-qa="first-title">A</h3><button>Open</button></article><article class="invoice-unit"><h3 data-qa="second-title">B</h3><button>Open</button></article></div>`);
check(recordHooks.page.repeaters[0].keyLocator&&!recordHooks.page.repeaters[0].keyLocator.includes('first-title'),'record-specific hook replaced by common selector');
const dir=process.env.PAGE_CLASS_FIXTURES;if(dir){fs.mkdirSync(dir,{recursive:true});for(const [n,p] of Object.entries(fixtures))fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(p,null,2));}
console.log(`Passed ${checks} component quality checks (constructed jsdom fixtures).`);
