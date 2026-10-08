const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const w=new JSDOM('<div class="example"><h3>Example</h3><table id="customers"><tbody><tr><th>Company</th><th>Contact</th></tr><tr><td>Alfreds Futterkiste</td><td>Maria Anders</td></tr></tbody></table></div>',{runScripts:'outside-only'}).window;w.CSS={escape:s=>s};
w.eval(fs.readFileSync(require('path').join(__dirname,'../JavaScript/locator-inspector.js'),'utf8'));const i=w.__seleniumLocatorInspector;i.isVisible=()=>true;const td=w.document.querySelector('td');
// The selected table cell is covered by an open shadow host whose root
// returns no deeper hit. v35 spins forever in this case; exercise the real
// production clickability method rather than stubbing it out.
const host=w.document.createElement('div');host.id='shadow-overlay';w.document.body.append(host);
host.attachShadow({mode:'open'}).elementFromPoint=()=>null;
w.document.elementFromPoint=()=>host;
for(const n of w.document.querySelectorAll('*'))n.getBoundingClientRect=()=>({left:10,top:10,right:90,bottom:50,width:80,height:40});
const snapshot=i.flattenMultiFrameDOM(),sync=i.generateLocators(td,0,snapshot);let pulses=0;const timer=w.setInterval(()=>pulses++,0);await i.analyseSelection([td],true);w.clearInterval(timer);
assert.deepEqual(JSON.parse(JSON.stringify(w.__seleniumLocatorResult.rectangleResults[0])),JSON.parse(JSON.stringify(sync)));assert.equal(i._analysisSnapshot,null);assert.equal(i._analysisVisibilityCache,null);assert.equal(i._analysisClickabilityCache,null);assert.equal(sync.clickable,false);assert.equal(i.selectionStatus.phase,'ready');assert.ok(pulses>2);console.log('Full production generator with null shadow hit: sync/cooperative outputs identical; '+sync.candidates.length+' candidates; '+pulses+' timer pulses.');w.close();})().catch(e=>{console.error(e);process.exitCode=1});
