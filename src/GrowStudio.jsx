import { useState } from "react";
import { Icon } from "./icons.jsx";

/* ---------- Claude idea tools ---------- */
const TOOLS = {
  titles: {
    label: "Title ideas",
    inputLabel: "What's your video about?",
    placeholder: "e.g. grilling suya on a charcoal grill, street-food style",
    prompt: (topic, niche) =>
      `You are a YouTube title strategist. Video topic: "${topic}". ${niche ? `Channel niche: ${niche}.` : ""}
Write 10 click-worthy YouTube titles under 60 characters. Mix formats: how-to, curiosity gap, bold claim, listicle, question. No dishonest clickbait, no ALL CAPS words, no emoji.
Respond with ONLY a JSON array of 10 strings. No markdown, no explanation.`,
  },
  keywords: {
    label: "Keywords",
    inputLabel: "What's your video about?",
    placeholder: "e.g. how to grill chicken without burning it",
    prompt: (topic, niche) =>
      `You are a YouTube SEO specialist. Video topic: "${topic}". ${niche ? `Channel niche: ${niche}.` : ""}
List 15 search keywords and tags: mix of short head terms and long-tail phrases people actually type into YouTube search. Order from highest to lowest expected search volume.
Respond with ONLY a JSON array of 15 strings. No markdown, no explanation.`,
  },
  hooks: {
    label: "Hook ideas",
    inputLabel: "What's your video about?",
    placeholder: "e.g. secret marinade taste test",
    prompt: (topic, niche) =>
      `You are a YouTube retention expert. Video topic: "${topic}". ${niche ? `Channel niche: ${niche}.` : ""}
Write 8 spoken opening hooks for the first 10 seconds of the video. Each is 1-2 sentences the creator says on camera. Mix styles: bold promise, question, pattern interrupt, story cold-open, stakes. Conversational, not salesy.
Respond with ONLY a JSON array of 8 strings. No markdown, no explanation.`,
  },
  ideas: {
    label: "Content ideas",
    inputLabel: "Describe your channel",
    placeholder: "e.g. Nigerian street grilling, BBQ tips, cooking on a budget",
    prompt: (topic, niche) =>
      `You are a YouTube content strategist. Channel: "${topic}". ${niche ? `Extra context: ${niche}.` : ""}
Suggest 10 next video ideas. Each is one line: a working title plus a dash and the angle that makes it clickable. Mix formats: tutorials, challenges, comparisons, mistakes-to-avoid, behind-the-scenes.
Respond with ONLY a JSON array of 10 strings. No markdown, no explanation.`,
  },
};

/* ---------- shared formatters ---------- */
const kfmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

const daysSince = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso)) / 86400000));

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const parseDur = (iso) => {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

function GrowStudio() {
  /* Claude tools */
  const [apiKey, setApiKey] = useState("");
  const [tool, setTool] = useState("titles");
  const [topic, setTopic] = useState("");
  const [niche, setNiche] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);

  /* YouTube research */
  const [ytKey, setYtKey] = useState("");
  const [ytTool, setYtTool] = useState("outliers");
  const [channelInput, setChannelInput] = useState("");
  const [outliers, setOutliers] = useState(null);
  const [kwInput, setKwInput] = useState("");
  const [kwReport, setKwReport] = useState(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState("");

  /* analytics */
  const [impressions, setImpressions] = useState("");
  const [views, setViews] = useState("");
  const [avgViewSec, setAvgViewSec] = useState("");
  const [videoLenSec, setVideoLenSec] = useState("");
  const [report, setReport] = useState(null);

  /* ---------- Claude idea engine ---------- */
  const runTool = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const messages = [{ role: "user", content: TOOLS[tool].prompt(topic, niche) }];
      let res;
      if (apiKey.trim()) {
        // local / personal use: direct call with the user's own key
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey.trim(),
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages }),
        });
      } else {
        // deployed use: the server holds the key (netlify/functions/claude.mjs)
        res = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ max_tokens: 1024, messages }),
        });
        if (res.status === 404 || res.status === 501) {
          setError("No hosted engine on this server — paste your own Anthropic API key above to use the Idea engine.");
          setLoading(false);
          return;
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `API error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .replace(/```json|```/g, "")
        .trim();
      const list = JSON.parse(text);
      if (!Array.isArray(list)) throw new Error("Unexpected response shape");
      setResults(list);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong — check the console.");
    }
    setLoading(false);
  };

  const copyItem = async (text, i) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1200);
    } catch { /* clipboard blocked */ }
  };

  /* ---------- YouTube API helpers ---------- */
  const ytFetch = async (path, params) => {
    const url =
      `https://www.googleapis.com/youtube/v3/${path}?` +
      new URLSearchParams({ ...params, key: ytKey.trim() });
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "YouTube API error");
    return data;
  };

  const resolveChannel = async (input) => {
    const raw = input.trim();
    const idMatch = raw.match(/channel\/(UC[\w-]+)/) || raw.match(/^(UC[\w-]{20,})$/);
    const hMatch = raw.match(/@([\w.\-]+)/);
    const params = { part: "snippet,statistics,contentDetails" };
    if (idMatch) params.id = idMatch[1];
    else if (hMatch) params.forHandle = "@" + hMatch[1];
    else {
      const s = await ytFetch("search", { part: "snippet", q: raw, type: "channel", maxResults: 1 });
      if (!s.items?.length) throw new Error("Channel not found — try the @handle or the channel URL.");
      params.id = s.items[0].snippet.channelId;
    }
    const c = await ytFetch("channels", params);
    if (!c.items?.length) throw new Error("Channel not found — try the @handle or the channel URL.");
    return c.items[0];
  };

  /* ---------- outlier finder ---------- */
  const findOutliers = async () => {
    if (!ytKey.trim()) { setYtError("Paste your free YouTube API key first — see the note above for the 2-minute setup."); return; }
    if (!channelInput.trim()) return;
    setYtLoading(true); setYtError(""); setOutliers(null);
    try {
      const channel = await resolveChannel(channelInput);
      const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) throw new Error("Couldn't read this channel's uploads.");
      const pl = await ytFetch("playlistItems", { part: "contentDetails", playlistId: uploadsId, maxResults: 50 });
      const ids = pl.items.map((i) => i.contentDetails.videoId);
      const vres = await ytFetch("videos", { part: "statistics,snippet,contentDetails", id: ids.join(",") });
      const vids = vres.items.map((v) => ({
        id: v.id,
        title: v.snippet.title,
        views: Number(v.statistics.viewCount || 0),
        days: daysSince(v.snippet.publishedAt),
        short: parseDur(v.contentDetails.duration) <= 62,
      }));
      const med = median(vids.map((v) => v.views).filter((n) => n > 0)) || 1;
      const scored = vids
        .map((v) => ({ ...v, mult: v.views / med, vpd: Math.round(v.views / v.days) }))
        .sort((a, b) => b.mult - a.mult)
        .slice(0, 12);
      setOutliers({
        title: channel.snippet.title,
        subs: Number(channel.statistics.subscriberCount || 0),
        median: med,
        sample: vids.length,
        videos: scored,
      });
    } catch (err) {
      console.error(err);
      setYtError(err.message || "Outlier search failed.");
    }
    setYtLoading(false);
  };

  /* ---------- keyword competition research ---------- */
  const researchKeyword = async () => {
    if (!ytKey.trim()) { setYtError("Paste your free YouTube API key first — see the note above for the 2-minute setup."); return; }
    if (!kwInput.trim()) return;
    setYtLoading(true); setYtError(""); setKwReport(null);
    try {
      const s = await ytFetch("search", { part: "snippet", q: kwInput, type: "video", maxResults: 25, order: "relevance" });
      const ids = s.items.map((i) => i.id.videoId).filter(Boolean);
      if (!ids.length) throw new Error("No videos found for that term.");
      const vres = await ytFetch("videos", { part: "statistics,snippet", id: ids.join(",") });
      const chIds = [...new Set(vres.items.map((v) => v.snippet.channelId))];
      const cres = await ytFetch("channels", { part: "statistics", id: chIds.join(",") });
      const subsById = Object.fromEntries(cres.items.map((c) => [c.id, Number(c.statistics.subscriberCount || 0)]));

      const vids = vres.items.map((v) => ({
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        views: Number(v.statistics.viewCount || 0),
        days: daysSince(v.snippet.publishedAt),
        subs: subsById[v.snippet.channelId] || 0,
      }));

      const medViews = median(vids.map((v) => v.views));
      const freshPct = Math.round((vids.filter((v) => v.days <= 90).length / vids.length) * 100);
      const bigPct = Math.round((vids.filter((v) => v.subs >= 100000).length / vids.length) * 100);
      const smallWins = vids.filter((v) => v.subs > 0 && v.subs < 10000 && v.views > medViews).length;

      const lines = [];
      if (medViews >= 100000) lines.push({ level: "good", text: `Strong demand: the median top-ranking video has ${kfmt(medViews)} views — people actively search and watch this topic.` });
      else if (medViews >= 5000) lines.push({ level: "ok", text: `Moderate demand: median top result sits at ${kfmt(medViews)} views. A well-packaged video can perform here.` });
      else lines.push({ level: "fix", text: `Low demand signal: median top result has only ${kfmt(medViews)} views. Consider a broader phrasing of this topic.` });

      if (bigPct >= 70) lines.push({ level: "fix", text: `Tough competition: ${bigPct}% of the top results come from channels with 100K+ subscribers. Ranking here as a small channel is a long shot — target a longer-tail version of this keyword.` });
      else if (bigPct >= 40) lines.push({ level: "ok", text: `Mixed competition: ${bigPct}% of top results are big channels — winnable with a sharper angle and better packaging.` });
      else lines.push({ level: "good", text: `Open field: only ${bigPct}% of top results are 100K+ channels. Small channels are ranking here.` });

      if (smallWins >= 3) lines.push({ level: "good", text: `Opportunity flag: ${smallWins} videos from channels under 10K subscribers are beating the median. The algorithm is rewarding content quality over channel size on this term — a strong sign to make this video.` });
      if (freshPct >= 50) lines.push({ level: "ok", text: `${freshPct}% of top results are under 90 days old — this topic is actively churning, so new uploads get a real shot (and results decay fast).` });
      else lines.push({ level: "ok", text: `Only ${freshPct}% of top results are recent — rankings here are stable. Harder to break in, but a win holds its position for a long time.` });

      setKwReport({ medViews, freshPct, bigPct, smallWins, lines, top: vids.sort((a, b) => b.views - a.views).slice(0, 8) });
    } catch (err) {
      console.error(err);
      setYtError(err.message || "Keyword research failed.");
    }
    setYtLoading(false);
  };

  /* ---------- offline analytics ---------- */
  const runAnalytics = () => {
    const imp = Number(impressions);
    const v = Number(views);
    const avs = Number(avgViewSec);
    const len = Number(videoLenSec);
    if (!imp || !v || !avs || !len) {
      setReport({ error: "Fill in all four numbers — you'll find them in YouTube Studio under Analytics → Reach and Engagement." });
      return;
    }
    const ctr = (v / imp) * 100;
    const retention = (avs / len) * 100;
    const lines = [];
    if (ctr < 2) lines.push({ level: "fix", text: `Click-through rate is ${ctr.toFixed(1)}% — below the ~2% floor. Your thumbnail and title aren't earning the click. Test a new thumbnail with a single clear subject and use the Title ideas tool for sharper options.` });
    else if (ctr < 5) lines.push({ level: "ok", text: `Click-through rate is ${ctr.toFixed(1)}% — a healthy middle range (2–5% is typical). Worth A/B-testing thumbnails to push higher, but this isn't your bottleneck.` });
    else lines.push({ level: "good", text: `Click-through rate is ${ctr.toFixed(1)}% — strong. Your packaging (title + thumbnail) is working; keep this style consistent.` });
    if (retention < 30) lines.push({ level: "fix", text: `Average retention is ${retention.toFixed(0)}% of the video — viewers are leaving early. The first 15 seconds are the usual culprit: cut the intro, open on the payoff. The Hook ideas tool can help.` });
    else if (retention < 50) lines.push({ level: "ok", text: `Average retention is ${retention.toFixed(0)}% — respectable (30–50% is common). Check the retention graph in Studio for the exact dip points and tighten those sections.` });
    else lines.push({ level: "good", text: `Average retention is ${retention.toFixed(0)}% — excellent. Viewers stay with you; longer videos in this style could increase total watch time.` });
    if (ctr >= 5 && retention < 30) lines.push({ level: "fix", text: "Pattern alert: great clicks but weak retention usually means the video doesn't deliver what the packaging promises. Align the opening with the thumbnail's promise immediately." });
    if (ctr < 2 && retention >= 50) lines.push({ level: "good", text: "Pattern alert: weak clicks but strong retention means the content is better than the packaging. Fixing thumbnails/titles here has the highest payoff of anything you can do." });
    setReport({ ctr, retention, lines });
  };

  return (
    <div className="grow">
      {/* ---------- YouTube research ---------- */}
      <section className="panel">
        <h2>{Icon.chart} YouTube research</h2>
        <p className="panel-note">
          Live data straight from YouTube, with your own free API key: Google Cloud Console →
          create a project → enable "YouTube Data API v3" → Credentials → API key. Free quota
          resets daily and comfortably covers a creator's daily research. The key stays in this tab.
        </p>
        <input
          type="password"
          className="text-input"
          placeholder="YouTube Data API key (AIza…)"
          value={ytKey}
          onChange={(e) => setYtKey(e.target.value)}
          autoComplete="off"
        />

        <div className="toolbar grow-tabs">
          <button className={ytTool === "outliers" ? "tab active" : "tab"} onClick={() => { setYtTool("outliers"); setYtError(""); }}>
            Outlier finder
          </button>
          <button className={ytTool === "keyword" ? "tab active" : "tab"} onClick={() => { setYtTool("keyword"); setYtError(""); }}>
            Keyword research
          </button>
        </div>

        {ytTool === "outliers" && (
          <>
            <p className="panel-note">
              Scans a channel's last 50 uploads and surfaces the videos massively outperforming that
              channel's own median — the fastest way to find proven topics in any niche, including yours.
            </p>
            <div className="lib-search-row">
              <input
                type="text"
                className="text-input"
                placeholder="Channel @handle, URL, or name — e.g. @LazyGrillz"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && findOutliers()}
              />
              <button className="ember-button" onClick={findOutliers} disabled={ytLoading}>
                {ytLoading ? "Scanning…" : "Find outliers"}
              </button>
            </div>
            {outliers && (
              <div className="results">
                <div className="metric-row">
                  <div className="metric"><span>Channel</span><strong className="timecode">{outliers.title}</strong></div>
                  <div className="metric"><span>Subscribers</span><strong className="timecode">{kfmt(outliers.subs)}</strong></div>
                  <div className="metric"><span>Median views (last {outliers.sample})</span><strong className="timecode">{kfmt(Math.round(outliers.median))}</strong></div>
                </div>
                {outliers.videos.map((v) => (
                  <div className="result-card" key={v.id}>
                    <div className="layer-info">
                      <strong>{v.title}</strong>
                      <span className="timecode">
                        {kfmt(v.views)} views · {v.days}d old · {kfmt(v.vpd)}/day{v.short ? " · Short" : ""}
                      </span>
                    </div>
                    <span className={`badge ${v.mult >= 3 ? "hot" : ""}`}>{v.mult.toFixed(1)}×</span>
                  </div>
                ))}
                <p className="panel-note">
                  × = views vs the channel's median. Anything above 3× is a proven topic worth your own angle on.
                </p>
              </div>
            )}
          </>
        )}

        {ytTool === "keyword" && (
          <>
            <p className="panel-note">
              Analyzes the actual top 25 ranking videos for a search term — real views, real channel
              sizes, real freshness — and tells you whether the keyword is worth chasing.
            </p>
            <div className="lib-search-row">
              <input
                type="text"
                className="text-input"
                placeholder="Search term — e.g. how to grill suya"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && researchKeyword()}
              />
              <button className="ember-button" onClick={researchKeyword} disabled={ytLoading}>
                {ytLoading ? "Analyzing…" : "Research"}
              </button>
            </div>
            {kwReport && (
              <div className="results">
                <div className="metric-row">
                  <div className="metric"><span>Median views (top 25)</span><strong className="timecode">{kfmt(Math.round(kwReport.medViews))}</strong></div>
                  <div className="metric"><span>Big channels in results</span><strong className="timecode">{kwReport.bigPct}%</strong></div>
                  <div className="metric"><span>Fresh (&lt;90 days)</span><strong className="timecode">{kwReport.freshPct}%</strong></div>
                </div>
                {kwReport.lines.map((l, i) => (
                  <div className={`result-card verdict ${l.level}`} key={i}><span>{l.text}</span></div>
                ))}
                <h3 style={{ margin: "14px 0 2px" }}>Top ranking videos</h3>
                {kwReport.top.map((v) => (
                  <div className="result-card" key={v.id}>
                    <div className="layer-info">
                      <strong>{v.title}</strong>
                      <span className="timecode">{v.channel} ({kfmt(v.subs)} subs) · {kfmt(v.views)} views · {v.days}d</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {ytError && <div className="status error" role="alert">{ytError}</div>}
      </section>

      {/* ---------- Claude idea engine ---------- */}
      <section className="panel">
        <h2>{Icon.spark} Idea engine</h2>
        <p className="panel-note">
          Powered by Claude. On a hosted GrillStudio (deployed with a server key) this just works — leave
          the field empty. Running locally, paste your own API key from console.anthropic.com; it stays in
          this tab and goes only to the API.
        </p>
        <input
          type="password"
          className="text-input"
          placeholder="sk-ant-…  (only needed when running locally)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />

        <div className="toolbar grow-tabs">
          {Object.entries(TOOLS).map(([id, t]) => (
            <button key={id} className={tool === id ? "tab active" : "tab"} onClick={() => { setTool(id); setResults([]); setError(""); }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="grow-inputs">
          <div className="grow-field">
            <label>{TOOLS[tool].inputLabel}</label>
            <input type="text" className="text-input" placeholder={TOOLS[tool].placeholder} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="grow-field">
            <label>Channel niche (optional)</label>
            <input type="text" className="text-input" placeholder="e.g. street food & grilling" value={niche} onChange={(e) => setNiche(e.target.value)} />
          </div>
        </div>

        <button className="ember-button" onClick={runTool} disabled={loading}>
          {Icon.spark} {loading ? "Thinking…" : `Generate ${TOOLS[tool].label.toLowerCase()}`}
        </button>

        {error && <div className="status error" role="alert">{error}</div>}

        {results.length > 0 && (
          <div className="results">
            {results.map((r, i) => (
              <div className="result-card" key={i}>
                <span>{r}</span>
                <button onClick={() => copyItem(r, i)} aria-label="Copy to clipboard">
                  {copied === i ? "Copied" : Icon.copy}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Analytics check-up ---------- */}
      <section className="panel">
        <h2>{Icon.chart} Analytics check-up</h2>
        <p className="panel-note">
          Paste four numbers from YouTube Studio and get a plain-language diagnosis of what to fix first.
          Works entirely offline — no account connection needed.
        </p>
        <div className="options-row">
          <div><label>Impressions</label><input type="number" min="0" value={impressions} onChange={(e) => setImpressions(e.target.value)} placeholder="e.g. 4800" /></div>
          <div><label>Views</label><input type="number" min="0" value={views} onChange={(e) => setViews(e.target.value)} placeholder="e.g. 210" /></div>
          <div><label>Avg view time (sec)</label><input type="number" min="0" value={avgViewSec} onChange={(e) => setAvgViewSec(e.target.value)} placeholder="e.g. 45" /></div>
          <div><label>Video length (sec)</label><input type="number" min="0" value={videoLenSec} onChange={(e) => setVideoLenSec(e.target.value)} placeholder="e.g. 180" /></div>
        </div>
        <button className="ember-button" onClick={runAnalytics}>{Icon.chart} Diagnose</button>

        {report?.error && <div className="status error" role="alert">{report.error}</div>}
        {report?.lines && (
          <div className="results">
            <div className="metric-row">
              <div className="metric"><span>CTR</span><strong className="timecode">{report.ctr.toFixed(1)}%</strong></div>
              <div className="metric"><span>Retention</span><strong className="timecode">{report.retention.toFixed(0)}%</strong></div>
            </div>
            {report.lines.map((l, i) => (
              <div className={`result-card verdict ${l.level}`} key={i}><span>{l.text}</span></div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default GrowStudio;
