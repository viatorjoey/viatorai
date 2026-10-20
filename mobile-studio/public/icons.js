const paths={
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 cards:'<rect x="3" y="3" width="13" height="16" rx="2"/><path d="M7 7h5M7 11h5M7 15h3M19 7h2v14H8"/>',

 cyclePlay:'<path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4 4m-4-4 4-4"/><path d="m10 9 5 3-5 3Z"/>',
 dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="3"/>',
 save:'<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 16v4h14v-4"/>',
 heart:'<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
 repeat:'<path d="M20 7H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 17h13a4 4 0 0 0 4-4M4 17l4 4m-4-4 4-4"/>',
 play:'<path d="m9 5 11 7-11 7Z"/>',
 film:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
 imageEdit:'<path d="M13 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-7M3 17l5-5 4 4"/><path d="m14 8 5-5 3 3-5 5-4 1Z"/>',
 imageVideo:'<rect x="2" y="4" width="15" height="16" rx="3"/><path d="m17 9 5-3v12l-5-3M2 16l4-4 3 3 3-5 5 6"/>',
 sparkles:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 chat:'<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5H8l-5 2 1.8-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 9h8m-8 5h5"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
 volume:'<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 muted:'<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
 stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
 attach:'<path d="m9 17 9-9a3 3 0 0 0-4-4L4 14a5 5 0 0 0 7 7L21 11M7 16l9-9"/>',
 send:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
 restore:'<path d="M3 11a9 9 0 1 1 2 7M3 11V4m0 7h7"/>',
 loader:'<path d="M21 12a9 9 0 1 1-9-9"/>'
};
export function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon'+(name==='loader'?' spinning':''));svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=paths[name]||paths.sparkles;return svg;}
export function setIcon(button,name,label){button.replaceChildren(icon(name));button.setAttribute('aria-label',label);button.title=label;}
export function hydrateIcons(){for(const n of document.querySelectorAll('[data-icon]'))n.replaceChildren(icon(n.dataset.icon));}
