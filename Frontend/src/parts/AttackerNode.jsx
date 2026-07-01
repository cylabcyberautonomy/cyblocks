
// Generic custom node for all attacker-panel blocks.
// Port explanation 
//   Control flow  → vertical ports, triangular clip (top = in, bottom = out)
//   Data flow     → horizontal ports, circular (left = in, right = out)
//   Parameter     → middle port in LLM blocks, circular ( only in)

import { Handle, Position } from '@xyflow/react';
// Which ports each block exposes.
//   cfIn  = control-in (top triangle)      cfOut = list of control-out labels (bottom triangles)
//   dataIn = data-in (left circle)         dataOut = data-out (right circle)
const PORTS = {
  Start:     { cfIn: false, cfOut: ["next"], dataIn: false, dataOut: false },
  Stop:      { cfIn: true,  cfOut: [],        dataIn: false, dataOut: false },//no next blcok  to go to 
  Condition: { cfIn: true,  cfOut: ["out"],   dataIn: true,  dataOut: false, branch: ["true", "false"] },
  Choice:    { cfIn: true,  cfOut: ["out"],   dataIn: true,  dataOut: false, branch: ["continue", "override", "llm "] },
  Human:     { cfIn: true,  cfOut: ["next"],  dataIn: true,  dataOut: true  },
  LLM:       { cfIn: true,  cfOut: ["next"],  dataIn: true,  dataOut: true,  paramIn: true   },
  DataFile:  { cfIn: false, cfOut: [],         dataIn: true,  dataOut: true  },
  Parameter: { cfIn: false, cfOut: [],         dataIn: false, dataOut: true  },
  Algorithm: { cfIn: true, cfOut: ["next"], dataIn: true, dataOut: true, paramIn: true },

};
const AttackerNode = ({ data }) => {
  const { blockType, accentColor, textColor, icon, category } = data;

  const shapeStyle =
    category === "control" ? { borderRadius: "5px" }
    : category === "agent"   ? { borderRadius: "16px" }
    : category === "data"    ? { borderRadius: "4px 18px 4px 18px" }
    :                          { borderRadius: "10px" };

  const handleBase = {
    background: accentColor,
    border: `2px solid ${textColor}`,
    width: 10,
    height: 10,
  };

  return (
    <div
      style={{
        background: accentColor,
        color: textColor,
        minWidth: 116,
        padding: "10px 14px",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        boxShadow: "0 0 0 1.5px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.35)",
        position: "relative",
        userSelect: "none",
        ...shapeStyle,
      }}
    >
      {/* Control-flow ports (vertical, triangular)*/}
      {(() => {
        const spec = PORTS[blockType] || { cfIn: true, cfOut: ["next"], dataIn: true, dataOut: true };
        return (
          <>
            {spec.cfIn && (
              <Handle id="cf-in" type="target" position={Position.Top}
                style={{ ...handleBase, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)", borderRadius: 0 }} />
            )}
            {spec.paramIn && (
              <Handle id="param-in" type="target" position={Position.Top}
                style={{ ...handleBase, top: "75%", borderRadius: "50%",
                        background: textColor }} />   //distinct from PTT's outline circle its in the middle and filled with textColor
            )}
            {spec.cfOut.map((label, i) => (
              <Handle key={label} id={`cf-out-${label}`} type="source" position={Position.Bottom}
                style={{ ...handleBase,
                  left: `${((i + 1) / (spec.cfOut.length + 1)) * 100}%`,
                  clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)", borderRadius: 0 }} />
            ))}
            {spec.dataIn  && <Handle id="data-in"  type="target" position={Position.Left}
              style={{ ...handleBase, borderRadius: "50%" }} />}
            {spec.dataOut && <Handle id="data-out" type="source" position={Position.Right}
              style={{ ...handleBase, borderRadius: "50%" }} />}
          </>
        );
      })()}
      {/*Block labels*/}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
        <div>
          <div
            style={{
              opacity: 0.5,
              fontSize: 8,
              letterSpacing: "0.1em",
              marginBottom: 2,
              textTransform: "uppercase",
            }}
          >
            {category}
          </div>
          <div>{blockType}</div>
        </div>
      </div>
    </div>
  );
};

export default AttackerNode;