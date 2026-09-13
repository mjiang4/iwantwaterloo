import {database} from '@/db/raw';
import {identity,response,failure,tagsSQL} from '@/lib/server';
import {SUGGESTED_TAGS,normalizeTag} from '@/lib/garden';
export async function GET(request:Request){const {id}=identity(request);try{
 const query=normalizeTag((new URL(request.url).searchParams.get('q')||'').slice(0,40));
 const result=await database().prepare(`SELECT t.value AS tag,count(*) AS count FROM ideas i,json_each(${tagsSQL}) t WHERE t.value LIKE ? ESCAPE '\\' GROUP BY t.value ORDER BY count DESC,t.value LIMIT 30`).bind('%'+query.replace(/[\\%_]/g,'\\$&')+'%').all<{tag:string;count:number}>();
 const tags=new Map(result.results.map(t=>[t.tag,t]));
 for(const tag of SUGGESTED_TAGS)if(tag.includes(query)&&!tags.has(tag))tags.set(tag,{tag,count:0});
 return response(request,id,{tags:[...tags.values()]});
 }catch(error){return failure(request,id,error);}}
