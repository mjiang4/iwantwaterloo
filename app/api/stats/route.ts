import {database} from '@/db/raw';
import {identity,response,failure} from '@/lib/server';
export async function GET(request:Request){const {id}=identity(request);try{
 const db=database();const results=await db.batch<Record<string,unknown>>([
 db.prepare('SELECT count(*) AS ideas,count(DISTINCT visitor_id) AS browsers FROM ideas'),
 db.prepare('SELECT count(*) AS waters FROM supports s INNER JOIN ideas i ON i.id=s.idea_id'),
 db.prepare('SELECT category,count(*) AS count FROM ideas GROUP BY category ORDER BY count DESC'),
 db.prepare("SELECT connection,count(*) AS count FROM ideas WHERE connection != '' GROUP BY connection ORDER BY count DESC")]);
 return response(request,id,{...results[0].results[0],...results[1].results[0],categories:results[2].results,connections:results[3].results});
 }catch(error){return failure(request,id,error);}}
