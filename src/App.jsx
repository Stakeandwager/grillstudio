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
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#f5f5f5', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{ borderBottom: '1px solid #262626', backgroundColor: '#121212', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px', fontWeight: 'bold', background: 'linear-gradient(to right, #f97316, #fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>GrillStudio</span>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: '#262626', padding: '4px 8px', borderRadius: '4px', color: '#fb923c', fontWeight: '600' }}>AI Filmmaking Suite v3.0</span>
        </div>
        <nav style={{ display: 'flex', gap: '8px' }}>
          {['screenplay', 'assets', 'timeline', 'export'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                textTransform: 'capitalize',
                cursor: 'pointer',
                backgroundColor: activeTab === tab ? '#ea580c' : 'transparent',
                color: activeTab === tab ? '#ffffff' : '#a3a3a3',
                border: 'none',
                transition: 'background-color 0.2s'
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Workspace */}
      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {activeTab === 'screenplay' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', height: '100%' }}>
            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#fff' }}>Screenplay Parser</h2>
              <textarea
                value={screenplayText}
                onChange={(e) => setScreenplayText(e.target.value)}
                style={{ width: '100%', flex: 1, backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', padding: '12px', fontSize: '14px', fontFamily: 'monospace', color: '#d4d4d4', resize: 'none', outline: 'none', minHeight: '200px' }}
                rows="12"
              />
              <button
                onClick={parseScreenplay}
                style={{ marginTop: '16px', backgroundColor: '#ea580c', color: '#fff', fontWeight: '500', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
              >
                Extract Scene Breakdown
              </button>
            </div>
            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#fff' }}>Scene Coverage & Inventory</h2>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {scenes.map(scene => (
                  <div key={scene.id} style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', padding: '12px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#fb923c', margin: 0 }}>{scene.heading}</p>
                      <p style={{ fontSize: '12px', color: '#737373', margin: '4px 0 0 0' }}>Assigned Asset: {scene.asset || 'None'}</p>
                    </div>
                    <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', backgroundColor: scene.status === 'covered' ? '#052e16' : '#451a03', color: scene.status === 'covered' ? '#4ade80' : '#fbbf24', border: `1px solid ${scene.status === 'covered' ? '#166534' : '#92400e'}` }}>
                      {scene.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assets' && (
          <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#fff' }}>Media Asset Library</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {assets.map(asset => (
                <div key={asset.id} style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ height: '120px', backgroundColor: '#121212', borderRadius: '6px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#525252', fontFamily: 'monospace', fontSize: '12px' }}>PREVIEW WINDOW</div>
                    <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 4px 0', color: '#fff' }}>{asset.name}</p>
                    <p style={{ fontSize: '12px', color: '#737373', margin: 0 }}>Duration: {asset.duration}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '16px' }}>
                    {asset.tags.map(tag => (
                      <span key={tag} style={{ backgroundColor: '#262626', color: '#d4d4d4', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#fff' }}>Multi-Track Timeline & Animation Keyframes</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              {timelineTracks.map(track => (
                <div key={track.id} style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', padding: '16px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#737373', marginBottom: '8px' }}>
                    <span>{track.name}</span>
                    <span>Length: {track.length}s</span>
                  </div>
                  <div style={{ height: '40px', backgroundColor: '#121212', borderRadius: '4px', border: '1px solid #262626', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '14px', color: '#fb923c', fontFamily: 'monospace' }}>
                    [ Clip: {track.clip} ]
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', padding: '32px', maxWidth: '500px', margin: '40px auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: '#fff' }}>Project Delivery & Pipeline Export</h2>
            <p style={{ fontSize: '14px', color: '#a3a3a3', marginBottom: '24px' }}>Export project EDL, render sequence, or generate a Blender animation script.</p>
            <button
              onClick={() => alert("Blender Python script & timeline EDL generated successfully!")}
              style={{ width: '100%', backgroundColor: '#ea580c', color: '#fff', fontWeight: '500', padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '15px' }}
            >
              Export Blender Python Pipeline (.py)
            </button>
          </div>
        )}
      </main>
    </div>
  );
}