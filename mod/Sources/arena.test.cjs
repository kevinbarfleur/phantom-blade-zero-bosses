const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const entity=name=>({GetName:()=>name,K2_GetActorLocation:()=>({X:100,Y:0,Z:0}),SetActorHiddenInGame(v){this.bHidden=v;},SetActorEnableCollision(v){this.collision=v;}});
 const bell=entity('NativeBell'),far=entity('OtherAreaBell'),guide=entity('DetachedGuide'),child=entity('BellChild');
 far.K2_GetActorLocation=()=>({X:50000,Y:0,Z:0});bell.BellID='ArenaCheckpoint';bell.ChildActor={ChildActor:child,SetVisibility(v){this.visible=v;}};bell.FXGuideLine_01=guide;
 const fx=()=>({SetVisibility(v){this.visible=v;},Deactivate(){this.stopped=true;}});
 guide.Niagara=fx();bell.NiagaraComponent=fx();bell.WidgetComp=fx();bell.InteractionComp={SetGenerateOverlapEvents(v){this.enabled=v;}};
 const list=[bell,far],UE={Class:{Find:()=>1},Actor:{},NewArray:()=>({Num:()=>list.length,Get:i=>list[i]}),KismetSystemLibrary:{IsValid:x=>!!x},GameplayStatics:{GetAllActorsOfClass(){}}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/arena.js','utf8'),{exports,require:n=>n==='ue'?UE:{$ref:v=>({value:v}),$unref:r=>r.value}});
 const session={active:true,boss:{profile:{arena:{X:0,Y:0,Z:0}}},ux:{}};
 return {api:exports,session,bell,far,guide,child};
}
test('standalone fights hide arena checkpoint, child model, interaction and detached strings without deleting it',()=>{
 const h=harness();h.api.tick({},h.session);
 assert.equal(h.bell.bHidden,true);assert.equal(h.bell.collision,false);assert.equal(h.bell.InteractionComp.enabled,false);
 assert.equal(h.bell.WidgetComp.visible,false);assert.equal(h.bell.NiagaraComponent.stopped,true);
 assert.equal(h.child.bHidden,true);assert.equal(h.guide.bHidden,true);assert.equal(h.guide.Niagara.stopped,true);
 assert.equal(h.far.bHidden,undefined);assert.equal(h.bell.BellID,'ArenaCheckpoint');
 assert.equal(h.session.ux.arenaBellsSuppressed.length,1);
});
test('campaign and sanctuary retain their own bell handling',()=>{
 for(const setup of [s=>s.active=false,s=>s.boss.training=true]){const h=harness();setup(h.session);h.api.tick({},h.session);assert.equal(h.bell.bHidden,undefined);}
});
test('a native refresh cannot leave the arena bell visible after the next sweep',()=>{
 const h=harness();h.api.tick({},h.session);h.bell.bHidden=false;h.guide.bHidden=false;
 h.api.tick({},h.session);assert.equal(h.bell.bHidden,true);assert.equal(h.guide.bHidden,true);
});
test('child enumeration hides a detached model without an inline GetChildActor accessor',()=>{
 const h=harness();h.bell.ChildActor={};
 h.bell.GetAllChildActors=ref=>{ref.value={Num:()=>1,Get:()=>h.child};};
 h.api.tick({},h.session);assert.equal(h.child.bHidden,true);assert.equal(h.session.ux.arenaBellsSuppressed[0].childrenHidden,1);
});
test('a not-yet-created child never interrupts arrival processing',()=>{
 const h=harness();h.bell.ChildActor={};assert.doesNotThrow(()=>h.api.tick({},h.session));assert.equal(h.bell.bHidden,true);
});
