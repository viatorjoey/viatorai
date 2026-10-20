export type ProjectFolder={id:string;name:string;rooms:{id:string;title:string}[];total:number};
export const VINTAGE_FOLDER_COLORS=['#a6b294','#bc8d78','#c3a25f','#829eac','#b29ba9','#b4a38a','#8fa8a0','#ad8075','#a9ab7d','#a88f72','#8c93ac','#b0a28a'];
export function projectFolderColors(projects:readonly {id:string}[]){
 const colors:Record<string,string>={},used=new Set<number>();
 for(const project of projects){let hash=0;for(const char of project.id)hash=(hash*31+char.charCodeAt(0))>>>0;let index=hash%VINTAGE_FOLDER_COLORS.length;
  for(let n=0;n<VINTAGE_FOLDER_COLORS.length&&used.has(index);n++)index=(index+1)%VINTAGE_FOLDER_COLORS.length;
  colors[project.id]=VINTAGE_FOLDER_COLORS[index];used.add(index);
 }return colors;
}
export function projectFolderHref(project:ProjectFolder){const q=new URLSearchParams({project:project.id});if(project.rooms[0]?.id)q.set('room',project.rooms[0].id);return '/?'+q.toString();}
