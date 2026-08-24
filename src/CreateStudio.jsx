import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Icon } from "./icons.jsx";

/* ------------------------------------------------------------------ *
 * GrillStudio — non-destructive edit model
 *
 * The source file is loaded once and never overwritten. Every tool
 * writes into `edit` state instead of re-encoding. One render happens,
 * at export, from the original bytes. Trim and Polish are now instant,
 * every edit is reversible, and the video only goes through the
 * encoder a single time — which is why we can afford CRF 20 instead
 * of -preset ultrafast.
 * ------------------------------------------------------------------ */

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
};

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
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
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) cues.push({ start: a, end: b, text });
  }
  return cues;
};

/* Wrap long lines so burned-in text never runs off the frame */
const wrap = (text, max = 34) =>
  text
    .split("\n")
    .flatMap((line) => {
      const out = [];
      let cur = "";
      for (const word of line.split(/\s+/)) {
        if (!cur.length) cur = word;
        else if ((cur + " " + word).length <= max) cur += " " + word;
        else {
          out.push(cur);
          cur = word;
        }
      }
      if (cur.length) out.push(cur);
      return out;
    })
    .join("\n");

/* Shift cues/layers onto the trimmed timeline, dropping what falls outside */
const retime = (items, start, outDur) =>
  items
    .map((i) => ({ ...i, start: i.start - start, end: i.end - start }))
    .map((i) => ({ ...i, start: Math.max(0, i.start), end: Math.min(outDur, i.end) }))
    .filter((i) => i.end > i.start + 0.05);

const HEX = (c) => c.replace("#", "0x");
/* &HAABBGGRR — libass wants BGR, and 00 alpha means opaque */
const assColor = (c) => {
  const h = c.replace("#", "");
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

function CreateStudio() {
  /* ---------- source (never mutated) ---------- */
  const [sourceUrl, setSourceUrl] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [videoHeight, setVideoHeight] = useState(1080);
  const [currentTime, setCurrentTime] = useState(0);

  const [activeTool, setActiveTool] = useState(null);

  /* ---------- the edit (everything below is reversible) ---------- */
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [polish, setPolish] = useState(false);
  const [textLayers, setTextLayers] = useState([]);
  const [cues, setCues] = useState([]);
  const [framePos, setFramePos] = useState(50);

  const [musicFile, setMusicFile] = useState(null);
  const [musicUrl, setMusicUrl] = useState(null);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [musicStart, setMusicStart] = useState(0);
  const [keepOriginalAudio, setKeepOriginalAudio] = useState(true);
  const [musicCredit, setMusicCredit] = useState(null);

  /* ---------- text tool form ---------- */
  const [newText, setNewText] = useState("");
  const [newTextStart, setNewTextStart] = useState(0);
  const [newTextEnd, setNewTextEnd] = useState(5);
  const [newTextPosition, setNewTextPosition] = useState("center");
  const [newTextSize, setNewTextSize] = useState(48);
  const [newTextColor, setNewTextColor] = useState("#F6EFE5");

  /* ---------- music library ---------- */
  const [musicTab, setMusicTab] = useState("upload");
  const [jamendoId, setJamendoId] = useState("");
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState("");
  const [previewingId, setPreviewingId] = useState(null);
  const trackPreviewRef = useRef(null);

  /* ---------- engine ---------- */
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [previewScale, setPreviewScale] = useState(1);
  const [lastExport, setLastExport] = useState(null);

  const videoRef = useRef(null);
  const musicRef = useRef(null);
  const ffmpegRef = useRef(null);
  const handlersBound = useRef(false);
  const rendering = useRef(false);
  const logBuf = useRef([]);
  const collecting = useRef(false);
  const caps = useRef(null); // { subtitles: bool }
  const hasAudio = useRef(null);
  const urls = useRef(new Set());

  const outDuration = Math.max(0, trimEnd - trimStart);

  /* ---------- object URL bookkeeping ---------- */
  const makeUrl = useCallback((blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.add(u);
    return u;
  }, []);
  const dropUrl = useCallback((u) => {
    if (!u) return;
    URL.revokeObjectURL(u);
    urls.current.delete(u);
  }, []);
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current.clear();
    },
    []
  );

  /* ---------- upload ---------- */
  const loadFile = (file) => {
    if (!file || !file.type.startsWith("video/")) {
      setStatus("That file isn't a video. Drop an MP4, MOV or WebM.");
      return;
    }
    dropUrl(sourceUrl);
    setSourceUrl(makeUrl(file));
    setSourceFile(file);
    setActiveTool(null);
    setTrimStart(0);
    setTrimEnd(0);
    setDuration(0);
    setCurrentTime(0);
    setTextLayers([]);
    setCues([]);
    setPolish(false);
    setFramePos(50);
    setLastExport(null);
    hasAudio.current = null;
    setStatus("");
  };
  const handleVideoUpload = (e) => loadFile(e.target.files[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    loadFile(e.dataTransfer.files[0]);
  };

  const updateScale = useCallback(() => {
    const v = videoRef.current;
    if (v && v.videoWidth) setPreviewScale(v.clientWidth / v.videoWidth);
  }, []);
  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = musicVolume;
  }, [musicVolume]);

  const handleVideoLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimStart(0);
    setTrimEnd(v.duration);
    if (v.videoWidth && v.videoHeight) {
      setVideoAspect(v.videoWidth / v.videoHeight);
      setVideoHeight(v.videoHeight);
    }
    updateScale();
  };

  /* Playback stays inside the trim window, so Preview needs no render */
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (trimEnd > 0 && v.currentTime > trimEnd + 0.05) {
      v.pause();
      v.currentTime = trimEnd;
    } else if (v.currentTime < trimStart - 0.05 && !v.paused) {
      v.currentTime = trimStart;
    }
    setCurrentTime(v.currentTime);
  };

  /* ---------- engine ---------- */
  const getFFmpeg = () => {
    if (!ffmpegRef.current) ffmpegRef.current = new FFmpeg();
    return ffmpegRef.current;
  };

  const loadFFmpeg = async () => {
    const ffmpeg = getFFmpeg();
    if (!handlersBound.current) {
      ffmpeg.on("log", ({ message }) => {
        if (collecting.current) logBuf.current.push(message);
      });
      ffmpeg.on("progress", ({ progress: p }) => {
        if (rendering.current && p >= 0 && p <= 1) setProgress(Math.round(p * 100));
      });
      handlersBound.current = true;
    }
    if (ffmpegLoaded) return ffmpeg;
    setStatus("Warming up the engine…");
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    setFfmpegLoaded(true);
    return ffmpeg;
  };

  /* Run a command purely to read its log output */
  const probe = async (ffmpeg, args) => {
    logBuf.current = [];
    collecting.current = true;
    try {
      await ffmpeg.exec(args);
    } catch {
      /* probes are expected to exit non-zero */
    }
    collecting.current = false;
    const out = logBuf.current.join("\n");
    logBuf.current = [];
    return out;
  };

  /* Does this core build ship libass? Decides the captions strategy. */
  const getCaps = async (ffmpeg) => {
    if (caps.current) return caps.current;
    const out = await probe(ffmpeg, ["-filters"]);
    caps.current = { subtitles: /^\s*\S*\s+subtitles\s/m.test(out) };
    return caps.current;
  };

  /* Referencing [0:a] on a silent video kills the graph — check first */
  const getHasAudio = async (ffmpeg) => {
    if (hasAudio.current !== null) return hasAudio.current;
    const out = await probe(ffmpeg, ["-i", "in.mp4"]);
    hasAudio.current = /Stream #\d+:\d+.*: Audio:/.test(out);
    return hasAudio.current;
  };

  /* ---------- trim (instant) ---------- */
  const handleStartChange = (e) => {
    const v = Number(e.target.value);
    if (v < trimEnd - 0.1) setTrimStart(v);
  };
  const handleEndChange = (e) => {
    const v = Number(e.target.value);
    if (v > trimStart + 0.1) setTrimEnd(v);
  };
  const previewTrim = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = trimStart;
    v.play();
  };
  const resetTrim = () => {
    setTrimStart(0);
    setTrimEnd(duration);
  };

  /* ---------- text + captions ---------- */
  const addTextLayer = () => {
    if (!newText.trim()) return;
    const start = Math.max(0, Math.min(Number(newTextStart), duration));
    const end = Math.max(start + 0.1, Math.min(Number(newTextEnd), duration));
    setTextLayers((l) => [
      ...l,
      {
        id: Date.now(),
        text: newText,
        start,
        end,
        position: newTextPosition,
        size: newTextSize,
        color: newTextColor,
      },
    ]);
    setNewText("");
  };
  const deleteTextLayer = (id) => setTextLayers((l) => l.filter((x) => x.id !== id));

  const handleSrtUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const parsed = parseSrt(await file.text());
    if (parsed.length === 0) {
      setStatus("No cues found in that file. Check it's a valid .srt.");
      return;
    }
    setCues(parsed);
    setStatus(`${parsed.length} captions loaded. They re-time themselves against your trim.`);
    e.target.value = "";
  };
  const clearCaptions = () => setCues([]);

  const visibleText = textLayers.filter((l) => currentTime >= l.start && currentTime <= l.end);
  const visibleCue = cues.find((c) => currentTime >= c.start && currentTime <= c.end);

  /* ---------- music ---------- */
  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    dropUrl(musicUrl);
    setMusicFile(file);
    setMusicUrl(makeUrl(file));
    setMusicCredit(null);
    setStatus("Music loaded.");
  };
  const removeMusic = () => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
    stopTrackPreview();
    dropUrl(musicUrl);
    setMusicFile(null);
    setMusicUrl(null);
    setMusicStart(0);
    setMusicCredit(null);
  };

  const stopTrackPreview = () => {
    if (trackPreviewRef.current) trackPreviewRef.current.pause();
    setPreviewingId(null);
  };
  useEffect(() => stopTrackPreview, []);

  const searchLibrary = async () => {
    if (!jamendoId.trim()) {
      setLibError("Add your free Jamendo client ID first — devportal.jamendo.com, one-minute signup.");
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
        throw new Error(data.headers?.error_message || "Search failed. Check the client ID.");
      }
      setLibResults(data.results || []);
      if (!data.results?.length) setLibError("No tracks matched. Try a mood word: upbeat, calm, epic.");
    } catch (err) {
      setLibError(err.message || "Library search failed. Check your connection.");
    }
    setLibLoading(false);
  };

  const togglePreviewTrack = (t) => {
    if (previewingId === t.id) return stopTrackPreview();
    stopTrackPreview();
    trackPreviewRef.current = new Audio(t.audio);
    trackPreviewRef.current.volume = 0.7;
    trackPreviewRef.current
      .play()
      .then(() => setPreviewingId(t.id))
      .catch(() => setLibError("That preview wouldn't stream. Try another track."));
  };

  const useTrack = async (t) => {
    stopTrackPreview();
    setStatus(`Fetching "${t.name}"…`);
    setLibError("");
    try {
      const res = await fetch(t.audiodownload || t.audio);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      dropUrl(musicUrl);
      setMusicFile(new File([blob], `${t.name}.mp3`, { type: "audio/mpeg" }));
      setMusicUrl(makeUrl(blob));
      setMusicCredit({ track: t.name, artist: t.artist_name, url: t.shareurl });
      setMusicTab("upload");
      setStatus(`"${t.name}" loaded.`);
    } catch {
      setLibError("That track wouldn't download here. Its Jamendo page is opening — grab the MP3 and use Upload.");
      window.open(t.shareurl, "_blank");
      setStatus("");
    }
  };

  const previewMix = () => {
    const v = videoRef.current;
    if (!v || !musicUrl) return;
    if (!musicRef.current) musicRef.current = new Audio(musicUrl);
    const a = musicRef.current;
    a.volume = musicVolume;
    v.currentTime = trimStart + musicStart;
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
    setStatus("Previewing the mix. Pause the video to stop.");
  };

  /* ---------- font ---------- */
  const loadFont = async (ffmpeg) => {
    const sources = [
      "/fonts/GrillStudio.ttf",
      "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
    ];
    for (const src of sources) {
      try {
        const res = await fetch(src);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
        const isFont =
          (buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) ||
          magic === "OTTO" ||
          magic === "true" ||
          magic === "ttcf";
        if (!isFont) continue;
        await ffmpeg.writeFile("font.ttf", buf);
        try {
          await ffmpeg.createDir("/fonts");
        } catch {
          /* already there */
        }
        await ffmpeg.writeFile("/fonts/font.ttf", buf);
        return true;
      } catch {
        /* next source */
      }
    }
    return false;
  };

  /* ---------- reset ---------- */
  const activeEdits = useMemo(() => {
    const e = [];
    if (duration && (trimStart > 0.05 || trimEnd < duration - 0.05))
      e.push({ key: "trim", label: `Trim ${fmt(outDuration)}`, clear: resetTrim });
    if (polish) e.push({ key: "polish", label: "Polish", clear: () => setPolish(false) });
    if (textLayers.length)
      e.push({ key: "text", label: `${textLayers.length} text`, clear: () => setTextLayers([]) });
    if (cues.length) e.push({ key: "cc", label: `${cues.length} captions`, clear: clearCaptions });
    if (musicFile) e.push({ key: "music", label: "Music", clear: removeMusic });
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, trimStart, trimEnd, polish, textLayers, cues, musicFile, outDuration]);

  /* ---------- export: the only render ---------- */
  const exportVideo = async (mode = "landscape") => {
    if (!sourceFile) return;
    setProcessing(true);
    setProgress(0);
    setStatus("Reading your video…");
    let ffmpeg;
    try {
      ffmpeg = await loadFFmpeg();
      await ffmpeg.writeFile("in.mp4", await fetchFile(sourceFile));

      setStatus("Checking the file…");
      const audio = await getHasAudio(ffmpeg);
      const cap = await getCaps(ffmpeg);

      const needFont = textLayers.length > 0 || cues.length > 0;
      if (needFont && !(await loadFont(ffmpeg))) {
        setStatus("No font available for burned-in text. Check your connection, or add public/fonts/GrillStudio.ttf.");
        setProcessing(false);
        return;
      }

      const outDur = outDuration || duration;
      const layers = retime(textLayers, trimStart, outDur);
      const cueList = retime(cues, trimStart, outDur);
      const outH = mode === "short" ? 1920 : videoHeight || 1080;

      /* --- video chain --- */
      const vChain = [];
      if (polish) vChain.push("eq=contrast=1.05:saturation=1.12:brightness=0.01");
      if (mode === "short") {
        const pos = (framePos / 100).toFixed(3);
        vChain.push(
          `crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))*${pos}':0`,
          "scale=1080:1920:flags=bicubic",
          "setsar=1"
        );
      }

      /* Captions: libass in one filter when the build has it, otherwise
         a drawtext chain — which gets expensive past ~80 cues. */
      let useDrawtextCaptions = false;
      if (cueList.length) {
        if (cap.subtitles) {
          const srt = cueList
            .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
            .join("\n");
          await ffmpeg.writeFile("captions.srt", new TextEncoder().encode(srt));
          const fs = Math.round(outH / 22);
          vChain.push(
            `subtitles=captions.srt:fontsdir=/fonts:force_style='FontName=DejaVu Sans,Fontsize=${fs},` +
              `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,` +
              `Alignment=2,MarginV=${Math.round(outH * 0.07)}'`
          );
        } else {
          useDrawtextCaptions = true;
          if (cueList.length > 80)
            setStatus(`Burning ${cueList.length} captions one by one — this build has no libass, so expect a slow render.`);
        }
      }

      const drawItems = [
        ...layers.map((l) => ({ ...l, kind: "text" })),
        ...(useDrawtextCaptions
          ? cueList.map((c, i) => ({
              id: `c${i}`,
              text: c.text,
              start: c.start,
              end: c.end,
              position: "bottom",
              size: Math.round(outH / 22),
              color: "#FFFFFF",
              kind: "cue",
            }))
          : []),
      ];

      for (let i = 0; i < drawItems.length; i++) {
        const item = drawItems[i];
        /* text goes in a file — no escaping, and newlines just work */
        await ffmpeg.writeFile(`t${i}.txt`, new TextEncoder().encode(wrap(item.text)));
        const prior = drawItems
          .slice(0, i)
          .filter((p) => p.position === item.position && p.start < item.end && item.start < p.end).length;
        const shift = prior * (item.size + 12);
        let y = `(h-text_h)/2+${shift}`;
        if (item.position === "top") y = `h*0.08+${shift}`;
        if (item.position === "bottom") y = `h-text_h-h*0.08-${shift}`;
        vChain.push(
          `drawtext=fontfile=font.ttf:textfile=t${i}.txt:expansion=none:fontsize=${item.size}:` +
            `fontcolor=${HEX(item.color)}:borderw=3:bordercolor=black:line_spacing=8:` +
            `x=(w-text_w)/2:y=${y}:enable='between(t,${item.start.toFixed(3)},${item.end.toFixed(3)})'`
        );
      }

      /* --- audio chain --- */
      const hasMusic = Boolean(musicFile);
      if (hasMusic) await ffmpeg.writeFile("music", await fetchFile(musicFile));

      const aChain = [];
      let aOut = null;
      const useOriginal = audio && (keepOriginalAudio || !hasMusic);

      if (useOriginal) {
        aChain.push(`[0:a]${polish ? "loudnorm=I=-16:TP=-1.5:LRA=11," : ""}aresample=48000[a0]`);
        aOut = "[a0]";
      }
      if (hasMusic) {
        const musicDur = Math.max(0.1, outDur - musicStart);
        const fadeAt = Math.max(0, musicDur - 2);
        let m =
          `[1:a]aloop=loop=-1:size=2e9,atrim=0:${musicDur.toFixed(3)},asetpts=N/SR/TB,` +
          `volume=${musicVolume.toFixed(2)},afade=t=out:st=${fadeAt.toFixed(3)}:d=2`;
        if (musicStart > 0.01) m += `,adelay=${Math.round(musicStart * 1000)}:all=1`;
        aChain.push(`${m},aresample=48000[m]`);
        if (useOriginal) {
          /* normalize=0 or amix quietly halves the original audio */
          aChain.push(`[a0][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
          aOut = "[aout]";
        } else {
          aOut = "[m]";
        }
      }

      /* --- assemble --- */
      const args = ["-ss", trimStart.toFixed(3), "-t", outDur.toFixed(3), "-i", "in.mp4"];
      if (hasMusic) args.push("-i", "music");

      const fc = [];
      if (vChain.length) fc.push(`[0:v]${vChain.join(",")}[vout]`);
      fc.push(...aChain);
      if (fc.length) args.push("-filter_complex", fc.join(";"));

      args.push("-map", vChain.length ? "[vout]" : "0:v");
      if (aOut) args.push("-map", aOut);
      else if (audio) args.push("-map", "0:a");

      args.push(
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"
      );
      if (aOut || audio) args.push("-c:a", "aac", "-b:a", "192k");
      args.push("-t", outDur.toFixed(3), "out.mp4");

      setStatus("Rendering — one pass, straight from your original file.");
      rendering.current = true;
      const code = await ffmpeg.exec(args);
      rendering.current = false;
      if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);

      const data = await ffmpeg.readFile("out.mp4");
      const blob = new Blob([data], { type: "video/mp4" });
      const name = mode === "short" ? "GrillStudio-Short.mp4" : "GrillStudio-Final.mp4";
      const url = makeUrl(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      /* the edit survives the export — tweak one caption and re-render */
      setLastExport({ name, url, size: blob.size });
      setStatus("Exported. Your edit is still here, so you can adjust and export again.");

      const junk = ["in.mp4", "out.mp4"];
      if (hasMusic) junk.push("music");
      if (cueList.length && cap.subtitles) junk.push("captions.srt");
      drawItems.forEach((_, i) => junk.push(`t${i}.txt`));
      for (const f of junk) {
        try {
          await ffmpeg.deleteFile(f);
        } catch {
          /* already gone */
        }
      }
    } catch (err) {
      rendering.current = false;
      console.error("Export error:", err);
      setStatus(
        hasAudio.current === false && keepOriginalAudio && musicFile
          ? "Export failed. This video has no sound of its own — untick “Keep original video sound” and try again."
          : "Export failed. The browser console has the ffmpeg output."
      );
    }
    setProcessing(false);
  };

  const toggleTool = (tool) => setActiveTool((t) => (t === tool ? null : tool));

  /* ---------- UI ---------- */
  if (!sourceUrl) {
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
          src={sourceUrl}
          controls
          className="video-preview"
          style={polish ? { filter: "contrast(1.05) saturate(1.12) brightness(1.01)" } : undefined}
          onLoadedMetadata={handleVideoLoaded}
          onTimeUpdate={handleTimeUpdate}
        />

        {activeTool === "frame" &&
          (() => {
            const cropFrac = Math.min(1, 9 / 16 / videoAspect);
            if (cropFrac >= 1) return null;
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
          const group = visibleText.filter((l) => l.position === pos);
          if (!group.length) return null;
          return (
            <div key={pos} className={`overlay-stack ${pos}`}>
              {group.map((l) => (
                <div
                  key={l.id}
                  className="overlay-line"
                  style={{ fontSize: `${l.size * previewScale}px`, color: l.color }}
                >
                  {l.text}
                </div>
              ))}
            </div>
          );
        })}

        {visibleCue && (
          <div className="overlay-stack bottom caption-preview">
            <div className="overlay-line" style={{ fontSize: `${(videoHeight / 22) * previewScale}px` }}>
              {visibleCue.text}
            </div>
          </div>
        )}
      </div>

      <div className="toolbar" role="tablist" aria-label="Editing tools">
        {[
          ["trim", Icon.trim, "Trim"],
          ["text", Icon.text, `Text${textLayers.length ? ` (${textLayers.length})` : ""}`],
          ["captions", Icon.captions, `Captions${cues.length ? ` (${cues.length})` : ""}`],
          ["music", Icon.music, "Music"],
          ["polish", Icon.polish, "Polish"],
          ["frame", Icon.captions, "Frame"],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTool === key}
            className={activeTool === key ? "tab active" : "tab"}
            onClick={() => toggleTool(key)}
          >
            {icon} {label}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <button className="ghost-button" onClick={() => exportVideo("landscape")} disabled={processing} title="Original aspect ratio">
          {Icon.export} 16:9
        </button>
        <button className="export-button" onClick={() => exportVideo("short")} disabled={processing}>
          {Icon.export} {processing ? "Rendering…" : "Export Short 9:16"}
        </button>
      </div>

      {activeEdits.length > 0 && (
        <div className="edit-summary" aria-label="Edits waiting to render">
          <span className="edit-summary-label">Renders at export</span>
          {activeEdits.map((e) => (
            <button key={e.key} className="edit-chip" onClick={e.clear} title="Remove this edit">
              {e.label} {Icon.remove}
            </button>
          ))}
        </div>
      )}

      {processing && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && <div className="status" role="status">{status}</div>}
      {lastExport && !processing && (
        <div className="status">
          Last export: {lastExport.name} · {(lastExport.size / 1048576).toFixed(1)} MB —{" "}
          <a href={lastExport.url} download={lastExport.name}>download again</a>
        </div>
      )}

      {/* TRIM */}
      {activeTool === "trim" && (
        <section className="panel">
          <h2>Trim</h2>
          <p className="panel-note">Nothing is cut until you export, so drag these as often as you like.</p>
          <div className="timeline">
            <div className="timeline-track">
              <div
                className="selected-range"
                style={{
                  left: duration > 0 ? `${(trimStart / duration) * 100}%` : "0%",
                  width: duration > 0 ? `${((trimEnd - trimStart) / duration) * 100}%` : "100%",
                }}
              />
            </div>
            <input className="range-input" type="range" min="0" max={duration} step="0.1" value={trimStart} onChange={handleStartChange} aria-label="Trim start" />
            <input className="range-input" type="range" min="0" max={duration} step="0.1" value={trimEnd} onChange={handleEndChange} aria-label="Trim end" />
          </div>
          <div className="trim-times">
            <div><span>Start</span><strong className="timecode">{fmt(trimStart)}</strong></div>
            <div className="kept"><span>Keeping</span><strong className="timecode">{fmt(outDuration)}</strong></div>
            <div><span>End</span><strong className="timecode">{fmt(trimEnd)}</strong></div>
          </div>
          <div className="panel-actions">
            <button className="ghost-button" onClick={previewTrim}>{Icon.play} Play the keeper</button>
            <button className="ghost-button" onClick={resetTrim}>Use the whole clip</button>
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
                  { id: Date.now(), text: "CHARCOAL CHICKEN", start: trimStart, end: Math.min(trimStart + 3, trimEnd), position: "top", size: 64, color: "#FFB03A" },
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
                  { id: Date.now(), text: "LIKE • SUBSCRIBE • FOLLOW THE GRILL JOURNEY", start: Math.max(trimStart, trimEnd - 3), end: trimEnd, position: "bottom", size: 40, color: "#F6EFE5" },
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

          {textLayers.length > 0 && (
            <div className="text-layers">
              <h3>On the video</h3>
              {textLayers.map((l) => (
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
            Upload an .srt and every cue burns into the export, re-timed against your trim automatically.
            YouTube Studio's auto-subtitles export as .srt, as does any transcription tool.
          </p>
          <div className="panel-actions">
            <label className="ember-button as-label">
              Upload .srt file
              <input type="file" accept=".srt" onChange={handleSrtUpload} hidden />
            </label>
            {cues.length > 0 && (
              <button className="ghost-button" onClick={clearCaptions}>{Icon.remove} Clear {cues.length} captions</button>
            )}
          </div>
          {cues.length > 0 && (
            <div className="text-layers">
              <h3>Loaded captions</h3>
              {cues.slice(0, 6).map((c, i) => (
                <div className="layer-card" key={i}>
                  <div className="layer-info">
                    <strong>{c.text}</strong>
                    <span className="timecode">{fmt(c.start)} → {fmt(c.end)}</span>
                  </div>
                </div>
              ))}
              {cues.length > 6 && <p className="panel-note">…and {cues.length - 6} more. Scrub the video to see them in place.</p>}
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
              <button className={musicTab === "upload" ? "tab active" : "tab"} onClick={() => setMusicTab("upload")}>Upload</button>
              <button className={musicTab === "library" ? "tab active" : "tab"} onClick={() => setMusicTab("library")}>Free library</button>
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
                Search Jamendo's Creative Commons catalogue. You need a free client ID from devportal.jamendo.com.
                CC music asks one thing back: credit the artist in your description. The credit line appears once you pick a track.
              </p>
              <input type="password" className="text-input" placeholder="Jamendo client ID" value={jamendoId} onChange={(e) => setJamendoId(e.target.value)} autoComplete="off" />
              <div className="lib-search-row">
                <input type="text" className="text-input" placeholder="Search a mood — upbeat, calm, epic, acoustic…" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchLibrary()} />
                <button className="ember-button" onClick={searchLibrary} disabled={libLoading}>{libLoading ? "Searching…" : "Search"}</button>
              </div>
              {libError && <div className="status error" role="alert">{libError}</div>}
              {libResults.length > 0 && (
                <div className="results">
                  {libResults.map((t) => (
                    <div className="result-card" key={t.id}>
                      <div className="layer-info">
                        <strong>{t.name}</strong>
                        <span className="timecode">{t.artist_name} · {fmt(Number(t.duration) || 0)}</span>
                      </div>
                      <div className="lib-actions">
                        <button className="ghost-button small" onClick={() => togglePreviewTrack(t)}>{previewingId === t.id ? "Stop" : "Play"}</button>
                        <button className="ember-button small" onClick={() => useTrack(t)}>Use</button>
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
                  Paste in your description: Music: "{musicCredit.track}" by {musicCredit.artist} — {musicCredit.url}
                </div>
              )}
              <p className="panel-note">Short tracks loop to fill the clip and fade out over the last two seconds.</p>
              <div className="music-setting">
                <label>Volume</label>
                <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
                <span className="timecode">{Math.round(musicVolume * 100)}%</span>
              </div>
              <div className="music-setting">
                <label>Start music at</label>
                <input type="number" min="0" max={outDuration} step="0.1" value={musicStart} onChange={(e) => setMusicStart(Number(e.target.value))} />
                <span>seconds into the trimmed clip</span>
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
            The bright window is exactly what the 9:16 export keeps. Slide it so the food stays in frame,
            and scrub the clip to check it holds throughout.
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
            Two fixes, applied during the export: sound levelled to broadcast loudness so the upload isn't too quiet,
            and a gentle contrast and warmth lift on the picture. The preview above shows the colour change live.
          </p>
          <label className="audio-checkbox">
            <input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} />
            Polish this video
          </label>
        </section>
      )}
    </div>
  );
}

export default CreateStudio;