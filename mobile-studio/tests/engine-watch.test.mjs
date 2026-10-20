import {test} from 'node:test';import assert from 'node:assert/strict';
import {createEngineWatch} from '../engine-watch.mjs';
import {controlStatus} from '../control-status.mjs';
test('persistent outage recovers once and backs off; startup and healthy busy engines are preserved',async()=>{
 let time=0,online=false,state='unresponsive',calls=0,active=false;
 const watch=createEngineWatch({now:()=>time,probe:async()=>online,inspect:async()=>({state}),recover:async()=>{calls++;},active:()=>active});
 await watch();await watch();assert.equal(calls,0);await watch();assert.equal(calls,1);await watch();assert.equal(calls,1);
 time=60001;state='starting';await watch();await watch();await watch();assert.equal(calls,1);
 state='stopped';active=true;await watch();assert.equal(calls,1);active=false;await watch();assert.equal(calls,2);
 time=120002;online=true;state='busy';await watch();await watch();await watch();assert.equal(calls,2);
});
test('concurrent monitor ticks cannot submit duplicate restarts; failed attempts retry after cooldown',async()=>{
 let calls=0,time=0;const watch=createEngineWatch({threshold:1,now:()=>time,probe:async()=>false,inspect:async()=>({state:'stopped'}),recover:async()=>{calls++;throw Error('failed');},active:()=>false});
 await Promise.all([watch(),watch(),watch()]);assert.equal(calls,1);await watch();assert.equal(calls,1);time=60001;await watch();assert.equal(calls,2);
});
test('display uses actual operation records and does not call an unconfirmed stop complete',()=>{
 const value=controlStatus({jobs:[{mode:'memory-clean',state:'blocked',message:'unload failed',created:1}],cancellations:[{requested:1,confirmed:null}],maintenance:[{state:'failed',message:'API offline',created:2}],online:false,usedGB:12,totalGB:24});
 assert.match(value.memory.text,/실패.*12 \/ 24/);assert.match(value.stop.text,/중단 확인 중/);assert.match(value.stop.detail,/확인 불가/);assert.equal(value.restart.state,'failed');assert.equal(value.restart.detail,'API offline');
});
