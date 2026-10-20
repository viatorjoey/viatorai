import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {providerVault} from './provider-vault.mjs';
const db=new DatabaseSync('data/studio.sqlite',{readOnly:true});
console.log(JSON.stringify({active:db.prepare("SELECT id,state,json_extract(body,'executionLane') lane FROM jobs WHERE state NOT IN ('blocked','cancelled','complete')").all(),services:JSON.parse(readFileSync('data/supervisor-status.json','utf8')),localProviders:await providerVault('data').configured()},null,2));db.close();
