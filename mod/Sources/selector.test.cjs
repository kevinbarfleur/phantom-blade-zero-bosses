const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function delegate(){const handlers=[];return {Clear(){handlers.length=0;},Add(f){handlers.push(f);},Broadcast(...args){for(const f of handlers)f(...args);}};}
function harness(blueprintOnly=false,overrideCatalog=null){
 const catalog=overrideCatalog||[{id:'one',label:'Premier',chapter:{id:1,label:'Premier chapitre'}},{id:'two',label:'Deuxième',chapter:{id:2,label:'Deuxième chapitre'}}];
 const UE={Vector2D:class{},SlateColor:class{},LinearColor:class{constructor(R,G,B,A){Object.assign(this,{R,G,B,A});}},Widget:{Find:()=>null},Class:{Load:()=>1},Object:{},NewArray:()=>Object.assign([],{Add(v){this.push(v);}}),NewObject:()=>({}),ESlateVisibility:{Collapsed:0,HitTestInvisible:1,Hidden:2,SelfHitTestInvisible:3},KismetTextLibrary:{Conv_TextToString:x=>x}};
 const api={};vm.runInNewContext(fs.readFileSync(__dirname+'/selector.js','utf8'),{exports:api,require:n=>n==='ue'?UE:n==='cpp'?{FText:{FromString:x=>x}}:n==='./boss-catalog'?catalog:n==='./boss-label'?require('./boss-label'):{default:{GetTextByID:x=>x}},setTimeout(){}});
 const displayed=[],list={BP_OnItemClicked:delegate(),BP_OnItemSelectionChanged:delegate(),BP_OnItemIsHoveredChanged:delegate(),GetDisplayedEntryWidgets:()=>({Num:()=>displayed.length,Get:i=>displayed[i]}),BP_GetSelectedItem(){return this.selected;},GetIndexForItem(item){return this.items.indexOf(item);},BP_SetListItems(items){this.items=items;},SetSelectedIndex(index){this.selected=this.items[index];this.BP_OnItemSelectionChanged.Broadcast(this.selected,true);},BP_SetSelectedItem(item){this.SetSelectedIndex(this.items.indexOf(item));}};
 class Selector{initListView(){}BP_OnActivated(){}Tick(){}}
 api.patchSelector(Selector);const widget=Object.assign(new Selector(),{codexBossSelector:true,codexInTraining:true,CommonListView_89:list,playSlotHoverSound(){}});widget.initListView();
 class Entry{OnListItemObjectSet(){}DoSelectedAppearance(v){this.highlight=v;}SetIsSelectable(v){this.selectable=v;}SetIsInteractionEnabled(v){this.interactive=v;}SetIsFocusable(v){this.focusable=v;}GetSelected(){return true;}RefreshBottomLine(){}}
 if(blueprintOnly)delete Entry.prototype.DoSelectedAppearance;
 api.patchEntry(Entry);
 function row(index){const entry=new Entry();entry.Image_44={SetDesiredSizeOverride(){},SetVisibility(){},SetRenderOpacity(v){this.opacity=v;}};entry.BellName={SetText(value){this.text=value;},SetAutoWrapText(){},SetVisibility(){},SetRenderOpacity(){},OverrideTextColor(v){this.color=v;},SetOutlineOverrideEnabled(v){this.outline=v;}};entry.OnListItemObjectSet(list.items[index]);displayed.push(entry);return entry;}
 return {api,list,widget,row};
}
test('chapter headers cannot take focus and navigation skips them in either direction',()=>{
 const h=harness(),header=h.row(0);assert.equal(header.focusable,false);assert.equal(header.selectable,false);assert.equal(header.highlight,false);
 h.list.SetSelectedIndex(1);h.list.SetSelectedIndex(2);assert.equal(h.list.selected.codexBossEntry.id,'two');h.list.SetSelectedIndex(2);assert.equal(h.list.selected.codexBossEntry.id,'one');
});
test('native hover or focus cannot retain a second row highlight',()=>{
 const h=harness(),one=h.row(1),two=h.row(3);h.list.SetSelectedIndex(1);assert.equal(one.highlight,true);assert.equal(two.highlight,false);h.list.SetSelectedIndex(3);one.DoSelectedAppearance(true);assert.equal(one.highlight,false);assert.equal(two.highlight,true);
});
test('a recycled chapter row restores focusability and derives selection from its current item',()=>{
 const h=harness(),row=h.row(0);row.OnListItemObjectSet(h.list.items[1]);assert.equal(row.focusable,true);h.list.SetSelectedIndex(1);assert.equal(row.highlight,true);row.OnListItemObjectSet(h.list.items[2]);assert.equal(row.focusable,false);assert.equal(row.highlight,false);
});
test('Blueprint-only appearance needs no JavaScript super and clears every other ink background',()=>{
 const h=harness(true),one=h.row(1),two=h.row(3);h.list.SetSelectedIndex(1);assert.equal(one.Image_44.opacity,1);assert.equal(two.Image_44.opacity,0);assert.equal(one.BellName.color.SpecifiedColor.R,0);
 h.list.SetSelectedIndex(3);one.DoSelectedAppearance(true);assert.equal(one.Image_44.opacity,0);assert.equal(two.Image_44.opacity,1);assert.equal(one.BellName.color.SpecifiedColor.R,1);assert.equal(one.BellName.outline,false);
});

test('native selector shows one combined duo row and omits the deprecated solo',()=>{
 const h=harness(false,[{id:'duo',nameKeys:['Danseuse de jade, titre','Démon de fer, titre']},{id:'old',label:'Ancien solo',available:false,deprecatedAliasOf:'duo'}]);
 assert.equal(h.list.items.length,1);
 const row=h.row(0);assert.equal(row.BellName.text,'DANSEUSE DE JADE & DÉMON DE FER');
 assert.deepEqual(Array.from(h.api.bosses,b=>b.id),['duo']);
});
