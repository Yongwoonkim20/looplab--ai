import { useState, useRef, useEffect, useCallback } from "react";
import * as mammoth from "mammoth";

// ─────────────────────────────────────────────────────────────
// MODEL CATALOG
// ─────────────────────────────────────────────────────────────
const CLAUDE_MODELS = [
  { id: "claude-opus-4-20250514",   label: "Claude Opus 4",   badge: "최고성능", desc: "심층 전략 분석 · 복잡한 추론 최강" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", badge: "추천",     desc: "속도·성능 균형 · 실무 범용" },
  { id: "claude-haiku-4-5-20251001",label: "Claude Haiku 4.5",badge: "빠름",     desc: "가장 빠름 · 단순 질의 최적" },
];
const GPT_MODELS = [
  { id: "gpt-4o",      label: "GPT-4o",      badge: "추천",   desc: "멀티모달 범용 · 파일 분석 우수" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", badge: "저비용", desc: "빠르고 저렴 · 단순 작업 적합" },
  { id: "o3",          label: "o3",           badge: "추론",   desc: "논리·수학 최강 · 느리고 고비용" },
  { id: "o4-mini",     label: "o4-mini",      badge: "균형",   desc: "o3 성능 70% · 합리적 비용" },
];
const GEMINI_MODELS = [
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    badge: "최고성능", desc: "추론·분석 전반 최고 · 최신" },
  { id: "gemini-1.5-pro",    label: "Gemini 1.5 Pro",    badge: "안정",     desc: "100만 토큰 컨텍스트 · 안정적" },
  { id: "gemini-2.0-flash",  label: "Gemini 2.0 Flash",  badge: "빠름",     desc: "매우 빠름 · 실시간 응답" },
];
const IMG_MODELS = [
  { id: "dalle",       label: "DALL-E 3",        desc: "OpenAI · 고품질 이미지" },
  { id: "nanobanana",  label: "Nano Banana Pro",  desc: "Gemini 3 · 4K · 텍스트 렌더링 우수" },
];

const DEFAULT_SEL_MODELS = {
  claude: "claude-sonnet-4-20250514",
  gpt:    "gpt-4o",
  gemini: "gemini-1.5-flash",
  img:    "dalle",
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const DEFAULT_PROFILE = `이름: 김용운 (주식회사 루프랩 대표)
배경: 전 마이비밀(MyB) 식품 브랜드 운영 → 폐업. 뉴로엔터테인먼트 공동창업(틱톡 라이브 에이전시) → 국내 5위, 1000명 크리에이터 양성, 25년 4월 Exit. 현재 루프랩 대표: 틱톡 마케팅 대행(Mars 독점 등), 라이브히어로(틱톡 라이브 스트리밍 에이전시 SaaS) 개발 중.
관심사: 틱톡 생태계, 라이브 스트리밍(기프팅), SaaS, 재무 효율, 글로벌 진출`;

const AI_INFO = {
  claude: { name: "Claude",        short: "C",  color: "#C85E3A", bg: "#fff5f2" },
  gpt:    { name: "GPT-4o",        short: "G",  color: "#0A7B5C", bg: "#f0faf6" },
  gemini: { name: "Gemini",        short: "Gm", color: "#1558C0", bg: "#f0f5ff" },
  final:  { name: "종합 (Claude)", short: "★",  color: "#6B21A8", bg: "#faf5ff" },
};
const MODE = { DEBATE: "debate", SINGLE: "single", IMAGE: "image" };
const MODE_INFO = {
  [MODE.DEBATE]: { label: "🔥 토론",  desc: "3AI 토론 → 종합" },
  [MODE.SINGLE]: { label: "💬 단일",  desc: "3AI 동시 답변" },
  [MODE.IMAGE]:  { label: "🖼️ 이미지", desc: "AI 이미지 생성" },
};
const DEFAULT_PROJECT = { id: "default", name: "기본 프로젝트", createdAt: Date.now() };

// ─────────────────────────────────────────────────────────────
// FILE UTILS
// ─────────────────────────────────────────────────────────────
const getCat = (file) => {
  const n = file.name.toLowerCase(), t = file.type;
  if (t.startsWith("image/"))                                return "image";
  if (t.startsWith("video/"))                                return "video";
  if (n.endsWith(".pptx") || n.endsWith(".ppt"))             return "pptx";
  if (n.endsWith(".hwpx"))                                   return "hwpx";
  if (n.endsWith(".hwp"))                                    return "hwp";
  if (n.endsWith(".docx") || t.includes("wordprocessingml")) return "docx";
  if (t === "application/pdf" || n.endsWith(".pdf"))         return "pdf";
  return "text";
};
const CAT_ICON = { image:"🖼️", video:"🎬", pptx:"📊", hwpx:"📝", hwp:"📝", docx:"📄", pdf:"📑", text:"📄" };
const fmtBytes = b => b < 1024 ? b+"B" : b < 1048576 ? (b/1024).toFixed(0)+"KB" : (b/1048576).toFixed(1)+"MB";

const readAB  = f => new Promise((r,j) => { const x=new FileReader(); x.onload=e=>r(e.target.result); x.onerror=j; x.readAsArrayBuffer(f); });
const readTxt = f => new Promise((r,j) => { const x=new FileReader(); x.onload=e=>r(e.target.result); x.onerror=j; x.readAsText(f,"utf-8"); });
const readDU  = f => new Promise((r,j) => { const x=new FileReader(); x.onload=e=>r(e.target.result); x.onerror=j; x.readAsDataURL(f); });

async function resizeImg(file, px=1024) {
  const du = await readDU(file);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(px/img.width, px/img.height, 1);
      const [w,h] = [Math.round(img.width*ratio), Math.round(img.height*ratio)];
      const c = document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg",.85).split(",")[1]);
    };
    img.src = du;
  });
}

async function extractVideoFrames(file, n=4) {
  const url = URL.createObjectURL(file);
  return new Promise(res => {
    const v = document.createElement("video"); v.src=url; v.muted=true; v.playsInline=true;
    const frames=[]; let idx=0;
    v.addEventListener("loadedmetadata", () => {
      const times = Array.from({length:n},(_,i)=>(v.duration/(n+1))*(i+1));
      const next = () => { if(idx>=times.length){URL.revokeObjectURL(url);res(frames);return;} v.currentTime=times[idx]; };
      v.addEventListener("seeked", () => {
        const c=document.createElement("canvas"); c.width=640; c.height=Math.round(640*(v.videoHeight/v.videoWidth))||360;
        c.getContext("2d").drawImage(v,0,0,c.width,c.height);
        frames.push(c.toDataURL("image/jpeg",.75).split(",")[1]); idx++; next();
      });
      next();
    });
    v.addEventListener("error",()=>{URL.revokeObjectURL(url);res([]);});
    v.load();
  });
}

async function extractPptx(file) {
  try {
    const JSZip = (await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")).default;
    const zip = await JSZip.loadAsync(await readAB(file));
    const slides = Object.keys(zip.files).filter(n=>n.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a,b)=>parseInt(a.match(/\d+/)[0])-parseInt(b.match(/\d+/)[0]));
    let out="";
    for(const s of slides){
      const xml=await zip.files[s].async("string");
      const txt=Array.from(new DOMParser().parseFromString(xml,"text/xml").querySelectorAll("t")).map(n=>n.textContent).filter(Boolean).join(" ");
      if(txt.trim()) out+=`[슬라이드 ${s.match(/\d+/)[0]}]\n${txt}\n\n`;
    }
    return out || "(텍스트 없음)";
  } catch(e){ return `[PPTX 오류: ${e.message}]`; }
}

async function extractHwpx(file) {
  try {
    const JSZip = (await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")).default;
    const zip = await JSZip.loadAsync(await readAB(file));
    const secs = Object.keys(zip.files).filter(n=>n.match(/Contents\/section\d+\.xml/)).sort();
    if(!secs.length) return "(내용 추출 실패)";
    let out="";
    for(const s of secs){
      const xml=await zip.files[s].async("string");
      out+=Array.from(new DOMParser().parseFromString(xml,"text/xml").querySelectorAll("t,T")).map(n=>n.textContent).join(" ")+"\n";
    }
    return out || "(내용 없음)";
  } catch(e){ return `[HWPX 오류: ${e.message}]`; }
}

async function processFile(file) {
  const cat=getCat(file);
  const base={id:`${Date.now()}-${Math.random()}`,name:file.name,size:file.size,type:file.type,cat};
  if(cat==="image"){ const b64=await resizeImg(file); return{...base,b64,mime:"image/jpeg",thumb:`data:image/jpeg;base64,${b64}`,text:null}; }
  if(cat==="video"){ const frames=await extractVideoFrames(file); return{...base,frames,thumb:frames[0]?`data:image/jpeg;base64,${frames[0]}`:null,text:`[영상: ${file.name}, ${frames.length}프레임]`}; }
  if(cat==="pptx") return{...base,text:await extractPptx(file)};
  if(cat==="hwpx") return{...base,text:await extractHwpx(file)};
  if(cat==="hwp")  return{...base,text:`⚠️ HWP 구버전 → HWPX 변환 후 재업로드`};
  if(cat==="docx"){ const r=await mammoth.extractRawText({arrayBuffer:await readAB(file)}); return{...base,text:r.value||"(내용 없음)"}; }
  let text=""; try{text=await readTxt(file);}catch(e){text=`[읽기 오류: ${e.message}]`;}
  return{...base,text:text.slice(0,60000)};
}

// ─────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────
const buildImgCtx = files => files.flatMap(f=>{
  if(f.cat==="image"&&f.b64) return[{data:f.b64,mime:f.mime||"image/jpeg"}];
  if(f.cat==="video"&&f.frames) return f.frames.slice(0,3).map(fr=>({data:fr,mime:"image/jpeg"}));
  return[];
});
const buildTextCtx = files => {
  if(!files.length) return "";
  let s="\n\n[첨부 파일]\n";
  files.forEach(f=>{s+=`▸ ${CAT_ICON[f.cat]} ${f.name}`; if(f.text) s+=`\n${f.text.slice(0,8000)}${f.text.length>8000?"\n...(생략)":""}\n`; else s+=` (${f.cat})\n`;});
  return s;
};

async function callClaude(msgs, sys, model="claude-sonnet-4-20250514", apiKey="") {
  const endpoint = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api/claude"
    : "https://api.anthropic.com/v1/messages";
  const headers = {"Content-Type":"application/json"};
  if (endpoint === "/api/claude") headers["x-api-key"] = apiKey;
  const r=await fetch(endpoint,{method:"POST",headers,
    body:JSON.stringify({model,max_tokens:1400,system:sys,messages:msgs})});
  const d=await r.json(); if(d.error) throw new Error(d.error.message);
  return d.content.map(c=>c.text||"").join("");
}
async function callGPT(msgs, key, sys, model="gpt-4o") {
  const isO = model==="o3"||model==="o4-mini";
  const body = isO
    ? {model,messages:[{role:"user",content:sys+"\n\n"+(typeof msgs[0].content==="string"?msgs[0].content:msgs[0].content.find(c=>c.type==="text")?.text||"")}],max_completion_tokens:1400}
    : {model,messages:[{role:"system",content:sys},...msgs],max_tokens:1400};
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify(body)});
  const d=await r.json(); if(d.error) throw new Error(d.error.message);
  return d.choices[0].message.content;
}
async function callGemini(parts, key, sys, model="gemini-1.5-flash") {
  const modelId = model==="gemini-2.5-pro" ? "gemini-2.5-pro-preview-03-25"
    : model==="gemini-1.5-pro" ? "gemini-1.5-flash"
    : model==="gemini-2.0-flash" ? "gemini-2.0-flash" : model;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({system_instruction:{parts:[{text:sys}]},contents:[{role:"user",parts:Array.isArray(parts)?parts:[{text:parts}]}],generationConfig:{maxOutputTokens:1400}})});
  const d=await r.json(); if(d.error) throw new Error(d.error.message);
  return d.candidates[0].content.parts.map(p=>p.text||"").join("");
}

const mkCMsgs = (q,imgs) => [{role:"user",content:imgs.length?[...imgs.map(i=>({type:"image",source:{type:"base64",media_type:i.mime,data:i.data}})),{type:"text",text:q}]:[{type:"text",text:q}]}];
const mkGMsgs = (q,imgs) => [{role:"user",content:imgs.length?[...imgs.map(i=>({type:"image_url",image_url:{url:`data:${i.mime};base64,${i.data}`}})),{type:"text",text:q}]:q}];
const mkGmParts = (q,imgs) => imgs.length?[...imgs.map(i=>({inlineData:{mimeType:i.mime,data:i.data}})),{text:q}]:[{text:q}];

async function genDalle(p,k){ const r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${k}`},body:JSON.stringify({model:"dall-e-3",prompt:p,n:1,size:"1024x1024"})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return d.data[0].url; }
async function genNanoBanana(p,k){ const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${k}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:p}]}],generationConfig:{responseModalities:["IMAGE","TEXT"]}})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); const pt=d.candidates[0].content.parts.find(p=>p.inlineData); if(!pt) throw new Error("이미지 미생성"); return`data:${pt.inlineData.mimeType};base64,${pt.inlineData.data}`; }

// ─────────────────────────────────────────────────────────────
// MEMORY AUTO-EXTRACT
// ─────────────────────────────────────────────────────────────
async function extractMemories(chatMessages, profile) {
  const textMsgs = chatMessages.filter(m=>m.role==="user").map(m=>m.text).join("\n");
  if(!textMsgs.trim()) return [];
  try {
    const sys = "당신은 대화에서 사용자의 목표, 결정사항, 중요 컨텍스트를 추출하는 전문가입니다. 반드시 JSON만 응답하세요.";
    const q = `다음 대화에서 사용자의 핵심 정보를 추출해주세요:\n\n${textMsgs.slice(0,3000)}\n\n반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n{"memories":["핵심 사실 1","핵심 사실 2",...]}`;
    const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:500,system:sys,messages:[{role:"user",content:[{type:"text",text:q}]}]})});
    const d = await r.json();
    const txt = d.content?.[0]?.text || "";
    const clean = txt.replace(/```json|```/g,"").trim();
    const parsed = JSON.parse(clean);
    return parsed.memories || [];
  } catch(e){ return []; }
}

// ─────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────
function Dots({color="#bbb"}) {
  return <span style={{display:"inline-flex",gap:3,alignItems:"center"}}>
    {[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:color,animation:`blink 1.2s ease-in-out ${i*.2}s infinite`}}/>)}
  </span>;
}
function Spinner() { return <div style={{width:13,height:13,border:"2px solid #aaa",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>; }

function Avatar({ai}) {
  const info=AI_INFO[ai];
  return <div style={{width:28,height:28,borderRadius:"50%",background:info.bg,border:`1.5px solid ${info.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    <span style={{fontSize:8,fontWeight:700,color:info.color,fontFamily:"monospace"}}>{info.short}</span>
  </div>;
}
function FileChip({file,onRemove}) {
  return <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 8px 3px 6px",background:"#f5f5f5",border:"1px solid #e5e5e5",borderRadius:8,fontSize:12,color:"#555",maxWidth:180,flexShrink:0}}>
    {file.thumb?<img src={file.thumb} style={{width:16,height:16,objectFit:"cover",borderRadius:3}} alt=""/>:<span style={{fontSize:13}}>{CAT_ICON[file.cat]}</span>}
    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{file.name}</span>
    <span style={{color:"#bbb",fontSize:10,flexShrink:0}}>{fmtBytes(file.size)}</span>
    {onRemove&&<button onClick={onRemove} style={{background:"none",border:"none",color:"#bbb",cursor:"pointer",padding:0,fontSize:13,lineHeight:1,marginLeft:2}}>✕</button>}
  </div>;
}

// Model badge
function BadgePill({text, color="#888"}) {
  return <span style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:color+"18",color,border:`1px solid ${color}33`,fontFamily:"monospace",letterSpacing:"0.02em"}}>{text}</span>;
}

// Mode badge on each message
function ModeBadge({mode}) {
  const m = MODE_INFO[mode];
  if(!m) return null;
  return <span style={{fontSize:10,color:"#bbb",fontFamily:"monospace",marginLeft:4}}>{m.label}</span>;
}

// ─────────────────────────────────────────────────────────────
// MODEL SELECTOR ROW (used in settings)
// ─────────────────────────────────────────────────────────────
function ModelSelector({label, color, models, value, onChange}) {
  return <div style={{marginBottom:14}}>
    <div style={{fontSize:11,fontWeight:700,color,marginBottom:6,letterSpacing:"0.04em"}}>{label}</div>
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {models.map(m=>(
        <button key={m.id} onClick={()=>onChange(m.id)} style={{
          display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
          border:`1.5px solid ${value===m.id?color:"#e8e8e8"}`,borderRadius:8,cursor:"pointer",
          background:value===m.id?color+"0d":"#fff",textAlign:"left",transition:"all 0.15s",
        }}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,fontWeight:600,color:value===m.id?color:"#333"}}>{m.label}</span>
              <BadgePill text={m.badge} color={value===m.id?color:"#999"}/>
            </div>
            <div style={{fontSize:11,color:"#aaa",marginTop:1}}>{m.desc}</div>
          </div>
          {value===m.id&&<span style={{color,fontSize:14,flexShrink:0}}>✓</span>}
        </button>
      ))}
    </div>
  </div>;
}

// ─────────────────────────────────────────────────────────────
// SETTINGS PANEL
// ─────────────────────────────────────────────────────────────
function SettingsPanel({claudeKey,setClaudeKey,gptKey,setGptKey,geminiKey,setGeminiKey,profile,setProfile,onSaveProfile,selModels,setSelModels,memories,onDeleteMemory,onAddMemory,open,onClose}) {
  const [tab, setTab] = useState("models"); // "models" | "profile" | "memory"
  const [editP, setEditP] = useState(false);
  const [lp, setLp] = useState(profile);
  const [newMem, setNewMem] = useState("");
  useEffect(()=>setLp(profile),[profile]);
  if(!open) return null;

  const tabStyle = (t) => ({
    flex:1,padding:"7px 0",fontSize:12,fontWeight:tab===t?700:400,
    border:"none",borderBottom:`2px solid ${tab===t?"#111":"transparent"}`,
    background:"none",cursor:"pointer",color:tab===t?"#111":"#aaa",transition:"all 0.15s",
  });

  return <>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.15)",zIndex:99}}/>
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:360,background:"#fff",borderLeft:"1px solid #e8e8e8",boxShadow:"-8px 0 32px rgba(0,0,0,0.08)",zIndex:100,display:"flex",flexDirection:"column",animation:"slideIn 0.22s ease"}}>
      {/* Header */}
      <div style={{padding:"14px 18px 0",borderBottom:"1px solid #f0f0f0",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:14,fontWeight:700,color:"#111"}}>설정</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,color:"#aaa",cursor:"pointer"}}>✕</button>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:0}}>
          {[["models","🤖 모델"],["profile","👤 프로필"],["memory","🧠 메모리"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={tabStyle(t)}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:18}}>

        {/* ── MODELS TAB ── */}
        {tab==="models" && <>
          {/* API Keys */}
          <div style={{marginBottom:20,padding:"12px 14px",background:"#f8f8f8",borderRadius:10,border:"1px solid #efefef"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:10,letterSpacing:"0.05em"}}>API 키</div>
            <label style={{fontSize:11,color:"#C85E3A",display:"block",marginBottom:4,fontWeight:600}}>ANTHROPIC (CLAUDE) KEY</label>
            <input type="password" value={claudeKey} onChange={e=>setClaudeKey(e.target.value)} placeholder="sk-ant-..."
              style={{width:"100%",padding:"7px 10px",border:"1.5px solid #e8e8e8",borderRadius:7,fontSize:12,color:"#111",outline:"none",fontFamily:"monospace",marginBottom:10,background:"#fff"}}/>
            <label style={{fontSize:11,color:"#0A7B5C",display:"block",marginBottom:4,fontWeight:600}}>OPENAI KEY</label>
            <input type="password" value={gptKey} onChange={e=>setGptKey(e.target.value)} placeholder="sk-..."
              style={{width:"100%",padding:"7px 10px",border:"1.5px solid #e8e8e8",borderRadius:7,fontSize:12,color:"#111",outline:"none",fontFamily:"monospace",marginBottom:10,background:"#fff"}}/>
            <label style={{fontSize:11,color:"#1558C0",display:"block",marginBottom:4,fontWeight:600}}>GEMINI KEY</label>
            <input type="password" value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder="AIza..."
              style={{width:"100%",padding:"7px 10px",border:"1.5px solid #e8e8e8",borderRadius:7,fontSize:12,color:"#111",outline:"none",fontFamily:"monospace",background:"#fff"}}/>
            {gptKey&&geminiKey&&<div style={{marginTop:8,fontSize:11,color:"#0A7B5C",fontWeight:600}}>✓ 연결됨</div>}
          </div>

          {/* Model selectors */}
          <ModelSelector label="CLAUDE 모델" color="#C85E3A" models={CLAUDE_MODELS} value={selModels.claude}
            onChange={v=>setSelModels(p=>({...p,claude:v}))}/>
          <ModelSelector label="GPT 모델" color="#0A7B5C" models={GPT_MODELS} value={selModels.gpt}
            onChange={v=>setSelModels(p=>({...p,gpt:v}))}/>
          <ModelSelector label="GEMINI 모델" color="#1558C0" models={GEMINI_MODELS} value={selModels.gemini}
            onChange={v=>setSelModels(p=>({...p,gemini:v}))}/>
          <div style={{height:1,background:"#f0f0f0",margin:"4px 0 14px"}}/>
          <ModelSelector label="이미지 생성 모델" color="#6B21A8" models={IMG_MODELS} value={selModels.img}
            onChange={v=>setSelModels(p=>({...p,img:v}))}/>

          <div style={{marginTop:8,padding:"10px 12px",background:"#fffbeb",borderRadius:8,border:"1px solid #f59e0b33",fontSize:12,color:"#92400e"}}>
            ℹ️ 모델 변경은 <strong>다음 전송부터</strong> 즉시 적용됩니다. 채팅을 새로 시작할 필요 없습니다.
          </div>
        </>}

        {/* ── PROFILE TAB ── */}
        {tab==="profile" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#111"}}>사용자 프로필</div>
              <div style={{fontSize:11,color:"#aaa",marginTop:2}}>모든 대화의 시스템 프롬프트에 자동 주입됩니다</div>
            </div>
            <button onClick={()=>{if(editP){onSaveProfile(lp);}setEditP(!editP);}}
              style={{fontSize:11,color:editP?"#C85E3A":"#888",background:editP?"#fff5f2":"#f5f5f5",border:`1px solid ${editP?"#C85E3A33":"#e8e8e8"}`,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontWeight:600}}>
              {editP?"저장":"편집"}
            </button>
          </div>
          {editP
            ?<textarea value={lp} onChange={e=>setLp(e.target.value)} rows={14}
                style={{width:"100%",padding:10,border:"1.5px solid #e8e8e8",borderRadius:7,fontSize:12,color:"#111",lineHeight:1.65,resize:"vertical",outline:"none",fontFamily:"'IBM Plex Mono',monospace"}}/>
            :<pre style={{fontSize:12,color:"#555",lineHeight:1.7,whiteSpace:"pre-wrap",background:"#fafafa",borderRadius:7,padding:"10px 12px",border:"1px solid #f0f0f0",fontFamily:"'IBM Plex Mono',monospace"}}>{profile}</pre>
          }
        </>}

        {/* ── MEMORY TAB ── */}
        {tab==="memory" && <>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"#111",marginBottom:4}}>장기 메모리</div>
            <div style={{fontSize:12,color:"#aaa",lineHeight:1.6}}>
              대화에서 자동 추출된 사용자 정보입니다. 모든 새 채팅에 자동으로 주입되어 AI가 맥락을 기억합니다.
            </div>
          </div>

          {memories.length===0
            ?<div style={{padding:"24px 0",textAlign:"center",color:"#ccc",fontSize:13}}>
                아직 메모리가 없습니다<br/>
                <span style={{fontSize:11,marginTop:4,display:"block"}}>채팅을 하면 자동으로 추출됩니다</span>
              </div>
            :<div style={{marginBottom:14}}>
              {memories.map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 10px",background:"#fafafa",border:"1px solid #f0f0f0",borderRadius:8,marginBottom:5}}>
                  <span style={{color:"#6B21A8",fontSize:12,flexShrink:0,marginTop:1}}>●</span>
                  <span style={{flex:1,fontSize:12,color:"#333",lineHeight:1.6}}>{m}</span>
                  <button onClick={()=>onDeleteMemory(i)} style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:13,flexShrink:0,padding:0}}>✕</button>
                </div>
              ))}
            </div>
          }

          {/* Manual add */}
          <div style={{marginTop:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:6}}>메모리 직접 추가</div>
            <div style={{display:"flex",gap:6}}>
              <input value={newMem} onChange={e=>setNewMem(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&newMem.trim()){onAddMemory(newMem.trim());setNewMem("");}}}
                placeholder="예: 라이브히어로 출시 목표는 25년 Q3" 
                style={{flex:1,padding:"7px 10px",border:"1.5px solid #e8e8e8",borderRadius:7,fontSize:12,color:"#111",outline:"none"}}/>
              <button onClick={()=>{if(newMem.trim()){onAddMemory(newMem.trim());setNewMem("");}}}
                style={{padding:"7px 12px",background:"#111",color:"#fff",border:"none",borderRadius:7,fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>추가</button>
            </div>
          </div>

          <div style={{marginTop:16,padding:"10px 12px",background:"#f0f5ff",borderRadius:8,border:"1px solid #1558C033",fontSize:12,color:"#1558C0"}}>
            💡 메모리는 Claude Haiku가 대화 종료 후 자동 추출합니다. 부정확한 내용은 직접 삭제하세요.
          </div>
        </>}
      </div>
    </div>
  </>;
}

// ─────────────────────────────────────────────────────────────
// MESSAGE COMPONENTS
// ─────────────────────────────────────────────────────────────
function UserBubble({msg}) {
  return <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14,animation:"fadeUp 0.2s ease"}}>
    <div style={{maxWidth:"70%"}}>
      {msg.files?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end",marginBottom:5}}>{msg.files.map(f=><FileChip key={f.id} file={f}/>)}</div>}
      <div style={{background:"#111",color:"#fff",padding:"10px 14px",borderRadius:"16px 16px 4px 16px",fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
        {msg.text}
      </div>
      <div style={{textAlign:"right",marginTop:3,display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4}}>
        <ModeBadge mode={msg.usedMode}/>
        {msg.usedModels&&<span style={{fontSize:10,color:"#ccc",fontFamily:"monospace"}}>{msg.usedModels}</span>}
      </div>
    </div>
  </div>;
}

function AiBlock({aiKey,status,text}) {
  const info=AI_INFO[aiKey];
  if(status==="idle") return null;
  return <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8,animation:"fadeUp 0.25s ease"}}>
    <Avatar ai={aiKey}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:10,fontWeight:700,color:info.color,marginBottom:3,fontFamily:"monospace",letterSpacing:"0.04em"}}>{info.name}</div>
      <div style={{background:status==="loading"?"#fafafa":info.bg,border:`1px solid ${info.color}22`,borderRadius:"4px 14px 14px 14px",padding:"10px 13px",fontSize:13.5,lineHeight:1.8,color:"#111",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
        {status==="loading"&&<Dots color={info.color}/>}
        {status==="done"&&text}
        {status==="error"&&<span style={{color:"#e53e3e"}}>{text}</span>}
      </div>
    </div>
  </div>;
}

function AIMessage({msg}) {
  const div=(label)=><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,marginTop:4}}>
    <span style={{fontSize:10,fontWeight:700,color:"#ccc",letterSpacing:"0.1em",fontFamily:"monospace",whiteSpace:"nowrap"}}>{label}</span>
    <div style={{flex:1,height:1,background:"#f0f0f0"}}/>
  </div>;

  return <div style={{marginBottom:18,animation:"fadeUp 0.2s ease"}}>
    {msg.mode===MODE.DEBATE&&<>
      {msg.round0&&<>{div("1R — 초기 분석")}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8,marginBottom:10}}>{["claude","gpt","gemini"].map(k=><AiBlock key={k} aiKey={k} status={msg.round0[k]?.status||"idle"} text={msg.round0[k]?.text}/>)}</div></>}
      {msg.round1&&<>{div("2R — 교차 비판")}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8,marginBottom:10}}>{["claude","gpt","gemini"].map(k=><AiBlock key={k} aiKey={k} status={msg.round1[k]?.status||"idle"} text={msg.round1[k]?.text}/>)}</div></>}
      {msg.final&&<>{div("FINAL — 종합")}<AiBlock aiKey="final" status={msg.final.status||"idle"} text={msg.final.text}/></>}
    </>}
    {msg.mode===MODE.SINGLE&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8}}>{["claude","gpt","gemini"].map(k=><AiBlock key={k} aiKey={k} status={msg.responses?.[k]?.status||"idle"} text={msg.responses?.[k]?.text}/>)}</div>}
    {msg.mode===MODE.IMAGE&&msg.imageUrl&&<div style={{display:"flex",gap:8,alignItems:"flex-start"}}><Avatar ai="claude"/><div><div style={{fontSize:10,fontWeight:700,color:AI_INFO.claude.color,marginBottom:5,fontFamily:"monospace"}}>이미지 생성 완료</div><img src={msg.imageUrl} alt="generated" style={{maxWidth:360,borderRadius:10,border:"1px solid #e8e8e8",boxShadow:"0 4px 20px rgba(0,0,0,0.1)",display:"block"}}/><a href={msg.imageUrl} download={`img_${Date.now()}.png`} style={{display:"inline-block",marginTop:7,fontSize:12,color:"#555",textDecoration:"none",padding:"4px 12px",border:"1px solid #e8e8e8",borderRadius:6,background:"#fff"}}>↓ 다운로드</a></div></div>}
    {msg.mode===MODE.IMAGE&&msg.status==="loading"&&<div style={{display:"flex",gap:8}}><Avatar ai="claude"/><div style={{padding:"10px 13px",background:"#fafafa",borderRadius:"4px 14px 14px 14px",fontSize:13,color:"#888"}}><Dots color="#C85E3A"/> 이미지 생성 중...</div></div>}
    {msg.mode===MODE.IMAGE&&msg.status==="error"&&<div style={{display:"flex",gap:8}}><Avatar ai="claude"/><div style={{padding:"10px 13px",background:"#fff5f5",border:"1px solid #fed7d7",borderRadius:"4px 14px 14px 14px",fontSize:13,color:"#e53e3e"}}>{msg.error}</div></div>}
  </div>;
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────
const ctxBtnStyle = {display:"block",width:"100%",padding:"9px 14px",background:"none",border:"none",cursor:"pointer",fontSize:13,textAlign:"left",color:"#333"};

function Sidebar({projects,chats,activeProjectId,activeChatId,onSelectProject,onSelectChat,onNewChat,onNewProject,onRenameProject,onDeleteProject,onDeleteChat,collapsed,onToggle}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState("");
  const [newProjMode, setNewProjMode] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [contextMenu, setContextMenu] = useState(null);

  const activeProj = projects.find(p=>p.id===activeProjectId);
  const projChats  = chats.filter(c=>c.projectId===activeProjectId).sort((a,b)=>b.updatedAt-a.updatedAt);

  const startRename=(p,e)=>{e.stopPropagation();setEditingId(p.id);setEditName(p.name);setContextMenu(null);};
  const commitRename=(id)=>{if(editName.trim()) onRenameProject(id,editName.trim());setEditingId(null);};

  return <div style={{width:collapsed?0:240,minWidth:collapsed?0:240,height:"100%",background:"#fafafa",borderRight:"1px solid #ebebeb",display:"flex",flexDirection:"column",transition:"width 0.22s ease,min-width 0.22s ease",overflow:"hidden",zIndex:20,position:"relative"}}>
    {!collapsed&&<>
      {/* Top */}
      <div style={{padding:"14px 12px 10px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:12,fontWeight:700,color:"#111",fontFamily:"monospace"}}>LoopLab AI</span>
          <button onClick={onToggle} style={{background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:16,padding:2}}>←</button>
        </div>
        <button onClick={onNewChat} style={{width:"100%",padding:"8px 12px",background:"#111",color:"#fff",border:"none",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:16,lineHeight:1}}>＋</span> 새 채팅
        </button>
      </div>

      {/* Projects */}
      <div style={{padding:"0 8px 6px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 4px 6px"}}>
          <span style={{fontSize:10,fontWeight:700,color:"#bbb",letterSpacing:"0.08em"}}>PROJECTS</span>
          <button onClick={()=>setNewProjMode(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:15,lineHeight:1,padding:2}}>＋</button>
        </div>
        {newProjMode&&<div style={{display:"flex",gap:4,marginBottom:4}}>
          <input autoFocus value={newProjName} onChange={e=>setNewProjName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&newProjName.trim()){onNewProject(newProjName.trim());setNewProjName("");setNewProjMode(false);}if(e.key==="Escape"){setNewProjMode(false);setNewProjName("");}}}
            placeholder="프로젝트명..." style={{flex:1,padding:"5px 8px",border:"1.5px solid #e0e0e0",borderRadius:6,fontSize:12,outline:"none",background:"#fff"}}/>
          <button onClick={()=>{if(newProjName.trim()){onNewProject(newProjName.trim());setNewProjName("");setNewProjMode(false);}}} style={{padding:"5px 8px",background:"#111",color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer"}}>✓</button>
        </div>}
        {projects.map(p=>(
          <div key={p.id} onClick={()=>onSelectProject(p.id)}
            onContextMenu={e=>{e.preventDefault();setContextMenu({type:"project",id:p.id,x:e.clientX,y:e.clientY});}}
            style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",borderRadius:7,cursor:"pointer",marginBottom:1,background:activeProjectId===p.id?"#efefef":"transparent",transition:"background 0.15s"}}
            onMouseEnter={e=>{if(activeProjectId!==p.id)e.currentTarget.style.background="#f3f3f3";}}
            onMouseLeave={e=>{if(activeProjectId!==p.id)e.currentTarget.style.background="transparent";}}>
            <span style={{fontSize:14}}>📁</span>
            {editingId===p.id
              ?<input autoFocus value={editName} onChange={e=>setEditName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")commitRename(p.id);if(e.key==="Escape")setEditingId(null);}}
                  onBlur={()=>commitRename(p.id)}
                  style={{flex:1,border:"1px solid #e0e0e0",borderRadius:5,padding:"2px 6px",fontSize:12,outline:"none"}}
                  onClick={e=>e.stopPropagation()}/>
              :<span style={{flex:1,fontSize:12,fontWeight:activeProjectId===p.id?600:400,color:"#222",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>}
            <span style={{fontSize:10,color:"#bbb",flexShrink:0}}>{chats.filter(c=>c.projectId===p.id).length}</span>
          </div>
        ))}
      </div>

      <div style={{height:1,background:"#ebebeb",margin:"0 12px",flexShrink:0}}/>

      {/* Chat list */}
      <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#bbb",letterSpacing:"0.08em",padding:"4px 4px 8px"}}>{activeProj?.name||"채팅"}</div>
        {projChats.length===0
          ?<div style={{fontSize:12,color:"#ccc",padding:"8px 4px"}}>채팅 기록이 없습니다</div>
          :projChats.map(chat=>(
            <div key={chat.id} onClick={()=>onSelectChat(chat.id)}
              onContextMenu={e=>{e.preventDefault();setContextMenu({type:"chat",id:chat.id,x:e.clientX,y:e.clientY});}}
              style={{padding:"7px 8px",borderRadius:7,cursor:"pointer",marginBottom:1,background:activeChatId===chat.id?"#efefef":"transparent",transition:"background 0.15s"}}
              onMouseEnter={e=>{if(activeChatId!==chat.id)e.currentTarget.style.background="#f3f3f3";}}
              onMouseLeave={e=>{if(activeChatId!==chat.id)e.currentTarget.style.background="transparent";}}>
              <div style={{fontSize:12,fontWeight:activeChatId===chat.id?600:400,color:"#222",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chat.title||"새 채팅"}</div>
              <div style={{fontSize:10,color:"#bbb",marginTop:1}}>{new Date(chat.updatedAt).toLocaleDateString("ko-KR",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          ))}
      </div>
    </>}

    {/* Context menu */}
    {contextMenu&&<>
      <div onClick={()=>setContextMenu(null)} style={{position:"fixed",inset:0,zIndex:98}}/>
      <div style={{position:"fixed",left:contextMenu.x,top:contextMenu.y,background:"#fff",border:"1px solid #e8e8e8",borderRadius:9,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",zIndex:99,overflow:"hidden",minWidth:150}}>
        {contextMenu.type==="project"&&<>
          <button onClick={()=>{const p=projects.find(x=>x.id===contextMenu.id);startRename(p,{stopPropagation:()=>{}});}} style={ctxBtnStyle}>✏️ 이름 변경</button>
          <button onClick={()=>{onDeleteProject(contextMenu.id);setContextMenu(null);}} style={{...ctxBtnStyle,color:"#e53e3e"}}>🗑️ 프로젝트 삭제</button>
        </>}
        {contextMenu.type==="chat"&&<button onClick={()=>{onDeleteChat(contextMenu.id);setContextMenu(null);}} style={{...ctxBtnStyle,color:"#e53e3e"}}>🗑️ 채팅 삭제</button>}
      </div>
    </>}
  </div>;
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [claudeKey, setClaudeKey]   = useState(import.meta.env.VITE_ANTHROPIC_KEY||"");
  const [gptKey, setGptKey]         = useState(import.meta.env.VITE_OPENAI_KEY||"");
  const [geminiKey, setGeminiKey]   = useState(import.meta.env.VITE_GEMINI_KEY||"");
  const [profile, setProfile]       = useState(DEFAULT_PROFILE);
  const [selModels, setSelModels]   = useState(DEFAULT_SEL_MODELS);
  const [memories, setMemories]     = useState([]); // string[]

  const [projects, setProjects]     = useState([DEFAULT_PROJECT]);
  const [chats, setChats]           = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("default");
  const [activeChatId, setActiveChatId]       = useState(null);

  const [input, setInput]           = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [mode, setMode]             = useState(MODE.DEBATE);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);

  const fileRef  = useRef(null);
  const bottomRef = useRef(null);
  const textaRef = useRef(null);

  // ── Persistence ──
  useEffect(()=>{
    try {
      const k=localStorage.getItem("_ak"); if(k){const p=JSON.parse(k);setClaudeKey(p.c||import.meta.env.VITE_ANTHROPIC_KEY||"");setGptKey(p.g||import.meta.env.VITE_OPENAI_KEY||"");setGeminiKey(p.gm||import.meta.env.VITE_GEMINI_KEY||"");}
      const pr=localStorage.getItem("_pr"); if(pr) setProfile(pr);
      const sm=localStorage.getItem("_sm"); if(sm) setSelModels({...DEFAULT_SEL_MODELS,...JSON.parse(sm)});
      const pj=localStorage.getItem("_pj"); if(pj) setProjects(JSON.parse(pj));
      const ch=localStorage.getItem("_ch"); if(ch) setChats(JSON.parse(ch));
      const mm=localStorage.getItem("_mm"); if(mm) setMemories(JSON.parse(mm));
    } catch(e){}
  },[]);

  const saveKeys=(c,g,gm)=>{ try{localStorage.setItem("_ak",JSON.stringify({c,g,gm}));}catch(e){} };
  const saveSM=(sm)=>{ try{localStorage.setItem("_sm",JSON.stringify(sm));}catch(e){} };
  const savePj=(p)=>{ try{localStorage.setItem("_pj",JSON.stringify(p));}catch(e){} };
  const saveCh=(c)=>{ try{localStorage.setItem("_ch",JSON.stringify(c));}catch(e){} };
  const saveMM=(m)=>{ try{localStorage.setItem("_mm",JSON.stringify(m));}catch(e){} };

  // Sync model changes
  useEffect(()=>saveSM(selModels),[selModels]);
  // Sync key changes
  useEffect(()=>saveKeys(claudeKey,gptKey,geminiKey),[claudeKey,gptKey,geminiKey]);

  const activeChat = chats.find(c=>c.id===activeChatId);
  const messages   = activeChat?.messages||[];
  useEffect(()=>{setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),80);},[messages]);

  // ── Memory helpers ──
  const addMemory=(m)=>{ const upd=[...memories,m]; setMemories(upd); saveMM(upd); };
  const deleteMemory=(i)=>{ const upd=memories.filter((_,idx)=>idx!==i); setMemories(upd); saveMM(upd); };

  const triggerMemoryExtract = async(chatMsgs)=>{
    if(chatMsgs.filter(m=>m.role==="user").length<3) return; // need at least 3 user messages
    const extracted = await extractMemories(chatMsgs, profile);
    if(extracted.length){
      setMemories(prev=>{
        const deduped=[...prev,...extracted.filter(e=>!prev.some(p=>p===e))];
        const upd=deduped.slice(-30); // keep max 30
        saveMM(upd); return upd;
      });
    }
  };

  // ── Project/chat management ──
  const newProject=(name)=>{ const p={id:`p${Date.now()}`,name,createdAt:Date.now()}; const u=[...projects,p]; setProjects(u); savePj(u); setActiveProjectId(p.id); };
  const renameProject=(id,name)=>{ const u=projects.map(p=>p.id===id?{...p,name}:p); setProjects(u); savePj(u); };
  const deleteProject=(id)=>{ if(projects.length<=1) return; const up=projects.filter(p=>p.id!==id); setProjects(up); savePj(up); const uc=chats.filter(c=>c.projectId!==id); setChats(uc); saveCh(uc); if(activeProjectId===id){setActiveProjectId(up[0].id);setActiveChatId(null);} };
  const newChat=()=>{ if(activeChatId&&messages.length===0) return; setActiveChatId(null); setInput(""); setPendingFiles([]); };
  const selectProject=(id)=>{ setActiveProjectId(id); const pc=chats.filter(c=>c.projectId===id).sort((a,b)=>b.updatedAt-a.updatedAt); setActiveChatId(pc[0]?.id||null); };
  const selectChat=(id)=>setActiveChatId(id);
  const deleteChat=(id)=>{ const u=chats.filter(c=>c.id!==id); setChats(u); saveCh(u); if(activeChatId===id) setActiveChatId(null); };

  const updateLastAiMsg=(chatId,updater)=>{
    setChats(prev=>{
      const u=prev.map(c=>{
        if(c.id!==chatId) return c;
        const msgs=[...c.messages]; const li=msgs.findLastIndex(m=>m.role==="ai");
        if(li>=0) msgs[li]=updater(msgs[li]);
        return{...c,messages:msgs,updatedAt:Date.now()};
      }); saveCh(u); return u;
    });
  };

  // ── File handling ──
  const addFiles=useCallback(async rawFiles=>{
    setProcessing(true);
    const p=await Promise.all(Array.from(rawFiles).map(processFile));
    setPendingFiles(prev=>[...prev,...p]); setProcessing(false);
  },[]);
  const onDrop=useCallback(e=>{e.preventDefault();addFiles(e.dataTransfer.files);},[addFiles]);

  // ── Build system prompt ──
  const buildSys=(textCtx)=>{
    const memCtx = memories.length ? `\n\n[장기 메모리 - 사용자 정보]\n${memories.map(m=>`• ${m}`).join("\n")}` : "";
    return `당신은 전문 분석가입니다.\n\n[사용자 프로필]\n${profile}${memCtx}${textCtx}\n\n서론 없이 핵심부터, 구체적이고 실용적으로 답하세요.`;
  };

  // Model display names (live from selection)
  const modelShortName=(id)=>{ const all=[...CLAUDE_MODELS,...GPT_MODELS,...GEMINI_MODELS,...IMG_MODELS]; return all.find(m=>m.id===id)?.label||id; };
  const usedModelsStr=()=>`${modelShortName(selModels.claude)} · ${modelShortName(selModels.gpt)} · ${modelShortName(selModels.gemini)}`;

  // ── Send ──
  const handleSend=async()=>{
    const q=input.trim(); if(!q||sending) return;
    if(!claudeKey||!gptKey||!geminiKey){setSettingsOpen(true);return;}

    let chatId=activeChatId;
    if(!chatId){
      const nc={id:`c${Date.now()}`,projectId:activeProjectId,title:q.slice(0,40),messages:[],createdAt:Date.now(),updatedAt:Date.now()};
      const uc=[...chats,nc]; setChats(uc); saveCh(uc); chatId=nc.id; setActiveChatId(chatId);
    }

    const userMsg={id:`u${Date.now()}`,role:"user",text:q,files:[...pendingFiles],usedMode:mode,usedModels:usedModelsStr()};
    const aiId=`a${Date.now()}`;
    const allFiles=[...pendingFiles];
    const imgs=buildImgCtx(allFiles);
    const textCtx=buildTextCtx(allFiles);
    const sys=buildSys(textCtx);

    setChats(prev=>{const u=prev.map(c=>c.id!==chatId?c:{...c,messages:[...c.messages,userMsg],title:c.title||q.slice(0,40),updatedAt:Date.now()}); saveCh(u); return u;});
    setInput(""); setPendingFiles([]); setSending(true);

    // ── IMAGE ──
    if(mode===MODE.IMAGE){
      const aiMsg={id:aiId,role:"ai",mode:MODE.IMAGE,status:"loading"};
      setChats(prev=>{const u=prev.map(c=>c.id!==chatId?c:{...c,messages:[...c.messages,aiMsg],updatedAt:Date.now()}); saveCh(u); return u;});
      try{
        const url=selModels.img==="dalle"?await genDalle(q,gptKey):await genNanoBanana(q,geminiKey);
        updateLastAiMsg(chatId,m=>({...m,status:"done",imageUrl:url}));
      }catch(e){updateLastAiMsg(chatId,m=>({...m,status:"error",error:e.message}));}
      setSending(false); return;
    }

    // ── SINGLE ──
    if(mode===MODE.SINGLE){
      const aiMsg={id:aiId,role:"ai",mode:MODE.SINGLE,responses:{claude:{status:"loading"},gpt:{status:"loading"},gemini:{status:"loading"}}};
      setChats(prev=>{const u=prev.map(c=>c.id!==chatId?c:{...c,messages:[...c.messages,aiMsg],updatedAt:Date.now()}); saveCh(u); return u;});
      const upd=(k,st,txt)=>updateLastAiMsg(chatId,m=>({...m,responses:{...m.responses,[k]:{status:st,text:txt}}}));
      await Promise.all([
        callClaude(mkCMsgs(q,imgs),sys,selModels.claude,claudeKey).then(t=>upd("claude","done",t)).catch(e=>upd("claude","error","오류: "+e.message)),
        callGPT(mkGMsgs(q,imgs),gptKey,sys,selModels.gpt).then(t=>upd("gpt","done",t)).catch(e=>upd("gpt","error","오류: "+e.message)),
        callGemini(mkGmParts(q,imgs),geminiKey,sys,selModels.gemini).then(t=>upd("gemini","done",t)).catch(e=>upd("gemini","error","오류: "+e.message)),
      ]);
      setSending(false);
      // trigger memory extraction async
      const updChats=chats.find(c=>c.id===chatId); if(updChats) triggerMemoryExtract([...updChats.messages,userMsg]);
      return;
    }

    // ── DEBATE ──
    const aiMsg={id:aiId,role:"ai",mode:MODE.DEBATE,round0:{claude:{status:"loading"},gpt:{status:"loading"},gemini:{status:"loading"}},round1:null,final:null};
    setChats(prev=>{const u=prev.map(c=>c.id!==chatId?c:{...c,messages:[...c.messages,aiMsg],updatedAt:Date.now()}); saveCh(u); return u;});
    const updR=(round,k,st,txt)=>updateLastAiMsg(chatId,m=>({...m,[round]:{...(m[round]||{}),[k]:{status:st,text:txt}}}));

    const r0={};
    const q1=`다음에 대해 핵심 분석을 제공하세요:\n\n${q}`;
    await Promise.all([
      callClaude(mkCMsgs(q1,imgs),sys,selModels.claude,claudeKey).then(t=>{r0.claude=t;updR("round0","claude","done",t);}).catch(e=>{r0.claude="오류: "+e.message;updR("round0","claude","error",r0.claude);}),
      callGPT(mkGMsgs(q1,imgs),gptKey,sys,selModels.gpt).then(t=>{r0.gpt=t;updR("round0","gpt","done",t);}).catch(e=>{r0.gpt="오류: "+e.message;updR("round0","gpt","error",r0.gpt);}),
      callGemini(mkGmParts(q1,imgs),geminiKey,sys,selModels.gemini).then(t=>{r0.gemini=t;updR("round0","gemini","done",t);}).catch(e=>{r0.gemini="오류: "+e.message;updR("round0","gemini","error",r0.gemini);}),
    ]);

    updateLastAiMsg(chatId,m=>({...m,round1:{claude:{status:"loading"},gpt:{status:"loading"},gemini:{status:"loading"}}}));
    const r1={};
    const q2=(o)=>`원래 질문: ${q}\n\n다른 AI 분석:\n${o}\n\n논리적 허점을 지적하고 날카로운 인사이트를 추가하세요.`;
    await Promise.all([
      callClaude(mkCMsgs(q2(`[GPT]\n${r0.gpt}\n\n[Gemini]\n${r0.gemini}`),imgs),sys,selModels.claude,claudeKey).then(t=>{r1.claude=t;updR("round1","claude","done",t);}).catch(e=>{r1.claude="오류: "+e.message;updR("round1","claude","error",r1.claude);}),
      callGPT(mkGMsgs(q2(`[Claude]\n${r0.claude}\n\n[Gemini]\n${r0.gemini}`),imgs),gptKey,sys,selModels.gpt).then(t=>{r1.gpt=t;updR("round1","gpt","done",t);}).catch(e=>{r1.gpt="오류: "+e.message;updR("round1","gpt","error",r1.gpt);}),
      callGemini(mkGmParts(q2(`[Claude]\n${r0.claude}\n\n[GPT]\n${r0.gpt}`),imgs),geminiKey,sys,selModels.gemini).then(t=>{r1.gemini=t;updR("round1","gemini","done",t);}).catch(e=>{r1.gemini="오류: "+e.message;updR("round1","gemini","error",r1.gemini);}),
    ]);

    updateLastAiMsg(chatId,m=>({...m,final:{status:"loading"}}));
    const sq=`질문: ${q}\n\n[1R]\nClaude:${r0.claude}\nGPT:${r0.gpt}\nGemini:${r0.gemini}\n\n[2R]\nClaude:${r1.claude}\nGPT:${r1.gpt}\nGemini:${r1.gemini}\n\n종합:\n1. 공통 합의\n2. 의견 차이\n3. 최종 결론 및 실행 시사점`;
    await callClaude([{role:"user",content:sq}],sys,selModels.claude,claudeKey)
      .then(t=>updateLastAiMsg(chatId,m=>({...m,final:{status:"done",text:t}})))
      .catch(e=>updateLastAiMsg(chatId,m=>({...m,final:{status:"error",text:"오류: "+e.message}})));

    setSending(false);
    // async memory extraction
    setTimeout(()=>{ const c=chats.find(x=>x.id===chatId); if(c) triggerMemoryExtract([...c.messages,userMsg]); },500);
  };

  const onKey=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();}};
  const connected=claudeKey&&gptKey&&geminiKey;

  return <>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      body{background:#f7f7f7;overflow:hidden;}
      textarea,input{outline:none;font-family:inherit;}
      @keyframes blink{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:2px}
    `}</style>

    <div style={{height:"100vh",display:"flex",background:"#f7f7f7"}} onDrop={onDrop} onDragOver={e=>e.preventDefault()}>

      <Sidebar projects={projects} chats={chats} activeProjectId={activeProjectId} activeChatId={activeChatId}
        onSelectProject={selectProject} onSelectChat={selectChat} onNewChat={newChat} onNewProject={newProject}
        onRenameProject={renameProject} onDeleteProject={deleteProject} onDeleteChat={deleteChat}
        collapsed={sidebarCollapsed} onToggle={()=>setSidebarCollapsed(v=>!v)}/>

      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,height:"100vh"}}>

        {/* Top bar */}
        <div style={{height:50,background:"#fff",borderBottom:"1px solid #f0f0f0",display:"flex",alignItems:"center",padding:"0 14px",gap:10,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          {sidebarCollapsed&&<button onClick={()=>setSidebarCollapsed(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#aaa",fontSize:18,padding:2,lineHeight:1}}>☰</button>}
          <span style={{fontSize:13,fontWeight:600,color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
            {activeChat?.title||(projects.find(p=>p.id===activeProjectId)?.name||"새 채팅")}
          </span>

          {/* Current models display */}
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            {[{k:"claude",color:"#C85E3A",m:selModels.claude},{k:"gpt",color:"#0A7B5C",m:selModels.gpt},{k:"gemini",color:"#1558C0",m:selModels.gemini}].map(({k,color,m})=>{
              const short=CLAUDE_MODELS.find(x=>x.id===m)?.label.replace("Claude ","")
                ||GPT_MODELS.find(x=>x.id===m)?.label
                ||GEMINI_MODELS.find(x=>x.id===m)?.label.replace("Gemini ","")
                ||m;
              return <span key={k} style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:color+"12",color,fontFamily:"monospace",fontWeight:600,border:`1px solid ${color}22`}}>{short}</span>;
            })}
          </div>

          {/* Mode selector */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowModeMenu(v=>!v)} style={{padding:"5px 10px",background:"#f5f5f5",border:"1px solid #e8e8e8",borderRadius:8,fontSize:12,fontWeight:600,color:"#555",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {MODE_INFO[mode].label} <span style={{color:"#bbb",fontSize:10}}>▼</span>
            </button>
            {showModeMenu&&<>
              <div onClick={()=>setShowModeMenu(false)} style={{position:"fixed",inset:0,zIndex:48}}/>
              <div style={{position:"absolute",top:36,right:0,background:"#fff",border:"1px solid #e8e8e8",borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,0.1)",zIndex:49,minWidth:190,overflow:"hidden"}}>
                {Object.entries(MODE_INFO).map(([k,v])=>(
                  <button key={k} onClick={()=>{setMode(k);setShowModeMenu(false);}} style={{width:"100%",padding:"9px 14px",background:mode===k?"#f5f5f5":"#fff",border:"none",cursor:"pointer",textAlign:"left",borderBottom:"1px solid #f5f5f5"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{v.label}</div>
                    <div style={{fontSize:11,color:"#aaa",marginTop:1}}>{v.desc}</div>
                  </button>
                ))}
                <div style={{padding:"9px 14px",background:"#fffbeb",borderTop:"1px solid #f0f0f0"}}>
                  <div style={{fontSize:11,color:"#92400e"}}>💡 모드 변경 시 새 채팅 불필요 — 다음 전송부터 바로 적용</div>
                </div>
              </div>
            </>}
          </div>

          <button onClick={()=>setSettingsOpen(true)} style={{width:32,height:32,borderRadius:8,background:connected?"#f0faf6":"#fff5f5",border:`1px solid ${connected?"#0A7B5C33":"#e8e8e8"}`,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}} title="설정">⚙️</button>
        </div>

        {/* Chat area */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 16px"}}>
          <div style={{maxWidth:860,margin:"0 auto"}}>
            {messages.length===0&&(
              <div style={{textAlign:"center",padding:"60px 20px 40px",animation:"fadeUp 0.4s ease"}}>
                <div style={{fontSize:28,marginBottom:10}}>🤖</div>
                <div style={{fontSize:18,fontWeight:700,color:"#111",marginBottom:6}}>새 채팅</div>
                <div style={{fontSize:13,color:"#aaa",lineHeight:1.8,marginBottom:20}}>
                  파일 📎 첨부 후 질문하면 바로 분석됩니다<br/>
                  <span style={{color:"#C85E3A",fontWeight:600}}>토론</span>: 3단계 토론 후 종합 &nbsp;·&nbsp;
                  <span style={{color:"#0A7B5C",fontWeight:600}}>단일</span>: 3AI 동시 답변 &nbsp;·&nbsp;
                  <span style={{color:"#1558C0",fontWeight:600}}>이미지</span>: AI 이미지 생성
                </div>
                {memories.length>0&&<div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#faf5ff",border:"1px solid #6B21A833",borderRadius:20,fontSize:12,color:"#6B21A8",marginBottom:16}}>
                  🧠 {memories.length}개 메모리 활성화됨
                </div>}
                {!connected&&<button onClick={()=>setSettingsOpen(true)} style={{display:"block",margin:"0 auto 16px",padding:"9px 20px",background:"#111",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>⚙️ API 키 설정</button>}
                <div style={{display:"flex",gap:7,justifyContent:"center",flexWrap:"wrap"}}>
                  {["라이브히어로 SaaS 경쟁사 분석","틱톡 라이브 에이전시 수익 구조","투자 유치를 위한 피치덱 전략"].map(q=>(
                    <button key={q} onClick={()=>setInput(q)} style={{padding:"6px 14px",background:"#fff",border:"1px solid #e8e8e8",borderRadius:20,fontSize:12,color:"#666",cursor:"pointer"}}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg=>msg.role==="user"?<UserBubble key={msg.id} msg={msg}/>:<AIMessage key={msg.id} msg={msg}/>)}
            <div ref={bottomRef}/>
          </div>
        </div>

        {/* Input area */}
        <div style={{background:"#fff",borderTop:"1px solid #f0f0f0",padding:"10px 14px 14px",flexShrink:0}}>
          <div style={{maxWidth:860,margin:"0 auto"}}>
            {pendingFiles.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:7}}>{pendingFiles.map(f=><FileChip key={f.id} file={f} onRemove={()=>setPendingFiles(prev=>prev.filter(x=>x.id!==f.id))}/>)}</div>}
            <div style={{display:"flex",alignItems:"flex-end",gap:7,background:"#fff",border:"1.5px solid #e0e0e0",borderRadius:14,padding:"7px 7px 7px 12px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
              <button onClick={()=>fileRef.current?.click()} disabled={processing}
                style={{width:32,height:32,borderRadius:8,background:"#f5f5f5",border:"1px solid #e8e8e8",cursor:processing?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0,color:"#888"}}>
                {processing?<Dots color="#bbb"/>:"📎"}
              </button>
              <input ref={fileRef} type="file" multiple
                accept=".pdf,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.pptx,.ppt,.hwpx,.hwp,.docx,.mp4,.mov,.avi,.webm,.xlsx,.xls"
                style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
              <textarea ref={textaRef} value={input}
                onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";}}
                onKeyDown={onKey}
                placeholder={mode===MODE.IMAGE?"이미지 프롬프트...":mode===MODE.DEBATE?"토론 주제나 질문을 입력하세요...":"3개 AI에게 질문하세요..."}
                rows={1}
                style={{flex:1,border:"none",resize:"none",fontSize:14,lineHeight:1.65,color:"#111",background:"transparent",minHeight:34,maxHeight:160,padding:"5px 0"}}/>
              <button onClick={handleSend} disabled={!input.trim()||sending}
                style={{width:34,height:34,borderRadius:9,background:input.trim()&&!sending?"#111":"#f0f0f0",border:"none",cursor:input.trim()&&!sending?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.18s"}}>
                {sending?<Spinner/>:<svg width="15" height="15" viewBox="0 0 24 24" fill={input.trim()?"#fff":"#ccc"}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
              </button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5,padding:"0 2px"}}>
              <div style={{fontSize:11,color:"#ccc"}}>Enter 전송 · Shift+Enter 줄바꿈 · 드래그&드롭 첨부</div>
              <div style={{fontSize:11,color:connected?"#0A7B5C":"#e53e3e",fontWeight:600}}>{connected?"✓ API 연결됨":"⚠ API 키 필요"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SettingsPanel
      claudeKey={claudeKey} setClaudeKey={setClaudeKey}
      gptKey={gptKey} setGptKey={setGptKey} geminiKey={geminiKey} setGeminiKey={setGeminiKey}
      profile={profile} setProfile={setProfile} onSaveProfile={p=>{setProfile(p);try{localStorage.setItem("_pr",p);}catch(e){}}}
      selModels={selModels} setSelModels={setSelModels}
      memories={memories} onDeleteMemory={deleteMemory} onAddMemory={addMemory}
      open={settingsOpen} onClose={()=>setSettingsOpen(false)}/>
  </>;
}
