'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Check,Hash,Plus,X} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Popover,PopoverContent,PopoverTitle,PopoverTrigger} from '@/components/ui/popover';
import {SUGGESTED_TAGS,normalizeTag,validTag} from '@/lib/garden';
export function useTags(query='') {
 return useQuery({queryKey:['tags',query],queryFn:async()=>{const r=await fetch(`/api/tags?q=${encodeURIComponent(query)}`);if(!r.ok)throw new Error('Couldn’t load tags.');return await r.json() as {tags:{tag:string;count:number}[]};},staleTime:30000});
}
export function TagPicker({value,onChange,disabled}:{value:string[];onChange:(tags:string[])=>void;disabled:boolean}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const normalized=normalizeTag(query),result=useTags(normalized);
 const suggestions=(result.data?.tags||SUGGESTED_TAGS.filter(t=>t.includes(normalized)).map(tag=>({tag,count:0}))).slice(0,12);
 const create=validTag(normalized)&&!suggestions.some(t=>t.tag===normalized)&&!value.includes(normalized);
 function choose(tag:string){if(value.includes(tag))onChange(value.filter(t=>t!==tag));else if(value.length<3){onChange([...value,tag]);setQuery('');}}
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger className={`details-trigger tag-trigger ${value.length?'has-details':''}`} disabled={disabled}><Hash size={15}/>{value.length?`${value.length} tag${value.length===1?'':'s'}`:'Tags'}</PopoverTrigger>
 <PopoverContent className="tag-popover" align="start" sideOffset={12}><div className="tag-heading"><PopoverTitle className="popover-heading">Add tags</PopoverTitle><span>{value.length}/3</span></div>
 <Input aria-label="Find or create a tag" placeholder="Find or create a tag…" maxLength={40} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(validTag(normalized))choose(normalized);}}}/>
 {value.length>0&&<div className="tag-options selected-tags">{value.map(t=><button type="button" key={t} onClick={()=>choose(t)}>#{t}<X size={12}/><span className="sr-only">Remove {t}</span></button>)}</div>}
 <div className="tag-options">{suggestions.filter(t=>!value.includes(t.tag)).map(t=><button type="button" key={t.tag} disabled={value.length===3} onClick={()=>choose(t.tag)}>#{t.tag}{t.count>0&&<span>{t.count}</span>}</button>)}{create&&<button type="button" className="create-tag" disabled={value.length===3} onClick={()=>choose(normalized)}><Plus size={13}/>Create #{normalized}</button>}</div>
 {query&&!validTag(normalized)&&<p className="tag-hint">Use 2–24 letters or numbers.</p>}
 {result.isError&&<p className="tag-hint">Suggested tags unavailable. You can still add yours.</p>}
 <button type="button" className="tag-done" onClick={()=>setOpen(false)}>Done<Check size={14}/></button>
 </PopoverContent></Popover>;
}
