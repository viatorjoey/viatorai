import test from 'node:test';
import assert from 'node:assert/strict';
import {createEdgePull,initEdgeRefresh} from '../public/edge-refresh.js';
test('edge pull refreshes only on release past threshold and allows backing off',()=>{const p=createEdgePull();p.start({x:20,y:100},'top');assert.equal(p.move({x:20,y:170},'top').armed,false);assert.equal(p.move({x:20,y:205},'top').armed,true);assert.equal(p.end(),true);assert.equal(p.end(),false);p.start({x:20,y:300},'bottom');assert.equal(p.move({x:20,y:200},'bottom').armed,true);p.move({x:20,y:280},'bottom');assert.equal(p.end(),false);});
test('normal scroll reaching the bottom requires an additional deliberate pull',()=>{const p=createEdgePull();p.start({x:10,y:500},null);assert.equal(p.move({x:10,y:100},null).armed,false);assert.equal(p.move({x:10,y:80},'bottom').armed,false);assert.equal(p.end(),false);p.start({x:10,y:500},null);p.move({x:10,y:180},'bottom');assert.equal(p.move({x:10,y:70},'bottom').armed,true);assert.equal(p.end(),true);});
test('horizontal gallery gestures and cancelled or interrupted gestures do not refresh',()=>{const p=createEdgePull();p.start({x:0,y:200},'bottom');p.move({x:130,y:190},'bottom');p.move({x:130,y:0},'bottom');assert.equal(p.end(),false);p.start({x:10,y:200},'bottom');p.move({x:10,y:80},'bottom');p.cancel();assert.equal(p.end(),false);});
test('actual touch handlers preserve form inputs, skip dialogs and prevent duplicate refresh',async()=>{
 const handlers={},nodes=[];const make=()=>({hidden:false,dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},append(){},setAttribute(){},remove(){},textContent:''});
 const root={createElement:()=>{const n=make();nodes.push(n);return n;},body:{append(){}},documentElement:{},scrollingElement:{scrollTop:500,scrollHeight:1000},querySelector:()=>null,addEventListener:(n,f)=>handlers[n]=f,removeEventListener(){}};
 const win={innerHeight:500,getComputedStyle:()=>({overflowY:'visible'})};let calls=0,finish;const promise=new Promise(r=>finish=r);const cleanup=initEdgeRefresh({root,win,onRefresh:async()=>{calls++;await promise;}});
 const target={closest:()=>false,parentElement:root.body},event=y=>({target,touches:[{clientX:10,clientY:y}],cancelable:true,preventDefault(){this.prevented=true;}});
 handlers.touchstart(event(400));const e=event(280);handlers.touchmove(e);assert.equal(e.prevented,true);assert.equal(calls,0);handlers.touchend();assert.equal(calls,1);handlers.touchstart(event(400));handlers.touchmove(event(280));handlers.touchend();assert.equal(calls,1);finish();await promise;await Promise.resolve();cleanup();
 const blocked=event(400);blocked.target={closest:()=>true};handlers.touchstart(blocked);handlers.touchmove(event(280));handlers.touchend();assert.equal(calls,1);
});
