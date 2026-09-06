import {CATEGORIES,CONNECTIONS,type Category} from './garden';
export class InputError extends Error{constructor(message:string,public status=400){super(message);}}
export function identity(request:Request){
 const raw=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('garden_visitor='))?.slice(15);
 const existing=raw&&/^[a-f0-9-]{36}$/.test(raw)?raw:null;
 return {id:existing||crypto.randomUUID(),cookie:existing?null:undefined};
}
export function response(request:Request,id:string,data:unknown,status=200){
 const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 headers['Set-Cookie']=`garden_visitor=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol==='https:'?'; Secure':''}`;
 return Response.json(data,{status,headers});
}
export async function readBody(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new InputError('Please submit from the garden page.',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new InputError('Please send a valid form.',415);
 const reader=request.body?.getReader();if(!reader)throw new InputError('The form is empty.');
 let total=0;const chunks:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>12000){await reader.cancel();throw new InputError('This idea is too long.',413);}chunks.push(value);}
 const bytes=new Uint8Array(total);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new InputError('Please send a valid form.');}
}
export function validateIdea(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new InputError('Please complete the idea form.');
 const v=raw as Record<string,unknown>;
 function field(name:string,max:number,min=0){if(v[name]!==undefined&&typeof v[name]!=='string')throw new InputError(`Please check ${name}.`);const t=String(v[name]??'').trim();if(t.length<min||t.length>max)throw new InputError(`${name==='title'?'Title':name==='description'?'Idea':name} must be ${min}–${max} characters.`);return t;}
 const title=field('title',90,5),description=field('description',1400,20),category=field('category',30,1),place=field('place',90),connection=field('connection',60);
 if(!CATEGORIES.some(c=>c.id===category))throw new InputError('Choose a garden theme.');
 if(connection&&!CONNECTIONS.some(c=>c===connection))throw new InputError('Choose a connection to Waterloo.');
 if(v.consent!==true)throw new InputError('Please confirm that your idea can be visible to garden visitors.');
 if(v.website)throw new InputError('We could not plant this idea. Please try again.');
 return {title,description,category:category as Category,place,connection};
}
export function failure(request:Request,id:string,error:unknown){if(!(error instanceof InputError))console.error('Garden storage operation failed',error instanceof Error?error.message:'Unknown');return response(request,id,{error:error instanceof InputError?error.message:'The garden could not save or load this right now. Please try again.'},error instanceof InputError?error.status:503);}
