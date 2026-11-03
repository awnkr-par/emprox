const form=document.querySelector('#navigate'),input=document.querySelector('#url');
const welcome=document.querySelector('#welcome'),viewport=document.querySelector('#viewport');
const frame=document.querySelector('#page'),current=document.querySelector('#current');
function home(){frame.removeAttribute('src');viewport.classList.add('hidden');welcome.classList.remove('hidden');}
document.querySelector('#home').addEventListener('click',home);
document.querySelector('#close').addEventListener('click',home);
form.addEventListener('submit',e=>{e.preventDefault();let value=input.value.trim();
  if(!/^https?:\/\//i.test(value))value='https://'+value;
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error();
    current.textContent=url.hostname;frame.src='/browse?url='+encodeURIComponent(url.href);
    welcome.classList.add('hidden');viewport.classList.remove('hidden');
  }catch{alert('Enter a valid HTTP(S) URL');}
});
fetch('/config').then(r=>r.json()).then(data=>{
  document.querySelector('#hosts').textContent='Allowed hosts: '+data.allowedHosts.join(', ');
}).catch(()=>document.querySelector('#hosts').textContent='Unable to load configuration');
