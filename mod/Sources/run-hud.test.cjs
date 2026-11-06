const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),model=require('./run-model');
function harness(){
 const labels=[],boxes=[],slots=[],borders=[];let now=5000,failFont=false;
 const child=()=>({SetVisibility(v){this.visibility=v;},SetText(t){this.text=t;},SetFont(f){this.font=f;},SetJustification(){},SetShadowOffset(){},SetShadowColorAndOpacity(){},SetColorAndOpacity(){},SetWidthOverride(n){this.width=n;},SetBrushColor(c){this.brushColor=c;},SetPadding(p){this.padding=p;},AddChild(w){this.content=w;w.parent=this;},AddChildToVerticalBox(){},RemoveFromParent(){this.removed=true;if(this.parent)this.parent.content=null;this.parent=null;}});
 const root={AddChildToOverlay(w){boxes.push(w);const s={SetHorizontalAlignment(){},SetVerticalAlignment(){},SetPadding(m){s.margin=m;}};slots.push(s);return s;}},host={WidgetTree:{},IsActivated:()=>true},inactive={WidgetTree:{inactive:true},IsActivated:()=>false};
 const UE={KismetSystemLibrary:{IsValid:w=>!!w&&!w.invalid},Class:{Find:()=>1},UserWidget:class{},NewArray:()=>[],WidgetBlueprintLibrary:{GetAllWidgetsOfClass(c,out){out.value={Num:()=>2,Get:i=>i===0?inactive:host};}},Widget:{Find:(n,tree)=>n==='Overlay_0'&&!tree.inactive?root:null},
 VerticalBox:{StaticClass:()=>1},SizeBox:{StaticClass:()=>2},TextBlock:{StaticClass:()=>3},Border:{StaticClass:()=>4},NewObject(cls){const w=child();if(cls===3)labels.push(w);if(cls===4)borders.push(w);return w;},Font:{Load(){if(failFont)throw Error('font temporarily unavailable');return 1;}},SlateFontInfo:class{},SlateColor:class{},Vector2D:class{},Margin:class{},LinearColor:class{constructor(R,G,B,A){Object.assign(this,{R,G,B,A});}},EHorizontalAlignment:{},EVerticalAlignment:{},ETextJustify:{},ESlateVisibility:{HitTestInvisible:1,Collapsed:2}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/run-hud.js','utf8'),{exports,Date:{now:()=>now},require:n=>({'ue':UE,'cpp':{FText:{FromString:t=>t}},'puerts':{$ref:value=>({value}),$unref:r=>r.value},'./run-model':model}[n])});
 const session={active:true,boss:{},run:model.create({timer:'series',hits66:true},'a')};return {api:exports,UE,session,labels,boxes,slots,borders,set now(v){now=v;},set failFont(v){failFont=v;}};
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
test('a native construction failure removes the partial overlay before a later retry',()=>{
 const h=harness();h.failFont=true;assert.throws(()=>h.api.update(h.session,{}),/font temporarily unavailable/);assert.equal(h.boxes.length,1);assert.equal(h.boxes[0].removed,true);
 h.failFont=false;h.now=7000;h.api.update(h.session,{});assert.equal(h.boxes.length,2);assert.equal(h.boxes.filter(b=>!b.removed).length,1);assert.equal(h.labels[1].text,'00:00.00');h.api.stop();assert(h.boxes.every(b=>b.removed));
});
test('a backwards wall clock does not prevent the HUD from attaching to a replacement world',()=>{
 const h=harness();h.api.update(h.session,{});h.boxes[0].invalid=true;h.now=1000;h.api.update(h.session,{});assert.equal(h.boxes.length,2);assert.equal(h.labels.at(-3).text,'00:00.00');h.api.stop();
});

test('a dark native backdrop preserves HUD width, anchor and fonts without accepting input',()=>{
 const h=harness();h.api.update(h.session,{});const size=h.boxes[0],border=h.borders[0];
 assert.equal(size.width,330);assert.equal(size.content,border);assert.equal(border.parent,size);assert.equal(border.visibility,1);assert.equal(size.visibility,1);
 assert.equal(border.brushColor.A,0.76);assert(border.brushColor.R<0.02);assert.equal(border.padding.Left,14);assert.equal(border.padding.Right,14);assert.equal(border.padding.Top,10);assert.equal(border.padding.Bottom,10);
 assert.equal(h.slots[0].margin.Right,90);assert.equal(h.slots[0].margin.Top,190);assert.deepEqual(h.labels.map(l=>l.font.Size),[18,32,22,16]);assert(h.labels.every(l=>l.visibility===1||l.visibility===2));
 h.session.cinematicActive=true;h.api.update(h.session,{});assert.equal(size.visibility,2);h.api.stop();assert.equal(size.removed,true);assert.equal(border.parent,size,'border stays owned by the removed outer subtree');
});

test('unsupported or failing native border keeps the text HUD and cleans its partial ownership',()=>{
 for(const mode of ['missing-class','missing-method','construction-failure','child-failure']){
  const h=harness(),create=h.UE.NewObject;
  if(mode==='missing-class')delete h.UE.Border;
  else h.UE.NewObject=cls=>{if(cls===4&&mode==='construction-failure')throw Error('unsupported Border wrapper');const w=create(cls);if(cls===4&&mode==='missing-method')delete w.SetBrushColor;if(cls===4&&mode==='child-failure'){const add=w.AddChild;w.AddChild=box=>{add.call(w,box);throw Error('partial native child failure');};}return w;};
  assert.doesNotThrow(()=>h.api.update(h.session,{}),mode);assert.equal(h.labels[1].text,'00:00.00',mode);assert.equal(h.boxes.length,1,mode);assert(!h.borders.includes(h.boxes[0].content),mode);assert(h.borders.every(b=>b.removed),mode);
  h.api.stop();assert.equal(h.boxes[0].removed,true,mode);
 }
});
