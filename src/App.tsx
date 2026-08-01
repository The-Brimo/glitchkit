import { useState } from 'react';
import { AppStateProvider } from './store/AppState';
import { RenderEngineProvider } from './store/RenderEngine';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { PipelineStrip } from './components/PipelineStrip';
import { colors, fontUI } from './theme';

function Window() {
  const [search, setSearch] = useState('');

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1400,
        height: '100%',
        maxHeight: 860,
        minWidth: 1100,
        minHeight: 700,
        borderRadius: 26,
        overflow: 'hidden',
        background: colors.windowBg,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.23), 0 30px 80px rgba(0,0,0,0.55)',
        display: 'flex',
        position: 'relative',
        fontFamily: fontUI,
      }}
    >
      <Sidebar search={search} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
        <Toolbar onSearch={setSearch} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Canvas />
          <Inspector />
        </div>
        <PipelineStrip />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <RenderEngineProvider>
        <div
          style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            background: 'radial-gradient(circle at 30% 20%, #23262f 0%, #0b0c10 60%)',
          }}
        >
          <Window />
        </div>
      </RenderEngineProvider>
    </AppStateProvider>
  );
}
