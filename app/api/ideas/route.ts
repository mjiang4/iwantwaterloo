import {database} from '@/db/raw';
import {identity,response,readBody,validateIdea,failure,InputError} from '@/lib/server';
import {EXAMPLES,filterIdeas,type Idea} from '@/lib/garden';
export async function GET(request:Request){
 const {id}=identity(request);try{
 const db=database(),url=new URL(request.url),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0)),category=url.searchParams.get('category')||'all',query=(url.searchParams.get('q')||'').slice(0,200),connection=url.searchParams.get('connection')||'all',sort=url.searchParams.get('sort')==='watered'?'watered':'newest';
 const where:string[]=['1=1'],args:(string|number)[]=[];
 if(category!=='all'){where.push('i.category = ?');args.push(category);}if(connection!=='all'){where.push('i.connection = ?');args.push(connection);}
 for(const term of query.toLowerCase().trim().split(/\s+/).filter(Boolean)){where.push("lower(i.title || ' ' || i.description || ' ' || i.place) LIKE ? ESCAPE '\\'");args.push('%'+term.replace(/[\\%_]/g,'\\$&')+'%');}
 const clause=where.join(' AND '),order=sort==='watered'?'waters DESC, i.created_at DESC, i.id':'i.created_at DESC, i.id';
 const [rows,count,exampleWaters]=await db.batch<Record<string,unknown>>([
 db.prepare(`SELECT i.id,i.title,i.description,i.category,i.place,i.connection,i.created_at AS createdAt,(SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters,EXISTS(SELECT 1 FROM supports s WHERE s.idea_id=i.id AND s.visitor_id=?) AS watered FROM ideas i WHERE ${clause} ORDER BY ${order} LIMIT 50 OFFSET ?`).bind(id,...args,Math.floor(page)*50),
 db.prepare(`SELECT count(*) AS total FROM ideas i WHERE ${clause}`).bind(...args),
 db.prepare("SELECT idea_id AS id,count(*) AS waters,max(visitor_id=?) AS watered FROM supports WHERE idea_id LIKE 'example-%' GROUP BY idea_id").bind(id)]);
 const real=(rows.results as unknown as Idea[]).map(i=>({...i,watered:Boolean(i.watered),example:false}));
 const examples=page===0?filterIdeas(EXAMPLES.map(i=>{const s=exampleWaters.results.find(s=>s.id===i.id);return {...i,waters:Number(s?.waters||0),watered:Boolean(s?.watered)};}),category,query,connection,sort):[];
 const total=Number(count.results[0]?.total||0);
 return response(request,id,{ideas:real,examples,total,nextPage:(page+1)*50<total?page+1:null});
 }catch(error){return failure(request,id,error);}
}
export async function POST(request:Request){
 const {id}=identity(request);try{
 const data=validateIdea(await readBody(request)),db=database(),ideaId=crypto.randomUUID(),now=Date.now();
 const result=await db.prepare('INSERT INTO ideas (id,title,description,category,place,connection,created_at,visitor_id) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5').bind(ideaId,data.title,data.description,data.category,data.place,data.connection,now,id,id,now-600000).run();
 if(!result.meta.changes)throw new InputError('You have planted a few ideas already. Take a little time to explore, then try again in 10 minutes.',429);
 return response(request,id,{idea:{id:ideaId,...data,createdAt:now,waters:0,watered:false,example:false}},201);
 }catch(error){return failure(request,id,error);}
}
