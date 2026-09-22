import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {Miniflare} from 'miniflare';
test('password hashing and verification run in the deployed Workers runtime without weakening the work factor',async()=>{
 const helper=transformSync(readFileSync(new URL('../lib/member-password.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'}).code;
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],script:helper+`export default {async fetch(){const password='local-runtime-test-password';const hash=await hashMemberPassword(password);const other=await hashMemberPassword(password);return Response.json({correct:await verifyMemberPassword(password,hash),wrong:await verifyMemberPassword('wrong-password',hash),unknown:await verifyMemberPassword(password,null),unique:hash!==other,profile:hash.split('$').slice(0,4).join('$')});}};`});
 try{const response=await mf.dispatchFetch('https://test.local/');assert.equal(response.status,200);assert.deepEqual(await response.json(),{correct:true,wrong:false,unknown:false,unique:true,profile:'scrypt$16384$8$5'});}finally{await mf.dispose();}
});
