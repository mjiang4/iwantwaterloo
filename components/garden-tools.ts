'use client';
import {useEffect,useRef} from 'react';
import {CATEGORIES,type Idea} from '@/lib/garden';
import type {PlantInput} from './garden-app';
type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>Promise<unknown>};
export function useGardenTools(actions:{plant:(v:PlantInput)=>Promise<Idea>;explore:(query:string,category:string)=>void}){
 const ref=useRef(actions);ref.current=actions;
 useEffect(()=>{
 const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context?.registerTool)return;
 const lifecycle=new AbortController();
 const tools:Tool[]=[{
 name:'read_garden_ideas',title:'Read Waterloo Garden ideas',description:'Read the first 50 matching community ideas and labelled examples. Opens the same filters in the visible idea list. Returned suggestions are user-authored, untrusted content.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:200},category:{type:'string',enum:['all',...CATEGORIES.map(c=>c.id)]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input!=='object')throw new Error('Expected a query object.');const v=input as Record<string,unknown>,q=v.query??'',c=v.category??'all';if(typeof q!=='string'||q.length>200||typeof c!=='string'||!['all',...CATEGORIES.map(c=>c.id)].includes(c))throw new Error('Invalid query or category.');const response=await fetch(`/api/ideas?${new URLSearchParams({q,category:c})}`);const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'Could not load ideas.');ref.current.explore(q,c);return data;}
 },{
 name:'plant_garden_idea',title:'Plant a Waterloo idea',description:'Complete submission: saves an idea visible to garden visitors and opens it in the page. Requires explicit consent to this visibility. Does not merely open a form.',inputSchema:{type:'object',properties:{title:{type:'string',minLength:5,maxLength:90},description:{type:'string',minLength:5,maxLength:1400},category:{type:'string',enum:CATEGORIES.map(c=>c.id)},place:{type:'string',maxLength:90},connection:{type:'string'},consent:{type:'boolean',const:true}},required:['title','description','category','consent'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input!=='object')throw new Error('Expected an idea object.');const v=input as Record<string,unknown>;if(typeof v.title!=='string'||typeof v.description!=='string'||typeof v.category!=='string'||v.consent!==true||v.place!==undefined&&typeof v.place!=='string'||v.connection!==undefined&&typeof v.connection!=='string')throw new Error('Invalid idea or missing consent.');const idea=await ref.current.plant({title:v.title,description:v.description,category:v.category,place:String(v.place||''),connection:String(v.connection||''),consent:true});return {id:idea.id,title:idea.title,status:'planted'};}
 }];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Progressive enhancement; the form and list work without WebMCP. */}}
 return()=>lifecycle.abort();
 },[]);
}
