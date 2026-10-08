const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const source=fs.readFileSync(path.join(__dirname,'../JavaScript/locator-inspector.js'),'utf8');
let checks=0;const check=(ok,msg)=>{assert.ok(ok,msg);checks++;};
function fixture(){
 const doc={};const context={window:{},document:doc,Node:{ELEMENT_NODE:1},Map,WeakMap,Set};vm.runInNewContext(source,context);
 const i=context.window.__seleniumLocatorInspector;i.isVisible=()=>true;
 const element={tagName:'TD',attributes:[],textContent:'Alfreds Futterkiste',parentElement:null,getRootNode:()=>({}),getAttribute:()=>null,
 matches:()=>false,closest:()=>null,getBoundingClientRect:()=>({left:10,right:90,top:10,bottom:50,width:80,height:40}),contains(n){return n===this},ownerDocument:doc};
 doc.defaultView={innerWidth:1000,innerHeight:1000,getComputedStyle:()=>({pointerEvents:'auto'})};
 return {i,doc,element};
}
{
 const {i,doc,element}=fixture(),host={shadowRoot:{elementFromPoint:()=>null},contains:()=>false};doc.elementFromPoint=()=>host;
 check(i.isClickable(element)===false,'null shadow hit terminates and covered cell is not clickable');
 check(i.deepElementFromPoint(10,10)===host,'null fallback returns host');
 host.shadowRoot.elementFromPoint=()=>host;
 check(i.isClickable(element)===false,'host-returning hit terminates');
 check(i.deepElementFromPoint(10,10)===host,'self fallback returns host');
 const second={shadowRoot:{elementFromPoint:()=>host},contains:()=>false};host.shadowRoot.elementFromPoint=()=>second;
 check(i.isClickable(element)===false,'cyclic hit traversal terminates');
 host.shadowRoot.elementFromPoint=()=>{throw Error('hit test unavailable')};
 check(i.isClickable(element)===false,'throwing shadow hit does not fail whole analysis');
 host.shadowRoot={};check(i.isClickable(element)===false,'missing shadow hit API terminates');
 host.shadowRoot.elementFromPoint=()=>element;
 check(i.isClickable(element)===true,'actual nested target remains clickable');
 doc.elementFromPoint=()=>null;check(i.isClickable(element)===false,'empty document hit is not clickable');
}
{
 const {i,element}=fixture();let visibleCalls=0,clickableCalls=0;
 i._analysisVisibilityCache=new WeakMap();i._analysisClickabilityCache=new WeakMap();
 i.isVisible=()=>{visibleCalls++;return true};i.isClickable=()=>{clickableCalls++;return false};
 i.meaningfulText=()=>element.textContent;i.candidateExecution=()=> 'WebDriver';i.matchingClones=()=>[element];
 const snapshot={map:new Map([[element,element]])};
 const candidate=()=>({type:'XPATH',category:'Text',value:"//td[.='Alfreds Futterkiste']"});
 const a=candidate(),b=candidate();i.evaluateCandidate(a,element,snapshot);i.evaluateCandidate(b,element,snapshot);
 check(visibleCalls===1&&clickableCalls===1,'repeated locator matches reuse one visibility and clickability check');
 check(a.visibleMatches===1&&a.clickableMatches===0&&a.selectedTargetMatched,'cached statuses retain correct candidate values');
 const steps=i.evaluateCandidateSteps(candidate(),element,snapshot);
 check(!steps.next().done,'candidate evaluation yields before native status work');steps.return();
}
// Reproduce the old nontermination in a disposable subprocess, with a hard
// timeout so this regression test itself cannot freeze.
if(process.argv[2]){
 const old=fs.readFileSync(process.argv[2],'utf8');
 const child=`const vm=require('vm');let c={window:{},document:{},Node:{ELEMENT_NODE:1},Map,Set};vm.runInNewContext(require('fs').readFileSync(process.argv[1],'utf8'),c);const i=c.window.__seleniumLocatorInspector;i.isVisible=()=>true;const h={shadowRoot:{elementFromPoint:()=>null},contains:()=>false};const e={matches:()=>false,closest:()=>null,getAttribute:()=>null,getBoundingClientRect:()=>({left:1,top:1,right:20,bottom:20,width:19,height:19}),ownerDocument:{defaultView:{innerWidth:100,innerHeight:100,getComputedStyle:()=>({pointerEvents:'auto'})},elementFromPoint:()=>h}};process.stdout.write('entered');i.isClickable(e);`;
 const r=spawnSync(process.execPath,['-e',child,path.resolve(process.argv[2])],{timeout:1500,encoding:'utf8'});
 check(r.stdout==='entered'&&r.error?.code==='ETIMEDOUT','old isClickable reproduces an infinite loop');
}
console.log(`Passed ${checks} shadow hit-test / status-cache checks.`);
