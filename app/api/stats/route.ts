import {database} from '@/db/raw';
import {identity,response,failure,tagsSQL,connectionSQL} from '@/lib/server';
import {CONNECTIONS} from '@/lib/garden';
export async function GET(request:Request){const {id}=identity(request);try{
 const db=database();const results=await db.batch<Record<string,unknown>>([
 db.prepare('SELECT count(*) AS ideas,count(DISTINCT visitor_id) AS browsers FROM ideas'),
 db.prepare('SELECT count(*) AS waters FROM supports s INNER JOIN ideas i ON i.id=s.idea_id'),
 db.prepare(`SELECT t.value AS tag,count(*) AS count FROM ideas i,json_each(${tagsSQL}) t GROUP BY t.value ORDER BY count DESC,t.value LIMIT 12`),
 db.prepare(`SELECT ${connectionSQL} AS connection,count(*) AS count FROM ideas i WHERE ${connectionSQL} IN (?,?,?) GROUP BY ${connectionSQL} ORDER BY count DESC`).bind(...CONNECTIONS)]);
 return response(request,id,{...results[0].results[0],...results[1].results[0],tags:results[2].results,connections:results[3].results});
 }catch(error){return failure(request,id,error);}}
