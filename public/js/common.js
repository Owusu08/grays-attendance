/* Gray's Attendance - shared helpers */
var HOMES={lecturer:'dashboard.html',admin:'admin.html',institution:'institution-dashboard.html'};
var TITLES=/^(prof|professor|dr|mr|mrs|ms|miss|rev|eng|ing|hon)\.?$/i;

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function val(id){var e=document.getElementById(id);return e?e.value.trim():'';}
function initials(n){var w=String(n||'').split(/\s+/).filter(function(x){return x&&!TITLES.test(x);});if(!w.length)return '?';return w.map(function(x){return x[0];}).slice(0,2).join('').toUpperCase();}
function fmtDate(d){if(!d)return '-';var x=new Date(d);return isNaN(x)?String(d):x.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtTime(d){var x=new Date(d);return isNaN(x)?'-':x.toLocaleTimeString('en-GB',{hour:'numeric',minute:'2-digit',hour12:true});}
function plural(n,w){return n+' '+w+(n===1?'':'s');}

function syncThemeBtn(){var t=document.documentElement.getAttribute('data-theme')==='dark';document.querySelectorAll('#themeBtn').forEach(function(b){b.textContent=t?'Light':'Dark';b.setAttribute('aria-label',t?'Switch to light mode':'Switch to dark mode');});}
function toggleTheme(){var n=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('theme',n);}catch(e){}syncThemeBtn();}
function toggleMenu(force){var m=document.getElementById('mobileMenu');if(!m)return;var open=typeof force==='boolean'?force:!m.classList.contains('open');m.classList.toggle('open',open);var b=document.querySelector('.menu-btn');if(b)b.setAttribute('aria-expanded',open?'true':'false');}

function toast(msg,type){var w=document.getElementById('toastWrap');if(!w)return;w.setAttribute('aria-live','polite');var e=document.createElement('div');e.className='toast toast-'+(type||'success');e.setAttribute('role',type==='error'?'alert':'status');e.textContent=msg;w.appendChild(e);requestAnimationFrame(function(){e.classList.add('in');});setTimeout(function(){e.classList.remove('in');setTimeout(function(){e.remove();},260);},type==='error'?4500:3000);}
function copyText(t,msg){
  function fallback(){try{var a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();var ok=document.execCommand('copy');a.remove();toast(ok?(msg||'Copied'):'Could not copy.',ok?'success':'error');}catch(e){toast('Could not copy.','error');}}
  if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(function(){toast(msg||'Copied');},fallback);}else fallback();
}
function showErr(m,id){var e=document.getElementById(id||'err');if(!e)return;e.textContent=m;e.classList.add('show');e.setAttribute('role','alert');}
function hideErr(id){var e=document.getElementById(id||'err');if(e){e.classList.remove('show');}}
function setBusy(btn,on,text){if(!btn)return;if(on){btn.dataset.label=btn.textContent;btn.disabled=true;btn.innerHTML='<span class="spinner"></span>'+esc(text||'Please wait...');}else{btn.disabled=false;btn.textContent=text||btn.dataset.label||btn.textContent;}}
async function readJson(r){try{return await r.json();}catch(e){return {};}}

async function logout(url){try{await fetch('/api/auth/logout',{method:'POST'});}catch(e){}location.href=url;}
async function guard(role,login){
  var r;try{r=await fetch('/api/auth/me');}catch(e){toast('Could not reach the server. Check your connection.','error');return null;}
  if(r.status===401){location.href=login;return null;}
  var m=await readJson(r);
  if(m.role!==role){location.href=HOMES[m.role]||login;return null;}
  var w=document.getElementById('who');if(w)w.textContent=m.full_name||'';
  return m;
}
function statusFor(c){if(c.revoked_at)return 'expired';if(c.expires_at&&new Date(c.expires_at)<new Date())return 'expired';if(c.max_uses&&c.uses>=c.max_uses)return 'used';return 'active';}
function usesText(c){return c.uses+' / '+(c.max_uses?c.max_uses:'no limit');}
function cap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1);}

/* delegated copy buttons: <button data-copy="CODE" data-msg="Code copied"> */
document.addEventListener('click',function(e){
  var c=e.target.closest&&e.target.closest('[data-copy]');if(c){copyText(c.dataset.copy,c.dataset.msg||'Copied');return;}
  var cf=e.target.closest&&e.target.closest('[data-copy-from]');if(cf){var src=document.getElementById(cf.dataset.copyFrom);if(src)copyText(src.textContent,'Code copied');return;}
  var rv=e.target.closest&&e.target.closest('[data-revoke]');if(rv&&typeof revoke==='function'){revoke(rv.dataset.revoke);return;}
  if(e.target.classList&&e.target.classList.contains('modal-overlay')&&typeof closeModal==='function')closeModal();
  if(e.target.closest&&e.target.closest('.mobile-menu a'))toggleMenu(false);
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(typeof closeModal==='function')closeModal();toggleMenu(false);}});

document.querySelectorAll('.toggle-password').forEach(function(b){b.textContent='Show';b.setAttribute('aria-label','Show password');b.addEventListener('click',function(){var i=document.getElementById(b.dataset.target);var hide=i.type==='password';i.type=hide?'text':'password';b.textContent=hide?'Hide':'Show';b.setAttribute('aria-label',hide?'Hide password':'Show password');});});
if(document.body.classList.contains('auth')){var tb=document.createElement('button');tb.id='themeBtn';tb.className='btn btn-ghost btn-sm auth-theme';tb.type='button';tb.onclick=toggleTheme;document.body.appendChild(tb);}
syncThemeBtn();

function setupAuth(c){
  fetch('/api/auth/me').then(function(r){return r.ok?r.json():null;}).then(function(m){if(m&&m.role===c.role)location.href=c.home;}).catch(function(){});
  var f=document.getElementById('form'),b=f.querySelector('button[type=submit]'),label=b.textContent;
  var first=f.querySelector('input');if(first&&!window.matchMedia('(pointer:coarse)').matches)first.focus();
  f.addEventListener('submit',async function(e){
    e.preventDefault();hideErr();
    var p;try{p=c.build();}catch(x){return showErr(x.message);}
    setBusy(b,true,c.busy);
    try{var r=await fetch(c.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});var d=await readJson(r);
      if(!r.ok){setBusy(b,false,label);return showErr(d.error||c.fail);}
      b.innerHTML='<span class="spinner"></span>Redirecting...';location.href=c.home;
    }catch(x){setBusy(b,false,label);showErr('Could not reach the server. Check your connection and try again.');}
  });
}
