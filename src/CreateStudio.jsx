import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Icon } from "./icons.jsx";

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
};

/* Parse .srt into [{start, end, text}] */
const parseSrt = (raw) => {
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  const toSec = (t) => {
    const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  };
  const cues = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [a, b] = timeLine.split("-->").map((s) => toSec(s.trim()));
    if (a == null || b == null) continue;
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) cues.push({ start: a, end: b, text });
  }
  return cues;
};

function CreateStudio() {
  const [video, setVideo] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [activeTool, setActiveTool] = useState(null); // trim | text | captions | music | polish

  // trim
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // text (captions become text layers too, flagged caption:true)
  const [textLayers, setTextLayers] = useState([]);
  const [newText, setNewText] = useState("");
  const [newTextStart, setNewTextStart] = useState(0);
  const [newTextEnd, setNewTextEnd] = useState(5);
  const [newTextPosition, setNewTextPosition] = useState("center");
  const [newTextSize, setNewTextSize] = useState(48);
  const [newTextColor, setNewTextColor] = useState("#F6EFE5");

  // music
  const [musicFile, setMusicFile] = useState(null);
  const [musicUrl, setMusicUrl] = useState(null);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [musicStart, setMusicStart] = useState(0);
  const [keepOriginalAudio, setKeepOriginalAudio] = useState(true);

  // music library (Jamendo — free CC music API)
  const [musicTab, setMusicTab] = useState("upload"); // upload | library
  const [jamendoId, setJamendoId] = useState("");
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState("");
  const [previewingId, setPreviewingId] = useState(null);
  const [musicCredit, setMusicCredit] = useState(null);
  const trackPreviewRef = useRef(null);

  // engine
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [previewScale, setPreviewScale] = useState(1);
  const [framePos, setFramePos] = useState(50); // 0 = left edge, 100 = right edge
  const [videoAspect, setVideoAspect] = useState(16 / 9);

  const videoRef = useRef(null);
  const musicRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());

  /* ---------- upload ---------- */
  const loadFile = (file) => {
    if (!file || !file.type.startsWith("video/")) return;
    setVideo(URL.createObjectURL(file));
    setVideoFile(file);
    setActiveTool(null);
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setCurrentTime(0);
    setTextLayers([]);
    setStatus("");
  };
  const handleVideoUpload = (e) => loadFile(e.target.files[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    loadFile(e.dataTransfer.files[0]);
  };

  const updateScale = () => {
    const v = videoRef.current;
    if (v && v.videoWidth) setPreviewScale(v.clientWidth / v.videoWidth);
  };
  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = musicVolume;
  }, [musicVolume]);

  const handleVideoLoaded = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    setDuration(v.duration);
    setStartTime(0);
    setEndTime(v.duration);
    if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
    updateScale();
  };
  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  /* ---------- engine ---------- */
  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    setStatus("Warming up the engine…");
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));
    ffmpeg.on("progress", ({ progress: p }) => {
      if (p >= 0 && p <= 1) setProgress(Math.round(p * 100));
    });
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    setFfmpegLoaded(true);
    setStatus("Engine ready.");
  };

  const swapWorkingVideo = (blob, name) => {
    const url = URL.createObjectURL(blob);
    setVideo(url);
    setVideoFile(new File([blob], name, { type: "video/mp4" }));
    setCurrentTime(0);
  };

  /* ---------- trim ---------- */
  const handleStartChange = (e) => {
    const v = Number(e.target.value);
    if (v < endTime - 0.1) setStartTime(v);
  };
  const handleEndChange = (e) => {
    const v = Number(e.target.value);
    if (v > startTime + 0.1) setEndTime(v);
  };
  const previewTrim = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    videoRef.current.play();
  };

  const applyTrim = async () => {
    if (!videoFile) return;
    setProcessing(true);
    setProgress(0);
    setStatus("Preparing video…");
    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile("input.mp4", await fetchFile(videoFile));
      setStatus("Trimming…");
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-ss", startTime.toFixed(2),
        "-to", endTime.toFixed(2),
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "trimmed.mp4",
      ]);
      const data = await ffmpeg.readFile("trimmed.mp4");
      swapWorkingVideo(new Blob([data.buffer], { type: "video/mp4" }), "GrillStudio-trimmed.mp4");
      setActiveTool(null);
      setStatus("Trim applied.");
      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("trimmed.mp4");
    } catch (err) {
      console.error(err);
      setStatus("Trim failed — check the browser console.");
    }
    setProcessing(false);
  };

  /* ---------- text + captions ---------- */
  const addTextLayer = () => {
    if (!newText.trim()) return;
    const start = Math.max(0, Math.min(Number(newTextStart), duration));
    const end = Math.max(start + 0.1, Math.min(Number(newTextEnd), duration));
    setTextLayers((l) => [
      ...l,
      { id: Date.now(), text: newText, start, end, position: newTextPosition, size: newTextSize, color: newTextColor, caption: false },
    ]);
    setNewText("");
  };
  const deleteTextLayer = (id) => setTextLayers((l) => l.filter((x) => x.id !== id));

  const handleSrtUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const cues = parseSrt(await file.text());
    if (cues.length === 0) {
      setStatus("Couldn't read any captions from that file — is it a valid .srt?");
      return;
    }
    const layers = cues.map((c, i) => ({
      id: Date.now() + i,
      text: c.text,
      start: Math.min(c.start, duration),
      end: Math.min(c.end, duration),
      position: "bottom",
      size: 40,
      color: "#FFFFFF",
      caption: true,
    }));
    setTextLayers((l) => [...l.filter((x) => !x.caption), ...layers]);
    setStatus(`${cues.length} captions loaded — they'll burn into the export.`);
  };
  const clearCaptions = () => setTextLayers((l) => l.filter((x) => !x.caption));
  const captionCount = textLayers.filter((l) => l.caption).length;

  const visibleTextLayers = textLayers.filter((l) => currentTime >= l.start && currentTime <= l.end);

  const escapeFFmpegText = (t) =>
    t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

  /* ---------- music ---------- */
  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMusicFile(file);
    setMusicUrl(URL.createObjectURL(file));
    setStatus("Music loaded.");
  };
  const removeMusic = () => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
    stopTrackPreview();
    setMusicFile(null);
    setMusicUrl(null);
    setMusicStart(0);
    setMusicCredit(null);
  };

  /* ---------- music library (Jamendo) ---------- */
  const stopTrackPreview = () => {
    if (trackPreviewRef.current) trackPreviewRef.current.pause();
    setPreviewingId(null);
  };

  const searchLibrary = async () => {
    if (!jamendoId.trim()) {
      setLibError("Paste your free Jamendo client ID first — sign up at devportal.jamendo.com, it takes a minute.");
      return;
    }
    setLibLoading(true);
    setLibError("");
    setLibResults([]);
    try {
      const url =
        `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(jamendoId.trim())}` +
        `&format=json&limit=12&audioformat=mp32&include=licenses` +
        `&search=${encodeURIComponent(libQuery || "cinematic")}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.headers?.status !== "success") {
        throw new Error(data.headers?.error_message || "Search failed — is the client ID correct?");
      }
      setLibResults(data.results || []);
      if (!data.results?.length) setLibError("No tracks found — try a mood word like 'upbeat', 'calm' or 'epic'.");
    } catch (err) {
      console.error(err);
      setLibError(err.message || "Library search failed — check your connection.");
    }
    setLibLoading(false);
  };

  const togglePreviewTrack = (t) => {
    if (previewingId === t.id) {
      stopTrackPreview();
      return;
    }
    stopTrackPreview();
    trackPreviewRef.current = new Audio(t.audio);
    trackPreviewRef.current.volume = 0.7;
    trackPreviewRef.current
      .play()
      .then(() => setPreviewingId(t.id))
      .catch(() => setLibError("Couldn't stream the preview — try another track."));
  };

  const useTrack = async (t) => {
    stopTrackPreview();
    setStatus(`Fetching "${t.name}"…`);
    setLibError("");
    try {
      const res = await fetch(t.audiodownload || t.audio);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setMusicFile(new File([blob], `${t.name}.mp3`, { type: "audio/mpeg" }));
      setMusicUrl(URL.createObjectURL(blob));
      setMusicCredit({ track: t.name, artist: t.artist_name, url: t.shareurl });
      setMusicTab("upload"); // jump to the loaded-track controls
      setStatus(`"${t.name}" loaded — it will mix into the export like an uploaded file.`);
    } catch {
      setLibError(`Couldn't fetch that track directly. Opening its Jamendo page — download the MP3 there and use the Upload tab.`);
      window.open(t.shareurl, "_blank");
      setStatus("");
    }
  };

  useEffect(() => stopTrackPreview, []); // stop preview audio if component unmounts
  const previewMix = () => {
    const v = videoRef.current;
    if (!v || !musicUrl) return;
    if (!musicRef.current) musicRef.current = new Audio(musicUrl);
    const a = musicRef.current;
    a.volume = musicVolume;
    v.currentTime = musicStart;
    a.currentTime = 0;
    v.muted = !keepOriginalAudio;
    const stop = () => {
      a.pause();
      v.muted = false;
      v.removeEventListener("pause", stop);
      v.removeEventListener("ended", stop);
    };
    v.addEventListener("pause", stop);
    v.addEventListener("ended", stop);
    v.play();
    a.play();
    setStatus("Previewing the mix — pause the video to stop.");
  };

  /* ---------- polish (one-click: loudness + gentle color) ---------- */
  const applyPolish = async () => {
    if (!videoFile) return;
    setProcessing(true);
    setProgress(0);
    setStatus("Polishing — evening out the sound, warming the picture…");
    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile("input.mp4", await fetchFile(videoFile));
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-vf", "eq=contrast=1.05:saturation=1.12:brightness=0.01",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "polished.mp4",
      ]);
      const data = await ffmpeg.readFile("polished.mp4");
      swapWorkingVideo(new Blob([data.buffer], { type: "video/mp4" }), "GrillStudio-polished.mp4");
      setStatus("Polished — audio levelled to broadcast loudness, colors gently boosted.");
      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("polished.mp4");
    } catch (err) {
      console.error(err);
      setStatus("Polish failed. If your video has no audio track, that's the likely cause — check the console.");
    }
    setProcessing(false);
  };

  /* ---------- export ---------- */
  const exportVideo = async (mode = "landscape") => {
    if (!videoFile) return;
    setProcessing(true);
    setProgress(0);
    setStatus(mode === "short" ? "Preparing 9:16 Short…" : "Preparing export…");
    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile("in.mp4", await fetchFile(videoFile));

      // drawtext needs a real font; dev servers answer missing paths with
      // index.html, so validate bytes and fall back to a CDN font
      if (textLayers.length > 0) {
        const fontSources = [
          "/fonts/GrillStudio.ttf",
          "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
        ];
        let fontOk = false;
        for (const src of fontSources) {
          try {
            const res = await fetch(src);
            if (!res.ok) continue;
            const buf = new Uint8Array(await res.arrayBuffer());
            const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
            const isFont =
              (buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) ||
              magic === "OTTO" || magic === "true" || magic === "ttcf";
            if (!isFont) continue;
            await ffmpeg.writeFile("font.ttf", buf);
            fontOk = true;
            break;
          } catch { /* try next source */ }
        }
        if (!fontOk) {
          setStatus("Couldn't load a font for the text. Check your connection, or add a .ttf at public/fonts/GrillStudio.ttf.");
          setProcessing(false);
          return;
        }
      }

      const hasMusic = Boolean(musicFile);
      if (hasMusic) await ffmpeg.writeFile("music", await fetchFile(musicFile));

      const args = ["-i", "in.mp4"];
      if (hasMusic) args.push("-i", "music");

      // same-position layers overlapping in time stack down a line each
      const withLine = textLayers.map((l, i) => {
        const prior = textLayers
          .slice(0, i)
          .filter((p) => p.position === l.position && p.start < l.end && l.start < p.end);
        return { ...l, line: prior.length };
      });
      const drawChain = withLine
        .map((l) => {
          const text = escapeFFmpegText(l.text);
          const color = l.color.replace("#", "0x");
          const shift = l.line * (l.size + 12);
          let x = "(w-text_w)/2";
          let y = `(h-text_h)/2+${shift}`;
          if (l.position === "top") y = `h*0.08+${shift}`;
          if (l.position === "bottom") y = `h-text_h-h*0.08-${shift}`;
          return `drawtext=fontfile=font.ttf:text='${text}':fontsize=${l.size}:fontcolor=${color}:borderw=3:bordercolor=black:x=${x}:y=${y}:enable='between(t,${l.start},${l.end})'`;
        })
        .join(",");

      // vertical Shorts: crop to 9:16 at the user's chosen frame position,
      // then scale to 1080x1920 — BEFORE drawtext so text applies to the final frame
      const pos = (framePos / 100).toFixed(3);
      const cropChain =
        mode === "short"
          ? `crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))*${pos}':0,scale=1080:1920`
          : "";
      const vParts = [cropChain, drawChain].filter(Boolean).join(",");

      const fc = [];
      if (vParts) fc.push(`[0:v]${vParts}[vout]`);
      if (hasMusic) {
        const delayMs = Math.round(musicStart * 1000);
        let m = `[1:a]volume=${musicVolume}`;
        if (delayMs > 0) m += `,adelay=${delayMs}:all=1`;
        if (keepOriginalAudio) {
          fc.push(`${m}[m]`, `[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
        } else {
          fc.push(`${m}[aout]`);
        }
      }

      if (fc.length) args.push("-filter_complex", fc.join(";"));
      args.push("-map", vParts ? "[vout]" : "0:v");
      if (hasMusic) {
        args.push("-map", "[aout]");
        if (!keepOriginalAudio) args.push("-shortest");
      } else {
        args.push("-map", "0:a?");
      }
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", "out.mp4");

      setStatus("Rendering… this runs fully in your browser.");
      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile("out.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const outName = mode === "short" ? "GrillStudio-Short.mp4" : "GrillStudio-Final.mp4";
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      swapWorkingVideo(blob, outName);
      setTextLayers([]);
      removeMusic();
      setActiveTool(null);
      setStatus("Exported — check your downloads.");

      await ffmpeg.deleteFile("in.mp4");
      await ffmpeg.deleteFile("out.mp4");
      if (hasMusic) await ffmpeg.deleteFile("music");
    } catch (err) {
      console.error("Export error:", err);
      setStatus(
        keepOriginalAudio && musicFile
          ? "Export failed. If your video has no sound of its own, untick “Keep original video sound” and try again."
          : "Export failed — check the browser console."
      );
    }
    setProcessing(false);
  };

  const toggleTool = (tool) => setActiveTool((t) => (t === tool ? null : tool));

  /* ---------- UI ---------- */
  if (!video) {
    return (
      <label className="upload-box" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <div className="upload-flame">{Icon.flame}</div>
        <strong>Drop your video on the grill</strong>
        <small>or click to browse — MP4, MOV or WebM</small>
        <input type="file" accept="video/*" onChange={handleVideoUpload} />
      </label>
    );
  }

  return (
    <div className="video-area">
      <div className="video-container">
        <video
          ref={videoRef}
          src={video}
          controls
          className="video-preview"
          onLoadedMetadata={handleVideoLoaded}
          onTimeUpdate={handleTimeUpdate}
        />
        {activeTool === "frame" && (() => {
          const cropFrac = Math.min(1, (9 / 16) / videoAspect);
          if (cropFrac >= 1) return null; // already vertical — nothing gets cropped
          const leftPct = (1 - cropFrac) * (framePos / 100) * 100;
          const rightPct = (1 - cropFrac) * (1 - framePos / 100) * 100;
          return (
            <>
              <div className="crop-mask" style={{ left: 0, width: `${leftPct}%` }} />
              <div className="crop-mask" style={{ right: 0, width: `${rightPct}%` }} />
              <div className="crop-window" style={{ left: `${leftPct}%`, width: `${cropFrac * 100}%` }} />
            </>
          );
        })()}
        {["top", "center", "bottom"].map((pos) => {
          const group = visibleTextLayers.filter((l) => l.position === pos);
          if (group.length === 0) return null;
          return (
            <div key={pos} className={`overlay-stack ${pos}`}>
              {group.map((l) => (
                <div key={l.id} className="overlay-line" style={{ fontSize: `${l.size * previewScale}px`, color: l.color }}>
                  {l.text}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="toolbar" role="tablist" aria-label="Editing tools">
        <button role="tab" aria-selected={activeTool === "trim"} className={activeTool === "trim" ? "tab active" : "tab"} onClick={() => toggleTool("trim")}>
          {Icon.trim} Trim
        </button>
        <button role="tab" aria-selected={activeTool === "text"} className={activeTool === "text" ? "tab active" : "tab"} onClick={() => toggleTool("text")}>
          {Icon.text} Text
        </button>
        <button role="tab" aria-selected={activeTool === "captions"} className={activeTool === "captions" ? "tab active" : "tab"} onClick={() => toggleTool("captions")}>
          {Icon.captions} Captions{captionCount > 0 ? ` (${captionCount})` : ""}
        </button>
        <button role="tab" aria-selected={activeTool === "music"} className={activeTool === "music" ? "tab active" : "tab"} onClick={() => toggleTool("music")}>
          {Icon.music} Music
        </button>
        <button role="tab" aria-selected={activeTool === "polish"} className={activeTool === "polish" ? "tab active" : "tab"} onClick={() => toggleTool("polish")}>
          {Icon.polish} Polish
        </button>
        <button role="tab" aria-selected={activeTool === "frame"} className={activeTool === "frame" ? "tab active" : "tab"} onClick={() => toggleTool("frame")}>
          {Icon.captions} Frame
        </button>
        <span className="toolbar-spacer" />
        <button className="ghost-button" onClick={() => exportVideo("landscape")} disabled={processing} title="Original aspect ratio">
          {Icon.export} 16:9
        </button>
        <button className="export-button" onClick={() => exportVideo("short")} disabled={processing}>
          {Icon.export} {processing ? "Rendering…" : "Export Short 9:16"}
        </button>
      </div>

      {processing && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && <div className="status" role="status">{status}</div>}

      {/* TRIM */}
      {activeTool === "trim" && (
        <section className="panel">
          <h2>Trim</h2>
          <div className="timeline">
            <div className="timeline-track">
              <div
                className="selected-range"
                style={{
                  left: duration > 0 ? `${(startTime / duration) * 100}%` : "0%",
                  width: duration > 0 ? `${((endTime - startTime) / duration) * 100}%` : "100%",
                }}
              />
            </div>
            <input className="range-input" type="range" min="0" max={duration} step="0.1" value={startTime} onChange={handleStartChange} aria-label="Trim start" />
            <input className="range-input" type="range" min="0" max={duration} step="0.1" value={endTime} onChange={handleEndChange} aria-label="Trim end" />
          </div>
          <div className="trim-times">
            <div><span>Start</span><strong className="timecode">{fmt(startTime)}</strong></div>
            <div className="kept"><span>Keeping</span><strong className="timecode">{fmt(Math.max(0, endTime - startTime))}</strong></div>
            <div><span>End</span><strong className="timecode">{fmt(endTime)}</strong></div>
          </div>
          <div className="panel-actions">
            <button className="ghost-button" onClick={previewTrim} disabled={processing}>{Icon.play} Preview</button>
            <button className="ember-button" onClick={applyTrim} disabled={processing}>{processing ? "Working…" : "Apply trim"}</button>
          </div>
        </section>
      )}

      {/* TEXT */}
      {activeTool === "text" && (
        <section className="panel">
          <h2>Text</h2>
          <div className="panel-actions" style={{ marginTop: 0, marginBottom: 18 }}>
            <button
              className="ghost-button"
              onClick={() =>
                setTextLayers((l) => [
                  ...l,
                  { id: Date.now(), text: "CHARCOAL CHICKEN", start: 0, end: Math.min(3, duration), position: "top", size: 64, color: "#FFB03A", caption: false },
                ])
              }
            >
              + Title bar (first 3s)
            </button>
            <button
              className="ghost-button"
              onClick={() =>
                setTextLayers((l) => [
                  ...l,
                  { id: Date.now(), text: "LIKE • SUBSCRIBE • FOLLOW THE GRILL JOURNEY", start: Math.max(0, duration - 3), end: duration, position: "bottom", size: 40, color: "#F6EFE5", caption: false },
                ])
              }
            >
              + CTA outro (last 3s)
            </button>
          </div>
          <input type="text" className="text-input" placeholder="Type your caption…" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <div className="options-row">
            <div><label>Show from</label><input type="number" min="0" max={duration} step="0.1" value={newTextStart} onChange={(e) => setNewTextStart(e.target.value)} /></div>
            <div><label>Until</label><input type="number" min="0" max={duration} step="0.1" value={newTextEnd} onChange={(e) => setNewTextEnd(e.target.value)} /></div>
            <div>
              <label>Position</label>
              <select value={newTextPosition} onChange={(e) => setNewTextPosition(e.target.value)}>
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
            <div><label>Size {newTextSize}px</label><input type="range" min="16" max="120" value={newTextSize} onChange={(e) => setNewTextSize(Number(e.target.value))} /></div>
            <div><label>Color</label><input type="color" value={newTextColor} onChange={(e) => setNewTextColor(e.target.value)} /></div>
          </div>
          <button className="ember-button" onClick={addTextLayer}>Add text</button>

          {textLayers.filter((l) => !l.caption).length > 0 && (
            <div className="text-layers">
              <h3>On the video</h3>
              {textLayers.filter((l) => !l.caption).map((l) => (
                <div className="layer-card" key={l.id}>
                  <div className="layer-info">
                    <strong>{l.text}</strong>
                    <span className="timecode">{fmt(l.start)} → {fmt(l.end)}</span>
                  </div>
                  <button onClick={() => deleteTextLayer(l.id)} aria-label={`Remove text: ${l.text}`}>{Icon.remove}</button>
                </div>
              ))}
            </div>
          )}
          <div className="current-time timecode">Playhead {fmt(currentTime)}</div>
        </section>
      )}

      {/* CAPTIONS */}
      {activeTool === "captions" && (
        <section className="panel">
          <h2>Captions</h2>
          <p className="panel-note">
            Upload an .srt subtitle file and every cue becomes a caption, timed and styled, burned into the export.
            (You can get an .srt free from YouTube Studio's auto-subtitles, or any transcription tool.)
          </p>
          <div className="panel-actions">
            <label className="ember-button as-label">
              Upload .srt file
              <input type="file" accept=".srt" onChange={handleSrtUpload} hidden />
            </label>
            {captionCount > 0 && (
              <button className="ghost-button" onClick={clearCaptions}>{Icon.remove} Clear {captionCount} captions</button>
            )}
          </div>
          {captionCount > 0 && (
            <div className="text-layers">
              <h3>Loaded captions</h3>
              {textLayers.filter((l) => l.caption).slice(0, 6).map((l) => (
                <div className="layer-card" key={l.id}>
                  <div className="layer-info">
                    <strong>{l.text}</strong>
                    <span className="timecode">{fmt(l.start)} → {fmt(l.end)}</span>
                  </div>
                  <button onClick={() => deleteTextLayer(l.id)} aria-label="Remove caption">{Icon.remove}</button>
                </div>
              ))}
              {captionCount > 6 && <p className="panel-note">…and {captionCount - 6} more. Scrub the video to preview them in place.</p>}
            </div>
          )}
        </section>
      )}

      {/* MUSIC */}
      {activeTool === "music" && (
        <section className="panel">
          <h2>Music</h2>

          {!musicFile && (
            <div className="toolbar" style={{ marginTop: 0, marginBottom: 18 }}>
              <button className={musicTab === "upload" ? "tab active" : "tab"} onClick={() => setMusicTab("upload")}>
                Upload
              </button>
              <button className={musicTab === "library" ? "tab active" : "tab"} onClick={() => setMusicTab("library")}>
                Free library
              </button>
            </div>
          )}

          {!musicFile && musicTab === "upload" && (
            <label className="ember-button as-label">
              Choose a music file
              <input type="file" accept="audio/*" onChange={handleMusicUpload} hidden />
            </label>
          )}

          {!musicFile && musicTab === "library" && (
            <div className="music-library">
              <p className="panel-note">
                Search Jamendo's free Creative Commons music. You need a free client ID from{" "}
                devportal.jamendo.com (one-minute signup). CC music asks one thing in return:
                credit the artist in your video description — the credit line is shown when you pick a track.
              </p>
              <input
                type="password"
                className="text-input"
                placeholder="Jamendo client ID"
                value={jamendoId}
                onChange={(e) => setJamendoId(e.target.value)}
                autoComplete="off"
              />
              <div className="lib-search-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Search a mood or style — upbeat, calm, epic, acoustic…"
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchLibrary()}
                />
                <button className="ember-button" onClick={searchLibrary} disabled={libLoading}>
                  {libLoading ? "Searching…" : "Search"}
                </button>
              </div>
              {libError && <div className="status error" role="alert">{libError}</div>}
              {libResults.length > 0 && (
                <div className="results">
                  {libResults.map((t) => (
                    <div className="result-card" key={t.id}>
                      <div className="layer-info">
                        <strong>{t.name}</strong>
                        <span className="timecode">
                          {t.artist_name} · {fmt(Number(t.duration) || 0)}
                        </span>
                      </div>
                      <div className="lib-actions">
                        <button className="ghost-button small" onClick={() => togglePreviewTrack(t)}>
                          {previewingId === t.id ? "Stop" : "Play"}
                        </button>
                        <button className="ember-button small" onClick={() => useTrack(t)}>
                          Use
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {musicFile && (
            <div className="music-controls">
              <div className="music-file">{Icon.music}<strong>{musicFile.name}</strong></div>
              {musicCredit && (
                <div className="status" role="note">
                  Paste in your video description: Music: "{musicCredit.track}" by {musicCredit.artist} — {musicCredit.url}
                </div>
              )}
              <div className="music-setting">
                <label>Volume</label>
                <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
                <span className="timecode">{Math.round(musicVolume * 100)}%</span>
              </div>
              <div className="music-setting">
                <label>Start music at</label>
                <input type="number" min="0" max={duration} step="0.1" value={musicStart} onChange={(e) => setMusicStart(Number(e.target.value))} />
                <span>seconds in</span>
              </div>
              <label className="audio-checkbox">
                <input type="checkbox" checked={keepOriginalAudio} onChange={(e) => setKeepOriginalAudio(e.target.checked)} />
                Keep original video sound
              </label>
              <div className="panel-actions">
                <button className="ghost-button" onClick={previewMix}>{Icon.play} Preview mix</button>
                <button className="ghost-button" onClick={removeMusic}>{Icon.remove} Remove</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* FRAME */}
      {activeTool === "frame" && (
        <section className="panel">
          <h2>Short framing</h2>
          <p className="panel-note">
            The bright window on the preview is exactly what the 9:16 Short export keeps.
            Slide it so the food stays in frame — scrub the video to check the whole clip.
          </p>
          <div className="music-setting">
            <label>Position</label>
            <input type="range" min="0" max="100" step="1" value={framePos} onChange={(e) => setFramePos(Number(e.target.value))} />
            <span className="timecode">{framePos < 35 ? "left" : framePos > 65 ? "right" : "center"}</span>
          </div>
        </section>
      )}

      {/* POLISH */}
      {activeTool === "polish" && (
        <section className="panel">
          <h2>Polish</h2>
          <p className="panel-note">
            One click, two fixes: audio is levelled to broadcast loudness (no more too-quiet uploads),
            and the picture gets a gentle contrast and warmth boost. Runs once on the whole video.
          </p>
          <div className="panel-actions">
            <button className="ember-button" onClick={applyPolish} disabled={processing}>
              {Icon.polish} {processing ? "Polishing…" : "Polish this video"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default CreateStudio;