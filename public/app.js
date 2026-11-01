import * as THREE from '/vendor/three.module.js';
import { localize, translate } from '/translations.js';
import { createAudioRecorder } from '/audio-format.js';
import { speechLevel, smoothSpeechLevel } from '/speech-animation.js';
const $ = id => document.getElementById(id);
let session = null, stream = null, recorder = null, chunks = [], timer = null, recordingTimeout = null, playing = null, started = 0, busy = false;
let audioContext = null, playbackGraph = null, resizeScene = () => {};
const santaScene = $('scene'), homeSceneParent = santaScene.parentElement, homeSceneNext = santaScene.nextSibling;
const gifts = {star:'⭐',rocket:'🚀',teddy:'🧸',book:'📖',rainbow:'🌈',tree:'🌲',moon:'🌙',dragon:'🐉',unicorn:'🦄',cat:'🐈',music:'🎵',art:'🎨',ocean:'🐬',dinosaur:'🦕',butterfly:'🦋',football:'⚽'};
let titleKey = 'listening', statusKey = 'initial', errorKey = '', currentGift = null, giftLanguage = '', ending = false, isRecording = false, reportKey = '';
let replayStartTimer = null, replayStopTimer = null;
let bookToken = null, bookUrl = null, bookController = null, bookStatusKey = '', archiveStatusKey = '', archiveAvailable = false, archiveDeleteStatusKey = '';
const t = key => translate($('language').value, key);
function setTitle(key){titleKey = key; $('call-title').textContent = t(key);}
function setStatus(key){statusKey = key; $('call-status').textContent = t(key);}
function setError(key){errorKey = key; $('setup-error').textContent = key ? t(key) : '';}
function validGift(gift){
  return gift && Object.hasOwn(gifts,gift.theme) && typeof gift.title==='string' && gift.title.trim() && gift.title.length<=80 && typeof gift.message==='string' && gift.message.trim() && gift.message.length<=200;
}
function renderGift(){
  const gift=validGift(currentGift) && giftLanguage===$('language').value ? currentGift : null;
  const theme=gift?.theme || 'star';
  $('gift-stage').dataset.theme=theme;
  $('gift-icon').textContent=gifts[theme];
  $('gift-name').textContent=gift ? gift.title : t('star');
  $('gift-text').textContent=gift ? gift.message : '';
}
function clearBook(){
  if(bookController){bookController.abort();bookController=null;}
  if(bookUrl){URL.revokeObjectURL(bookUrl);bookUrl=null;}
  if(bookToken){const token=bookToken;bookToken=null;fetch('/api/gifts/discard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),keepalive:true}).catch(()=>{});}
  bookStatusKey='';$('book-status').textContent='';$('book-create').disabled=false;
  $('book-create').classList.remove('hidden');$('book-link').classList.add('hidden');$('book-link').removeAttribute('href');$('book-download').classList.add('hidden');
  $('archive-consent').checked=false;$('archive-result').classList.add('hidden');$('archive-code').value='';archiveStatusKey='';$('archive-result-text').textContent='';
}
function clearGiftReplay(){
  clearTimeout(replayStartTimer);clearTimeout(replayStopTimer);
  $('gift-stage').classList.remove('is-replaying');$('gift-replay-status').textContent='';
}
function resetGift(){
  clearGiftReplay();
  const stage=$('gift-stage');stage.classList.remove('is-open');
  $('gift-open').disabled=false;$('gift-open').removeAttribute('aria-hidden');
  $('gift-intro').classList.remove('hidden');$('gift-copy').classList.add('hidden');$('gift-replay').classList.add('hidden');
}
function openGift(){
  $('gift-stage').classList.add('is-open');$('gift-open').disabled=true;$('gift-open').setAttribute('aria-hidden','true');
  $('gift-intro').classList.add('hidden');$('gift-copy').classList.remove('hidden');$('gift-replay').classList.remove('hidden');
  if(bookToken)$('book-download').classList.remove('hidden');
}
function updateLanguage(){
  localize($('language').value);
  $('call-title').textContent = t(titleKey);
  if (statusKey) $('call-status').textContent = t(statusKey);
  $('setup-error').textContent = errorKey ? t(errorKey) : '';
  renderGift();
  $('report-status').textContent = reportKey ? t(reportKey) : '';
  $('book-status').textContent = bookStatusKey ? t(bookStatusKey) : '';
  $('archive-availability').textContent = archiveAvailable ? '' : t('archiveUnavailable');
  $('archive-result-text').textContent = archiveStatusKey ? t(archiveStatusKey) : '';
  $('delete-gift-status').textContent = archiveDeleteStatusKey ? t(archiveDeleteStatusKey) : '';
  $('record').setAttribute('aria-label', t(isRecording ? 'recordStop' : 'recordStart'));
}
$('language').addEventListener('change', updateLanguage);
updateLanguage();
fetch('/api/gifts/archive-status').then(response=>response.ok ? response.json() : {available:false}).then(data=>{
  archiveAvailable=data.available===true;$('archive-consent').disabled=!archiveAvailable;
  $('archive-availability').textContent=archiveAvailable?'':t('archiveUnavailable');
}).catch(()=>{$('archive-availability').textContent=t('archiveUnavailable');});
function show(id){
  for (const x of ['call','gift']) $(x).classList.toggle('hidden',x!==id);
  if(id==='call') $('call-avatar').appendChild(santaScene);
  else homeSceneParent.insertBefore(santaScene,homeSceneNext);
  requestAnimationFrame(resizeScene);
  if(id) $(id).scrollIntoView({behavior:'smooth',block:'start'});
}
// Browsers require the audio context to be unlocked by a user's tap. If Web
// Audio is unavailable, normal playback still works with a simple animation.
function primeAudio(){
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioContext && AudioContextClass) audioContext = new AudioContextClass();
    if (audioContext?.state === 'suspended') audioContext.resume().catch(()=>{});
  } catch { /* Playback does not depend on Web Audio. */ }
}
function attachPlaybackGraph(audio){
  if (!audioContext || audioContext.state !== 'running') return;
  let source;
  try {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser); analyser.connect(audioContext.destination);
    playbackGraph = {source, analyser, samples:new Uint8Array(analyser.fftSize)};
  } catch {
    // Once a media element has a source node, it needs a route to the output.
    if (source) { try {source.connect(audioContext.destination); playbackGraph={source};} catch {} }
  }
}
function stopPlayback(){
  const audio = playing; playing = null;
  if(audio){audio.onended=null;audio.pause();URL.revokeObjectURL(audio.src);}
  if(playbackGraph){try{playbackGraph.source?.disconnect();playbackGraph.analyser?.disconnect();}catch{} playbackGraph=null;}
}
function stopMedia(){ clearTimeout(recordingTimeout); if(recorder && recorder.state !== 'inactive') {recorder.onstop=null;recorder.stop();} recorder=null; stream?.getTracks().forEach(t=>t.stop());stream=null; stopPlayback(); }
async function start(){
  if(ending)return;setError(''); if(!$('adult').checked){setError('needAdult');return;}
  clearBook();$('start').disabled=true;$('language').disabled=true;
  try {const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adultPresent:true,language:$('language').value})});const data=await response.json();if(!response.ok) throw Error(response.status === 503 ? 'unavailable' : 'error');session=data.id;$('safety-advice').classList.add('hidden');$('language').disabled=true;started=Date.now();setTitle('listening');setStatus('initial');$('record').disabled=false;show('call');timer=setInterval(()=>{const n=Math.floor((Date.now()-started)/1000);$('timer').textContent=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;if(n>=300) end();},1000);}
  catch(e){$('language').disabled=false;setError(e.message === 'unavailable' ? e.message : 'error');} finally {$('start').disabled=false;}
}
async function record(){
  if(busy||!session)return;
  primeAudio();
  if(recorder?.state==='recording'){recorder.stop();return;}
  try {if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error('microphone');
    stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!session){stopMedia();return;} chunks=[];recorder=createAudioRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=send;recorder.start();$('record').classList.add('recording');isRecording=true;$('record').setAttribute('aria-label',t('recordStop'));setStatus('recording');recordingTimeout=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},20000);
  } catch(e){stopMedia();setStatus('microphone');}
}
async function send(){
  clearTimeout(recordingTimeout);stream?.getTracks().forEach(t=>t.stop());stream=null;$('record').classList.remove('recording');isRecording=false;$('record').setAttribute('aria-label',t('recordStart'));
  const active=session;if(!active)return;busy=true;$('record').disabled=true;setStatus('thinking');
  try {const form=new FormData();form.append('audio',new Blob(chunks,{type:recorder.mimeType}), 'message');const response=await fetch(`/api/turn/${encodeURIComponent(active)}`,{method:'POST',body:form});const data=await response.json();if(session!==active)return;if(data.safetyUnavailable){session=null;clearInterval(timer);stopMedia();$('language').disabled=false;setTitle('serviceTitle');setStatus('error');$('record').disabled=true;return;}if(data.safety){session=null;clearInterval(timer);stopMedia();$('language').disabled=false;setTitle('safetyTitle');setStatus('safetyText');$('safety-advice').classList.remove('hidden');$('record').disabled=true;return;}
    if(data.code==='audio_unsupported')throw Error('audioUnsupported');
    if(response.status===404 || response.status===410){session=null;clearInterval(timer);stopMedia();$('language').disabled=false;setTitle('serviceTitle');setStatus('sessionExpired');$('record').disabled=true;return;}
    if(!response.ok)throw Error('error');
    statusKey=null;$('call-status').textContent=data.reply;const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    const audio=new Audio(url);playing=audio;attachPlaybackGraph(audio);setTitle('speakingTitle');
    audio.onended=()=>{if(playing!==audio)return;stopPlayback();if(session===active){setTitle('listening');setStatus('yourTurn');$('record').disabled=false;}};
    await audio.play();
    if(session!==active || playing!==audio){audio.pause();return;}
  }catch(e){if(session===active){stopPlayback();setTitle('listening');setStatus(e.message === 'audioUnsupported' ? 'audioUnsupported' : 'error');$('record').disabled=false;}}finally{busy=false;}
}
async function end(){
  if(ending)return;ending=true;
  const active=session, language=$('language').value;session=null;$('language').disabled=false;isRecording=false;
  $('record').setAttribute('aria-label',t('recordStart'));clearInterval(timer);stopMedia();$('record').classList.remove('recording');
  let gift=null, token=null;
  if(active){try {const res=await fetch(`/api/session/${encodeURIComponent(active)}/finish`,{method:'POST'});if(res.ok){const data=await res.json();if(validGift(data.gift))gift=data.gift;if(typeof data.bookToken==='string' && /^[A-Za-z0-9_-]{43}$/.test(data.bookToken))token=data.bookToken;}}catch{}}
  currentGift=gift;giftLanguage=language;bookToken=gift?token:null;resetGift();renderGift();show('gift');ending=false;
}
$('gift-open').addEventListener('click',openGift);
$('gift-replay').addEventListener('click',()=>{
  const stage=$('gift-stage');clearGiftReplay();
  const bounds=stage.getBoundingClientRect();
  const visible=bounds.top>=0 && bounds.bottom<=window.innerHeight;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if(!visible)stage.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
  replayStartTimer=setTimeout(()=>{
    if(!stage.classList.contains('is-open'))return;
    // Commit the removal before reapplying the class so every tap replays it.
    void stage.offsetWidth;stage.classList.add('is-replaying');
    $('gift-replay-status').textContent=t('giftSparkled');
    replayStopTimer=setTimeout(()=>{stage.classList.remove('is-replaying');$('gift-replay-status').textContent='';},2000);
  },visible || reduced ? 0 : 500);
});
$('start').addEventListener('click',start);$('record').addEventListener('click',record);$('end').addEventListener('click',end);$('again').addEventListener('click',()=>{clearBook();clearGiftReplay();show(null);$('home').scrollIntoView({behavior:'smooth'});});

$('book-create').addEventListener('click',async()=>{
  if(!bookToken || bookController)return;
  const token=bookToken, controller=new AbortController();bookController=controller;
  $('book-create').disabled=true;$('archive-consent').disabled=true;bookStatusKey='bookCreating';$('book-status').textContent=t(bookStatusKey);
  let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},4*60*1000);
  try {
    const response=await fetch('/api/gifts/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,saveIllustration:$('archive-consent').checked}),signal:controller.signal});
    if(!response.ok){let code;try{code=(await response.json()).code;}catch{}throw Error(code||'book_unavailable');}
    const pdf=await response.blob();if(!pdf.size || pdf.type!=='application/pdf')throw Error('book_unavailable');
    if(bookToken!==token || controller.signal.aborted)return;
    bookUrl=URL.createObjectURL(pdf);$('book-link').href=bookUrl;$('book-link').classList.remove('hidden');$('book-create').classList.add('hidden');
    bookStatusKey='bookReady';$('book-status').textContent=t(bookStatusKey);
    const archiveResult=response.headers.get('X-Gift-Archive');
    if(archiveResult==='saved'){
      const code=response.headers.get('X-Gift-Deletion-Code');
      if(code && /^[A-Za-z0-9_-]{43}$/.test(code)){$('archive-code').value=code;archiveStatusKey='archiveSaved';$('archive-result-text').textContent=t(archiveStatusKey);$('archive-result').classList.remove('hidden');}
    }else if(archiveResult==='unavailable'){bookStatusKey='archiveFailed';$('book-status').textContent=t(bookStatusKey);}
  }catch(error){
    if(bookToken!==token || (controller.signal.aborted && !timedOut))return;
    bookStatusKey=error.message==='book_expired'?'bookExpired':error.message==='book_busy'?'bookBusy':'bookError';
    $('book-status').textContent=t(bookStatusKey);
  }finally{
    clearTimeout(timeout);if(bookController===controller)bookController=null;
    if(bookToken===token)$('book-create').disabled=bookStatusKey==='bookExpired';
    $('archive-consent').disabled=!archiveAvailable;
  }
});
$('delete-gift-button').addEventListener('click',async()=>{
  $('delete-gift-button').disabled=true;
  try {
    const response=await fetch('/api/gifts/delete-archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('delete-code').value.trim()})});
    archiveDeleteStatusKey=response.ok?'archiveDeleted':'archiveDeleteError';
    if(response.ok)$('delete-code').value='';
  }catch {archiveDeleteStatusKey='archiveDeleteError';}
  finally {$('delete-gift-button').disabled=false;$('delete-gift-status').textContent=t(archiveDeleteStatusKey);}
});
$('report-send').addEventListener('click', async () => {
  $('report-send').disabled=true;
  try {const response=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:$('report-category').value})});reportKey=response.ok?'reportSent':'reportFailed';}
  catch {reportKey='reportFailed';}
  finally {$('report-send').disabled=false;$('report-status').textContent=t(reportKey);}
});
window.addEventListener('pagehide',()=>{if(session)fetch(`/api/session/${encodeURIComponent(session)}`,{method:'DELETE',keepalive:true});clearBook();stopMedia();});
try {
 const host=$('scene'), scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,8.6);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);host.classList.add('ready');
 scene.add(new THREE.HemisphereLight(0xffffff,0x90a58a,2));const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(-3,5,6);scene.add(light);
 const santa=new THREE.Group();scene.add(santa);
 const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.8});const red=mat('#b3473a'), cream=mat('#fff8e8'), skin=mat('#efb89d'), dark=mat('#343831'), rose=mat('#dd9688');
 function ball(x,y,z,sx,sy,sz,m,parent=santa){const o=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;}
 ball(0,-1.08,0,1.12,1.05,.68,red);ball(0,-1.7,.12,.75,.2,.62,cream);ball(0,.25,0,.83,.93,.63,skin);ball(0,-.37,.36,.83,.86,.47,cream);ball(-.63,-.18,.3,.27,.42,.32,cream);ball(.63,-.18,.3,.27,.42,.32,cream);ball(-.22,-.18,.7,.34,.16,.18,cream);ball(.22,-.18,.7,.34,.16,.18,cream);ball(0,.01,.72,.14,.13,.15,skin);ball(-.3,.28,.57,.042,.06,.04,dark);ball(.3,.28,.57,.042,.06,.04,dark);ball(-.52,.07,.54,.12,.07,.035,rose);ball(.52,.07,.54,.12,.07,.035,rose);ball(-.3,.44,.57,.18,.05,.05,cream);ball(.3,.44,.57,.18,.05,.05,cream);
 // The mouth sits just in front of the beard, below the moustache.
 const mouth=ball(0,-.43,.85,.17,.035,.035,dark);let mouthMotion=0;
 const hat=new THREE.Mesh(new THREE.ConeGeometry(.78,1.23,48),red);hat.position.set(.1,1.3,0);hat.rotation.z=-.22;santa.add(hat);ball(0,.83,.06,.84,.17,.65,cream);ball(.31,1.92,.02,.19,.19,.19,cream);ball(-1,-.85,0,.27,.68,.3,red).rotation.z=-.7;ball(1,-.85,0,.27,.68,.3,red).rotation.z=.7;ball(-1.3,-1.22,.1,.2,.2,.2,cream);ball(1.3,-1.22,.1,.2,.2,.2,cream);
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
 resizeScene=resize;window.addEventListener('resize',resize);if(window.ResizeObserver)new ResizeObserver(resize).observe(host);resize();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function animate(t){
   const speaking=Boolean(playing && !playing.paused && !playing.ended);
   let level=0;
   if(speaking && !reduced){
     if(playbackGraph?.analyser){playbackGraph.analyser.getByteTimeDomainData(playbackGraph.samples);level=speechLevel(playbackGraph.samples);}
     else level=.3 + .2*Math.sin(t/110);
   }
   mouthMotion=reduced ? (speaking ? .22 : 0) : smoothSpeechLevel(mouthMotion,level);
   mouth.scale.y=.035+mouthMotion*.13;mouth.position.y=-.43-mouthMotion*.025;
   if(!reduced){santa.rotation.y=Math.sin(t/2400)*.12;santa.position.y=Math.sin(t/1100)*.04;}
   renderer.render(scene,camera);requestAnimationFrame(animate);
 }
 requestAnimationFrame(animate);
}catch(_error){/* The illustrated fallback remains visible without WebGL. */}
