import {copyFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const [source,target] of [['test-fixtures/model-catalog-cache.json','mobile-studio/data/model-catalog-cache.json'],['test-fixtures/editor-demo.mp4','artifacts/editor-demo.mp4']]){
 const dest=path.join(root,target);mkdirSync(path.dirname(dest),{recursive:true});
 if(!existsSync(dest))copyFileSync(path.join(root,source),dest);
}
console.log('Synthetic test fixtures ready; existing files preserved.');
