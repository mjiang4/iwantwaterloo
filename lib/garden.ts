export const CATEGORIES = [
 {id:'nature',label:'Nature & climate',short:'Nature',color:'#6b903c',light:'#edf4e4',flower:'#d2e777'},
 {id:'mobility',label:'Getting around',short:'Getting around',color:'#457c9b',light:'#e7f1f6',flower:'#8ec5ef'},
 {id:'homes',label:'Homes & neighbourhoods',short:'Homes',color:'#ad613d',light:'#f9eee5',flower:'#ed9970'},
 {id:'culture',label:'Arts & belonging',short:'Arts & belonging',color:'#9261a3',light:'#f3ebf6',flower:'#c9a2ed'},
 {id:'learning',label:'Learning & opportunity',short:'Learning',color:'#987527',light:'#f8f2d9',flower:'#f2d15e'},
 {id:'business',label:'Business & innovation',short:'Business',color:'#b75970',light:'#f9e9ed',flower:'#ea9db8'},
] as const;
export type Category=typeof CATEGORIES[number]['id'];
export const CONNECTIONS=['I live here','I study here','I work here','I visit','I want to build a business','I am interested in investing','I care about Waterloo'] as const;
export type Idea={id:string;title:string;description:string;category:Category;place:string;connection:string;createdAt:number;waters:number;watered:boolean;example:boolean};
export const EXAMPLES:Idea[]=[
 {id:'example-meadow',title:'A little more wild in Waterloo',description:'What if some of our closely mown park edges became native wildflower meadows? A few paths through the flowers, small signs explaining what is growing, and places to sit could turn everyday walks into something special. Start with a small demonstration plot near the Laurel Trail and learn what thrives.',category:'nature',place:'Laurel Trail',connection:'',createdAt:6,waters:0,watered:false,example:true},
 {id:'example-night',title:'A night market under the stars',description:'Imagine a monthly evening market in the public square: local food, tiny art stalls, live music, and plenty of places to sit without buying anything. Low-cost stalls could give people a first chance to try a small business.',category:'culture',place:'Uptown Waterloo',connection:'',createdAt:5,waters:0,watered:false,example:true},
 {id:'example-bike',title:'One connected, comfortable bike network',description:'Join the gaps between neighbourhood routes, campuses, ION stops and Uptown with protected connections and useful wayfinding. A route should feel comfortable from the first block to the last, with secure places to leave a bike at the destination.',category:'mobility',place:'Across Waterloo',connection:'',createdAt:4,waters:0,watered:false,example:true},
 {id:'example-courtyard',title:'Homes around shared gardens',description:'Explore courtyard housing with a mix of home sizes, room for trees, and shared places to play, read or grow food. Could a small pilot show how adding homes can also create a lovely place to know your neighbours?',category:'homes',place:'Our neighbourhoods',connection:'',createdAt:3,waters:0,watered:false,example:true},
 {id:'example-workshop',title:'An open workshop for curious minds',description:'A welcoming place to learn practical skills together, from repairing a lamp to making a first prototype. Shared tools, public workshops, and mentors could connect campus knowledge with everyday creativity.',category:'learning',place:'Near the campuses',connection:'',createdAt:2,waters:0,watered:false,example:true},
 {id:'example-shop',title:'A first storefront, without the big leap',description:'Create a rotating set of small, short-term storefronts where new businesses can test an idea. Simple leases, clear information and shared basics could help a local maker or a newcomer to Waterloo take a first step.',category:'business',place:'Uptown Waterloo',connection:'',createdAt:1,waters:0,watered:false,example:true},
];
export function categoryFor(id:string){return CATEGORIES.find(c=>c.id===id)||CATEGORIES[0];}
export function filterIdeas(ideas:Idea[],category:string,query:string,connection='all',sort='newest'){
 const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return ideas.filter(i=>(category==='all'||i.category===category)&&(connection==='all'||i.connection===connection)&&terms.every(t=>`${i.title} ${i.description} ${i.place}`.toLowerCase().includes(t))).sort((a,b)=>Number(a.example)-Number(b.example)||(sort==='watered'?b.waters-a.waters:0)||b.createdAt-a.createdAt||a.id.localeCompare(b.id));
}

// Keep the full suggestion; derive a compact card title without a second field.
export function ideaTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  const first = clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  if (first && first.length >= 5 && first.length <= 90) return first;
  if (clean.length <= 90) return clean;
  const fragment = clean.slice(0, 89);
  const boundary = fragment.lastIndexOf(' ');
  return (boundary > 45 ? fragment.slice(0, boundary) : fragment).trimEnd() + '…';
}
