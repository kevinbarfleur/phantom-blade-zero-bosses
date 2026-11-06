const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
 const events=[],pending=[],session={active:true,boss:{training:true}},actor={valid:true};let live=session;
 const UE={KismetSystemLibrary:{IsValid:a=>!!a?.valid},GameplayStatics:{GetPlayerCharacter:()=>({})},PBZInteractComponent:{GetInteractComponent:()=>({EndInteract:a=>events.push(['end',a])})}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/inanis.js','utf8'),{exports,Date:{now:()=>10000},setTimeout:fn=>pending.push(fn),require:n=>n==='ue'?UE:{}});
 exports.configure(()=>live,a=>events.push(['selection',a]));return {api:exports,events,pending,session,actor,change:s=>live=s};
}
test('talking to Inanis ends the native interaction before opening selection and debounces held input',()=>{
 const h=harness();h.api.interact(h.actor);h.api.interact(h.actor);assert.equal(h.pending.length,1);assert.equal(h.events.length,0);
 h.pending[0]();assert.deepEqual(h.events.map(e=>e[0]),['end','selection']);assert.equal(h.session.ux.inanisSelections,1);
});
test('leaving training or changing worlds cancels a pending Inanis selection',()=>{
 for(const change of [h=>h.session.boss.training=false,h=>h.change({active:true,boss:{training:true}}),h=>h.actor.valid=false]){
  const h=harness();h.api.interact(h.actor);change(h);h.pending[0]();assert.equal(h.events.length,0);
 }
});
