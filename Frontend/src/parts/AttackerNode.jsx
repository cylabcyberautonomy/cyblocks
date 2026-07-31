
// Generic custom nodes for all attacker-panel blocks.
// Port explanation 
//   Control flow  → vertical ports, triangular clip (top = in, bottom = out)
//   Data flow     → horizontal ports, circular (left = in, right = out)
//   Parameter     → middle port in LLM blocks, circular ( only in)
import { useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
// Which ports each block exposes
//   cfIn  = control-in (top triangle)      cfOut = list of control-out labels (bottom triangles)
//   dataIn = data-in (left circle)         dataOut = data-out (right circle)
const PORTS = {
  Start:     { cfIn: false, cfOut: ["next"], dataIn: false, dataOut: false },
  Stop:      { cfIn: true,  cfOut: [],        dataIn: false, dataOut: false },//no next blcok  to go to 
  Condition: { cfIn: true,  cfOut: [],  dataIn: true,  dataOut: false, branch: ["goal_reached", "continue"] },
  Choice:   { cfIn: false, cfOut: [], dataIn: true, dataOut: false, dataInPos: "bottom", cradle: true },
  LLM:   { cfIn: true, cfOut: ["next","done","override","suggest"], dataIn: true, dataOut: true, paramIn: true },
  Human: { cfIn: true, cfOut: ["next","done","override","suggest"], dataIn: true, dataOut: true },
  DataFile:  { cfIn: false, cfOut: [],         dataIn: true,  dataOut: true  },
  Parameter: { cfIn: false, cfOut: [],         dataIn: false, dataOut: true  },
  Algorithm: { cfIn: true, cfOut: ["next"], dataIn: true, dataOut: true, paramIn: true },
  Action:   { cfIn: false, cfOut: [], dataIn: false, dataOut: true, dataOutPos: "top" },
  Executor: { cfIn: true,  cfOut: ["next"], dataIn: true, dataOut: true }
};
//we grab the styling + label fields off data and keep track of wether the cf-out menu is open
const AttackerNode = ({id, data }) => {
  const { blockType, accentColor, textColor, icon, category } = data;
  const [cfMenuOpen, setCfMenuOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
 //we remeasure whenever the cf-out set or cradle size changes or edges attach to the old spot
   useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.enabledCfOut?.join(","), data.cradleW, data.cradleH, updateNodeInternals]);
 
 //pick a border radius per category so each block shape hints at its role
  const shapeStyle =
    category === "control" ? { borderRadius: "5px" }
    : category === "agent"   ? { borderRadius: "16px" }
    : category === "data"    ? { borderRadius: "4px 18px 4px 18px" }
    : category === "action"  ? { borderRadius: "3px" }        // distinct: sharp, tool-like
    :                          { borderRadius: "10px" };
 
//is this a Choice block (drawn as a C).
//we put an agent parented inside a Choice (we hide its data-in)
  const isCradle = !!PORTS[blockType]?.cradle;
  const seated = !!data.parentId && (blockType === "LLM" || blockType === "Human");//will add algorithm later 
  const handleBase = {
    background: accentColor,
    border: `2px solid ${textColor}`,
    width: 10,
    height: 10,
  };
  //we retrun the C shape for the choice block
  if (isCradle) {
    const aw = data.cradleW ?? 130;
    const ah = data.cradleH ?? 74;
    const spine = 92;
    const top = 16;
    const bottom = 20;
    const W = spine + aw +2;              
    const H = top + ah + bottom;      
    const r = 10;
    const notchTop = top;
    const notchBot = top + ah + 2;        
    const d = `
      M ${r} 0
      H ${W - r} Q ${W} 0 ${W} ${r}
      V ${notchTop}
      H ${spine + r} Q ${spine} ${notchTop} ${spine} ${notchTop + r}
      V ${notchBot - r} Q ${spine} ${notchBot} ${spine + r} ${notchBot}
      H ${W}
      V ${H - r} Q ${W} ${H} ${W - r} ${H}
      H ${r} Q 0 ${H} 0 ${H - r}
      V ${r} Q 0 0 ${r} 0 Z
    `;
 //returnning the C shape
    return (
      <div style={{ position: "relative", width: W, height: H, userSelect: "none",
                    fontFamily: "'JetBrains Mono','Fira Mono',monospace" }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0,
             filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.35))" }}>
          <path d={d} fill={accentColor} stroke={textColor} strokeWidth="2" />
        </svg>
        <Handle id="data-in" type="target" position={Position.Bottom}
          style={{ ...handleBase, left: spine / 2, top: H - 12, borderRadius: "50%" }} />
        <div style={{ position: "absolute", left: 14, top: 14, color: textColor,
             fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", pointerEvents: "none" }}>
          <div style={{ opacity: 0.5, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>{category}</div>
          <div style={{ marginTop: 20, fontSize: 15 }}>{icon} {blockType}</div>
        </div>
      </div>
    );
  }
//returning the rest of attacker blcoks shapes 
  return (
    <div
      style={{
        background: accentColor,
        color: textColor,
        padding: "10px 14px",
        minWidth: 116,
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
                        background: textColor }} />   
            )}
            {(() => {
  const menu = spec.cfOut || [];           
  if (menu.length === 0) return null;//guard aginst blcoks with no control hnadels 
  const isEditable = Array.isArray(data.enabledCfOut);   
  const shown = isEditable
    ? menu.filter((h) => data.enabledCfOut.includes(h)) 
    : menu;                                              
    const n = shown.length;
 //to show our handesl 
  return (
    <>
    {shown.map((label, i) => {
      const left = `${((i + 1) / (n + 1)) * 100}%`;
      return (
        <Handle
          key={label}
          id={`cf-out-${label}`}
          type="source"
          position={Position.Bottom}
          style={{ ...handleBase, left,
            clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)", borderRadius: 0 }}
        />
      );
    })}
    {shown.map((label, i) => {//to show teh labels of each handel 
      const left = `${((i + 1) / (n + 1)) * 100}%`;
      return (
        <span key={`lbl-${label}`}
          style={{ position: "absolute", bottom: 7, left,
            transform: "translateX(-50%)", fontSize: 6, lineHeight: 1,
            color: textColor, opacity: 0.7, whiteSpace: "nowrap",
            pointerEvents: "none" }}>{label}</span>
      );
    })}
 
      {/* + button to add extra control handels on agent blocks */}
    {isEditable && (
            <button className="nodrag" onClick={(e) => { e.stopPropagation(); setCfMenuOpen((o) => !o); }}
              style={{ position: "absolute", bottom: -7,
              left: `calc(${(n / (n + 1)) * 100}% + 12px)`,
              width: 14, height: 30, padding: 0, margin: 0,
              background: "none", border: "none",
              color: textColor, opacity: 0.7,
              fontSize: 20, lineHeight: "12px", fontWeight: 700,
              cursor: "pointer" }}
          >+</button>
    )}
      {/* dropdown checklist */}
      {isEditable && cfMenuOpen && (
        <div className="nodrag" onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "100%", right: -8, marginTop: 6, zIndex: 50,
            background: accentColor, border: `1.5px solid ${textColor}`, borderRadius: 6,
            padding: "6px 8px", minWidth: 110, boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>
          {menu.map((h) => {
            const on = data.enabledCfOut.includes(h);
            const locked = h === "next";
            return (
              <label key={h} style={{ display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, color: textColor, padding: "2px 0",
                opacity: locked ? 0.6 : 1, cursor: locked ? "default" : "pointer" }}>
                <input type="checkbox" checked={on} disabled={locked}
                  onChange={() => data.onToggleCfOut?.(data.id, h)} />
                {h}
              </label>
            );
          })}
        </div>
      )}
    </>
  );
})()}
            {(spec.branch || []).map((label, i) => {
              const left = `${((i + 1) / (spec.branch.length + 1)) * 100}%`;
              return (
                <div key={label}>
                  <Handle id={`cf-out-${label}`} type="source" position={Position.Bottom}
                    style={{ ...handleBase, left,
                      clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)", borderRadius: 0 }} />
                  <span style={{ position: "absolute", bottom: 6, left,
                    transform: "translateX(-50%)", fontSize: 6, lineHeight: 1,
                    color: textColor, opacity: 0.7, whiteSpace: "nowrap",
                    pointerEvents: "none" }}>{label}</span>
                </div>
              );
            })}
            {spec.dataIn && !seated && (
              <Handle id="data-in" type="target"
                position={spec.dataInPos === "bottom" ? Position.Bottom : Position.Left}
                style={{ ...handleBase, borderRadius: "50%" }} />
            )}
            {spec.dataOut && (
              <Handle id="data-out" type="source"
                position={spec.dataOutPos === "top" ? Position.Top : Position.Right}
                style={{ ...handleBase, borderRadius: "50%" }} />
            )}
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
          {data.properties?.tool && (
            <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>
              {data.properties.tool}
            </div>
          )}        </div>
      </div>
    </div>
  );
   
};
 
export default AttackerNode;