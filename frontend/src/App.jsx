import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCcw, X } from "lucide-react";

const BLOCK_WIDTH = 148;
const BLOCK_HEIGHT = 72;
const STORAGE_KEY = "simple-block-board-state";

const BLOCK_TYPES = [
  { id: "red", label: "Red block", color: "#ff8a7a" },
  { id: "yellow", label: "Yellow block", color: "#ffd166" },
  { id: "green", label: "Green block", color: "#74d3ae" },
  { id: "blue", label: "Blue block", color: "#8fb8ff" },
  { id: "purple", label: "Purple block", color: "#d7a8ff" }
];

const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((type) => [type.id, type]));

function loadBlocks() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function App() {
  const boardRef = useRef(null);
  const blockDragRef = useRef(null);
  const paletteDragRef = useRef(null);
  const [blocks, setBlocks] = useState(loadBlocks);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [paletteDrag, setPaletteDrag] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  }, [blocks]);

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

  function clearBoard() {
    setBlocks([]);
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

    setBlocks(sample);
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
          <div
            ref={boardRef}
            className={`board${dropActive ? " is-drop-target" : ""}`}
            tabIndex={0}
            aria-label="Drag and drop board"
          >
            <div className="block-layer">
              {blocks.map((block) => (
                <button
                  type="button"
                  key={block.id}
                  className="block"
                  style={{
                    left: block.x,
                    top: block.y,
                    "--block-color": block.color
                  }}
                  onPointerDown={(event) => beginBlockDrag(event, block)}
                >
                  {block.label}
                </button>
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

export default App;
