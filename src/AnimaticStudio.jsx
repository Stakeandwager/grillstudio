import { useEffect, useMemo, useRef, useState } from "react";
import { buildAnimaticTimeline, findAnimaticFrame } from "./filmProject.js";
import { drawAnimaticFrame } from "./animatic.js";

function AnimaticStudio({ scenes, projectTitle, onUpdateScene, onClose }) {
  const canvasRef = useRef(null);
  const currentTimeRef = useRef(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState("");
  const timeline = useMemo(() => buildAnimaticTimeline(scenes), [scenes]);
  const totalDuration = timeline.at(-1)?.end || 0;
  const currentFrame = findAnimaticFrame(timeline, time);
  const activeScene = currentFrame?.scene || timeline[0];

  useEffect(() => {
    if (canvasRef.current) drawAnimaticFrame(canvasRef.current, timeline, time);
  }, [timeline, time]);

  useEffect(() => {
    if (!playing) return undefined;
    const startedAt = performance.now() - currentTimeRef.current * 1000;
    let lastUpdate = 0;
    let frameId;
    const tick = (now) => {
      if (now - lastUpdate > 40) {
        lastUpdate = now;
        const nextTime = Math.min(totalDuration, (now - startedAt) / 1000);
        currentTimeRef.current = nextTime;
        setTime(nextTime);
        if (nextTime >= totalDuration) {
          setPlaying(false);
          return;
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, totalDuration]);

  const seek = (nextTime) => {
    const bounded = Math.min(totalDuration, Math.max(0, nextTime));
    currentTimeRef.current = bounded;
    setTime(bounded);
  };

  const jumpToScene = (index) => {
    setPlaying(false);
    seek(timeline[index]?.start || 0);
  };

  const exportAnimatic = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.captureStream || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record a WebM animatic. Try a recent desktop version of Chrome or Edge.");
      return;
    }
    setError("");
    setPlaying(false);
    setExporting(true);
    setExportProgress(0);
    const stream = canvas.captureStream(24);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    let recorder;
    let frameId;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error("The browser stopped recording the animatic."));
        recorder.onstop = resolve;
        recorder.start(250);
        const startedAt = performance.now();
        const render = (now) => {
          const nextTime = Math.min(totalDuration, (now - startedAt) / 1000);
          drawAnimaticFrame(canvas, timeline, nextTime);
          setExportProgress(Math.round((nextTime / totalDuration) * 100));
          if (nextTime >= totalDuration) recorder.stop();
          else frameId = requestAnimationFrame(render);
        };
        frameId = requestAnimationFrame(render);
      });
      await stopped;
      if (!chunks.length) throw new Error("The browser produced an empty recording.");
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(projectTitle || "film-project").trim().replace(/[^\w.-]+/g, "-")}-animatic.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      currentTimeRef.current = totalDuration;
      setTime(totalDuration);
      setExportProgress(100);
    } catch (exportError) {
      setError(exportError.message || "Couldn't record the animatic.");
    } finally {
      if (frameId) cancelAnimationFrame(frameId);
      if (recorder?.state === "recording") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      setExporting(false);
    }
  };

  return (
    <section className="panel animatic-panel">
      <div className="project-heading-row">
        <div>
          <h2>2D animatic</h2>
          <p className="panel-note">A private, text-led motion preview assembled from your script. These abstract boards help plan pacing; they are not generated artwork.</p>
        </div>
        <button className="ghost-button" onClick={onClose}>Back to scenes</button>
      </div>

      <div className="animatic-layout">
        <div className="animatic-viewer-wrap">
          <canvas ref={canvasRef} className="animatic-canvas" width="1280" height="720" role="img" aria-label={activeScene ? `Animated storyboard for ${activeScene.heading}` : "Empty animatic"} />
          <div className="animatic-controls">
            <button className="ember-button" onClick={() => {
              if (time >= totalDuration) seek(0);
              setPlaying((value) => !value);
            }} disabled={exporting || timeline.length === 0}>{playing ? "Pause preview" : time >= totalDuration ? "Replay preview" : "Play preview"}</button>
            <button className="ghost-button" onClick={exportAnimatic} disabled={exporting || timeline.length === 0}>{exporting ? "Recording…" : "Export WebM"}</button>
            <span className="animatic-time">{time.toFixed(1)}s / {totalDuration.toFixed(1)}s</span>
          </div>
          {exporting && <div className="progress" aria-label="Animatic export progress"><div className="progress-fill" style={{ width: `${exportProgress}%` }} /></div>}
          {error && <div className="status error" role="alert">{error}</div>}
        </div>

        <div className="animatic-scenes">
          <h3>Scenes · {timeline.length}</h3>
          {timeline.map((scene) => (
            <button key={scene.key} className={activeScene?.key === scene.key ? "animatic-scene active" : "animatic-scene"} onClick={() => jumpToScene(scene.index)}>
              <span>{String(scene.index + 1).padStart(2, "0")}</span>
              <strong>{scene.heading}</strong>
              <small>{scene.duration.toFixed(1)}s · {scene.motion.replaceAll("-", " ")}</small>
            </button>
          ))}
        </div>
      </div>

      {activeScene && <div className="animatic-settings">
        <h3>Shot motion</h3>
        <p className="panel-note">Adjust the selected scene, then preview the sequence. Scene timing and motion save with the project.</p>
        <div className="animatic-setting-row">
          <label htmlFor="animatic-duration">Duration (seconds)</label>
          <input id="animatic-duration" type="number" min="2" max="20" step="0.5" value={activeScene.durationSeconds || 4} onChange={(event) => onUpdateScene(activeScene.key, { durationSeconds: event.target.value })} />
          <label htmlFor="animatic-motion">Camera move</label>
          <select id="animatic-motion" value={activeScene.motion || "slow-push"} onChange={(event) => onUpdateScene(activeScene.key, { motion: event.target.value })}>
            <option value="still">Still</option>
            <option value="slow-push">Slow push</option>
            <option value="pan-left">Pan left</option>
            <option value="pan-right">Pan right</option>
          </select>
        </div>
      </div>}
    </section>
  );
}

export default AnimaticStudio;
