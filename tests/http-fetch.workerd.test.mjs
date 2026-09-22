import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {Miniflare} from 'miniflare';

test('the real Workers runtime accepts outbound requests and refuses redirects without forwarding credentials',async()=>{
 const source=readFileSync(new URL('../lib/http-fetch.ts',import.meta.url),'utf8');
 const helper=transformSync(source,{loader:'ts',format:'esm'}).code;
 const calls=[];
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-22',script:helper+`
 export default {async fetch(request){
   try {
     const response=await fetchWithoutRedirects('https://provider.example.test'+new URL(request.url).pathname,{method:'POST',headers:{Authorization:'Bearer dummy-test-token'},body:'test'});
     return new Response(await response.text(),{status:response.status});
   } catch(error) {return new Response(error.message,{status:502});}
 }};`,outboundService:async request=>{
  calls.push(request.url);assert.equal(new URL(request.url).origin,'https://provider.example.test');
  assert.equal(request.headers.get('authorization'),'Bearer dummy-test-token');
  return new URL(request.url).pathname==='/redirect'?new Response(null,{status:302,headers:{location:'https://other.example.test/'}}):new Response('received');
 }});
 try {
  const success=await mf.dispatchFetch('https://test.local/ok');assert.equal(success.status,200);assert.equal(await success.text(),'received');
  const redirected=await mf.dispatchFetch('https://test.local/redirect');assert.equal(redirected.status,502);assert.match(await redirected.text(),/移動/);
  assert.deepEqual(calls,['https://provider.example.test/ok','https://provider.example.test/redirect']);
 } finally {await mf.dispose();}
});
