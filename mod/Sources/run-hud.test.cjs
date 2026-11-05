const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),model=require('./run-model');
function harness(){
 const labels=[],boxes=[],slots=[];
 const child=()=>({SetVisibility(v){this.visibility=v;},SetText(t){this.text=t;},SetFont(){},SetJustification(){},SetShadowOffset(){},SetShadowColorAndOpacity(){},SetColorAndOpacity(){},SetWidthOverride(){},AddChild(){},AddChildToVerticalBox(){},RemoveFromParent(){this.removed=true;}});
 const root={AddChildToOverlay(w){boxes.push(w);const s={SetHorizontalAlignment(){},SetVerticalAlignment(){},SetPadding(m){s.margin=m;}};slots.push(s);return s;}},host={WidgetTree:{}};
 const UE={KismetSystemLibrary:{IsValid:w=>!!w&&!w.invalid},Class:{Find:()=>1},UserWidget:class{},NewArray:()=>[],WidgetBlueprintLibrary:{GetAllWidgetsOfClass(c,out){out.value={Num:()=>1,Get:()=>host};}},Widget:{Find:n=>n==='Overlay_0'?root:null},
 VerticalBox:{StaticClass:()=>1},SizeBox:{StaticClass:()=>2},TextBlock:{StaticClass:()=>3},NewObject(cls){const w=child();if(cls===3)labels.push(w);return w;},Font:{Load:()=>1},SlateFontInfo:class{},SlateColor:class{},Vector2D:class{},Margin:class{},LinearColor:class{},EHorizontalAlignment:{},EVerticalAlignment:{},ETextJustify:{},ESlateVisibility:{HitTestInvisible:1,Collapsed:2}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/run-hud.js','utf8'),{exports,require:n=>({'ue':UE,'cpp':{FText:{FromString:t=>t}},'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./run-model':model}[n])});
 const session={active:true,boss:{},run:model.create({timer:'series',hits66:true},'a')};return {api:exports,session,labels,boxes,slots};
}
test('the HUD shows cumulative time and the hit budget, with a distinct paused and failed state',()=>{
 const h=harness();h.api.update(h.session,{});assert.equal(h.boxes.length,1);assert.equal(h.labels[0].text,'SÉRIE');assert.equal(h.labels[1].text,'00:00.00');assert.match(h.labels[2].text,/0 \/ 66/);
 h.session.run.totalMs=65432;h.session.run.reason='pause';h.api.update(h.session,{});assert.equal(h.labels[1].text,'01:05.43');assert.equal(h.labels[3].text,'EN PAUSE');
 h.session.run.hits=66;h.session.run.phase='failed';h.api.update(h.session,{});assert.match(h.labels[2].text,/66 \/ 66/);assert.equal(h.labels[3].text,'DÉFI TERMINÉ');h.api.stop();assert.equal(h.boxes[0].removed,true);
});
test('the overlay remains invisible in training and non-interactive movies, but visible during QTE',()=>{
 const h=harness();h.api.update(h.session,{});h.session.cinematicActive=true;h.api.update(h.session,{});assert.equal(h.boxes[0].visibility,2);
 h.session.runInteractiveActive=true;h.api.update(h.session,{});assert.equal(h.boxes[0].visibility,1);h.session.boss.training=true;h.api.update(h.session,{});assert.equal(h.boxes[0].visibility,2);
 h.api.stop();
});
test('an unresolved hit source is visible in the HUD and a disabled timer creates no empty clock',()=>{
 const h=harness();h.session.run.options.timer='off';h.api.update(h.session,{});assert.equal(h.labels[1].visibility,2);h.session.run.invalid=true;h.api.update(h.session,{});assert.equal(h.labels[3].text,'DÉTECTION À VÉRIFIER');h.api.stop();
});
