import {test} from 'node:test';import assert from 'node:assert/strict';import {attachImageViewer} from '../public/image-viewer.js';
test('image toggles fit/native size, bounds panning and keeps a drag from toggling zoom',()=>{
 class Node{constructor(){this.handlers={};this.style={};this.dataset={};this.classList={toggle(){}};}setAttribute(){}append(){}addEventListener(n,f){this.handlers[n]=f;}getBoundingClientRect(){return {width:400,height:300};}setPointerCapture(){}}
 globalThis.document={createElement:()=>new Node()};globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}};
 const image=new Node();image.naturalWidth=1200;image.naturalHeight=600;const box=attachImageViewer(image),click={stopPropagation(){},preventDefault(){}};assert.equal(image.style.width,'400px');box.handlers.click(click);assert.equal(image.style.width,'1200px');assert.equal(box.dataset.zoomed,'true');box.handlers.pointerdown({pointerId:1,clientX:0,clientY:0});box.handlers.pointermove({pointerId:1,clientX:2000,clientY:2000});box.handlers.pointerup();assert.match(image.style.transform,/400px,150px/);box.handlers.click(click);assert.equal(box.dataset.zoomed,'true');image.handlers.keydown({key:'Enter',preventDefault(){}});assert.equal(box.dataset.zoomed,'false');assert.equal(image.style.width,'400px');
});

test('zoom keeps the tapped image point in place rather than centering the image',()=>{
 class Node{constructor(){this.handlers={};this.style={};this.dataset={};this.classList={toggle(){}};}setAttribute(){}append(){}addEventListener(n,f){this.handlers[n]=f;}getBoundingClientRect(){return {left:30,top:20,width:400,height:300};}}
 globalThis.document={createElement:()=>new Node()};globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}};
 const image=new Node();image.naturalWidth=1200;image.naturalHeight=600;const box=attachImageViewer(image);box.handlers.click({clientX:130,clientY:120,stopPropagation(){}});assert.equal(image.style.width,'1200px');assert.match(image.style.transform,/200px,100px/);box.handlers.click({clientX:130,clientY:120,stopPropagation(){}});assert.equal(image.style.width,'400px');assert.match(image.style.transform,/0px,0px/);
});
