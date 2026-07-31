//Where Environment blocks and handels style gets pulled and render them togther from blcokthemes (except teh host node)

import { Handle, Position } from '@xyflow/react';
import { ENV_STYLES } from './blockTheme';
//to allow different handles no matter if they are inputs or outputs to connect (will use the allowed connections logic in app.jsx)
export default function AllNodes({ data }) {
  const s = ENV_STYLES[data.blockType] || { fill: '#1c1e1d', accent: '#adb2ab' };
  const name = data.properties?.name;
  return (
    <div style={{
      minWidth: 116, padding: '10px 14px',
      background: s.fill, color: s.accent,
      border: `1px solid ${s.accent}99`, borderRadius: 14,
      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      fontFamily: "'JetBrains Mono','Fira Mono',monospace", userSelect: 'none',
    }}>
      {/* top stacked target and source */}
      <Handle type="target" position={Position.Top}    id="t-top"    style={{ background: s.accent }} />
      <Handle type="source" position={Position.Top}    id="s-top"    style={{ background: s.accent }} />
      {/* bottom stacked target and source */}
      <Handle type="target" position={Position.Bottom} id="t-bottom" style={{ background: s.accent }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ background: s.accent }} />
 
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{s.icon}</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e8eaf2' }}>{data.blockType}</div>
          {name && <div style={{ fontSize: 9, color: '#e8eaf2', opacity: 0.85, marginTop: 2 }}>{name}</div>}
        </div>
      </div>
    </div>
  );
}