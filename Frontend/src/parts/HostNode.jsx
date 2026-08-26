//each costume node need to be defined in their own file 
//Our host node will have a circle shape with 5 handles to connect to each block 

import { Handle, Position } from '@xyflow/react';
import { ENV_STYLES } from './blockTheme';//now uses a different style 

const circleHandleStyle = (angleDeg, color) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    background: color, width: 9, height: 9, border: '2px solid #0d0f16',
    left: `${(50 + 50 * Math.sin(rad)).toFixed(1)}%`,
    top:  `${(50 - 50 * Math.cos(rad)).toFixed(1)}%`,
    transform: 'translate(-50%, -50%)',
  };
};

const HostNode = ({data}) => {// makes this costumized node a recat compunent we can use in our code 
  const s = ENV_STYLES.Host;
  const name = data.properties?.name ;
  return (
    <div style={{
      width: 104, height: 104, borderRadius: '50%',
      background: s.fill, border: `2px solid ${s.accent}cc`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2,
      color: s.accent, userSelect: 'none',
      fontFamily: "'JetBrains Mono','Fira Mono',monospace",
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{s.icon}</span>
      <span style={{ fontSize: 16, letterSpacing: '0.1em',color: '#ffffff',opacity: 0.6, textTransform: 'uppercase' }}>host</span>
      <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', padding: '0 8px' }}>{name}</span>

      <Handle id="host-subnet"  type="target" position={Position.Top}   style={circleHandleStyle(0,   '#2241e0')} />
      <Handle id="host-service" type="target" position={Position.Right}  style={circleHandleStyle(72,  '#0da319')} />
      <Handle id="host-file"    type="target" position={Position.Bottom} style={circleHandleStyle(144, '#737572')} />
      <Handle id="host-router"  type="target" position={Position.Bottom} style={circleHandleStyle(216, '#6b77be')} />
      <Handle id="host-user"    type="target" position={Position.Left}   style={circleHandleStyle(288, '#c8b800')} />
        </div>
    );
};
export default HostNode 