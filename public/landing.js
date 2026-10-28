(() => {
 const $=id=>document.getElementById(id);
 const refresh=()=>{const chosen=$('cast')?.querySelector('[aria-pressed="true"] b');if(chosen)$('selectedName').textContent=chosen.textContent;const course=$('courses')?.querySelector('[aria-pressed="true"] h3');if(course)$('courseSummary').textContent='Selected: '+course.textContent;filter();};
 const filter=()=>{const query=($('crewSearch')?.value||'').trim().toLowerCase();let count=0;for(const card of $('cast')?.children||[]){const match=(card.getAttribute('aria-label')||'').toLowerCase().includes(query);card.hidden=!match;if(match)count++;}$('noCrew')?.classList.toggle('hidden',count>0||!query);};
 $('crewSearch')?.addEventListener('input',filter);
 for(const id of ['cast','courses'])if($(id))new MutationObserver(refresh).observe($(id),{childList:true});
 document.querySelectorAll('[data-help]').forEach(button=>button.addEventListener('click',()=>$('helpBtn').click()));
 document.querySelectorAll('[data-host]').forEach(button=>button.addEventListener('click',()=>$('hostBtn').click()));
 document.querySelectorAll('[data-scroll-top]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('hostBtn').focus({preventScroll:true});}));
 refresh();
})();
