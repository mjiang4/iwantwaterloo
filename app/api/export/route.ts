import {database} from '@/db/raw';
import {identity,failure} from '@/lib/server';
import {decodeTags,connectionGroup} from '@/lib/garden';
// Prevent spreadsheet formulas when opening user-authored text in a CSV.
function csv(v:unknown){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export async function GET(request:Request){const {id}=identity(request);try{
 const db=database();const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){try{
 controller.enqueue(encoder.encode('\uFEFF'+['ID','Title','Idea','Tags','Place','Connection to Waterloo','Shared at (UTC)','Supports'].map(csv).join(',')+'\r\n'));
 let lastCreated=0,lastId='';while(true){const result=await db.prepare('SELECT i.*,(SELECT count(*) FROM supports s WHERE s.idea_id=i.id) AS waters FROM ideas i WHERE i.created_at>? OR (i.created_at=? AND i.id>?) ORDER BY i.created_at,i.id LIMIT 100').bind(lastCreated,lastCreated,lastId).all();
 for(const i of result.results){controller.enqueue(encoder.encode([i.id,i.title,i.description,decodeTags(i.tags,String(i.category)).join(', '),i.place,connectionGroup(String(i.connection)),new Date(Number(i.created_at)).toISOString(),i.waters].map(csv).join(',')+'\r\n'));lastCreated=Number(i.created_at);lastId=String(i.id);}if(result.results.length<100)break;}
 controller.close();}catch(e){controller.error(e);}}});
 return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="waterloo-garden-ideas.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return failure(request,id,error);}}
