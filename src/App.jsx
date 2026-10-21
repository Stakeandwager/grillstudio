import React, { useState } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('screenplay');
  const [screenplayText, setScreenplayText] = useState("INT. GRILLSTUDIO KITCHEN - DAY\n\nChef John prepares the master timeline.\n\nEXT. PATIO - SUNSET\n\nRender complete.");
  const [scenes, setScenes] = useState([
    { id: 1, heading: "INT. GRILLSTUDIO KITCHEN - DAY", status: "covered", asset: "hero_shot_01.mp4" },
    { id: 2, heading: "EXT. PATIO - SUNSET", status: "missing", asset: "" }
  ]);
  const [assets, setAssets] = useState([
    { id: 1, name: "hero_shot_01.mp4", duration: "00:15", tags: ["Hero", "Kitchen"] },
    { id: 2, name: "b_roll_patio.mp4", duration: "00:30", tags: ["B-Roll", "Sunset"] }
  ]);
  const [timelineTracks, setTimelineTracks] = useState([
    { id: 1, name: "Video Track 1", clip: "hero_shot_01.mp4", length: 15 },
    { id: 2, name: "Animation / Graphics", clip: "Title Card FX", length: 5 }
  ]);

  const parseScreenplay = () => {
    const lines = screenplayText.split('\n');
    const extracted = [];
    let idCounter = 1;
    lines.forEach(line => {
      if (line.startsWith('INT.') || line.startsWith('EXT.')) {
        extracted.push({ id: idCounter++, heading: line, status: "missing", asset: "" });
      }
    });
    if (extracted.length > 0) setScenes(extracted);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent">GrillStudio</span>
          <span className="text-xs uppercase tracking-wider bg-neutral-800 px-2 py-1 rounded text-orange-400 font-semibold">AI Filmmaking Suite v3.0</span>
        </div>
        <nav className="flex space-x-2">
          {['screenplay', 'assets', 'timeline', 'export'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded text-sm font-medium capitalize transition-colors ${
                activeTab === tab ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'screenplay' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col">
              <h2 className="text-lg font-semibold mb-3">Screenplay Parser</h2>
              <textarea
                value={screenplayText}
                onChange={(e) => setScreenplayText(e.target.value)}
                className="w-full flex-1 bg-neutral-950 border border-neutral-800 rounded p-3 text-sm font-mono text-neutral-300 resize-none focus:outline-none focus:border-orange-500"
                rows="12"
              />
              <button
                onClick={parseScreenplay}
                className="mt-4 bg-orange-600 hover:bg-orange-500 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                Extract Scene Breakdown
              </button>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col">
              <h2 className="text-lg font-semibold mb-3">Scene Coverage & Inventory</h2>
              <div className="flex-1 overflow-y-auto space-y-3">
                {scenes.map(scene => (
                  <div key={scene.id} className="bg-neutral-950 border border-neutral-800 p-3 rounded flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold text-orange-400">{scene.heading}</p>
                      <p className="text-xs text-neutral-400 mt-1">Assigned Asset: {scene.asset || 'None'}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded uppercase font-bold ${
                      scene.status === 'covered' ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}>
                      {scene.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Media Asset Library</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {assets.map(asset => (
                <div key={asset.id} className="bg-neutral-950 border border-neutral-800 p-4 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="h-32 bg-neutral-900 rounded mb-3 flex items-center justify-center text-neutral-600 font-mono text-xs">PREVIEW WINDOW</div>
                    <p className="font-semibold text-sm">{asset.name}</p>
                    <p className="text-xs text-neutral-400 mt-1">Duration: {asset.duration}</p>
                  </div>
                  <div className="flex gap-1 mt-4">
                    {asset.tags.map(tag => (
                      <span key={tag} className="bg-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col h-full">
            <h2 className="text-lg font-semibold mb-4">Multi-Track Timeline & Animation Keyframes</h2>
            <div className="space-y-4 flex-1">
              {timelineTracks.map(track => (
                <div key={track.id} className="bg-neutral-950 border border-neutral-800 p-3 rounded">
                  <div className="flex justify-between text-xs text-neutral-400 mb-2">
                    <span>{track.name}</span>
                    <span>Length: {track.length}s</span>
                  </div>
                  <div className="h-10 bg-neutral-900 rounded border border-neutral-800 flex items-center px-3 text-sm text-orange-400 font-mono">
                    [ Clip: {track.clip} ]
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-xl mx-auto">
            <h2 className="text-lg font-semibold mb-2">Project Delivery & Pipeline Export</h2>
            <p className="text-sm text-neutral-400 mb-6">Export project EDL, render sequence, or generate a Blender animation script.</p>
            <button
              onClick={() => alert("Blender Python script & timeline EDL generated successfully!")}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 rounded transition-colors"
            >
              Export Blender Python Pipeline (.py)
            </button>
          </div>
        )}
      </main>
    </div>
  );
}