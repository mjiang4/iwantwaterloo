import {database} from '@/db/raw';
import {identity,response,readBody,validateIdea,failure,InputError,tagsSQL,connectionSQL} from '@/lib/server';
import {EXAMPLES,filterIdeas,decodeTags,GROVE_SIZE,type Idea} from '@/lib/garden';
export async function GET(request:Request){
 const {id}=identity(request);try{
 const db=database(),url=new URL(request.url),page=Math.floor(Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0))),category=url.searchParams.get('category')||'all',query=(url.searchParams.get('q')||'').slice(0,200),connection=url.searchParams.get('connection')||'all',sort=url.searchParams.get('sort')==='watered'?'watered':'newest',tag=url.searchParams.get('tag')||'all',garden=url.searchParams.get('garden')==='1',includeExamples=url.searchParams.get('examples')!=='0';
 const where:string[]=['1=1'],args:(string|number)[]=[];
 if(category!=='all'){where.push('i.category = ?');args.push(category);}
 if(connection!=='all'){where.push(`${connectionSQL} = ?`);args.push(connection);}
 if(tag!=='all'){where.push(`EXISTS (SELECT 1 FROM json_each(${tagsSQL}) t WHERE t.value=?)`);args.push(tag);}
 for(const term of query.toLowerCase().trim().split(/\s+/).filter(Boolean)){where.push(`lower(i.title || ' ' || i.description || ' ' || i.place || ' ' || ${tagsSQL}) LIKE ? ESCAPE '\\'`);args.push('%'+term.replace(/[\\%_]/g,'\\$&')+'%');}
 const clause=where.join(' AND '),order=sort==='watered'?'waters DESC, i.created_at DESC, i.id':'i.created_at DESC, i.id';
 const pageClause=garden?' AND i.rowid + 5 >= ? AND i.rowid + 5 < ?':'';
 const pageArgs=garden?[page*GROVE_SIZE,(page+1)*GROVE_SIZE]:[page*50];
 const [rows,count,exampleWaters]=await db.batch<Record<string,unknown>>([
 db.prepare(`SELECT i.id,i.title,i.description,i.category,i.tags,i.rowid + 5 AS plot,i.place,${connectionSQL} AS connection,i.created_at AS createdAt,(SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters,EXISTS(SELECT 1 FROM supports s WHERE s.idea_id=i.id AND s.visitor_id=?) AS watered FROM ideas i WHERE ${clause}${pageClause} ORDER BY ${garden?'i.rowid':order} ${garden?'LIMIT 24':'LIMIT 50 OFFSET ?'}`).bind(id,...args,...pageArgs),
 db.prepare(`SELECT count(*) AS total,max(i.rowid + 5) AS lastPlot,group_concat(DISTINCT cast((i.rowid + 5) / 24 AS integer)) AS grovePages FROM ideas i WHERE ${clause}`).bind(...args),
 db.prepare("SELECT idea_id AS id,count(*) AS waters,max(visitor_id=?) AS watered FROM supports WHERE idea_id LIKE 'example-%' GROUP BY idea_id").bind(id)]);
 const real=rows.results.map(i=>({...i,tags:decodeTags(i.tags,String(i.category)),watered:Boolean(i.watered),example:false})) as Idea[];
 const matchingExamples=includeExamples?filterIdeas(EXAMPLES.map(i=>{const s=exampleWaters.results.find(s=>s.id===i.id);return {...i,waters:Number(s?.waters||0),watered:Boolean(s?.watered)};}),category,query,connection,sort,tag):[];
 const examples=garden?matchingExamples.filter(i=>Math.floor((i.plot||0)/GROVE_SIZE)===page):page===0?matchingExamples:[];
 const total=Number(count.results[0]?.total||0),lastPlot=Math.max(Number(count.results[0]?.lastPlot??-1),...matchingExamples.map(i=>i.plot??-1));
 const grovePages=[...new Set([...String(count.results[0]?.grovePages||'').split(',').filter(Boolean).map(Number),...matchingExamples.map(i=>Math.floor((i.plot??0)/GROVE_SIZE))])].sort((a,b)=>a-b);
 return response(request,id,{ideas:real,examples,total,grovePages:grovePages.length?grovePages:[0],examplesTotal:matchingExamples.length,groves:Math.max(1,Math.ceil((lastPlot+1)/GROVE_SIZE)),nextPage:!garden&&(page+1)*50<total?page+1:null});
 }catch(error){return failure(request,id,error);}
}
export async function POST(request:Request){
 const {id}=identity(request);try{
 const data=validateIdea(await readBody(request)),db=database(),ideaId=crypto.randomUUID(),now=Date.now();
 const result=await db.prepare('INSERT INTO ideas (id,title,description,category,tags,place,connection,created_at,visitor_id) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM ideas WHERE visitor_id=? AND created_at>?) < 5').bind(ideaId,data.title,data.description,data.category,JSON.stringify(data.tags),data.place,data.connection,now,id,id,now-600000).run();
 if(!result.meta.changes)throw new InputError('You’ve shared a few ideas. Try again in 10 minutes.',429);
 return response(request,id,{idea:{id:ideaId,...data,plot:Number(result.meta.last_row_id)+5,createdAt:now,waters:0,watered:false,example:false}},201);
 }catch(error){return failure(request,id,error);}
}
