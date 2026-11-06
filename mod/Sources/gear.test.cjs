const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function run(missing=false){
 const events=[],dirty={Inventory:{MainWeaponInfos:{Tang:{WeaponLevel:2}},MainWeapons:['Tang']},AbilityNode_RenewalHun:{AbilityNodes:{A:1}}};
 const array=values=>({Num:()=>values.length,Get:i=>values[i]});
 const pack={MainWeapons:array(['NewChoice','Tang']),ShaqiWeapons:array(['EdgeB','EdgeA']),AssemblyAccessory:array(['Ring']),GetCurrentMainWeaponIndex:()=>1,GetCurrentShaqiWeaponIndex:()=>1,PreSaveGame(){events.push('backpack-save');}};
 const save={GetDirtySectionCopy(key,ref){events.push(key);if(missing||!dirty[key])return false;ref.value=dirty[key];return true;}};
 const UE={SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>pack},PBZBackPackSubsystem:{StaticClass:()=>1},JsonObjectWrapper:class{},JSONUtility:{JsonToString(w,ok,str){ok.value=true;str.value=JSON.stringify(w);}}};
 const exports={};vm.runInNewContext(fs.readFileSync(__dirname+'/gear.js','utf8'),{exports,JSON,Error,require:n=>n==='ue'?UE:{$ref:value=>({value}),$unref:r=>r.value}});
 return {api:exports,events,save};
}
test('capture serializes the live backpack before reading gear, without traversing world actors',()=>{
 const h=run(),r=h.api.capture({},h.save,{});assert.equal(h.events[0],'backpack-save');assert.equal(r.Inventory.MainWeapons[0],'NewChoice');assert(r.AbilityNode_RenewalHun);assert(!r.EventPipeline);
});

test('live equipment replaces stale serialized slots while preserving weapon stats',()=>{
 const h=run(),inv=h.api.capture({},h.save,{}).Inventory;
 assert.deepEqual([...inv.MainWeapons],['NewChoice','Tang']);assert.deepEqual([...inv.ShaqiWeapons],['EdgeB','EdgeA']);
 assert.deepEqual([...inv.AccessoryIDs],['Ring']);assert.equal(inv.CurrentMainWeaponID,'Tang');assert.equal(inv.CurrentShaqiWeaponIndex,1);
 assert.equal(inv.MainWeaponInfos.Tang.WeaponLevel,2);
});
test('capture rejects a missing live inventory instead of accepting an old checkpoint',()=>{
 const h=run(true);assert.throws(()=>h.api.capture({},h.save,{}),/missing/);
});
