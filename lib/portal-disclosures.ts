/** Reveal a guide target without remounting its forms or search results. */
export function revealDetails(target:Element|null) {
  for(let element=target;element;element=element.parentElement) {
    if(element.tagName==="DETAILS")element.setAttribute("open","");
  }
}
