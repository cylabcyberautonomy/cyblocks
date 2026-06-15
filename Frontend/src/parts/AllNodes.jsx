import { Handle, Position } from '@xyflow/react';
//to allow different handles no matter they are inputs or outputs to connect to whatever 
export default function AllNodes({ data }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: data.bg, color: '#FFF' }}>
      {/* top stacked target and source */}
      <Handle type="target" position={Position.Top} id="t-top" />
      <Handle type="source" position={Position.Top} id="s-top" />
      {/* bottom stacked target and source */}
      <Handle type="target" position={Position.Bottom} id="t-bottom" />
      <Handle type="source" position={Position.Bottom} id="s-bottom" />
      {data.label}
    </div>
  );
}