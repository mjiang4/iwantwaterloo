import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('These mutation tests are local-only.');
const visitor=randomUUID(),ip='198.51.100.99',created=[];
const db='.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite';
async function request(path,{method='GET',body,cookie=true,origin=base}={}){
 const r=await fetch(base+path,{method,headers:{...(cookie?{Cookie:`garden_visitor=${visitor}`} : {}),'CF-Connecting-IP':ip,...(body!==undefined?{'Content-Type':'application/json',Origin:origin}:{})},body:body!==undefined?JSON.stringify(body):undefined,redirect:'manual'});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{}
 return {r,data,text};
}
const payload={title:'Public launch test idea',description:'An integration fixture for safe public submissions.',tags:['#Bike Lanes','bike_lanes'],connection:'From Waterloo',consent:true,submissionKey:randomUUID()};
function seedLimit(scope,count){const day=Math.floor(Date.now()/86400000),key=createHmac('sha256','local-development-only').update(`${scope}:${day}:${ip}`).digest('hex');const p=spawnSync('python3',['-c',"import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); d.execute('INSERT OR REPLACE INTO rate_limits (key,count,expires_at) VALUES (?,?,?)',(sys.argv[2],int(sys.argv[3]),int(sys.argv[4]))); d.commit()",db,key,String(count),String(Date.now()+600000)]);assert.equal(p.status,0,p.stderr.toString());return key;}
let keys=[];
try{
 for(const path of ['/api/export','/api/stats'])assert.equal((await request(path)).r.status,404,`${path} must not remain public`);
 const initial=await request('/api/ideas',{cookie:false});assert.equal(initial.r.status,200);assert.deepEqual(initial.data.examples,[]);assert.equal(initial.r.headers.get('set-cookie'),null,'Read requests must not race to replace visitor cookies');
 const pair=await Promise.all([request('/api/ideas',{method:'POST',body:payload}),request('/api/ideas',{method:'POST',body:payload})]);
 pair.forEach(x=>assert.ok([200,201].includes(x.r.status),x.text));
 assert.equal(pair[0].data.idea.id,pair[1].data.idea.id,'Retry must return the same saved idea');
 created.push(pair[0].data.idea.id);
 const idea=pair[0].data.idea;
 assert.deepEqual(idea.tags,['bike-lanes']);assert.equal(idea.submissionKey,undefined);assert.equal(idea.visitor_id,undefined);
 assert.match(pair[0].r.headers.get('set-cookie'),/HttpOnly/);
 const conflict=await request('/api/ideas',{method:'POST',body:{...payload,description:'A different suggestion using the same submission key.'}});assert.equal(conflict.r.status,409);
 const changedOrigin=await request('/api/ideas',{method:'POST',body:{...payload,submissionKey:randomUUID()},origin:'https://unrelated.example'});assert.equal(changedOrigin.r.status,403);
 assert.equal((await request('/api/ideas',{method:'POST',body:{...payload,tags:['a','b','c','d'],submissionKey:randomUUID()}})).r.status,400);
 const found=await request('/api/ideas?tag=bike-lanes');assert.ok(found.data.ideas.some(i=>i.id===idea.id));
 const grove=await request(`/api/ideas?garden=1&page=${Math.floor(idea.plot/24)}`);assert.equal(grove.data.ideas.find(i=>i.id===idea.id)?.plot,idea.plot);
 assert.equal((await request('/api/support',{method:'PUT',body:{ideaId:'example-meadow',watered:true}})).r.status,404);
 const support=await request('/api/support',{method:'PUT',body:{ideaId:idea.id,watered:true}});assert.equal(support.r.status,200);assert.equal(support.data.waters,1);
 assert.equal((await request('/api/support',{method:'PUT',body:{ideaId:idea.id,watered:true}})).data.waters,1,'Support is idempotent');
 assert.equal((await request('/api/support',{method:'PUT',body:{ideaId:idea.id,watered:false}})).data.waters,0);
 const again=await request('/api/ideas',{method:'POST',body:payload,cookie:false});assert.equal(again.data.idea.id,idea.id,'Lost response/cookie must not create a duplicate');
 const sql=await request('/api/ideas?q='+encodeURIComponent("' OR 1=1 --"));assert.equal(sql.data.total,0);
 keys.push(seedLimit('ideas',120));
 const limited=await request('/api/ideas',{method:'POST',body:{...payload,submissionKey:randomUUID()},cookie:false});assert.equal(limited.r.status,429,limited.text);assert.ok(limited.r.headers.get('retry-after'));
 assert.equal((await request('/api/ideas',{method:'POST',body:payload})).r.status,200,'A retry should still retrieve the saved result at the rate limit');
 keys.push(seedLimit('support',300));
 assert.equal((await request('/api/support',{method:'PUT',body:{ideaId:idea.id,watered:true}})).r.status,429);
 console.log('PASS: retired endpoints, anonymous reads/writes, no demo ideas, safe retries, preserved tree placement, tag filtering, support toggles, input validation, cross-origin rejection and network rate limits.');
}finally{
 const cleanup=spawnSync('python3',['-c',"import sqlite3,json,sys; d=sqlite3.connect(sys.argv[1]); ids=json.loads(sys.argv[2]); keys=json.loads(sys.argv[3]); [d.execute('DELETE FROM supports WHERE idea_id=?',(i,)) for i in ids]; [d.execute('DELETE FROM ideas WHERE id=?',(i,)) for i in ids]; [d.execute('DELETE FROM rate_limits WHERE key=?',(k,)) for k in keys]; d.commit()",db,JSON.stringify(created),JSON.stringify(keys)]);assert.equal(cleanup.status,0,cleanup.stderr.toString());
}
