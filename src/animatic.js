import { findAnimaticFrame } from "./filmProject.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawAnimaticFrame(canvas, timeline, time) {
  const frame = findAnimaticFrame(timeline, time);
  if (!frame) return null;
  const { scene, index, localTime, duration, totalDuration } = frame;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const progress = clamp(localTime / duration, 0, 1);
  const night = /NIGHT|EVENING|DUSK/i.test(scene.heading);
  const exterior = /^(EXT\.?|I\/E\.?)/i.test(scene.heading);
  const base = night ? (exterior ? "#111b2c" : "#231916") : (exterior ? "#446d82" : "#574438");
  const accent = night ? (exterior ? "#5586ad" : "#bf7339") : (exterior ? "#d1a86c" : "#dda263");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, night ? "#0e1019" : "#241d21");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  let drift = 0;
  if (scene.motion === "slow-push") drift = -16 * progress;
  if (scene.motion === "pan-left") drift = -70 * progress;
  if (scene.motion === "pan-right") drift = 70 * progress;
  const scale = scene.motion === "slow-push" ? 1 + 0.07 * progress : 1;
  ctx.save();
  ctx.translate(width / 2 + drift, height * 0.43);
  ctx.scale(scale, scale);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(width * 0.23, -height * 0.02, width * 0.19, height * 0.25, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#0a0b10";
  ctx.beginPath();
  ctx.roundRect(-width * 0.48, height * 0.13, width * 0.96, height * 0.48, 32);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(10, 10, 13, .18)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(width * 0.065, height * 0.14, 72, 7);
  ctx.fillStyle = "#f6efe5";
  ctx.font = "600 22px 'Segoe UI', sans-serif";
  ctx.fillText(`SCENE ${String(index + 1).padStart(2, "0")}  ·  ${scene.motion.replace("-", " ").toUpperCase()}`, width * 0.065, height * 0.12);

  const heading = scene.heading.toUpperCase();
  ctx.font = "700 44px 'Segoe UI', sans-serif";
  const headingLines = wrapText(ctx, heading, width * 0.8).slice(0, 2);
  let y = height * 0.67;
  for (const line of headingLines) {
    ctx.fillStyle = "#fff8eb";
    ctx.fillText(line, width * 0.065, y);
    y += 56;
  }
  ctx.fillStyle = "#e3d8cb";
  ctx.font = "400 25px 'Segoe UI', sans-serif";
  const synopsis = Array.isArray(scene.synopsis) ? scene.synopsis.join(" ") : String(scene.synopsis || "");
  for (const line of wrapText(ctx, synopsis, width * 0.78).slice(0, 3)) {
    ctx.fillText(line, width * 0.065, y + 2);
    y += 36;
  }

  const fade = Math.min(1, progress * 5, (1 - progress) * 5);
  const edgeFade = clamp(1 - fade, 0, 0.45);
  ctx.fillStyle = `rgba(0, 0, 0, ${edgeFade})`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,.66)";
  ctx.font = "500 18px 'Segoe UI', sans-serif";
  ctx.fillText(`${scene.durationSeconds || duration}s`, width * 0.91, height * 0.93);
  return { ...frame, progress, totalDuration };
}
