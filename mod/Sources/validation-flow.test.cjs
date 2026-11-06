const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function harness({mode='flow',hits66=true}={}){
    const context={},calls=[],dependencies=[],player={GetName:()=>'QA_Player'};
    let loading=false,health=20;
    const session={active:true,boss:{id:'BP_Monster_LuanShi',profile:{}},ux:{},run:{phase:'combat'},cinematicActive:false};
    const UE={
        Key:class{constructor(name){this.name=name;}},
        BasicAttributeSet:{StaticClass:()=>'BasicAttributeSet'},EGameplayModOp:{Override:'override'},
        GameplayStatics:{GetPlayerCharacter(c,index){assert.equal(c,context);assert.equal(index,0);return player;}},
        PBZBlueprintFunctionLibrary:{
            MakeAttribute(name,type){assert.equal(type,'BasicAttributeSet');return name;},
            GetAttributeFromCharacter(actor,name){assert.equal(actor,player);assert(['Health','Health_Max'].includes(name));return name==='Health_Max'?100:health;}
        },
        AttributeUtils:{ModifyCharacterAttributeValue(actor,name,operation,value){
            assert.equal(actor,player);assert.equal(operation,'override');calls.push({name,value});if(name==='Health')health=value;
        }}
    };
    const modules={ue:UE,puerts:{},'./qa-config':{mode,testHits66:hits66,ids:['BP_Monster_LuanShi']},'./boss-catalog':[],
        './control-qa':{tick(c,s){assert.equal(c,context);assert.equal(s,session);calls.push({name:'control-qa'});}},
        './cinema':{entryLoadingActive(c,s){assert.equal(c,context);assert.equal(s,session);calls.push({name:'loading-read'});return loading;}}
    };
    const exports={};
    // Do not inject a global `cinema`: production resolves the native bridge
    // through require. An undeclared reference must fail this full tick test.
    vm.runInNewContext(fs.readFileSync(__dirname+'/validation.js','utf8'),{exports,require(name){
        assert(Object.hasOwn(modules,name),'Unexpected dependency: '+name);dependencies.push(name);return modules[name];
    }},{filename:'validation.js'});
    assert.equal(typeof exports.tick,'function');
    const controller={IsInputKeyDown:()=>false},unexpected=()=>assert.fail('Flow health probe must not launch or capture a run');
    return {session,calls,dependencies,get health(){return health;},set health(value){health=value;},set loading(value){loading=value;},
        tick(){exports.tick(context,controller,session,unexpected,{travel:unexpected,showMenu:unexpected});},
        heals(){return calls.filter(call=>call.name==='Health');}
    };
}

test('66-hit QA does not heal behind the owned loading cover; same runtime tick heals after release',()=>{
    const h=harness();h.loading=true;
    assert.doesNotThrow(()=>h.tick());
    assert(h.dependencies.includes('./cinema'),'Native cinema module must actually be resolved');
    assert.equal(h.health,20);assert.equal(h.heals().length,0);
    assert.equal(h.calls.filter(call=>call.name==='Health_Min').length,1);
    h.loading=false;h.tick();assert.equal(h.health,100);assert.equal(h.heals().length,1);
    h.tick();assert.equal(h.heals().length,1,'Healthy hero must not be healed repeatedly');
});

test('66-hit QA keeps real damage visible through the entire cinematic and its following loading cover',()=>{
    const h=harness();h.session.cinematicActive=true;
    h.tick();assert.equal(h.health,20);assert.equal(h.heals().length,0);
    assert(!h.dependencies.includes('./cinema'),'Cinematic guard short-circuits loading lookup');
    h.session.cinematicActive=false;h.loading=true;h.health=10;h.tick();
    assert.equal(h.health,10);assert.equal(h.heals().length,0);
    h.loading=false;h.tick();assert.equal(h.health,100);
});

test('66th-hit failure never resurrects the player or overrides the native death health floor',()=>{
    const h=harness();h.health=100;h.tick();
    h.calls.length=0;h.session.run.phase='failed';h.health=0;
    h.tick();h.tick();
    assert.equal(h.health,0);assert.equal(h.heals().length,0);
    assert.equal(h.calls.filter(call=>call.name==='Health_Min').length,0,'Existing protected pawn must not reacquire a floor after death');
    assert.equal(h.calls.filter(call=>call.name==='loading-read').length,0,'Terminal failure bypasses survival logic');
});

test('public manual mode and flow without the private 66-hit flag cannot heal or protect',()=>{
    for(const settings of [{mode:'manual',hits66:true},{mode:'flow',hits66:false}]){
        const h=harness(settings);h.tick();
        assert.equal(h.health,20);assert.equal(h.heals().length,0);
        assert.equal(h.calls.filter(call=>call.name==='Health_Min').length,0);
        assert(!h.dependencies.includes('./cinema'));
    }
});

test('keyboard-probe observes refuge controls without private gameplay actions even with stale flags',()=>{
    const h=harness({mode:'keyboard-probe',hits66:true});h.session.boss.training=true;
    h.tick();h.tick();
    assert.deepEqual(h.calls,[{name:'control-qa'},{name:'control-qa'}]);
    assert.equal(h.health,20);assert(!h.dependencies.includes('./control-actions'));assert(!h.dependencies.includes('./cinema'));
});
