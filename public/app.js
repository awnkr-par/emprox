const form=document.querySelector('#navigate');
const input=document.querySelector('#url');
const welcome=document.querySelector('#welcome');
const viewport=document.querySelector('#viewport');
const frame=document.querySelector('#page');
const current=document.querySelector('#current');
const status=document.querySelector('#message');
let lastUrl=null;
let blockedHosts=[];

function message(text,isError=false){status.textContent=text;status.classList.toggle('error',isError);}
function parseInput(){
  let raw=input.value.trim();
  if(!raw)throw new Error('Enter a website address.');
  if(!/^https?:\/\//i.test(raw))raw='https://'+raw;
  let url;
  try{url=new URL(raw);}catch{throw new Error('Invalid website URL.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)
    throw new Error('Only regular HTTP(S) URLs are supported.');
  const host=url.hostname.toLowerCase();
  if(blockedHosts.some(domain=>host===domain||host.endsWith('.'+domain)))
    throw new Error('This domain is blocked by EmProx settings.');
  return url;
}
function viewerUrl(url){return '/browse?url='+encodeURIComponent(url.href);}
function navigate(){
  try{
    const url=parseInput();lastUrl=url.href;input.value=url.href;
    frame.src=viewerUrl(url);current.textContent='Viewing '+url.hostname;
    welcome.classList.add('hidden');viewport.classList.remove('hidden');
    message('Loading '+url.hostname+'…');
  }catch(e){message(e.message,true);}
}
function home(){frame.removeAttribute('src');viewport.classList.add('hidden');welcome.classList.remove('hidden');message('Ready to browse');}
function openBlank(){
  let url;
  try{url=parseInput();}catch(e){message(e.message,true);return;}
  // Open synchronously from the click. Async popup opening is commonly blocked.
  const tab=window.open('about:blank','_blank');
  if(!tab){message('Popup blocked: allow popups for EmProx and try again.',true);return;}
  tab.opener=null;
  const doc=tab.document;
  doc.title='New Tab';
  doc.body.style.cssText='margin:0;background:#160b28;color:#f4e8ff;font-family:system-ui;display:flex;flex-direction:column;height:100vh;';
  const bar=doc.createElement('div');
  bar.style.cssText='background:#241338;color:#e6c5fc;padding:12px 16px;font-size:14px;display:flex;align-items:center;gap:12px;';
  const heading=doc.createElement('strong');
  heading.textContent='EmProx · '+url.hostname;
  bar.appendChild(heading);
  const hint=doc.createElement('span');
  hint.style.cssText='font-size:12px;opacity:.7;margin-left:auto;';
  hint.textContent='Restricted page viewer';
  bar.appendChild(hint);
  const iframe=doc.createElement('iframe');
  iframe.title='EmProx page';
  iframe.referrerPolicy='no-referrer';
  iframe.setAttribute('sandbox','allow-scripts');
  iframe.style.cssText='border:0;flex:1;width:100%;background:white;';
  iframe.src=new URL(viewerUrl(url),window.location.href).href;
  doc.body.append(bar,iframe);
  doc.close();
  message('Opened an about:blank tab');
}
form.addEventListener('submit',e=>{e.preventDefault();navigate();});
document.querySelector('#home').addEventListener('click',home);
document.querySelector('#close').addEventListener('click',home);
document.querySelector('#reload').addEventListener('click',()=>{
  if(!lastUrl){message('Open a page first.',true);return;}
  input.value=lastUrl;navigate();
});
document.querySelector('#newtab').addEventListener('click',openBlank);
frame.addEventListener('load',()=>{if(frame.getAttribute('src'))message('Page loaded. Basic scripts are enabled, but modern sites may still need unsupported APIs.');});
fetch('/config').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  blockedHosts=data.blockedHosts||[];
  document.querySelector('#hosts').textContent='Public websites are enabled. Adult/gore domain filtering is best-effort.';
}).catch(()=>{
  document.querySelector('#hosts').textContent='Could not load content filtering settings.';
  message('Configuration unavailable.',true);
});

const themeButton=document.querySelector('#theme-toggle');
function applyTheme(theme){
  const light=theme==='light';
  document.documentElement.dataset.theme=light?'light':'dark';
  themeButton.textContent=light?'☾ Dark':'☀ Light';
  themeButton.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
  themeButton.setAttribute('aria-pressed',String(light));
}
let savedTheme='dark';
try{savedTheme=localStorage.getItem('emprox-theme')||'dark';}catch{}
applyTheme(savedTheme);
themeButton.addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  applyTheme(next);
  try{localStorage.setItem('emprox-theme',next);}catch{}
});
