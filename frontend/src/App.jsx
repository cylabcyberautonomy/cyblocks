import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, RefreshCcw, X } from "lucide-react";

const BLOCK_WIDTH = 176;
const BLOCK_HEIGHT = 74;
const STORAGE_KEY = "simple-block-board-state-v4";

const BLOCK_TYPES = [
  { id: "host-small", label: "host.small", color: "#ff8a7a", ramGb: 2, storageGb: 32 },
  { id: "host-medium", label: "host.medium", color: "#ffd166", ramGb: 4, storageGb: 64 },
  { id: "host-large", label: "host.large", color: "#74d3ae", ramGb: 8, storageGb: 128 },
  { id: "host-storage", label: "host.storage", color: "#8fb8ff", ramGb: 4, storageGb: 256 },
  { id: "host-custom", label: "host.custom", color: "#d7a8ff", ramGb: 4, storageGb: 64 }
];

const PORT_OPTIONS = [
  { value: "22", label: "22 / ssh" },
  { value: "80", label: "80 / http" },
  { value: "443", label: "443 / https" },
  { value: "5432", label: "5432 / postgres" },
  { value: "3306", label: "3306 / mysql" },
  { value: "6379", label: "6379 / redis" },
  { value: "8080", label: "8080 / app" },
  { value: "custom", label: "custom" }
];

const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((type) => [type.id, type]));

function loadCanvas() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;

    if (Array.isArray(parsed)) {
      return { blocks: normalizeBlocks(parsed), connections: [] };
    }

    return {
      blocks: normalizeBlocks(Array.isArray(parsed?.blocks) ? parsed.blocks : []),
      connections: normalizeConnections(Array.isArray(parsed?.connections) ? parsed.connections : [])
    };
  } catch {
    return { blocks: [], connections: [] };
  }
}

function createHostDefaults(typeId, index = 1) {
  const type = BLOCK_TYPE_MAP[typeId] || BLOCK_TYPES[0];

  return {
    hostname: `${type.label.replace(".", "-")}-${index}`,
    osImagePath: "/images/base-linux.img",
    ramGb: type.ramGb,
    storageGb: type.storageGb,
    externalDrives: []
  };
}

function normalizeBlocks(blocks) {
  return blocks.map((block, index) => {
    const type = BLOCK_TYPE_MAP[block.type] || BLOCK_TYPES[0];
    const defaults = createHostDefaults(type.id, index + 1);

    return {
      ...block,
      type: type.id,
      label: block.label || type.label,
      color: block.color || type.color,
      host: {
        hostname: block.host?.hostname || block.hostname || defaults.hostname,
        osImagePath: block.host?.osImagePath || block.osImagePath || defaults.osImagePath,
        ramGb: numberOrDefault(block.host?.ramGb ?? block.ramGb, defaults.ramGb),
        storageGb: numberOrDefault(block.host?.storageGb ?? block.storageGb, defaults.storageGb),
        externalDrives: Array.isArray(block.host?.externalDrives)
          ? block.host.externalDrives
          : Array.isArray(block.externalDrives)
            ? block.externalDrives
            : defaults.externalDrives
      }
    };
  });
}

function normalizeConnections(connections) {
  return connections.map((connection, index) => ({
    ...connection,
    label: connection.label || `link.${index + 1}`,
    port: String(connection.port || "8080")
  }));
}

function App() {
  const boardRef = useRef(null);
  const blockDragRef = useRef(null);
  const connectorDragRef = useRef(null);
  const copiedBlockRef = useRef(null);
  const paletteDragRef = useRef(null);
  const [blocks, setBlocks] = useState(() => loadCanvas().blocks);
  const [connections, setConnections] = useState(() => loadCanvas().connections);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [connectorDrag, setConnectorDrag] = useState(null);
  const [paletteDrag, setPaletteDrag] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [status, setStatus] = useState("Ready");
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) || null;
  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) || null;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ blocks, connections }));
  }, [blocks, connections]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setBoardSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height)
      });
    });

    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;

      if ((event.key === "Delete" || event.key === "Backspace") && (selectedBlock || selectedConnection)) {
        event.preventDefault();

        if (selectedBlock) {
          deleteBlock(selectedBlock.id);
          return;
        }

        if (selectedConnection) {
          deleteConnection(selectedConnection.id);
        }
      }

      if (commandKey && key === "c" && selectedBlock) {
        event.preventDefault();
        copiedBlockRef.current = selectedBlock;
        setStatus(`Copied ${selectedBlock.host.hostname}`);
      }

      if (commandKey && key === "v" && copiedBlockRef.current) {
        event.preventDefault();
        pasteCopiedBlock();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [blocks.length, boardSize.height, boardSize.width, selectedBlock, selectedConnection]);

  const getBoardPoint = useCallback((event) => {
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  const isPointInsideBoard = useCallback((clientX, clientY) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }

    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  const addBlockAt = useCallback(
    (typeId, x, y) => {
      const type = BLOCK_TYPE_MAP[typeId] || BLOCK_TYPES[0];
      const nextIndex = blocks.length + 1;
      const block = {
        id: `block-${Date.now()}-${Math.round(Math.random() * 999)}`,
        type: type.id,
        label: type.label,
        color: type.color,
        host: createHostDefaults(type.id, nextIndex),
        x: clamp(Math.round(x - BLOCK_WIDTH / 2), 8, Math.max(8, boardSize.width - BLOCK_WIDTH - 8)),
        y: clamp(Math.round(y - BLOCK_HEIGHT / 2), 8, Math.max(8, boardSize.height - BLOCK_HEIGHT - 8))
      };

      setBlocks((current) => [...current, block]);
      setSelectedBlockId(block.id);
      setSelectedConnectionId(null);
      setStatus(`Added ${type.label}`);
    },
    [blocks.length, boardSize.height, boardSize.width]
  );

  useEffect(() => {
    function handlePointerMove(event) {
      if (blockDragRef.current) {
        const drag = blockDragRef.current;
        const point = getBoardPoint(event);
        const maxX = Math.max(8, boardSize.width - BLOCK_WIDTH - 8);
        const maxY = Math.max(8, boardSize.height - BLOCK_HEIGHT - 8);
        const nextX = clamp(point.x - drag.offsetX, 8, maxX);
        const nextY = clamp(point.y - drag.offsetY, 8, maxY);

        setBlocks((current) =>
          current.map((block) =>
            block.id === drag.id
              ? { ...block, x: Math.round(nextX), y: Math.round(nextY) }
              : block
          )
        );
      }

      if (connectorDragRef.current) {
        const point = getBoardPoint(event);
        const drag = {
          ...connectorDragRef.current,
          end: point
        };

        connectorDragRef.current = drag;
        setConnectorDrag(drag);
      }

      if (paletteDragRef.current) {
        const drag = {
          ...paletteDragRef.current,
          x: event.clientX,
          y: event.clientY
        };

        paletteDragRef.current = drag;
        setPaletteDrag(drag);
        setDropActive(isPointInsideBoard(event.clientX, event.clientY));
      }
    }

    function handlePointerUp(event) {
      blockDragRef.current = null;

      if (connectorDragRef.current) {
        const sourceId = connectorDragRef.current.from;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const targetId =
          target?.closest("[data-input-port]")?.getAttribute("data-input-port") ||
          target?.closest("[data-block-id]")?.getAttribute("data-block-id");

        connectorDragRef.current = null;
        setConnectorDrag(null);

        if (targetId && targetId !== sourceId) {
          setConnections((current) => {
            const exists = current.some(
              (connection) => connection.from === sourceId && connection.to === targetId
            );

            if (exists) {
              return current;
            }

            setStatus("Connected blocks");
            const connectionId = `connection-${Date.now()}-${Math.round(Math.random() * 999)}`;
            setSelectedConnectionId(connectionId);
            return [
              ...current,
              {
                id: connectionId,
                label: `link.${current.length + 1}`,
                from: sourceId,
                to: targetId,
                port: "8080"
              }
            ];
          });
          setSelectedBlockId(null);
        }
      }

      if (paletteDragRef.current) {
        const typeId = paletteDragRef.current.typeId;
        const droppedOnBoard = isPointInsideBoard(event.clientX, event.clientY);

        paletteDragRef.current = null;
        setPaletteDrag(null);
        setDropActive(false);

        if (droppedOnBoard) {
          const point = getBoardPoint(event);
          addBlockAt(typeId, point.x, point.y);
        }
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [addBlockAt, boardSize.height, boardSize.width, getBoardPoint, isPointInsideBoard]);

  function beginPaletteDrag(event, typeId) {
    if (event.button !== 0) {
      return;
    }

    const type = BLOCK_TYPE_MAP[typeId];
    if (!type) {
      return;
    }

    const drag = {
      typeId,
      label: type.label,
      color: type.color,
      x: event.clientX,
      y: event.clientY
    };

    event.preventDefault();
    paletteDragRef.current = drag;
    setPaletteDrag(drag);
    setDropActive(isPointInsideBoard(event.clientX, event.clientY));
  }

  function beginBlockDrag(event, block) {
    if (event.button !== 0) {
      return;
    }

    const point = getBoardPoint(event);
    blockDragRef.current = {
      id: block.id,
      offsetX: point.x - block.x,
      offsetY: point.y - block.y
    };
    setSelectedBlockId(block.id);
    setSelectedConnectionId(null);
  }

  function beginConnectorDrag(event, block) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const start = {
      x: block.x + BLOCK_WIDTH,
      y: block.y + BLOCK_HEIGHT / 2
    };
    const drag = {
      from: block.id,
      start,
      end: start
    };

    connectorDragRef.current = drag;
    setConnectorDrag(drag);
    setStatus(`Connecting from ${block.label}`);
  }

  function clearBoard() {
    setBlocks([]);
    setConnections([]);
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
    setStatus("Cleared board");
  }

  function updateSelectedBlockHost(patch) {
    if (!selectedBlock) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              host: {
                ...block.host,
                ...patch
              }
            }
          : block
      )
    );
  }

  function updateSelectedConnection(patch) {
    if (!selectedConnection) {
      return;
    }

    setConnections((current) =>
      current.map((connection) =>
        connection.id === selectedConnection.id
          ? {
              ...connection,
              ...patch
            }
          : connection
      )
    );
  }

  function deleteBlock(blockId) {
    const block = blocks.find((item) => item.id === blockId);

    setBlocks((current) => current.filter((item) => item.id !== blockId));
    setConnections((current) =>
      current.filter((connection) => connection.from !== blockId && connection.to !== blockId)
    );
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
    setStatus(`Deleted ${block?.host?.hostname || "block"}`);
  }

  function deleteConnection(connectionId) {
    setConnections((current) => current.filter((connection) => connection.id !== connectionId));
    setSelectedConnectionId(null);
    setStatus("Deleted connection");
  }

  function pasteCopiedBlock() {
    const copiedBlock = copiedBlockRef.current;
    if (!copiedBlock) {
      return;
    }

    const block = {
      ...structuredClone(copiedBlock),
      id: `block-${Date.now()}-${Math.round(Math.random() * 999)}`,
      host: {
        ...copiedBlock.host,
        hostname: `${copiedBlock.host.hostname}-copy`
      },
      x: clamp(copiedBlock.x + 24, 8, Math.max(8, boardSize.width - BLOCK_WIDTH - 8)),
      y: clamp(copiedBlock.y + 24, 8, Math.max(8, boardSize.height - BLOCK_HEIGHT - 8))
    };

    setBlocks((current) => [...current, block]);
    setSelectedBlockId(block.id);
    setSelectedConnectionId(null);
    setStatus(`Pasted ${block.host.hostname}`);
  }

  function removeSelectedConnection() {
    if (!selectedConnection) {
      return;
    }

    deleteConnection(selectedConnection.id);
  }

  function resetBoard() {
    const sample = BLOCK_TYPES.slice(0, 3).map((type, index) => ({
      id: `sample-${type.id}`,
      type: type.id,
      label: type.label,
      color: type.color,
      host: createHostDefaults(type.id, index + 1),
      x: 80 + index * 210,
      y: 90 + index * 80
    }));
    const sampleConnections = [
      {
        id: "sample-host-small-to-host-medium",
        label: "link.control",
        from: "sample-host-small",
        to: "sample-host-medium",
        port: "22"
      },
      {
        id: "sample-host-medium-to-host-large",
        label: "link.app",
        from: "sample-host-medium",
        to: "sample-host-large",
        port: "8080"
      }
    ];

    setBlocks(sample);
    setConnections(sampleConnections);
    setSelectedBlockId(sample[0]?.id || null);
    setSelectedConnectionId(null);
    setStatus("Loaded sample blocks");
  }

  function downloadBlocksJson() {
    const visibleBlockIds = new Set();
    const visibleBlocks = blocks
      .filter((block) => {
        const right = block.x + BLOCK_WIDTH;
        const bottom = block.y + BLOCK_HEIGHT;
        const isVisible = block.x < boardSize.width && block.y < boardSize.height && right > 0 && bottom > 0;

        if (isVisible) {
          visibleBlockIds.add(block.id);
        }

        return isVisible;
      })
      .map((block, index) => ({
        id: block.id,
        order: index,
        type: block.type,
        label: block.label,
        color: block.color,
        host: {
          hostname: block.host.hostname,
          osImagePath: block.host.osImagePath,
          ramGb: block.host.ramGb,
          storageGb: block.host.storageGb,
          externalDrives: block.host.externalDrives
        },
        position: {
          x: block.x,
          y: block.y
        },
        size: {
          width: BLOCK_WIDTH,
          height: BLOCK_HEIGHT
        }
      }));
    const visibleConnections = connections
      .filter((connection) => visibleBlockIds.has(connection.from) && visibleBlockIds.has(connection.to))
      .map((connection) => ({
        id: connection.id,
        label: connection.label,
        from: connection.from,
        to: connection.to,
        port: connection.port
      }));

    const output = {
      kind: "block-board",
      version: 1,
      compiledAt: new Date().toISOString(),
      blockCount: visibleBlocks.length,
      connectionCount: visibleConnections.length,
      blocks: visibleBlocks,
      connections: visibleConnections
    };

    const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "blocks.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(
      `Downloaded ${visibleBlocks.length} block${visibleBlocks.length === 1 ? "" : "s"}, ${visibleConnections.length} connection${visibleConnections.length === 1 ? "" : "s"} as blocks.json`
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tiny canvas prototype</p>
          <h1>Block Board</h1>
        </div>
        <div className="topbar-actions" aria-label="Board actions">
          <button type="button" onClick={resetBoard}>
            <RefreshCcw size={17} aria-hidden="true" />
            <span>Sample</span>
          </button>
          <button type="button" onClick={downloadBlocksJson}>
            <FileDown size={17} aria-hidden="true" />
            <span>Download JSON</span>
          </button>
          <button type="button" onClick={clearBoard}>
            <X size={17} aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel palette-panel" aria-label="Block palette">
          <h2>Blocks</h2>
          <div className="palette-list">
            {BLOCK_TYPES.map((type) => (
              <button
                type="button"
                className="palette-item"
                key={type.id}
                data-type={type.id}
                style={{ "--item-color": type.color }}
                onPointerDown={(event) => beginPaletteDrag(event, type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="board-panel" aria-label="Canvas board">
          <div className="board-meta">
            <span>{blocks.length} blocks</span>
            <span>{connections.length} connections</span>
            <span>{status}</span>
          </div>
          <div
            ref={boardRef}
            className={`board${dropActive ? " is-drop-target" : ""}`}
            tabIndex={0}
            aria-label="Drag and drop board"
          >
            <svg
              className="connection-layer"
              viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
              aria-hidden="true"
            >
              {connections.map((connection) => {
                const from = blocks.find((block) => block.id === connection.from);
                const to = blocks.find((block) => block.id === connection.to);

                if (!from || !to) {
                  return null;
                }
                const path = makeConnectorPath(outputPoint(from), inputPoint(to));

                return (
                  <g
                    key={connection.id}
                    data-connection-id={connection.id}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedConnectionId(connection.id);
                      setSelectedBlockId(null);
                    }}
                  >
                    <path
                      id={`${connection.id}-path`}
                      className="connection-text-path"
                      d={path}
                    />
                    <path
                      className="connection-hitbox"
                      d={path}
                    />
                    <path
                      className={`connection-path${connection.id === selectedConnectionId ? " is-selected" : ""}`}
                      d={path}
                    />
                    <text className="connection-label" dy="-6">
                      <textPath href={`#${connection.id}-path`} startOffset="50%" textAnchor="middle">
                        {connection.label}:{connection.port}
                      </textPath>
                    </text>
                  </g>
                );
              })}
              {connectorDrag && (
                <path
                  className="connection-path connection-path-preview"
                  d={makeConnectorPath(connectorDrag.start, connectorDrag.end)}
                />
              )}
            </svg>
            <div className="block-layer">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={`block${block.id === selectedBlockId ? " is-selected" : ""}`}
                  data-block-id={block.id}
                  style={{
                    left: block.x,
                    top: block.y,
                    "--block-color": block.color
                  }}
                  onPointerDown={(event) => beginBlockDrag(event, block)}
                >
                  <span className="port port-in" data-input-port={block.id} aria-hidden="true" />
                  <span className="block-label">{block.host.hostname}</span>
                  <span className="block-meta">
                    {block.host.ramGb}GB RAM / {block.host.storageGb}GB disk
                  </span>
                  <button
                    type="button"
                    className="port port-out"
                    data-output-port={block.id}
                    aria-label={`Connect from ${block.label}`}
                    onPointerDown={(event) => beginConnectorDrag(event, block)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel properties-panel" aria-label="Properties">
          <h2>Properties</h2>
          {selectedBlock && (
            <form className="properties-form">
              <p className="properties-kicker">{selectedBlock.label}</p>
              <label>
                Hostname
                <input
                  value={selectedBlock.host.hostname}
                  onChange={(event) => updateSelectedBlockHost({ hostname: event.target.value })}
                />
              </label>
              <label>
                OS image path
                <input
                  value={selectedBlock.host.osImagePath}
                  onChange={(event) => updateSelectedBlockHost({ osImagePath: event.target.value })}
                />
              </label>
              <label>
                RAM (GB)
                <input
                  type="number"
                  min="1"
                  value={selectedBlock.host.ramGb}
                  onChange={(event) =>
                    updateSelectedBlockHost({ ramGb: numberOrDefault(event.target.value, 1) })
                  }
                />
              </label>
              <label>
                Storage (GB)
                <input
                  type="number"
                  min="1"
                  value={selectedBlock.host.storageGb}
                  onChange={(event) =>
                    updateSelectedBlockHost({ storageGb: numberOrDefault(event.target.value, 1) })
                  }
                />
              </label>
              <label>
                External drives
                <textarea
                  rows={5}
                  placeholder="/Volumes/data.img"
                  value={selectedBlock.host.externalDrives.join("\n")}
                  onChange={(event) =>
                    updateSelectedBlockHost({
                      externalDrives: event.target.value
                        .split("\n")
                        .map((drive) => drive.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </label>
              <div className="hotkeys-panel" aria-label="Available hotkeys">
                <strong>Hotkeys</strong>
                <span>Delete: delete host</span>
                <span>Cmd/Ctrl+C: copy host</span>
                <span>Cmd/Ctrl+V: paste host</span>
              </div>
            </form>
          )}

          {selectedConnection && (
            <form className="properties-form">
              <p className="properties-kicker">
                {blockName(blocks, selectedConnection.from)} to {blockName(blocks, selectedConnection.to)}
              </p>
              <label>
                Connector name
                <input
                  value={selectedConnection.label}
                  onChange={(event) => updateSelectedConnection({ label: event.target.value })}
                />
              </label>
              <label>
                Port
                <select
                  value={portSelectValue(selectedConnection.port)}
                  onChange={(event) =>
                    updateSelectedConnection({
                      port: event.target.value === "custom" ? "" : event.target.value
                    })
                  }
                >
                  {PORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {portSelectValue(selectedConnection.port) === "custom" && (
                <label>
                  Custom port
                  <input
                    inputMode="numeric"
                    value={selectedConnection.port}
                    onChange={(event) => updateSelectedConnection({ port: event.target.value })}
                  />
                </label>
              )}
              <button type="button" className="remove-button" onClick={removeSelectedConnection}>
                Remove connection
              </button>
              <div className="hotkeys-panel" aria-label="Available hotkeys">
                <strong>Hotkeys</strong>
                <span>Delete: delete connector</span>
              </div>
            </form>
          )}

          {!selectedBlock && !selectedConnection && (
            <p className="properties-empty">Select a host block or connector.</p>
          )}
        </aside>
      </main>

      {paletteDrag && (
        <div
          className="palette-item drag-ghost"
          style={{
            "--item-color": paletteDrag.color,
            left: paletteDrag.x,
            top: paletteDrag.y
          }}
        >
          {paletteDrag.label}
        </div>
      )}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function numberOrDefault(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function blockName(blocks, blockId) {
  const block = blocks.find((item) => item.id === blockId);
  return block?.host?.hostname || block?.label || "missing";
}

function portSelectValue(port) {
  return PORT_OPTIONS.some((option) => option.value === port) ? port : "custom";
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
}

function inputPoint(block) {
  return {
    x: block.x,
    y: block.y + BLOCK_HEIGHT / 2
  };
}

function outputPoint(block) {
  return {
    x: block.x + BLOCK_WIDTH,
    y: block.y + BLOCK_HEIGHT / 2
  };
}

function makeConnectorPath(from, to) {
  const distance = Math.max(42, Math.abs(to.x - from.x) * 0.5);

  return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`;
}

export default App;
