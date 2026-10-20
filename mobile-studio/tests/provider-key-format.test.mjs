import test from 'node:test';
import assert from 'node:assert/strict';
import {validProviderKey} from '../provider-vault.mjs';
test('Gemini auth keys support dots and long tokens without accepting header injection',()=>{
 assert.equal(validProviderKey('gemini','AQ.'+'a'.repeat(700)+'_-.'),true);
 assert.equal(validProviderKey('gemini','AIza'+'a'.repeat(35)),true);
 assert.equal(validProviderKey('gemini','AQ.'+'a'.repeat(5000)),false);
 assert.equal(validProviderKey('gemini','AQ.'+'a'.repeat(30)+'\r\nAuthorization:test'),false);
 assert.equal(validProviderKey('gemini',''),true);
 assert.equal(validProviderKey('xai','AQ.'+'a'.repeat(30)),false);
 assert.equal(validProviderKey('other','a'.repeat(30)),false);
});
