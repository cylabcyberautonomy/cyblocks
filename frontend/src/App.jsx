import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, RefreshCcw, X } from "lucide-react";

const BLOCK_WIDTH = 132;
const BLOCK_HEIGHT = 56;
const STORAGE_KEY = "simple-block-board-state-v3";

const BLOCK_TYPES = [
  { id: "red", label: "block.red", color: "#ff8a7a" },
  { id: "yellow", label: "block.yellow", color: "#ffd166" },
  { id: "green", label: "block.green", color: "#74d3ae" },
  { id: "blue", label: "block.blue", color: "#8fb8ff" },
  { id: "purple", label: "block.purple", color: "#d7a8ff" }
];

const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((type) => [type.id, type]));

function loadCanvas() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;

    if (Array.isArray(parsed)) {
      return { blocks: parsed, connections: [] };
    }

    return {
      blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
      connections: Array.isArray(parsed?.connections) ? parsed.connections : []
    };
  } catch {
    return { blocks: [], connections: [] };
  }
}

function App() {
  const boardRef = useRef(null);
  const blockDragRef = useRef(null);
  const connectorDragRef = useRef(null);
  const paletteDragRef = useRef(null);
  const [blocks, setBlocks] = useState(() => loadCanvas().blocks);
  const [connections, setConnections] = useState(() => loadCanvas().connections);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [connectorDrag, setConnectorDrag] = useState(null);
  const [paletteDrag, setPaletteDrag] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [status, setStatus] = useState("Ready");

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
      const type = BLOCK_TYPE_MAP[typeId] || BLOCK_TYPE_MAP.red;
      const block = {
        id: `block-${Date.now()}-${Math.round(Math.random() * 999)}`,
        type: type.id,
        label: type.label,
        color: type.color,
        x: clamp(Math.round(x - BLOCK_WIDTH / 2), 8, Math.max(8, boardSize.width - BLOCK_WIDTH - 8)),
        y: clamp(Math.round(y - BLOCK_HEIGHT / 2), 8, Math.max(8, boardSize.height - BLOCK_HEIGHT - 8))
      };

      setBlocks((current) => [...current, block]);
      setStatus(`Added ${type.label}`);
    },
    [boardSize.height, boardSize.width]
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
            return [
              ...current,
              {
                id: `connection-${Date.now()}-${Math.round(Math.random() * 999)}`,
                from: sourceId,
                to: targetId
              }
            ];
          });
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
    setStatus("Cleared board");
  }

  function resetBoard() {
    const sample = BLOCK_TYPES.slice(0, 3).map((type, index) => ({
      id: `sample-${type.id}`,
      type: type.id,
      label: type.label,
      color: type.color,
      x: 80 + index * 170,
      y: 90 + index * 70
    }));
    const sampleConnections = [
      {
        id: "sample-red-to-yellow",
        from: "sample-red",
        to: "sample-yellow"
      },
      {
        id: "sample-yellow-to-green",
        from: "sample-yellow",
        to: "sample-green"
      }
    ];

    setBlocks(sample);
    setConnections(sampleConnections);
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
        position: {
          x: block.x,
          y: block.y
        },
        size: {
          width: BLOCK_WIDTH,
          height: BLOCK_HEIGHT
        }
      }));
    const visibleConnections = connections.filter(
      (connection) => visibleBlockIds.has(connection.from) && visibleBlockIds.has(connection.to)
    );

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

                return (
                  <path
                    key={connection.id}
                    className="connection-path"
                    d={makeConnectorPath(outputPoint(from), inputPoint(to))}
                  />
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
                  className="block"
                  data-block-id={block.id}
                  style={{
                    left: block.x,
                    top: block.y,
                    "--block-color": block.color
                  }}
                  onPointerDown={(event) => beginBlockDrag(event, block)}
                >
                  <span className="port port-in" data-input-port={block.id} aria-hidden="true" />
                  <span className="block-label">{block.label}</span>
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
