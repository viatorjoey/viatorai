import{test}from'node:test';import assert from'node:assert/strict';import{generationStats}from'../generation-stats.mjs';
test('statistics include all saved media jobs, exclude queue wait, chat, refinements and cancellations from failures',()=>{
 const records=[{mode:'image-video',state:'complete',created:1,startedAt:10000,completedAt:20000,assets:[{kind:'video'}],deletedAt:9},{mode:'image-video',state:'complete',startedAt:10000,completedAt:40000,assets:[{kind:'video'}]},{mode:'image-video',state:'blocked'},{mode:'image-video',state:'blocked',cancellationConfirmed:1},{mode:'image-video',state:'queued'},{mode:'text-image',state:'complete',assets:[{kind:'image'}]},{mode:'text-image',state:'complete',refineOnly:true},{mode:'llm-chat',state:'complete'}];
 const s=generationStats(records);assert.equal(s.total.completed,3);assert.equal(s.total.images,1);assert.equal(s.total.videos,2);assert.equal(s.total.averageSeconds,20);assert.equal(s.total.failed,1);assert.equal(s.total.cancelled,1);assert.equal(s.total.pending,1);assert.equal(s.total.successRate,75);assert.equal(s.rows.find(r=>r.mode==='text-image').averageSeconds,null);assert.equal(s.rows.find(r=>r.mode==='image-image').successRate,null);
});
test('old completed rows beyond gallery limit still count and invalid time records do not affect average',()=>{const rows=Array.from({length:501},()=>({mode:'text-image',state:'complete',assets:[{kind:'image'}]}));rows.push({mode:'text-image',state:'complete',startedAt:100,completedAt:50});assert.equal(generationStats(rows).total.completed,502);assert.equal(generationStats(rows).total.averageSeconds,null);});

test('model statistics combine modes, count result files and average only timed completions',()=>{
 const s=generationStats([
  {mode:'text-video',model:'gemini:veo',state:'complete',startedAt:1000,completedAt:11000,assets:[{kind:'video'}]},
  {mode:'image-video',model:'gemini:veo',state:'complete',startedAt:1000,completedAt:31000,assets:[{kind:'video'},{kind:'video'}]},
  {mode:'text-video',model:'gemini:veo',state:'complete',assets:[{kind:'video'}]},
  {mode:'image-video',model:'gemini:veo',state:'blocked'},
  {mode:'text-video',model:'gemini:veo',state:'cancelled'},
  {mode:'text-video',model:'xai:video',state:'queued'},
  {mode:'text-video',model:'xai:video',state:'complete',startedAt:1000,completedAt:6000,assets:[{kind:'video'}]},
  {mode:'llm-chat',model:'gemini:veo',state:'complete'},
  {mode:'text-video',model:'gemini:veo',state:'complete',refineOnly:true},
 ]);
 const veo=s.models.find(r=>r.model==='gemini:veo');assert.equal(veo.completed,3);assert.equal(veo.videos,4);assert.equal(veo.averageSeconds,20);assert.equal(veo.timed,2);assert.equal(veo.failed,1);assert.equal(veo.cancelled,1);assert.equal(veo.successRate,75);
 const grok=s.models.find(r=>r.model==='xai:video');assert.equal(grok.averageSeconds,5);assert.equal(grok.pending,1);assert.equal(s.total.averageSeconds,15);
});

test('legacy OpenAI aliases share one model row while missing model records stay separate',()=>{
 const s=generationStats([{mode:'text-image',state:'complete',model:'chatgpt-image-latest'},{mode:'image-image',state:'complete',model:'openai:chatgpt-image-latest'},{mode:'text-image',state:'complete'}]);
 assert.equal(s.models.length,2);assert.equal(s.models.find(r=>r.model==='openai:chatgpt-image-latest').completed,2);assert.equal(s.models.find(r=>r.model===null).completed,1);
});

test('content tools and document exports participate in production and model totals',()=>{
 const s=generationStats([{mode:'post',model:'Studio 편집기',state:'complete',startedAt:1000,completedAt:3000,assets:[{kind:'document'},{kind:'document'}]},{mode:'shorts',model:'Studio 편집기',state:'complete',assets:[{kind:'video'},{kind:'document'}]}]);
 assert.equal(s.total.completed,2);assert.equal(s.total.documents,3);assert.equal(s.total.videos,1);assert.equal(s.models[0].completed,2);assert.equal(s.models[0].averageSeconds,2);assert.equal(s.rows.find(r=>r.mode==='post').completed,1);
});

test('success rate retains a decimal so a failure is visible in a large completed batch',()=>{const jobs=Array.from({length:259},()=>({mode:'text-image',model:'sample',state:'complete'}));jobs.push({mode:'text-image',model:'sample',state:'blocked'});const s=generationStats(jobs);assert.equal(s.total.successRate,99.6);assert.equal(s.models[0].successRate,99.6);});
