const __nativeRequire=require;
const __cache=Object.create(null);
function __ownRequire(id){
    if(id.startsWith('../Library/'))return __nativeRequire(id.slice(3));
    const local=id.replace(/^\.\//,'').replace(/\.js$/,'');
    if(!Object.prototype.hasOwnProperty.call(__factories,local))return __nativeRequire(id);
    if(__cache[local])return __cache[local].exports;
    const module={exports:{}};__cache[local]=module;
    __factories[local](module,module.exports,__ownRequire);
    return module.exports;
}
const __UE=__nativeRequire('ue');
const __enabled=/(?:^|\s)-CodexBossLab(?:\s|$)/i.test(__UE.KismetSystemLibrary.GetCommandLine());
if(__enabled){
    if(globalThis.__CodexBossesLoader)throw new Error('BOSSES requires a full game restart. Hot reload is not supported.');
    const state=globalThis.__CodexBossesLoader={phase:'preparing',version:'0.6.2',hooks:[]};
    const plan=[
        ['UI/Widget/StartMenu','StartmenuMinXinInterface','patchStartMenu'],
        ['Gameplay/GameModeBuild','GameModeBuildMixinInterface','patchGameMode'],
        ['UI/Widget/DeadMenu','DeadMenuInterface','patchDeathMenu'],
        ['UI/Widget/Character_V1','CharacterUI_V1MixinInterface','patchEquipment'],
        ['UI/Widget/Confirmation','ConfirmationInterface','patchConfirmation'],
        ['UI/Widget/LoadGame','LoadGameInterface','patchSelector'],
        ['UI/ListViewEntry/LoadGameSlot','LoadGameEntryInterface','patchEntry'],
        ['Gameplay/BossCombatRecorder','BossCombatRecorder','patchRecorder'],
        ['FlowNode/LootItems','lootItemsMixinInterface','patchLoot'],
        ['UI/Widget/PickupWeapon','PickupWeaponMixinInterface','patchPickup'],
        ['FlowNode/PushPersonnelListNode','pushPersonnelListNodeInterface','patchSettlement'],
        ['UI/Widget/BellMenu','BellMenuMinXinInterface','patchBell'],
        ['Gameplay/TeleportSubsystem','teleportSubsystemInterface','patchTeleport'],
        ['UI/Setting/SettingPanel','SettingPanelMixinInterface','patchSettings'],
    ];
    const runtime=__ownRequire('runtime');
    const resolved=plan.map(([name,type,hook])=>{
        const klass=__nativeRequire(name)[type];
        if(typeof klass!=='function'||!klass.prototype||typeof runtime[hook]!=='function')throw new Error('Native export changed: '+name+' / '+type);
        return {name,klass,hook};
    });
    // The native game mode calls this C++ adapter from JavaScript. Intercept
    // that call without replacing its original game script or validation.
    const adapter=__UE.PBZAchievementAdapter.prototype;
    const listen=adapter.StartListening;
    if(typeof listen!=='function')throw new Error('Native achievement adapter entry unavailable.');
    const guarded=function(...args){
        if(!runtime.isActive())return listen.apply(this,args);
        state.achievementStartsSuppressed=(state.achievementStartsSuppressed||0)+1;
    };
    adapter.StartListening=guarded;
    if(adapter.StartListening!==guarded)throw new Error('Achievement adapter hook refused.');
    state.achievementAdapterGuard=true;
    for(const {name,klass,hook} of resolved){runtime[hook](klass);state.hooks.push(name);}
    state.phase='ready';state.runtime=runtime;
    console.log('[CodexBossLab] loader ready: '+state.hooks.length+' native export hooks; achievement adapter guarded; game files unchanged');
}else console.log('[CodexBossLab] inactive: protected launcher flag absent');
exports.stop=function(){
    if(__enabled)throw new Error('BOSSES requires a full game restart; hot reload refused to preserve native hooks.');
};
