import * as THREE from '/vendor/three.module.js';
const $ = id => document.getElementById(id);
let session = null, stream = null, recorder = null, chunks = [], timer = null, recordingTimeout = null, playing = null, started = 0, busy = false;
const gifts = {star:['⭐','A little star to remind you how brightly you shine.'],rocket:['🚀','A little rocket for your next big adventure.'],teddy:['🧸','A cuddly bear for your imagination.'],book:['📚','A magical book full of stories to discover.'],rainbow:['🌈','A rainbow to brighten your day.'],tree:['🌲','A little evergreen for your next adventure.']};
function show(id){ for (const x of ['call','gift']) $(x).classList.toggle('hidden',x!==id); if(id) $(id).scrollIntoView({behavior:'smooth',block:'center'}); }
function stopMedia(){ clearTimeout(recordingTimeout); if(recorder && recorder.state !== 'inactive') {recorder.onstop=null;recorder.stop();} recorder=null; stream?.getTracks().forEach(t=>t.stop());stream=null; if(playing){playing.pause(); URL.revokeObjectURL(playing.src);playing=null;} }
async function start(){
  $('setup-error').textContent=''; if(!$('adult').checked){$('setup-error').textContent='Please ask a grown-up to join you first.';return;}
  $('start').disabled=true;
  try {const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adultPresent:true,language:$('language').value})});const data=await response.json();if(!response.ok) throw Error(data.error);session=data.id;started=Date.now();$('call-title').textContent='Santa is listening!';$('call-status').textContent='Tap the microphone, say hello, then tap it again.';$('record').disabled=false;show('call');timer=setInterval(()=>{const n=Math.floor((Date.now()-started)/1000);$('timer').textContent=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;if(n>=300) end();},1000);}
  catch(e){$('setup-error').textContent=e.message || 'Could not start the call.';} finally {$('start').disabled=false;}
}
async function record(){
  if(busy||!session)return;
  if(recorder?.state==='recording'){recorder.stop();return;}
  try {if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error('Recording needs a supported browser and a secure connection (HTTPS).');
    stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!session){stopMedia();return;} chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=send;recorder.start();$('record').classList.add('recording');$('record').setAttribute('aria-label','Stop recording and send');$('call-status').textContent='I’m listening... tap the microphone when you’re done.';recordingTimeout=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},20000);
  } catch(e){stopMedia();$('call-status').textContent=e.message || 'Please allow the microphone and try again.';}
}
async function send(){
  clearTimeout(recordingTimeout);stream?.getTracks().forEach(t=>t.stop());stream=null;$('record').classList.remove('recording');$('record').setAttribute('aria-label','Start recording');
  const active=session;if(!active)return;busy=true;$('record').disabled=true;$('call-status').textContent='Santa is thinking...';
  try {const form=new FormData();form.append('audio',new Blob(chunks,{type:recorder.mimeType}), 'message');const response=await fetch(`/api/turn/${encodeURIComponent(active)}`,{method:'POST',body:form});const data=await response.json();if(session!==active)return;if(!response.ok)throw Error(data.error);if(data.safety){session=null;clearInterval(timer);stopMedia();$('call-title').textContent='Let’s find your grown-up.';$('call-status').textContent='Please ask a trusted grown-up to stay with you now.';$('record').disabled=true;return;}
    $('call-status').textContent=data.reply;const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));playing=new Audio(url);playing.onended=()=>{URL.revokeObjectURL(url);playing=null;if(session===active){$('call-status').textContent='Your turn! Tap the microphone to speak.';$('record').disabled=false;}};await playing.play();
  }catch(e){if(session===active){$('call-status').textContent=e.message || 'Please try again.';$('record').disabled=false;}}finally{busy=false;}
}
async function end(){const active=session;session=null;clearInterval(timer);stopMedia();$('record').classList.remove('recording');let gift='star';if(active){try {const res=await fetch(`/api/session/${encodeURIComponent(active)}`,{method:'DELETE'});const data=await res.json();gift=gifts[data.gift]?data.gift:'star';}catch{}}$('gift-icon').textContent=gifts[gift][0];$('gift-text').textContent=gifts[gift][1];show('gift');}
$('start').addEventListener('click',start);$('record').addEventListener('click',record);$('end').addEventListener('click',end);$('again').addEventListener('click',()=>{show(null);$('home').scrollIntoView({behavior:'smooth'});});
window.addEventListener('pagehide',()=>{if(session)fetch(`/api/session/${encodeURIComponent(session)}`,{method:'DELETE',keepalive:true});stopMedia();});
try {
 const host=$('scene'), scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,8.6);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);host.classList.add('ready');
 scene.add(new THREE.HemisphereLight(0xffffff,0x90a58a,2));const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(-3,5,6);scene.add(light);
 const santa=new THREE.Group();scene.add(santa);
 const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.8});const red=mat('#b3473a'), cream=mat('#fff8e8'), skin=mat('#efb89d'), dark=mat('#343831'), rose=mat('#dd9688');
 function ball(x,y,z,sx,sy,sz,m,parent=santa){const o=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
 ball(0,-1.08,0,1.12,1.05,.68,red);ball(0,-1.7,.12,.75,.2,.62,cream);ball(0,.25,0,.83,.93,.63,skin);ball(0,-.37,.36,.83,.86,.47,cream);ball(-.63,-.18,.3,.27,.42,.32,cream);ball(.63,-.18,.3,.27,.42,.32,cream);ball(-.22,-.18,.7,.34,.16,.18,cream);ball(.22,-.18,.7,.34,.16,.18,cream);ball(0,.01,.72,.14,.13,.15,skin);ball(-.3,.28,.57,.042,.06,.04,dark);ball(.3,.28,.57,.042,.06,.04,dark);ball(-.52,.07,.54,.12,.07,.035,rose);ball(.52,.07,.54,.12,.07,.035,rose);ball(-.3,.44,.57,.18,.05,.05,cream);ball(.3,.44,.57,.18,.05,.05,cream);
 const hat=new THREE.Mesh(new THREE.ConeGeometry(.78,1.23,48),red);hat.position.set(.1,1.3,0);hat.rotation.z=-.22;santa.add(hat);ball(0,.83,.06,.84,.17,.65,cream);ball(.31,1.92,.02,.19,.19,.19,cream);ball(-1,-.85,0,.27,.68,.3,red).rotation.z=-.7;ball(1,-.85,0,.27,.68,.3,red).rotation.z=.7;ball(-1.3,-1.22,.1,.2,.2,.2,cream);ball(1.3,-1.22,.1,.2,.2,.2,cream);
 function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}window.addEventListener('resize',resize);resize();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function animate(t){if(!reduced){santa.rotation.y=Math.sin(t/2400)*.12;santa.position.y=Math.sin(t/1100)*.04;}renderer.render(scene,camera);requestAnimationFrame(animate)}requestAnimationFrame(animate);
}catch(_error){/* The illustrated fallback remains visible without WebGL. */}
