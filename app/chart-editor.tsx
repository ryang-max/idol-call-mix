"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, ChevronLeft, Keyboard, MousePointer2, Pause, Play, Plus, RotateCcw, Scissors, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type DanceNote = { id: string; time: number; key: "W" | "A" | "S" | "D" };
type CheerNote = { id: string; time: number; x: number; y: number; type: "tap" | "clap" | "burst" };
type CallCue = { start: number; end: number; main: string; sub: string };
export type GameSection = { start: number; end: number; mode: "dance" | "cheer" };
export type EditableChart = { title: string; artist: string; bpm: number; duration: number; sections: GameSection[]; danceNotes: DanceNote[]; cheerNotes: CheerNote[]; calls: CallCue[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chart: EditableChart;
  audioUrl: string | null;
  audioName: string;
  onApply: (chart: EditableChart) => void;
};

const keys: DanceNote["key"][] = ["A", "S", "W", "D"];
const keyByCode: Record<string, DanceNote["key"]> = { ArrowUp:"W", ArrowLeft:"A", ArrowDown:"S", ArrowRight:"D" };
const keyGlyph = (key: DanceNote["key"]): string => key === "W" ? "↑" : key === "A" ? "←" : key === "S" ? "↓" : "→";
const waves = [35,62,46,78,42,66,31,73,55,88,49,68,39,81,52,69,43,76,58,84,37,64,47,72,51,79,41,69,56,82,45,73,38,67,50,77,44,71,54,85,48,74,40,65,57,80];
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function ChartEditor({ open, onOpenChange, chart, audioUrl, audioName, onApply }: Props) {
  const [draft, setDraft] = useState(chart);
  const [history, setHistory] = useState<EditableChart[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [snap, setSnap] = useState(true);
  const [cheerType, setCheerType] = useState<CheerNote["type"]>("tap");
  const [callMain, setCallMain] = useState("はい！ はい！");
  const [callSub, setCallSub] = useState("这里输入动作或记忆提示");
  const frameRef = useRef<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    const context = new AudioContext();
    contextRef.current = context;
    const loadAudio = async () => {
      const bytes = await fetch(audioUrl).then(response => response.arrayBuffer());
      const buffer = await context.decodeAudioData(bytes);
      if (cancelled) return;
      bufferRef.current = buffer;
      setAudioReady(true);
      setDraft(previous => ({
        ...previous,
        duration: Number(buffer.duration.toFixed(3)),
        sections: previous.sections.map((section,index,all)=>({ ...section, end:Math.min(index===all.length-1?buffer.duration:section.end,buffer.duration) })).filter(section=>section.start<buffer.duration),
      }));
    };
    void loadAudio();
    return () => {
      cancelled = true;
      if (sourceRef.current) { sourceRef.current.onended = null; try { sourceRef.current.stop(); } catch {} }
      void context.close();
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const context = contextRef.current;
      if (context) setCursor(Math.min(draft.duration, Math.max(0, context.currentTime-startedAtRef.current)));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [draft.duration, playing]);

  const preciseTime = useCallback(() => playing&&contextRef.current?Math.min(draft.duration,Math.max(0,contextRef.current.currentTime-startedAtRef.current)):cursor, [cursor, draft.duration, playing]);
  const snapped = useCallback((raw: number) => {
    if (!snap) return Number(raw.toFixed(3));
    const step = 60 / Math.max(1, draft.bpm) / 2;
    return Number((Math.round(raw / step) * step).toFixed(3));
  }, [draft.bpm, snap]);

  const change = useCallback((next: EditableChart) => {
    setHistory((items) => [...items.slice(-39), structuredClone(draft)]);
    setDraft(next);
  }, [draft]);

  const addDance = useCallback((key: DanceNote["key"]) => {
    const time = snapped(preciseTime());
    change({ ...draft, danceNotes: [...draft.danceNotes, { id: uid("d"), time, key }].sort((a,b)=>a.time-b.time) });
  }, [change, draft, preciseTime, snapped]);

  useEffect(() => {
    if (!open) return;
    const shouldCapture = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      return Boolean(keyByCode[event.code]) && !event.ctrlKey && !event.metaKey && !event.altKey && target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA";
    };
    const recordKey = (event: KeyboardEvent) => {
      if (!shouldCapture(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!event.repeat) addDance(keyByCode[event.code]);
    };
    const blockKeyRelease = (event: KeyboardEvent) => {
      if (!shouldCapture(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", recordKey, { capture:true });
    window.addEventListener("keyup", blockKeyRelease, { capture:true });
    return () => {
      window.removeEventListener("keydown", recordKey, { capture:true });
      window.removeEventListener("keyup", blockKeyRelease, { capture:true });
    };
  }, [addDance, open]);

  const seek = (next: number) => {
    const value = clamp(next, 0, draft.duration);
    setCursor(value);
    if (playing) {
      if (sourceRef.current) { sourceRef.current.onended = null; try { sourceRef.current.stop(); } catch {} }
      const context=contextRef.current,buffer=bufferRef.current;
      if (context&&buffer&&value<draft.duration) { const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start(0,value);source.onended=()=>setPlaying(false);sourceRef.current=source;startedAtRef.current=context.currentTime-value; }
    }
  };

  const togglePlay = async () => {
    const context=contextRef.current,buffer=bufferRef.current;
    if (!context||!buffer||!audioReady) return;
    if (playing) {
      const now=preciseTime();
      if (sourceRef.current) { sourceRef.current.onended = null; try { sourceRef.current.stop(); } catch {} }
      sourceRef.current=null;setCursor(now);setPlaying(false);
    }
    else {
      (document.activeElement as HTMLElement | null)?.blur();
      await context.resume();
      const start=cursor>=draft.duration?0:cursor;
      if(start!==cursor)setCursor(0);
      const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start(0,start);source.onended=()=>{setCursor(draft.duration);setPlaying(false)};sourceRef.current=source;startedAtRef.current=context.currentTime-start;
      setPlaying(true);
    }
  };

  const addCheer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width * 100, 5, 95);
    const y = clamp((event.clientY - rect.top) / rect.height * 100, 8, 92);
    const time = snapped(preciseTime());
    change({ ...draft, cheerNotes: [...draft.cheerNotes, { id: uid("c"), time, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), type: cheerType }].sort((a,b)=>a.time-b.time) });
  };

  const markSection = (mode: GameSection["mode"]) => {
    const at = snapped(preciseTime());
    const points = draft.sections.map(s => ({ start: s.start, mode: s.mode })).filter(p => Math.abs(p.start-at)>.02);
    points.push({ start: at, mode });
    if (!points.some(p=>p.start===0)) points.push({ start:0, mode:"dance" });
    points.sort((a,b)=>a.start-b.start);
    const sections = points.map((p,i)=>({ start:p.start, end:points[i+1]?.start ?? draft.duration, mode:p.mode })).filter(s=>s.end>s.start);
    change({ ...draft, sections });
  };

  const addCall = () => {
    if (!callMain.trim()) return;
    const start = snapped(preciseTime());
    change({ ...draft, calls: [...draft.calls, { start, end: Math.min(draft.duration, start+4), main:callMain.trim(), sub:callSub.trim() }].sort((a,b)=>a.start-b.start) });
  };

  const undo = () => {
    const previous = history[history.length-1];
    if (!previous) return;
    setDraft(previous);
    setHistory(items=>items.slice(0,-1));
  };

  const clearAll = () => {
    change({ ...draft, danceNotes:[], cheerNotes:[], calls:[], sections:[{start:0,end:draft.duration,mode:"dance"}] });
  };

  const currentMode = draft.sections.find(s=>cursor>=s.start&&cursor<s.end)?.mode ?? "dance";
  const recent = [...draft.danceNotes.map(n=>({...n,kind:"dance" as const})),...draft.cheerNotes.map(n=>({...n,kind:"cheer" as const}))].sort((a,b)=>b.time-a.time).slice(0,7);

  const closeEditor = () => {
    if (sourceRef.current) { sourceRef.current.onended = null; try { sourceRef.current.stop(); } catch {} }
    setPlaying(false);
    onOpenChange(false);
  };

  return <Dialog open={open} onOpenChange={(next)=>{if(!next)closeEditor()}}>
    <DialogContent className="editor-dialog" showCloseButton={false}>
      <DialogHeader className="editor-header">
        <div className="editor-title-row"><Button variant="ghost" size="icon" onClick={closeEditor} aria-label="返回游戏"><ChevronLeft/></Button><div><DialogTitle>可视化谱面编辑器 <span>BETA</span></DialogTitle><DialogDescription>{audioUrl?`正在编辑：${audioName}`:"播放音乐，按键或点击画布就能记录音符"}</DialogDescription></div></div>
        <div className="editor-summary"><span>{draft.danceNotes.length} 个舞步</span><span>{draft.cheerNotes.length} 个应援</span><span>{draft.calls.length} 条 CALL</span></div>
      </DialogHeader>

      <div className="editor-transport">
        <Button className="editor-play" size="icon" onClick={()=>void togglePlay()} disabled={!audioReady} aria-label={playing?"暂停":"播放"}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</Button>
        <div className="editor-time"><b>{cursor.toFixed(3)}</b><span>秒</span></div>
        <div className="editor-scrub">
          <div className="waveform" aria-hidden="true">{waves.map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div>
          <Slider value={[cursor]} min={0} max={Math.max(1,draft.duration)} step={.001} onValueChange={v=>seek(Array.isArray(v)?v[0]:Number(v))}/>
          <div className="timeline-events">{draft.danceNotes.map(n=><i key={n.id} className="event-dance" style={{left:`${n.time/draft.duration*100}%`}}/>)}{draft.cheerNotes.map(n=><i key={n.id} className="event-cheer" style={{left:`${n.time/draft.duration*100}%`}}/>)}</div>
        </div>
        <div className="editor-duration">/ {draft.duration.toFixed(1)}s</div>
        <label className="snap-control"><Switch checked={snap} onCheckedChange={setSnap}/><span>吸附 1/8 拍</span></label>
      </div>
      {!audioReady&&<div className="editor-audio-warning"><MusicBadge/>{audioUrl?"正在解码音乐，请稍候……":"请先退出编辑器，点击右上角“音乐”上传音频，再回来制作谱面。"}</div>}

      <div className="section-track">{draft.sections.map((section,i)=><div key={`${section.start}-${i}`} className={section.mode} style={{left:`${section.start/draft.duration*100}%`,width:`${(section.end-section.start)/draft.duration*100}%`}}><span>{section.mode==="dance"?"方向键舞蹈":"CLICK 应援"}</span></div>)}<i className="section-cursor" style={{left:`${cursor/draft.duration*100}%`}}/></div>

      <div className="editor-workspace">
        <section className={`record-card dance ${currentMode==="dance"?"current":""}`}><div className="record-heading"><div><Keyboard/><span><b>舞步录制</b><small>播放时直接按方向键</small></span></div><Button size="sm" variant="outline" onClick={()=>markSection("dance")}><Scissors/>从此处开始舞蹈</Button></div><div className="record-keys">{keys.map(key=><button key={key} onPointerDown={()=>addDance(key)}><b>{keyGlyph(key)}</b><span>{key==="W"?"跳跃":key==="A"?"向左":key==="S"?"下蹲":"向右"}</span></button>)}</div></section>
        <section className={`record-card cheer ${currentMode==="cheer"?"current":""}`}><div className="record-heading"><div><MousePointer2/><span><b>应援录制</b><small>选择类型后点击画布</small></span></div><Button size="sm" variant="outline" onClick={()=>markSection("cheer")}><Scissors/>从此处开始应援</Button></div><div className="cheer-tools">{(["tap","clap","burst"] as const).map(type=><button className={cheerType===type?"selected":""} key={type} onClick={()=>setCheerType(type)}>{type==="tap"?"普通":type==="clap"?"拍手":"爆发"}</button>)}</div><div className="editor-cheer-field" onPointerDown={addCheer}><span>点击任意位置放置 <b>{cheerType.toUpperCase()}</b></span>{draft.cheerNotes.filter(n=>Math.abs(n.time-cursor)<.12).map(n=><i key={n.id} className={n.type} style={{left:`${n.x}%`,top:`${n.y}%`}}>{n.type==="burst"?"✦":"!"}</i>)}</div></section>
      </div>

      <div className="editor-bottom-grid">
        <section className="call-editor"><div className="bottom-heading"><span><Sparkles/>在当前时间添加 CALL</span><b>{snapped(cursor).toFixed(3)}s</b></div><div className="call-inputs"><Input value={callMain} onChange={e=>setCallMain(e.target.value)} placeholder="大字 Call 词"/><Input value={callSub} onChange={e=>setCallSub(e.target.value)} placeholder="动作或记忆提示"/><Button onClick={addCall}><Plus/>添加</Button></div></section>
        <section className="recent-notes"><div className="bottom-heading"><span>最近音符</span><b>最新在前</b></div><div className="recent-list">{recent.length?recent.map(note=><span key={note.id} className={note.kind}>{note.kind==="dance"?keyGlyph(note.key):note.type}<i>{note.time.toFixed(3)}s</i></span>):<em>还没有音符</em>}</div></section>
      </div>

      <DialogFooter className="editor-footer"><div><Button variant="ghost" onClick={clearAll}><RotateCcw/>清空谱面</Button><Button variant="outline" onClick={undo} disabled={!history.length}>撤销 {history.length?`(${history.length})`:""}</Button></div><div><span>谱面会保存在当前页面中，记得返回后导出 JSON</span><Button className="apply-chart" onClick={()=>{if(sourceRef.current){sourceRef.current.onended=null;try{sourceRef.current.stop()}catch{}}onApply({...draft,danceNotes:[...draft.danceNotes].sort((a,b)=>a.time-b.time),cheerNotes:[...draft.cheerNotes].sort((a,b)=>a.time-b.time)});onOpenChange(false)}}><Check/>应用谱面</Button></div></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function MusicBadge(){return <span className="music-badge">♪</span>}
