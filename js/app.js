/* ============ AUDIO ENGINE ============ */
let ctx, master, chorusWet, chorusDry, chorusLfo, chorusLfoGain, delayNode, delayFb, delayWet, delayDry;
let synths = {}, lfo, lfoGain, patch = {};
let initialized = false;
let knobControls = {};

const params = {
  syn1:{wave:'sawtooth',octave:0,tune:0,cutoff:0.45,reso:0.2,envAmt:0.6,attack:0.05,decay:0.3,sustain:0.2,release:0.1,level:0.8,legato:false},
  syn2:{wave:'square',octave:1,tune:0,cutoff:0.6,reso:0.4,envAmt:0.5,attack:0.01,decay:0.2,sustain:0.1,release:0.2,level:0.5,legato:false},
  lfoRate:4, chorusRate:1.2, chorusDepth:0.5, delayTime:0.32, delayFb:0.35, delayMix:0.3,
  chorusOn:false, delayOn:false,
  patch:{'syn1-pitch':0,'syn1-cutoff':0,'syn2-pitch':0,'syn2-cutoff':0}
};

/* ============ RECORDING ENGINE ============ */
const recordDest = {};
const mediaRecorders = {};
const recordedChunks = {};
const STEMS = ['master', 'syn1', 'syn2', 'drum'];
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let takeStamp = '';

function noteFreq(semi){ return 261.6256 * Math.pow(2, semi/12); }
function curve(min,max,n){ return min + (max-min)*n; } 

function initAudio(){
  if(initialized) return;
  
  try {
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9;

    // Feature detect MediaStreamDestination for Safari/iOS compatibility
    const supportsRecording = !!ctx.createMediaStreamDestination;

    if (supportsRecording) {
      recordDest.master = ctx.createMediaStreamDestination();
      master.connect(recordDest.master);
    }

    const busSyn1 = ctx.createGain(); busSyn1.gain.value = 1;
    if (supportsRecording) {
      recordDest.syn1 = ctx.createMediaStreamDestination(); 
      busSyn1.connect(recordDest.syn1);
    }
    window.__busSyn1 = busSyn1;

    const busSyn2 = ctx.createGain(); busSyn2.gain.value = 1;
    if (supportsRecording) {
      recordDest.syn2 = ctx.createMediaStreamDestination(); 
      busSyn2.connect(recordDest.syn2);
    }
    window.__busSyn2 = busSyn2;

    const busDrum = ctx.createGain(); busDrum.gain.value = 1;
    if (supportsRecording) {
      recordDest.drum = ctx.createMediaStreamDestination(); 
      busDrum.connect(recordDest.drum);
    }
    window.__busDrum = busDrum;

    const fxIn = ctx.createGain();
    busSyn1.connect(fxIn);
    busSyn2.connect(fxIn);
    busDrum.connect(fxIn);

    chorusDry = ctx.createGain(); chorusWet = ctx.createGain();
    const chorusDelay = ctx.createDelay(0.05); chorusDelay.delayTime.value = 0.012;
    chorusLfo = ctx.createOscillator(); chorusLfo.type='sine'; chorusLfo.frequency.value = params.chorusRate;
    chorusLfoGain = ctx.createGain(); chorusLfoGain.gain.value = 0.004 * params.chorusDepth;
    chorusLfo.connect(chorusLfoGain); chorusLfoGain.connect(chorusDelay.delayTime); chorusLfo.start();
    fxIn.connect(chorusDry);
    fxIn.connect(chorusDelay); chorusDelay.connect(chorusWet);
    chorusDry.gain.value = 1; chorusWet.gain.value = 0;

    const chorusOut = ctx.createGain();
    chorusDry.connect(chorusOut); chorusWet.connect(chorusOut);

    delayNode = ctx.createDelay(1.0); delayNode.delayTime.value = params.delayTime;
    delayFb = ctx.createGain(); delayFb.gain.value = params.delayFb;
    delayWet = ctx.createGain(); delayWet.gain.value = 0;
    delayDry = ctx.createGain(); delayDry.gain.value = 1;
    chorusOut.connect(delayDry);
    chorusOut.connect(delayNode); delayNode.connect(delayFb); delayFb.connect(delayNode);
    delayNode.connect(delayWet);
    delayDry.connect(master); delayWet.connect(master);
    master.connect(ctx.destination);

    window.__fxIn = fxIn; 

    lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value = params.lfoRate;
    lfoGain = ctx.createGain(); lfoGain.gain.value = 1;
    lfo.connect(lfoGain); lfo.start();

    synths.syn1 = buildSynth('syn1');
    synths.syn2 = buildSynth('syn2');

    initialized = true;
    document.getElementById('start-overlay').style.display='none';
    
    // Auto-play demo sequence
    if(!playing) {
        songMode = true;
        activeSongPattern = songChain[0];
        startSeq();
    }
  } catch (err) {
    console.error("Audio Context Init Failed:", err);
    alert("Audio Engine Failed to Start. Ensure you are using a modern browser like Chrome or Edge.");
  }
}

function buildSynth(name){
  const vco = ctx.createOscillator();
  vco.type = params[name].wave;
  vco.frequency.value = noteFreq(0 + params[name].octave*12);
  const vcf = ctx.createBiquadFilter(); vcf.type='lowpass';
  const vca = ctx.createGain(); vca.gain.value = 0;
  const level = ctx.createGain(); level.gain.value = params[name].level;

  vco.connect(vcf); vcf.connect(vca); vca.connect(level); 
  level.connect(name === 'syn1' ? window.__busSyn1 : window.__busSyn2);
  vco.start();

  const pitchModGain = ctx.createGain(); pitchModGain.gain.value = 0;
  const cutoffModGain = ctx.createGain(); cutoffModGain.gain.value = 0;
  lfoGain.connect(pitchModGain); pitchModGain.connect(vco.detune);
  lfoGain.connect(cutoffModGain); cutoffModGain.connect(vcf.frequency);

  applyFilter(name, vcf);

  return {vco, vcf, vca, level, pitchModGain, cutoffModGain, baseNote:0, _held:false};
}

function cutoffHz(n){ return 80 * Math.pow(60, n); } 
function applyFilter(name, vcf){
  const p = params[name];
  vcf.frequency.setTargetAtTime(cutoffHz(p.cutoff), ctx.currentTime, 0.02);
  vcf.Q.setTargetAtTime(p.reso*18, ctx.currentTime, 0.02);
}

function triggerEnvelope(name, note){
  const s = synths[name], p = params[name];
  if(!s) return;
  const t = ctx.currentTime;
  const freq = noteFreq((note||0) + p.octave*12) * Math.pow(2, p.tune/1200);
  
  if (p.legato && s._held) {
    s.vco.frequency.setTargetAtTime(freq, t, 0.04);
  } else {
    s.vco.frequency.setTargetAtTime(freq, t, 0.005);
    const peak = p.level;
    const sustainLevel = peak * p.sustain;
    
    s.vca.gain.cancelScheduledValues(t);
    s.vca.gain.setValueAtTime(s.vca.gain.value, t);
    s.vca.gain.linearRampToValueAtTime(peak, t + Math.max(0.002,p.attack*1.2));
    s.vca.gain.linearRampToValueAtTime(sustainLevel, t + p.attack*1.2 + p.decay*1.2);

    const baseCut = cutoffHz(p.cutoff);
    const envCut = baseCut * (1 + p.envAmt*3);
    s.vcf.frequency.cancelScheduledValues(t);
    s.vcf.frequency.setValueAtTime(s.vcf.frequency.value, t);
    s.vcf.frequency.linearRampToValueAtTime(Math.min(12000,Math.max(40,envCut)), t + Math.max(0.002,p.attack*1.2));
    s.vcf.frequency.linearRampToValueAtTime(baseCut, t + p.attack*1.2 + p.decay*1.2);
  }
  s._held = true;
}

function releaseEnvelope(name){
  const s = synths[name], p = params[name];
  if(!s) return;
  const t = ctx.currentTime;
  s.vca.gain.cancelScheduledValues(t);
  s.vca.gain.setValueAtTime(s.vca.gain.value, t);
  s.vca.gain.linearRampToValueAtTime(0, t + Math.max(0.02,p.release*1.5));
  s._held = false;
}

function ensureRunning(){
  if(ctx && ctx.state==='suspended'){ ctx.resume().catch(()=>{}); }
}

function kaossNoteOn(name){
  const s = synths[name], p = params[name];
  if(!s) return;
  const t = ctx.currentTime;
  s.vcf.frequency.cancelScheduledValues(t); 
  s.vca.gain.cancelScheduledValues(t);
  s.vca.gain.setValueAtTime(s.vca.gain.value, t);
  s.vca.gain.linearRampToValueAtTime(p.level, t + 0.02);
}
function kaossNoteOff(name){
  const s = synths[name], p = params[name];
  if(!s) return;
  const t = ctx.currentTime;
  s.vca.gain.cancelScheduledValues(t);
  s.vca.gain.setValueAtTime(s.vca.gain.value, t);
  s.vca.gain.linearRampToValueAtTime(0, t + Math.max(0.03,p.release*1.2));
}

/* ---- DRUM synthesis ---- */
const drumDefs = [
  {id:'kick', name:'KICK'}, {id:'snare', name:'SNARE'},
  {id:'hihat', name:'HI-HAT'}, {id:'tom', name:'TOM'}
];
function makeNoiseBuffer(){
  const b = ctx.createBuffer(1, ctx.sampleRate*0.5, ctx.sampleRate);
  const d = b.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return b;
}
let noiseBuf = null;

function playDrum(id){
  if(!ctx) return;
  if(!noiseBuf) noiseBuf = makeNoiseBuffer();
  const t = ctx.currentTime;
  
  if(id==='kick'){
    const o = ctx.createOscillator(); o.type='sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(400, t); 
    o.frequency.exponentialRampToValueAtTime(150, t + 0.015);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(window.__busDrum); o.start(t); o.stop(t+0.4);
    
  } else if(id==='snare'){
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2200; bp.Q.value=1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.2);
    src.connect(bp); bp.connect(g); g.connect(window.__busDrum); src.start(t); src.stop(t+0.2);
    const o = ctx.createOscillator(); o.type='triangle';
    const bodyG = ctx.createGain();
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.1);
    bodyG.gain.setValueAtTime(0.6, t); bodyG.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(bodyG); bodyG.connect(window.__busDrum); o.start(t); o.stop(t+0.2);
    
  } else if(id==='hihat'){
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=8000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.05);
    src.connect(hp); hp.connect(g); g.connect(window.__busDrum); src.start(t); src.stop(t+0.08);
    
  } else if(id==='tom'){
    const o = ctx.createOscillator(); o.type='sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.02);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(window.__busDrum); o.start(t); o.stop(t+0.4);
  }
}

document.getElementById('start-overlay').addEventListener('click', initAudio);

/* ============ TABS & BUTTONS ============ */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.style.display='none');
    tab.classList.add('active');
    document.querySelector(`.panel[data-panel="${tab.dataset.tab}"]`).style.display='block';
  });
});

document.querySelectorAll('.tgl-btn[data-param="legato"]').forEach(btn => {
  btn.addEventListener('click', e => {
    const synth = e.target.dataset.synth;
    params[synth].legato = !params[synth].legato;
    e.target.textContent = 'LEGATO ' + (params[synth].legato ? 'ON' : 'OFF');
    e.target.classList.toggle('on', params[synth].legato);
  });
});

/* ============ KNOBS ============ */
function paintKnob(knob, norm){
  const deg = -135 + norm*270;
  knob.style.transform = `rotate(${deg}deg)`;
}
function setupKnob(knob, onChange, initNorm){
  const min = parseFloat(knob.dataset.min), max = parseFloat(knob.dataset.max);
  let norm = initNorm!==undefined ? initNorm : (parseFloat(knob.dataset.default)-min)/(max-min);
  paintKnob(knob, norm);
  let dragging=false, startY=0, startNorm=0;
  knob.addEventListener('pointerdown', e=>{ dragging=true; startY=e.clientY; startNorm=norm; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const dy = (startY - e.clientY)/140;
    norm = Math.min(1, Math.max(0, startNorm + dy));
    paintKnob(knob, norm);
    const value = min + (max-min)*norm;
    onChange(value, norm);
  });
  knob.addEventListener('pointerup', e=>{ dragging=false; });
  knob.addEventListener('pointercancel', ()=>{ dragging=false; });
  onChange(min+(max-min)*norm, norm);
  return {set:(v)=>{ norm=(v-min)/(max-min); paintKnob(knob,norm); onChange(v,norm); }};
}

document.querySelectorAll('.knob[data-synth]').forEach(knob=>{
  const name = knob.dataset.synth, prm = knob.dataset.param;
  const ctrl = setupKnob(knob, (v)=>{
    params[name][prm] = v;
    const out = document.querySelector(`[data-out="${name}-${prm}"]`);
    if(out) out.textContent = (prm==='cutoff') ? Math.round(cutoffHz(v))+'Hz'
      : (prm==='tune') ? Math.round(v)
      : v.toFixed(2);
    if(initialized){
      if(prm==='cutoff'||prm==='reso') applyFilter(name, synths[name].vcf);
      if(prm==='level') synths[name].level.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    }
  });
  knobControls[`${name}-${prm}`] = ctrl;
});

document.querySelectorAll('select.dsel[data-synth]').forEach(sel=>{
  sel.addEventListener('change', ()=>{
    const name=sel.dataset.synth, prm=sel.dataset.param;
    const v = (prm==='octave') ? parseInt(sel.value) : sel.value;
    params[name][prm]=v;
    if(initialized){
      if(prm==='wave') synths[name].vco.type = v;
    }
  });
});

document.querySelectorAll('[data-hold]').forEach(btn=>{
  const name = btn.dataset.hold;
  const down = ()=>{ initAudio(); ensureRunning(); btn.classList.add('on'); triggerEnvelope(name, 0); };
  const up = ()=>{ btn.classList.remove('on'); releaseEnvelope(name); };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
});

/* ============ DRUM PANEL ============ */
const drumHost = document.getElementById('drum-parts');
drumDefs.forEach(d=>{
  const c = document.createElement('div'); c.className='ctrl';
  c.innerHTML = `<button class="btn testbtn" style="padding:16px 14px; height:60px;">${d.name}</button>`;
  const btn = c.querySelector('button');
  btn.addEventListener('pointerdown', ()=>{ initAudio(); ensureRunning(); playDrum(d.id); btn.classList.add('on'); });
  btn.addEventListener('pointerup', ()=> btn.classList.remove('on'));
  btn.addEventListener('pointerleave', ()=> btn.classList.remove('on'));
  drumHost.appendChild(c);
});

/* ============ PATCH BAY ============ */
const destinations = [
  {key:'syn1-pitch', label:'SYN1 PITCH', synth:'syn1', mod:'pitchModGain', scale:1200},
  {key:'syn1-cutoff', label:'SYN1 CUTOFF', synth:'syn1', mod:'cutoffModGain', scale:4000},
  {key:'syn2-pitch', label:'SYN2 PITCH', synth:'syn2', mod:'pitchModGain', scale:1200},
  {key:'syn2-cutoff', label:'SYN2 CUTOFF', synth:'syn2', mod:'cutoffModGain', scale:4000},
];
const pg = document.getElementById('patch-grid');
pg.innerHTML = '<div></div>' + destinations.map(d=>`<div class="patch-head">${d.label}</div>`).join('');
pg.innerHTML += '<div class="patch-src">LFO 1</div>' + destinations.map(d=>`
  <div style="flex-direction:column; padding-top:4px;">
    <div class="jack" data-dest="${d.key}"></div>
    <input type="range" class="depth" data-depth="${d.key}" min="0" max="1" step="0.01" value="0">
  </div>`).join('');

pg.querySelectorAll('.jack').forEach(jack=>{
  jack.addEventListener('click', ()=>{
    initAudio();
    const key = jack.dataset.dest;
    const active = jack.classList.toggle('active');
    const depthInput = pg.querySelector(`[data-depth="${key}"]`);
    const depth = active ? (parseFloat(depthInput.value)||0.5) : 0;
    if(!active) depthInput.value = 0;
    else if(depthInput.value=="0") depthInput.value = 0.5;
    applyPatch(key, active ? parseFloat(depthInput.value) : 0);
  });
});
pg.querySelectorAll('.depth').forEach(inp=>{
  inp.addEventListener('input', ()=>{
    const key = inp.dataset.depth;
    const jack = pg.querySelector(`.jack[data-dest="${key}"]`);
    if(parseFloat(inp.value)>0) jack.classList.add('active'); else jack.classList.remove('active');
    applyPatch(key, parseFloat(inp.value));
  });
});
function applyPatch(key, depth){
  params.patch[key] = depth;
  const dest = destinations.find(d=>d.key===key);
  if(!initialized || !dest) return;
  const node = synths[dest.synth][dest.mod];
  const t = ctx.currentTime;
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(node.gain.value, t);
  node.gain.linearRampToValueAtTime(depth * dest.scale, t + 0.02);
}
knobControls.lfoRate = setupKnob(document.getElementById('lfo-rate-knob'), (v)=>{
  params.lfoRate = v;
  document.getElementById('lfo-rate-val').textContent = v.toFixed(2)+'Hz';
  if(initialized) lfo.frequency.setTargetAtTime(v, ctx.currentTime, 0.02);
});
document.getElementById('lfo-wave').addEventListener('change', e=>{ if(initialized) lfo.type = e.target.value; });

/* ============ SEQUENCER & DEMO PATTERNS ============ */
const tracks = ['syn1','syn2','kick','snare','hihat','tom'];
const trackLabel = {syn1:'SYN1', syn2:'SYN2', kick:'KICK', snare:'SNARE', hihat:'HI-HAT', tom:'TOM'};
let pattern = {A:{}, B:{}};
['A','B'].forEach(p=> tracks.forEach(t=> pattern[p][t] = Array.from({length:16}, ()=>({on:false, note:0})) ));

function mapDemoTrack(patt, track, arr, notesArr) {
    for(let i=0; i<16; i++) {
        pattern[patt][track][i].on = arr[i] === 1;
        if(notesArr) pattern[patt][track][i].note = notesArr[i];
    }
}

// Demo Pattern A (Groove)
mapDemoTrack('A', 'kick',  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]);
mapDemoTrack('A', 'snare', [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]);
mapDemoTrack('A', 'hihat', [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]);
mapDemoTrack('A', 'syn1',  [1,0,1,1, 0,1,0,1, 1,0,1,0, 0,1,0,0], [-12,0,-12,-12, 0,-5,0,-3, -12,0,-12,0, 0,-5,0,0]);
mapDemoTrack('A', 'syn2',  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0], [0,0,12,0, 0,0,7,0, 0,0,12,0, 0,0,7,0]);

// Demo Pattern B (Build)
mapDemoTrack('B', 'kick',  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]);
mapDemoTrack('B', 'snare', [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,1,1,1]);
mapDemoTrack('B', 'hihat', [0,0,1,0, 0,0,1,0, 0,0,1,0, 1,1,1,1]);
mapDemoTrack('B', 'syn1',  [1,0,1,1, 0,1,0,1, 1,0,1,0, 0,1,0,0], [-12,0,-12,-12, 0,-5,0,-3, -12,0,-12,0, 0,-5,0,0]);
mapDemoTrack('B', 'syn2',  [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,1,1,1], [0,0,12,0, 12,0,7,0, 0,0,12,0, 12,12,12,12]);

let curTrack = 'syn1', curPattern = 'A';
let playing=false, curStep=0, nextStepTime=0, timerId=null, activeSongPattern=null;
let songChain = ['A', 'A', 'A', 'B'], songIndex = 0, songMode=false;
const seqTracksHost = document.getElementById('seq-tracks');

tracks.forEach(t=>{
  const b = document.createElement('div'); b.className='btn'+(t===curTrack?' on':''); b.textContent=trackLabel[t];
  b.dataset.track = t;
  b.addEventListener('click', ()=>{
    curTrack = t;
    seqTracksHost.querySelectorAll('.btn').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    renderSteps(); 
  });
  seqTracksHost.appendChild(b);
});
document.getElementById('seq-pattern').addEventListener('change', e=>{ curPattern = e.target.value; renderSteps(); });

const stepsHost = document.getElementById('steps');
function renderSteps(){
  stepsHost.innerHTML = '';
  const arr = pattern[curPattern][curTrack];
  arr.forEach((st, i)=>{
    const el = document.createElement('div');
    el.className = 'step'+(i%4===0?' beat':'')+(st.on?' on':'')+(i===curStep && !playing?' cur':'');
    if(st.on && (curTrack==='syn1'||curTrack==='syn2')){
      el.innerHTML = `<span class="n">${noteName(st.note)}</span>`;
    }
    el.addEventListener('click', ()=>{
      initAudio();
      if(st.on){ st.on=false; }
      else { st.on=true; st.note = parseInt(document.getElementById('seq-note').value); }
      renderSteps();
    });
    stepsHost.appendChild(el);
  });
}
function noteName(semi){
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const oct = 4 + Math.floor((semi+0)/12);
  const idx = ((semi%12)+12)%12;
  return names[idx]+oct;
}
renderSteps();
document.getElementById('seq-clear').addEventListener('click', ()=>{
  pattern[curPattern][curTrack] = Array.from({length:16}, ()=>({on:false, note:0}));
  renderSteps();
});

/* ---- scheduler ---- */
const lookahead = 25, scheduleAhead = 0.1;
document.getElementById('tempo').addEventListener('input', e=>{
  document.getElementById('tempo-val').textContent = e.target.value+' BPM';
});
function stepDuration(){ return 60/parseFloat(document.getElementById('tempo').value)/4; }

function scheduleStep(stepIndex, time){
  const p = activeSongPattern || curPattern;
  tracks.forEach(t=>{
    const st = pattern[p][t][stepIndex];
    if(!st.on) return;
    const delay = Math.max(0,(time-ctx.currentTime))*1000;
    setTimeout(()=>{
      if(t==='syn1'||t==='syn2') triggerStepNote(t, st.note);
      else playDrum(t);
    }, delay);
  });
}
function triggerStepNote(name, note){
  triggerEnvelope(name, note);
  setTimeout(()=>releaseEnvelope(name), stepDuration()*900);
}

function scheduler(){
  while(nextStepTime < ctx.currentTime + scheduleAhead){
    scheduleStep(curStep, nextStepTime);
    
    const visualDelay = Math.max(0, (nextStepTime - ctx.currentTime)) * 1000;
    const stepToHighlight = curStep;
    setTimeout(() => {
      if (playing) {
        document.querySelectorAll('#steps .step').forEach(el => el.classList.remove('cur'));
        const stepEls = document.querySelectorAll('#steps .step');
        if (stepEls[stepToHighlight]) stepEls[stepToHighlight].classList.add('cur');
      }
    }, visualDelay);

    nextStepTime += stepDuration();
    curStep = (curStep+1)%16;
    if(curStep===0 && songMode) advanceSong();
  }
}

function updateTransportButtons(){
  const seqBtn = document.getElementById('seq-play');
  const songBtn = document.getElementById('song-play');
  seqBtn.textContent = playing ? '■ STOP' : '▶ PLAY';
  seqBtn.classList.toggle('on', playing && !songMode);
  songBtn.textContent = playing ? '■ STOP' : '▶ PLAY SONG';
  songBtn.classList.toggle('on', playing && songMode);
}

function startSeq(){
  initAudio();
  ensureRunning();
  if(playing) return;
  playing = true; curStep = 0; nextStepTime = ctx.currentTime + 0.05;
  timerId = setInterval(scheduler, lookahead);
  updateTransportButtons();
}
function stopSeq(){
  playing = false; songMode=false; activeSongPattern=null;
  clearInterval(timerId);
  updateTransportButtons();
  renderSteps(); 
}
document.getElementById('seq-play').addEventListener('click', ()=>{
  if(playing){ stopSeq(); return; }
  songMode = false; activeSongPattern = null;
  startSeq();
});

/* ============ SONG MODE ============ */
function renderSong(){
  document.getElementById('song-chain').textContent = songChain.length? songChain.join(' ') : '(empty — add A/B blocks)';
}
document.getElementById('song-add-a').addEventListener('click', ()=>{ songChain.push('A'); renderSong(); });
document.getElementById('song-add-b').addEventListener('click', ()=>{ songChain.push('B'); renderSong(); });
document.getElementById('song-clear').addEventListener('click', ()=>{ songChain=[]; renderSong(); });
function advanceSong(){
  if(!songChain.length) return;
  songIndex = (songIndex+1)%songChain.length;
  activeSongPattern = songChain[songIndex];
}
document.getElementById('song-play').addEventListener('click', ()=>{
  if(!songChain.length) return;
  if(playing){ stopSeq(); return; }
  songMode = true; songIndex = 0; activeSongPattern = songChain[0];
  startSeq();
});

/* ============ KAOSS PAD ============ */
const kpad = document.getElementById('kaoss-pad');
const kcursor = document.getElementById('kaoss-cursor');
const kdisplay = document.getElementById('kaoss-display');
let kActive=false;
function updateKaoss(e){
  if(!kActive) return;
  const rect = kpad.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX-rect.left, rect.width));
  const y = Math.max(0, Math.min(e.clientY-rect.top, rect.height));
  kcursor.style.left=x+'px'; kcursor.style.top=y+'px';
  const nx = x/rect.width, ny = 1-(y/rect.height);
  const target = document.getElementById('kaoss-target').value;
  const semi = Math.round((nx*24)-12);
  const cutNorm = ny;
  kdisplay.innerHTML = `<span>PITCH: ${noteName(semi)}</span><span>CUTOFF: ${Math.round(cutoffHz(cutNorm))}Hz</span>`;
  if(initialized){
    const s = synths[target];
    s.vco.frequency.setTargetAtTime(noteFreq(semi+params[target].octave*12), ctx.currentTime, 0.015);
    s.vcf.frequency.setTargetAtTime(cutoffHz(cutNorm), ctx.currentTime, 0.015);
  }
}
kpad.addEventListener('pointerdown', e=>{
  initAudio();
  ensureRunning();
  kActive = true;
  kcursor.style.display = 'block';
  try{ kpad.setPointerCapture(e.pointerId); }catch(err){ }
  try{
    const target = document.getElementById('kaoss-target').value;
    kaossNoteOn(target);
    updateKaoss(e);
  }catch(err){ console.error('kaoss pointerdown error:', err); }
});
kpad.addEventListener('pointermove', e=>{
  try{ updateKaoss(e); }catch(err){ console.error('kaoss move error:', err); }
});
function endKaoss(){
  if(!kActive) return;
  kActive = false;
  kcursor.style.display = 'none';
  kdisplay.innerHTML = `<span>PITCH: —</span><span>CUTOFF: —</span>`;
  try{ kaossNoteOff(document.getElementById('kaoss-target').value); }catch(err){ console.error('kaoss release error:', err); }
}
kpad.addEventListener('pointerup', endKaoss);
kpad.addEventListener('pointercancel', endKaoss);
kpad.addEventListener('pointerleave', e=>{ if(e.buttons===0) endKaoss(); });

/* ============ FX ============ */
document.getElementById('chorus-toggle').addEventListener('click', function(){
  initAudio();
  params.chorusOn = !params.chorusOn;
  this.textContent = 'CHORUS ' + (params.chorusOn?'ON':'OFF');
  this.classList.toggle('on', params.chorusOn);
  chorusWet.gain.setTargetAtTime(params.chorusOn?0.5:0, ctx.currentTime, 0.05);
  chorusDry.gain.setTargetAtTime(params.chorusOn?0.7:1, ctx.currentTime, 0.05);
});
document.getElementById('delay-toggle').addEventListener('click', function(){
  initAudio();
  params.delayOn = !params.delayOn;
  this.textContent = 'DELAY ' + (params.delayOn?'ON':'OFF');
  this.classList.toggle('on', params.delayOn);
  delayWet.gain.setTargetAtTime(params.delayOn?params.delayMix:0, ctx.currentTime, 0.05);
});
knobControls.chorusRate = setupKnob(document.getElementById('chorus-rate'), v=>{
  params.chorusRate=v; document.getElementById('chorus-rate-val').textContent=v.toFixed(2)+'Hz';
  if(initialized) chorusLfo.frequency.setTargetAtTime(v, ctx.currentTime, 0.02);
});
knobControls.chorusDepth = setupKnob(document.getElementById('chorus-depth'), v=>{
  params.chorusDepth=v; document.getElementById('chorus-depth-val').textContent=v.toFixed(2);
  if(initialized) chorusLfoGain.gain.setTargetAtTime(0.004*v, ctx.currentTime, 0.02);
});
knobControls.delayTime = setupKnob(document.getElementById('delay-time'), v=>{
  params.delayTime=v; document.getElementById('delay-time-val').textContent=v.toFixed(2)+'s';
  if(initialized) delayNode.delayTime.setTargetAtTime(v, ctx.currentTime, 0.02);
});
knobControls.delayFb = setupKnob(document.getElementById('delay-fb'), v=>{
  params.delayFb=v; document.getElementById('delay-fb-val').textContent=v.toFixed(2);
  if(initialized) delayFb.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
});
knobControls.delayMix = setupKnob(document.getElementById('delay-mix'), v=>{
  params.delayMix=v; document.getElementById('delay-mix-val').textContent=v.toFixed(2);
  if(initialized && params.delayOn) delayWet.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
});

/* ============ WAV STEM EXPORT ============ */
const recordBtn = document.getElementById('recordBtn');
const recordStatus = document.getElementById('recordStatus');
const downloadEls = {};
STEMS.forEach(key => downloadEls[key] = document.getElementById(`dl-${key}`));

const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
const supportsMediaRecorder = typeof MediaRecorder !== 'undefined' && AudioCtxClass && !!AudioCtxClass.prototype.createMediaStreamDestination;

if (!supportsMediaRecorder) {
  recordBtn.classList.add('btn-disabled');
  recordBtn.innerText = 'REC N/A';
  recordStatus.innerText = 'NO SUPPORT';
} else {
  recordBtn.addEventListener('click', async () => {
    if (ctx && ctx.state === 'suspended') await ctx.resume();

    if (!isRecording) {
      STEMS.forEach(key => {
        recordedChunks[key] = [];
        downloadEls[key].classList.add('btn-disabled');

        let options;
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options = { mimeType: 'audio/webm;codecs=opus' };
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options = { mimeType: 'audio/webm' };
        }
        const rec = new MediaRecorder(recordDest[key].stream, options);
        rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks[key].push(e.data);
        };
        rec.onstop = () => encodeStem(key);
        mediaRecorders[key] = rec;
        rec.start();
      });

      isRecording = true;
      recordStartTime = Date.now();
      {
        const d = new Date(recordStartTime);
        const pad = (n) => String(n).padStart(2, '0');
        takeStamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
      }
      recordBtn.classList.add('rec-live');
      recordBtn.innerText = '■ STOP';
      recordStatus.innerText = '00:00';

      recordTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        recordStatus.innerText = `${mm}:${ss}`;
      }, 500);
    } else {
      STEMS.forEach(key => mediaRecorders[key] && mediaRecorders[key].stop());
      isRecording = false;
      clearInterval(recordTimerInterval);
      recordBtn.classList.remove('rec-live');
      recordBtn.innerText = '● REC';
      recordStatus.innerText = 'ENCODING';
    }
  });
}

async function encodeStem(key) {
  const el = downloadEls[key];
  const rec = mediaRecorders[key];
  const rawBlob = new Blob(recordedChunks[key], { type: (rec && rec.mimeType) || 'audio/webm' });
  try {
    const arrayBuffer = await rawBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(decoded);
    el.href = URL.createObjectURL(wavBlob);
    el.download = recordingFilename(key, 'wav');
  } catch (err) {
    el.href = URL.createObjectURL(rawBlob);
    el.download = recordingFilename(key, 'webm');
  }
  el.classList.remove('btn-disabled');
  if (STEMS.every(k => !downloadEls[k].classList.contains('btn-disabled'))) {
    flashMsg('STEMS READY');
    recordStatus.innerText = '00:00';
  }
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = numChannels === 2
      ? interleaveChannels(buffer.getChannelData(0), buffer.getChannelData(1))
      : buffer.getChannelData(0);

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function interleaveChannels(left, right) {
  const result = new Float32Array(left.length + right.length);
  let idx = 0;
  for (let i = 0; i < left.length; i++) {
      result[idx++] = left[i];
      result[idx++] = right[i];
  }
  return result;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function recordingFilename(stem, ext) {
  return `vwds10-${takeStamp}-${stem}.${ext}`;
}

function flashMsg(msg){
  const f = document.getElementById('sys-msg');
  f.textContent = '» ' + msg;
  f.style.color = '#4af55d';
  setTimeout(()=>{ f.textContent = 'READY'; f.style.color=''; }, 1800);
}

renderSong();
