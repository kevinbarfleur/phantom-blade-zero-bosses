const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 let now=3000,skip=0,active=true,playing=false,tagged=false;
 const widget={CanSkip:true,IsActivated:()=>active,IsAnyAnimationPlaying:()=>playing,ActionProgress(v){assert.equal(v,1);skip++;}};
 const pipeline={DialogueWidget:null};
 const UE={Class:{Find:()=>1},GameplayTag:class{},PBZUIManagerSubsystem:{StaticClass:()=>1},EventPipelineManager:{StaticClass:()=>2},KismetSystemLibrary:{IsValid:()=>true},SubsystemBlueprintLibrary:{GetWorldSubsystem:()=>pipeline,GetGameInstanceSubsystem:()=>({GetActivateWidgetByLayer:()=>widget})},GameplayStatics:{GetPlayerCharacter:()=>({})},AbilitySystemBlueprintLibrary:{GetAbilitySystemComponent:()=>({HasMatchingGameplayTag:()=>tagged})}};
 const exports={},session={active:true,completed:true};vm.runInNewContext(fs.readFileSync(__dirname+'/cinema.js','utf8'),{exports,require:n=>n==='ue'?UE:{$ref:value=>({value}),$unref:r=>r.value},Date:{now:()=>now}});
 return {api:exports,UE,session,widget,pipeline,get skip(){return skip;},set active(v){active=v;},set playing(v){playing=v;},set tagged(v){tagged=v;},advance(ms){now+=ms;}};
}
test('cinematics use the native authored skip and respect non-skippable segments and transition animations',()=>{
 const h=harness();h.widget.CanSkip=false;assert(h.api.tick({},h.session));assert.equal(h.skip,0);
 h.widget.CanSkip=true;h.playing=true;h.api.tick({},h.session);assert.equal(h.skip,0);
 h.playing=false;h.api.tick({},h.session);assert.equal(h.skip,1);h.api.tick({},h.session);assert.equal(h.skip,1);
 h.advance(1600);h.api.tick({},h.session);assert.equal(h.skip,2);h.session.active=false;assert.equal(h.api.tick({},h.session),false);
});
test('preparation waits until native cinematic state has fully cleared',()=>{
 const h=harness();h.active=false;h.tagged=true;assert.equal(h.api.tick({},h.session),true);h.tagged=false;assert.equal(h.api.tick({},h.session),false);
});

test('a transparent activated sequence counts as pending without pretending it has already played',()=>{
 const h=harness();h.widget.GetRenderOpacity=()=>0;h.session.completed=false;
 assert.equal(h.api.pending({}),true);assert.equal(h.api.tick({},h.session),false);assert.equal(h.skip,0);
 h.active=false;assert.equal(h.api.pending({}),false);
});
test('only visible dialogue content is advanced through its native skip action',()=>{
 const h=harness();h.active=false;let skipped=0,has=true;
 h.pipeline.DialogueWidget={CanSkip:true,IsA:()=>true,IsActivated:()=>true,IsVisible:()=>true,HasContent:(_,r)=>r.value=has,SkipCurrentLine:()=>skipped++};
 assert.equal(h.api.tick({},h.session),true);assert.equal(skipped,1);h.api.tick({},h.session);assert.equal(skipped,1);
 has=false;assert.equal(h.api.tick({},h.session),false);
});
test('post-victory movies use native flow completion instead of returning to campaign menus',()=>{
 const h=harness();h.active=false;h.session.completed=false;let count=0,visible=true;
 const video={LevelSequencePlayer:{},IsActivated:()=>visible,IsVisible:()=>visible,IsAnyAnimationPlaying:()=>false,'Action Progress_Event':v=>{assert.equal(v,1);count++;visible=false;},'Press Skip':()=>assert.fail('Must not return to campaign menu')};
 h.UE.NewArray=()=>({Num:()=>1,Get:()=>video});h.UE.WidgetBlueprintLibrary={GetAllWidgetsOfClass(){}};
 h.api.tick({},h.session);assert.equal(count,0);
 h.session.completed=true;assert.equal(h.api.tick({},h.session),true);assert.equal(count,1);assert.equal(h.session.cinemaSource,'video');
 assert.equal(h.api.tick({},h.session),false);assert.equal(count,1);
});

test('boss introductions and their dialogue remain visible and keep native player controls',()=>{
 const h=harness();h.session.completed=false;
 assert.equal(h.api.tick({},h.session),true);assert.equal(h.skip,0);
 h.advance(30000);h.api.tick({},h.session);assert.equal(h.skip,0);
});
test('an immediate retry skips only the native skippable introduction',()=>{
 const h=harness();h.session.completed=false;h.session.skipIntroduction=true;
 h.widget.CanSkip=false;h.api.tick({},h.session);assert.equal(h.skip,0);
 h.widget.CanSkip=true;h.api.tick({},h.session);assert.equal(h.skip,1);
});
test('skippable campaign conversation does not interrupt a direct boss entry',()=>{
 const h=harness();h.active=false;h.session.completed=false;h.session.mode='direct-fight';let count=0;
 h.pipeline.DialogueWidget={CanSkip:true,IsA:()=>true,IsActivated:()=>true,IsVisible:()=>true,HasContent:(_,ref)=>ref.value=true,SkipCurrentLine:()=>count++};
 assert.equal(h.api.tick({},h.session),true);assert.equal(count,1);
});

test('the selected standalone intro disables only the timed post-cinema story black screen',()=>{
 const h=harness(),node={BlackAfterFinish:true,BlackDuration:4};
 h.UE.KismetSystemLibrary.GetPathName=x=>x.path;
 Object.assign(h.session,{completed:false,mode:'direct-fight',boss:{profile:{directEntry:{sequences:['/Intro.Intro']}}}});
 h.widget.InLevelSeq={path:'/Intro.Intro'};h.widget['In Level Sequence Node']=node;
 h.api.tick({},h.session);assert.equal(node.BlackAfterFinish,false);assert.equal(node.BlackDuration,4);assert.equal(h.skip,0);assert.equal(h.session.ux.introExitBlackSuppressed,true);
});
test('intro cleanup waits for the native sequence and player lock, then removes its surface once',()=>{
 const h=harness();let native=true,locked=true,playing=true,hidden=0,fades=0;
 h.UE.PBZLevelSequenceManager={StaticClass:()=>3};h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>native});
 h.UE.AbilitySystemBlueprintLibrary.GetAbilitySystemComponent=()=>({HasMatchingGameplayTag:()=>locked});h.UE.GameplayStatics.GetPlayerController=()=>({PlayerCameraManager:{StopCameraFade(){fades++;}}});
 Object.assign(h.session,{completed:false,mode:'direct-fight',boss:{}});h.session.introPresentation={boss:h.session.boss,widget:{SetRenderOpacity:v=>{assert.equal(v,0);hidden++;},InLevelSeqPlayer:{IsPlaying:()=>playing}},started:false,released:false};
 h.api.releaseIntroduction({},h.session);assert.equal(fades,0);native=false;h.api.releaseIntroduction({},h.session);assert.equal(fades,0);locked=false;h.api.releaseIntroduction({},h.session);assert.equal(fades,0);playing=false;
 h.api.releaseIntroduction({},h.session);h.session.introPresentation.widget.IsActivated=()=>true;h.api.releaseIntroduction({},h.session);assert.equal(fades,1);assert.equal(hidden,1);assert.equal(h.session.ux.introPresentationReleased,true);
});
test('a released intro surface restores its opacity while hidden before reuse by later scenes',()=>{
 const h=harness();let opacity=0,active=true,visible=true;
 h.session.introPresentation={released:true,opacity:1,widget:{IsActivated:()=>active,IsVisible:()=>visible,GetRenderOpacity:()=>opacity,SetRenderOpacity:v=>opacity=v}};
 h.api.releaseIntroduction({},h.session);assert.equal(opacity,0);active=false;h.api.releaseIntroduction({},h.session);assert.equal(opacity,0);
 visible=false;h.api.releaseIntroduction({},h.session);assert.equal(opacity,1);assert.equal(h.session.introPresentation.opacityRestored,true);
});
test('post-intro presentation releases its native modal input immediately once real loading ends',()=>{
 const h=harness();let covered=true,active=true,deactivated=0,native=false;
 const loading={TotalTime:0.2,MaxLoadTime:10,IsActivated:()=>active,SetRenderOpacity:()=>assert.fail('opacity does not release native input'),DeactivateWidget(){deactivated++;active=false;}};
 h.UE.PBZTeleportCoverSubsystem={IsAnyTeleportCoverActive:()=>covered};h.UE.PBZLevelSequenceManager={StaticClass:()=>3};
 h.UE.GameplayStatics.GetPlayerController=()=>({PlayerCameraManager:{StopCameraFade(){}}});
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>native});h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:tag=>tag.TagName==='UI.Layer.Menu'?loading:null});h.tagged=false;
 Object.assign(h.session,{completed:false,mode:'direct-fight',boss:{},worldLoadingComplete:false,ux:{directReady:true}});
 h.session.introPresentation={boss:h.session.boss,started:true,released:false,widget:{IsActivated:()=>true,GetRenderOpacity:()=>1,SetRenderOpacity(){}}};
 h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0,'world load not ready');h.session.worldLoadingComplete=true;
 h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0,'native cover still owns the screen');covered=false;h.session.arrivalAnchorPending=true;
 h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0,'arrival still pending');h.session.arrivalAnchorPending=false;
 native=true;h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0,'a subsequent native sequence owns presentation');native=false;
 h.tagged=true;h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0,'player native sequence state still owns input');h.tagged=false;
 h.api.releaseIntroduction({},h.session);assert.equal(deactivated,1);assert.equal(active,false);assert.equal(h.session.ux.introAdditionalLoadingReleased,true);assert.equal(h.session.ux.introAdditionalLoadingTimer,0.2);
 active=true;h.api.releaseIntroduction({},h.session);assert.equal(deactivated,1,'later reuse of the pooled loading widget is not closed');
});

test('a completed intro cannot release an unrelated overlay after its scoped transition window',()=>{
 const h=harness();let deactivated=0;
 h.UE.PBZTeleportCoverSubsystem={IsAnyTeleportCoverActive:()=>false};h.UE.PBZLevelSequenceManager={StaticClass:()=>3};
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>false});h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:()=>({IsActivated:()=>true,DeactivateWidget(){deactivated++;}})});
 Object.assign(h.session,{completed:false,mode:'direct-fight',boss:{},worldLoadingComplete:true,ux:{directReady:true}});
 h.session.introPresentation={boss:h.session.boss,started:true,released:true,releasedAt:0,opacityRestored:true};
 h.api.releaseIntroduction({},h.session);assert.equal(deactivated,0);
});

test('an unstarted, stale or campaign intro can never remove another camera fade',()=>{
 for(const change of [s=>s.mode='campaign',s=>s.active=false,s=>s.completed=true,s=>s.introPresentation.boss={},s=>s.introPresentation.started=false]){
  const h=harness();let fades=0;h.UE.PBZLevelSequenceManager={StaticClass:()=>3};h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>false});h.UE.GameplayStatics.GetPlayerController=()=>({PlayerCameraManager:{StopCameraFade(){fades++;}}});h.tagged=false;
  Object.assign(h.session,{active:true,completed:false,mode:'direct-fight',boss:{}});h.session.introPresentation={boss:h.session.boss,started:true,released:false,widget:{SetRenderOpacity(){}}};change(h.session);h.api.releaseIntroduction({},h.session);assert.equal(fades,0);
 }
});

test('campaign, training, ending and unrelated phase cinematics keep their authored black screens',()=>{
 for(const mode of ['campaign','training','ending','other-sequence']){
  const h=harness(),node={BlackAfterFinish:true,BlackDuration:4};h.UE.KismetSystemLibrary.GetPathName=x=>x.path;
  Object.assign(h.session,{completed:mode==='ending',mode:mode==='campaign'?'campaign':'direct-fight',boss:{training:mode==='training',profile:{directEntry:{sequences:['/Intro.Intro']}}}});
  h.widget.InLevelSeq={path:mode==='other-sequence'?'/Other.Other':'/Intro.Intro'};h.widget['In Level Sequence Node']=node;
  h.api.tick({},h.session);assert.equal(node.BlackAfterFinish,true,mode);
 }
});


test('intro reveal waits for native playback as well as native camera ownership',()=>{
 const h=harness();let playback=false,native=false;h.session.cinemaSource='sequence';
 h.UE.PBZLevelSequenceManager={StaticClass:()=>3};h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>native});h.widget.InLevelSeqPlayer={IsPlaying:()=>playback};
 assert.equal(h.api.introductionReady({},h.session),false);native=true;assert.equal(h.api.introductionReady({},h.session),false);
 playback=true;assert.equal(h.api.introductionReady({},h.session),true);native=false;assert.equal(h.api.introductionReady({},h.session),false);
 h.active=false;assert.equal(h.api.introductionReady({},h.session),false);
});

test('dialogue and native tag-only introductions keep their original presentation ownership',()=>{
 const h=harness();
 for(const source of ['dialogue','player-state']){h.session.cinemaSource=source;assert.equal(h.api.introductionReady({},h.session),true);}
});


function arrivalLoadingHarness(){
 const h=harness();let covered=false,native=false,additionalActive=true,deactivations=0;
 h.UE.PBZTeleportCoverSubsystem={IsAnyTeleportCoverActive:()=>covered};h.UE.PBZLevelSequenceManager={StaticClass:()=>3};
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>native});
 const loading={TotalTime:0.2,MaxLoadTime:10,IsActivated:()=>additionalActive,DeactivateWidget(){additionalActive=false;deactivations++;}};
 h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:tag=>tag.TagName==='UI.Layer.Sequence'?h.widget:loading});h.active=false;
 Object.assign(h.session,{completed:false,mode:'direct-fight',boss:{},worldLoadingComplete:true,ux:{directReady:true},directArrival:{released:true,releasedAt:3000}});
 return {h,loading,get deactivations(){return deactivations;},set covered(v){covered=v;},set native(v){native=v;},set additionalActive(v){additionalActive=v;}};
}

test('ordinary arrival closes its leftover ten-second modal loading overlay before gameplay',()=>{
 const a=arrivalLoadingHarness(),h=a.h;
 h.api.releaseArrivalLoading({},h.session);
 assert.equal(a.deactivations,1);assert.equal(h.session.ux.arrivalAdditionalLoadingReleased,true);assert.equal(h.session.ux.arrivalAdditionalLoadingTimer,0.2);
 a.additionalActive=true;h.api.releaseArrivalLoading({},h.session);assert.equal(a.deactivations,1,'do not close a later reuse of that pooled overlay');
});

test('arrival overlay release respects native streaming, cinematic and loading ownership',()=>{
 for(const change of [a=>a.covered=true,a=>a.native=true,a=>a.h.tagged=true,a=>a.h.active=true,a=>a.h.session.cinematicActive=true,a=>a.h.session.worldLoadingComplete=false,a=>a.h.session.arrivalAnchorPending=true,a=>a.h.session.ux.directReady=false,a=>a.h.session.directArrival.released=false]){
  const a=arrivalLoadingHarness();change(a);a.h.api.releaseArrivalLoading({},a.h.session);assert.equal(a.deactivations,0);
 }
});

test('arrival cleanup is restricted to its direct fight and first two released seconds',()=>{
 for(const change of [a=>a.h.advance(2000),a=>a.h.session.directArrival.releasedAt=undefined,a=>a.h.session.mode='campaign',a=>a.h.session.boss.training=true,a=>a.h.session.completed=true,a=>a.h.session.active=false]){
  const a=arrivalLoadingHarness();change(a);a.h.api.releaseArrivalLoading({},a.h.session);assert.equal(a.deactivations,0);
 }
 const a=arrivalLoadingHarness();a.h.advance(1999);a.h.api.releaseArrivalLoading({},a.h.session);assert.equal(a.deactivations,1);
});


function outgoingIntroHarness(){
 const h=harness();let closed=0,queued=null;
 h.UE.PBZLevelSequenceManager={StaticClass:()=>3};h.UE.PBZTeleportCoverSubsystem={IsAnyTeleportCoverActive:()=>false};
 h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>false});
 const loading={IsActivated:()=>true,DeactivateWidget(){closed++;}};
 h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:tag=>tag.TagName==='UI.Layer.Sequence'?queued:loading});
 Object.assign(h.session,{active:true,completed:false,mode:'direct-fight',worldLoadingComplete:true,boss:{},ux:{directReady:true}});
 const sequence={},node={},widget={IsActivated:()=>true,InLevelSeq:sequence,InLevelSequenceNode:node,InLevelSeqPlayer:{IsPlaying:()=>false}};
 h.session.introPresentation={boss:h.session.boss,widget,node,sequence,released:true,releasedAt:2800,opacityRestored:true};
 return {h,widget,sequence,node,set queued(v){queued=v;},get closed(){return closed;}};
}

test('the stopped outgoing intro widget releases its residual modal overlay without waiting for widget deactivation',()=>{
 const a=outgoingIntroHarness();a.queued=a.widget;a.h.api.releaseIntroduction({},a.h.session);assert.equal(a.closed,1);
});

test('a new pending phase keeps its overlay even if it reuses the outgoing pooled widget or sequence asset',()=>{
 for(const reuse of ['different-widget','different-sequence','different-node','playing']){
  const a=outgoingIntroHarness();
  if(reuse==='different-widget')a.queued={...a.widget};
  else{a.queued=a.widget;if(reuse==='different-sequence')a.widget.InLevelSeq={};if(reuse==='different-node')a.widget.InLevelSequenceNode={};if(reuse==='playing')a.widget.InLevelSeqPlayer.IsPlaying=()=>true;}
  a.h.api.releaseIntroduction({},a.h.session);assert.equal(a.closed,0,reuse);assert.equal(a.h.session.introPresentation.additional,undefined);
 }
});

test('a pending phase preparation can cancel and the scoped intro cleanup retries within two seconds',()=>{
 const a=outgoingIntroHarness();a.queued={...a.widget};a.h.api.releaseIntroduction({},a.h.session);assert.equal(a.closed,0);
 a.queued=null;a.h.advance(500);a.h.api.releaseIntroduction({},a.h.session);assert.equal(a.closed,1);
});


function nativeLoadingContinuationHarness(source){
 const a=outgoingIntroHarness(),h=a.h;let tempActive=true,additionalActive=false,native=false,queued=null,closed=0,replacement=null;
 const temp={IsA:()=>true,IsActivated:()=>tempActive,DeactivateWidget:()=>assert.fail('real native loading must never be deactivated by the mod')};
 const loading={IsActivated:()=>additionalActive,TotalTime:0,MaxLoadTime:10,DeactivateWidget(){additionalActive=false;closed++;}};
 h.UE.Class.Find=p=>p;h.UE.SubsystemBlueprintLibrary.GetWorldSubsystem=()=>({IsInSequence:()=>native});
 h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:(tag,cls)=>tag.TagName==='UI.Layer.Sequence'?queued:cls.includes('WB_TempLoadingScreen')?(replacement||(tempActive?temp:null)):(additionalActive?loading:null)});
 if(source==='arrival')h.session.directArrival={released:true,releasedAt:3000};
 const tick=()=>h.api[source==='arrival'?'releaseArrivalLoading':'releaseIntroduction']({},h.session);
 return {h,tick,temp,get closed(){return closed;},get state(){return source==='arrival'?h.session.directArrival:h.session.introPresentation;},set tempActive(v){tempActive=v;},set additionalActive(v){additionalActive=v;},set native(v){native=v;},set queued(v){queued=v;},set replacement(v){replacement=v;}};
}

test('intro and ordinary arrival follow an exact native loading cover beyond two seconds and close only its optional successor',()=>{
 for(const source of ['intro','arrival']){
  const a=nativeLoadingContinuationHarness(source);a.tick();assert.equal(a.closed,0);assert.equal(a.state.loadingFollowup.widget,a.temp);
  a.h.advance(4500);a.tick();assert.equal(a.closed,0,'native cover remains untouched');
  a.tempActive=false;a.additionalActive=true;a.tick();assert.equal(a.closed,1);assert.equal(a.state.loadingFollowup.finishedAt>0,true);
 }
});

test('native loading successor cleanup tolerates delayed optional activation but expires after native completion',()=>{
 const a=nativeLoadingContinuationHarness('intro');a.tick();a.h.advance(4500);a.tempActive=false;a.tick();assert.equal(a.closed,0);
 a.h.advance(1000);a.additionalActive=true;a.tick();assert.equal(a.closed,1);
 const b=nativeLoadingContinuationHarness('arrival');b.tick();b.h.advance(4500);b.tempActive=false;b.tick();b.h.advance(2000);b.additionalActive=true;b.tick();assert.equal(b.closed,0);
});

test('a different pending phase, replacement cover or elapsed loading bound cancels the exact-cover continuation',()=>{
 for(const reason of ['new-phase','native-phase','native-tag','replacement','timeout']){
  const a=nativeLoadingContinuationHarness('intro');a.tick();a.h.advance(3000);
  if(reason==='new-phase')a.queued={IsActivated:()=>true,InLevelSeq:{},InLevelSequenceNode:{}};
  if(reason==='native-phase')a.native=true;
  if(reason==='native-tag')a.h.tagged=true;
  if(reason==='replacement')a.replacement={IsA:()=>true,IsActivated:()=>true};
  if(reason==='timeout')a.h.advance(90001);
  a.tick();assert.equal(a.state.loadingFollowupCancelled,true,reason);
  a.queued=null;a.replacement=null;a.native=false;a.h.tagged=false;a.tempActive=false;a.additionalActive=true;a.tick();assert.equal(a.closed,0,reason);
 }
});


test('a collected finished native loading widget cannot strand its optional modal successor',()=>{
 const a=nativeLoadingContinuationHarness('intro');a.tick();a.h.advance(4500);a.tempActive=false;a.additionalActive=true;
 const valid=a.h.UE.KismetSystemLibrary.IsValid;a.h.UE.KismetSystemLibrary.IsValid=o=>{if(o===a.temp)throw Error('invalid native wrapper');return valid(o);};
 a.tick();assert.equal(a.closed,1);
});

test('entry loading query reads exact native covers without changing their lifecycle',()=>{
 const a=nativeLoadingContinuationHarness('intro'),h=a.h;
 h.session.boss.profile={directEntry:{}};
 assert.equal(h.api.entryLoadingActive({},h.session),true);
 assert.equal(a.state.loadingFollowup,undefined,'query remains read-only');
 a.tick();h.advance(7000);assert.equal(h.api.entryLoadingActive({},h.session),true);
 a.tempActive=false;assert.equal(h.api.entryLoadingActive({},h.session),false);
 a.additionalActive=true;
 // Add the native type identity to the separate optional loading mock.
 const manager=h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem();
 const lookup=manager.GetActivateWidgetByLayer;
 h.UE.SubsystemBlueprintLibrary.GetGameInstanceSubsystem=()=>({GetActivateWidgetByLayer:(tag,cls)=>{const w=lookup(tag,cls);if(w&&cls.includes('WB_AdditionalLoading'))w.IsA=()=>true;return w;}});
 assert.equal(h.api.entryLoadingActive({},h.session),true,'same-frame optional successor before polling');
 a.tick();assert.equal(h.api.entryLoadingActive({},h.session),false);
});

test('entry loading query excludes unrelated modes, late covers and newly queued phases',()=>{
 for(const change of [a=>a.h.session.active=false,a=>a.h.session.completed=true,a=>a.h.session.boss.training=true,a=>a.h.session.mode='campaign',a=>a.h.session.boss.profile={},a=>a.h.advance(2000),a=>a.queued={IsActivated:()=>true},a=>a.state.loadingFollowupCancelled=true]){
  const a=nativeLoadingContinuationHarness('intro');a.h.session.boss.profile={directEntry:{}};change(a);
  assert.equal(a.h.api.entryLoadingActive({},a.h.session),false);
 }
 const a=nativeLoadingContinuationHarness('arrival');a.h.session.boss.profile={directEntry:{}};a.tick();a.h.advance(7000);
 a.replacement={IsA:()=>true,IsActivated:()=>true};assert.equal(a.h.api.entryLoadingActive({},a.h.session),false,'never adopt a replacement native loading cover');
});

test('entry loading query keeps pre-release covers scoped and ignores menu focus or ordinary QTE',()=>{
 const a=nativeLoadingContinuationHarness('arrival');a.h.session.boss.profile={directEntry:{}};
 a.h.session.introPresentation=null;a.state.released=false;a.state.coverRequested=true;
 assert.equal(a.h.api.entryLoadingActive({},a.h.session),true);
 a.state.coverRequested=false;assert.equal(a.h.api.entryLoadingActive({},a.h.session),false);
 a.state.coverRequested=true;a.tempActive=false;
 assert.equal(a.h.api.entryLoadingActive({},a.h.session),false);
});
