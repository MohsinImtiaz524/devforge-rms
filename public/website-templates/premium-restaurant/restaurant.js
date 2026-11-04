'use strict';
(()=>{
 const cards=[...document.querySelectorAll('[data-product-card]')],chips=[...document.querySelectorAll('[data-category-filter]')],search=document.querySelector('[data-menu-search]'),empty=document.querySelector('[data-menu-empty]'),count=document.querySelector('[data-results-count]'),heading=document.querySelector('[data-results-heading]');
 let category='';
 function filter(){const query=(search?.value||'').trim().toLocaleLowerCase();let visible=0;for(const card of cards){const matches=(!category||(category==='__deals'?card.dataset.deal==='true':card.dataset.category===category))&&(!query||card.dataset.search.includes(query));card.hidden=!matches;if(matches)visible++;}chips.forEach(chip=>{const active=chip.dataset.categoryFilter===category;chip.classList.toggle('is-active',active);chip.setAttribute('aria-pressed',String(active));});if(empty)empty.hidden=visible>0;if(count)count.textContent=visible+' '+(visible===1?'item':'items');if(heading)heading.textContent=category==='__deals'?'Our Deals':category||'Our Menu';}
 search?.addEventListener('input',filter);chips.forEach(chip=>chip.addEventListener('click',()=>{category=chip.dataset.categoryFilter;filter();}));
 document.querySelectorAll('[data-filter-deals]').forEach(link=>link.addEventListener('click',()=>{category='__deals';if(search)search.value='';filter();}));
 function reset(){category='';if(search)search.value='';filter();}
 document.querySelectorAll('[data-reset-menu],[data-show-all]').forEach(control=>control.addEventListener('click',reset));
 document.querySelectorAll('[data-product-open]').forEach(button=>button.addEventListener('click',()=>{const dialog=document.getElementById(button.dataset.productOpen);if(dialog instanceof HTMLDialogElement){dialog.showModal();dialog.addEventListener('close',()=>button.focus(),{once:true});}}));
 document.querySelectorAll('.pr-product-dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
 const mobile=document.querySelector('.pr-mobile-navigation');mobile?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobile.open=false;}));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&mobile)mobile.open=false;});
 document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.pr-desktop-nav a').forEach(item=>{if(item.getAttribute('href')===link.getAttribute('href'))item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});}));
})();
