"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Download, FileJson, Keyboard, MousePointer2, Music2, Pause, Play, RotateCcw, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import oidemaseDefaultChart from "@/data/oidemase-default-chart.json";
import { ChartEditor } from "./chart-editor";

type DanceNote = { id: string; time: number; key: "W" | "A" | "S" | "D" };
type CheerNote = { id: string; time: number; x: number; y: number; type: "tap" | "clap" | "burst" };
type CallCue = { start: number; end: number; main: string; sub: string };
type GameSection = { start: number; end: number; mode: "dance" | "cheer" };
type Chart = { title: string; artist: string; bpm: number; duration: number; sections: GameSection[]; danceNotes: DanceNote[]; cheerNotes: CheerNote[]; calls: CallCue[] };
type Judge = "PERFECT" | "GOOD" | "BAD" | "MISS";

const defaultChart = oidemaseDefaultChart as Chart;

const laneKeys: DanceNote["key"][] = ["A","S","W","D"];
const danceKeyByCode: Record<string,DanceNote["key"]> = { ArrowUp:"W", ArrowLeft:"A", ArrowDown:"S", ArrowRight:"D" };
const keyGlyph = (key:DanceNote["key"]): string => key==="W"?"↑":key==="A"?"←":key==="S"?"↓":"→";
const keyAction = (key:DanceNote["key"]): string => key==="W"?"跳跃":key==="A"?"向左":key==="S"?"下蹲":"向右";
const judgeFromDelta=(delta:number):Judge=>{const d=Math.abs(delta);return d<=.05?"PERFECT":d<=.11?"GOOD":d<=.18?"BAD":"MISS"};
const scoreFor=(judge:Judge)=>judge==="PERFECT"?1000:judge==="GOOD"?500:judge==="BAD"?100:0;
const isDanceTime=(t:number,sections:GameSection[])=>sections.find(section=>t>=section.start&&t<section.end)?.mode!=="cheer";
const fallbackSections=(duration:number):GameSection[]=>[
  {start:0,end:Math.min(16,duration),mode:"dance"},
  {start:Math.min(16,duration),end:Math.min(28,duration),mode:"cheer"},
  {start:Math.min(28,duration),end:Math.min(44,duration),mode:"dance"},
  {start:Math.min(44,duration),end:duration,mode:"cheer"},
].filter(section=>section.end>section.start);

function scheduleDemoTrack(context:AudioContext,duration:number){
  const base=context.currentTime+.05,beat=60/128,scale=[261.63,329.63,392,523.25,392,329.63,293.66,392];
  const tone=(at:number,frequency:number,length:number,volume:number,type:OscillatorType)=>{const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+length);osc.connect(gain).connect(context.destination);osc.start(at);osc.stop(at+length+.02)};
  for(let i=0;i*beat<duration;i++){const at=base+i*beat;tone(at,i%4===0?82.41:110,.09,i%4===0?.14:.07,"square");tone(at,scale[i%scale.length]*(i%8>5?2:1),beat*.38,.035,"triangle");if(i%2===1)tone(at+beat/2,740,.035,.025,"square")}
}

export default function Home(){
  const [chart,setChart]=useState<Chart>(defaultChart);
  const [gameState,setGameState]=useState<"idle"|"playing"|"paused"|"finished">("idle");
  const [time,setTime]=useState(0);
  const [stats,setStats]=useState({score:0,combo:0,maxCombo:0,hits:0,total:0});
  const [lastJudge,setLastJudge]=useState<{text:Judge;nonce:number;offset:number}|null>(null);
  const [results,setResults]=useState<Record<string,Judge>>({});
  const [editorOpen,setEditorOpen]=useState(false);
  const [audioUrl,setAudioUrl]=useState<string|null>("/oidemase.mp3");
  const [audioName,setAudioName]=useState("FES☆TIVE — OIDEMASE!!～極楽～");
  const [notice,setNotice]=useState("按下开始，让偶像和应援在同一首歌里交替登场");
  const audioRef=useRef<HTMLAudioElement>(null),audioInputRef=useRef<HTMLInputElement>(null),chartInputRef=useRef<HTMLInputElement>(null);
  const frameRef=useRef<number|null>(null),startPerfRef=useRef(0),audioContextRef=useRef<AudioContext|null>(null);
  const resultsRef=useRef<Record<string,Judge>>({});
  const mode=isDanceTime(time,chart.sections)?"dance":"cheer",progress=Math.min(100,time/chart.duration*100),accuracy=stats.total?Math.round(stats.hits/stats.total*100):100;
  const cue=chart.calls.find(item=>time>=item.start&&time<item.end)??chart.calls[chart.calls.length-1];

  const registerJudge=useCallback((id:string,judge:Judge,offset=0)=>{if(resultsRef.current[id])return;resultsRef.current[id]=judge;setResults(prev=>({...prev,[id]:judge}));const hit=judge!=="MISS";setStats(prev=>{const combo=hit?prev.combo+1:0;return{score:prev.score+scoreFor(judge)+(hit?Math.min(prev.combo,50)*8:0),combo,maxCombo:Math.max(prev.maxCombo,combo),hits:prev.hits+(hit?1:0),total:prev.total+1}});setLastJudge({text:judge,nonce:Date.now(),offset})},[]);
  const resetGame=useCallback(()=>{if(frameRef.current)cancelAnimationFrame(frameRef.current);if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0}if(audioContextRef.current){void audioContextRef.current.close();audioContextRef.current=null}resultsRef.current={};setResults({});setStats({score:0,combo:0,maxCombo:0,hits:0,total:0});setTime(0);setLastJudge(null);setGameState("idle");setNotice("准备好了？耳机音量别开太大")},[]);
  const finishGame=useCallback(()=>{if(frameRef.current)cancelAnimationFrame(frameRef.current);if(audioRef.current)audioRef.current.pause();if(audioContextRef.current?.state==="running")void audioContextRef.current.suspend();setGameState("finished");setNotice("LIVE 结束！看看你的最高连击吧")},[]);

  useEffect(()=>{if(gameState!=="playing")return;const tick=()=>{const next=audioUrl&&audioRef.current?audioRef.current.currentTime:Math.max(0,(performance.now()-startPerfRef.current)/1000);setTime(next);for(const note of [...chart.danceNotes,...chart.cheerNotes])if(!resultsRef.current[note.id]&&next-note.time>.185)registerJudge(note.id,"MISS",next-note.time);if(next>=chart.duration){finishGame();return}frameRef.current=requestAnimationFrame(tick)};frameRef.current=requestAnimationFrame(tick);return()=>{if(frameRef.current)cancelAnimationFrame(frameRef.current)}},[audioUrl,chart,finishGame,gameState,registerJudge]);

  const currentClock=useCallback(()=>audioUrl&&audioRef.current?audioRef.current.currentTime:gameState==="playing"?Math.max(0,(performance.now()-startPerfRef.current)/1000):time,[audioUrl,gameState,time]);
  const pressKey=useCallback((key:DanceNote["key"])=>{const now=currentClock();if(gameState!=="playing"||!isDanceTime(now,chart.sections))return;const candidate=chart.danceNotes.filter(note=>note.key===key&&!resultsRef.current[note.id]).map(note=>({note,delta:now-note.time})).filter(({delta})=>Math.abs(delta)<=.18).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];if(candidate)registerJudge(candidate.note.id,judgeFromDelta(candidate.delta),candidate.delta)},[chart.danceNotes,chart.sections,currentClock,gameState,registerJudge]);
  useEffect(()=>{const blockArrow=(event:KeyboardEvent)=>{if(gameState!=="playing"||event.ctrlKey||event.metaKey||event.altKey)return;const key=danceKeyByCode[event.code];if(key){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(event.type==="keydown"&&!event.repeat)pressKey(key)}if(event.code==="Space"&&event.target===document.body)event.preventDefault()};window.addEventListener("keydown",blockArrow,{capture:true});window.addEventListener("keyup",blockArrow,{capture:true});return()=>{window.removeEventListener("keydown",blockArrow,{capture:true});window.removeEventListener("keyup",blockArrow,{capture:true})}},[gameState,pressKey]);

  const startOrPause=async()=>{if(gameState==="playing"){if(audioUrl&&audioRef.current)audioRef.current.pause();else if(audioContextRef.current)await audioContextRef.current.suspend();setGameState("paused");setNotice("已暂停，舞台灯还为你亮着");return}const resumeTime=gameState==="finished"?0:time;if(gameState==="finished")resetGame();if(audioUrl&&audioRef.current){if(gameState==="idle"||gameState==="finished")audioRef.current.currentTime=0;await audioRef.current.play()}else if(gameState==="paused"&&audioContextRef.current)await audioContextRef.current.resume();else{const context=new AudioContext();audioContextRef.current=context;scheduleDemoTrack(context,chart.duration)}startPerfRef.current=performance.now()-resumeTime*1000;setGameState("playing");setNotice("LIVE START — 看准判定线！")};
  const hitCheer=(note:CheerNote)=>{const now=currentClock();if(gameState!=="playing"||isDanceTime(now,chart.sections)||resultsRef.current[note.id])return;const delta=now-note.time;if(Math.abs(delta)<=.18)registerJudge(note.id,judgeFromDelta(delta),delta)};
  const activeDanceNotes=useMemo(()=>chart.danceNotes.filter(n=>n.time-time>-.3&&n.time-time<2.7),[chart.danceNotes,time]);
  const activeCheerNotes=useMemo(()=>chart.cheerNotes.filter(n=>n.time-time>-.3&&n.time-time<1.5),[chart.cheerNotes,time]);
  const loadAudio=(file?:File)=>{if(!file)return;if(audioUrl?.startsWith("blob:"))URL.revokeObjectURL(audioUrl);const url=URL.createObjectURL(file);setAudioUrl(url);setAudioName(file.name);resetGame();setNotice("音乐已装载；谱面时间仍按当前 JSON 执行")};
  const loadChart=async(file?:File)=>{if(!file)return;try{const parsed=JSON.parse(await file.text()) as Chart;if(!parsed.danceNotes||!parsed.cheerNotes||!parsed.duration)throw new Error("invalid chart");const normalized={...parsed,sections:Array.isArray(parsed.sections)&&parsed.sections.length?parsed.sections:fallbackSections(parsed.duration)};setChart(normalized);resetGame();setNotice(`已装载谱面：${parsed.title??file.name}`)}catch{setNotice("谱面读取失败：请使用导出的示例 JSON 格式")}};
  const exportChart=()=>{const blob=new Blob([JSON.stringify(chart,null,2)],{type:"application/json"}),href=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=href;anchor.download="idol-call-mix-chart.json";anchor.click();URL.revokeObjectURL(href)};

  return <main className="game-shell">
    <audio ref={audioRef} src={audioUrl??undefined} onEnded={finishGame}/>
    <input ref={audioInputRef} hidden type="file" accept="audio/*" onChange={e=>loadAudio(e.target.files?.[0])}/>
    <input ref={chartInputRef} hidden type="file" accept="application/json,.json" onChange={e=>void loadChart(e.target.files?.[0])}/>
    {editorOpen&&<ChartEditor open={editorOpen} onOpenChange={setEditorOpen} chart={chart} audioUrl={audioUrl} audioName={audioName} onApply={next=>{setChart(next);resetGame();setNotice("编辑后的谱面已应用；记得点击“导出”保存 JSON")}}/>}
    <header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={16}/></span><div><strong>IDOL CALL MIX</strong><small>偶像应援双打 / playable prototype</small></div></div><div className="song-chip"><Music2 size={15}/><span><b>{chart.title}</b><small>{audioName}</small></span></div><div className="header-actions"><Button className="editor-entry" variant="ghost" size="sm" onClick={()=>{resetGame();setEditorOpen(true)}}><SlidersHorizontal/>编辑器</Button><Button variant="ghost" size="sm" onClick={()=>audioInputRef.current?.click()}><Upload/>音乐</Button><Button variant="ghost" size="sm" onClick={()=>chartInputRef.current?.click()}><FileJson/>谱面</Button><Button variant="ghost" size="sm" onClick={exportChart}><Download/>导出</Button></div></header>
    <section className="scorebar" aria-label="游戏状态"><div className="score-block"><span>SCORE</span><b>{stats.score.toString().padStart(7,"0")}</b></div><div className="score-block combo"><span>COMBO</span><b>{stats.combo}<i>x</i></b></div><div className="timeline"><div className="timeline-labels"><span>{Math.floor(time/60)}:{Math.floor(time%60).toString().padStart(2,"0")}</span><strong>{mode==="dance"?"DANCE PART":"OTA CALL PART"}</strong><span>0:{Math.floor(chart.duration/60)}:{Math.floor(chart.duration%60).toString().padStart(2,"0")}</span></div><div className="timeline-track"><div className="timeline-fill" style={{width:`${progress}%`}}/>{chart.sections.slice(1).map(section=><i key={section.start} className="section-mark" style={{left:`${section.start/chart.duration*100}%`}}/>)}</div></div><div className="score-block accuracy"><span>ACCURACY</span><b>{accuracy}%</b></div></section>
    <section className="stage-wrap">
      <div className={`judge-pin ${lastJudge?.text.toLowerCase()??"waiting"}`}><span>LAST JUDGE</span><b>{lastJudge?.text??"—"}</b><small>{!lastJudge?"等待第一个音符":lastJudge.text==="MISS"?"超过 ±180 ms":`${lastJudge.offset>=0?"晚":"早"} ${Math.abs(Math.round(lastJudge.offset*1000))} ms`}</small></div>
      <div className={`play-panel dance-panel ${mode==="dance"?"active":"sleeping"}`}><div className="panel-label"><Keyboard size={16}/><span>偶像编舞</span><em>方向键</em></div><div className="dance-stage"><div className="spotlight"/><div className="pixel-grid"/><img width={1024} height={1536} className={`idol ${stats.combo>5?"fever":""}`} src="/pixel-idol.png" alt="原创像素风偶像角色"/><div className="crowd"><i/><i/><i/><i/><i/><i/><i/></div></div><div className="note-highway">{laneKeys.map(key=><div className="lane" key={key}><span className="lane-name">{keyGlyph(key)}</span></div>)}<div className="hit-line"/>{activeDanceNotes.map(note=>{const top=14+((2.5-(note.time-time))/2.5)*70,result=results[note.id];return <button key={note.id} aria-label={`${keyAction(note.key)}，按${keyGlyph(note.key)}`} onClick={()=>pressKey(note.key)} className={`falling-note key-${note.key} ${result?`judged ${result.toLowerCase()}`:""}`} style={{top:`${top}%`}}>{keyGlyph(note.key)}</button>})}</div><div className="touch-keys">{laneKeys.map(key=><button key={key} onPointerDown={()=>pressKey(key)}><b>{keyGlyph(key)}</b><small>{key==="W"?"跳":key==="A"?"左":key==="S"?"蹲":"右"}</small></button>)}</div></div>
      <div className="center-divider"><span>DUAL</span><i/><span>BEAT</span></div>
      <div className={`play-panel cheer-panel ${mode==="cheer"?"active":"sleeping"}`}><div className="panel-label"><MousePointer2 size={16}/><span>OTA 应援</span><em>CLICK</em></div><div className="cheer-field"><div className="field-rings"><i/><i/><i/></div><div className="call-watermark">CALL!</div>{activeCheerNotes.map(note=>{const until=note.time-time,approach=Math.max(1,1+until*1.55),result=results[note.id];return <button key={note.id} className={`cheer-target ${note.type} ${result?`judged ${result.toLowerCase()}`:""}`} style={{left:`${note.x}%`,top:`${note.y}%`,"--approach":approach} as CSSProperties} onPointerDown={()=>hitCheer(note)} aria-label={`${note.type} 应援音符`}><span>{note.type==="clap"?"👏":note.type==="burst"?"✦":"!"}</span><i/></button>})}<div className="penlight-hint"><span>鼠标 / 触屏</span><small>外圈与音符重合时点击</small></div></div></div>
      {lastJudge&&<div key={lastJudge.nonce} className={`judge-pop ${lastJudge.text.toLowerCase()}`}>{lastJudge.text}<small>{lastJudge.text==="MISS"?"":`${lastJudge.offset>=0?"+":""}${Math.round(lastJudge.offset*1000)} ms`}</small></div>}
    </section>
    <section className="call-strip"><div className="call-tag">NOW CALLING</div><div className="call-copy"><strong>{cue?.main??"准备——"}</strong><span>{cue?.sub??"等待音乐开始"}</span></div><div className="call-beats"><i/><i/><i/><i/></div></section>
    <footer className="controlbar"><div className="tip"><span className={`status-dot ${gameState}`}/>{notice}</div><div className="main-controls"><Button className="reset-button" variant="outline" size="icon" onClick={resetGame} aria-label="重新开始"><RotateCcw/></Button><Button className="play-button" onClick={()=>void startOrPause()}>{gameState==="playing"?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}{gameState==="playing"?"暂停":gameState==="paused"?"继续":gameState==="finished"?"再来一次":"开始 LIVE"}</Button></div><div className="result-mini"><span>MAX COMBO <b>{stats.maxCombo}</b></span><span>HIT <b>{stats.hits}/{stats.total}</b></span></div></footer>
  </main>;
}
