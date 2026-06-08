
import './App.css'
import { ReactFlow, Background, Controls, applyNodeChanges , addEdge ,applyEdgeChanges} from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState } from 'react'; //so we can manage the taps and switch between them 
//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service", "Vulnerability", "Misconfiguration", "Subnet"];
const Ablocks = ["Agent", "Tool"];
//Adding properties for for each block 
const blockProperties = {
  Host: { name: "", image: "", RAM: "", disk: "", IP: "", subnet_name: "", subnetID: "" },
  Router: { name: "", image: "", subnet_name: "", subnetID: "" },
  Service: { name:"", Type: "", protocol: "", port: "", version: "" },
  Vulnerability: { Type: "", CVE: "", Description: "", severity: "" },
  Misconfiguration: { name: "", Description: "" },
  Subnet: { name: "", CIDR: "" },// CIDER is a notation for describing IP address ranges
};



//we need the first laod of the page to open an environment tap  so people acn drag and drop 
const initialFile = { id: crypto.randomUUID(), name: "Env 1", type: "environment", nodes: [], edges: [] };
const [panelPos, setPanelPos] = useState({ x: 320, y: 80 });
const [dragging, setDragging] = useState(false);
const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
const [files , setFiles] = useState([initialFile]); //this will allow us to manage the state of the files that we have uploaded, we will use this to show the list of files in the sidebar 
const [activeId, setActiveId] = useState(initialFile.id); //this will allow us to manage the state of the active file, we will use this to switch between different files and show different content based on the active file
const [menuOpen, setMenuOpen] = useState(false);// to choose which tab we want 
const [selectedId, setSelectedId] = useState(null);
const activeFile = files.find((f) => f.id === activeId);
const nodes = activeFile ? activeFile.nodes : []; //this will get the nodes of the active file, if there is no active file it will return an empty array, we will use this to show the nodes on the canvas based on the active file
const selectedNode = nodes.find((n) => n.id === selectedId);
const edges = activeFile ? activeFile.edges : [];
const [dialog, setDialog] = useState(null); //state of the popup window for connction type 
//a helper function to help write any changes made to edge back to file 
const setActiveEdges = (updater) => {
  setFiles((files) => files.map((f) =>
    f.id === activeId ? { ...f, edges: updater(f.edges) } : f
  ));
};
//const [nodes, setNodes, onNodesChange] = useNodesState([]); //from react flow that allows us to manage the state of our nodes in the canvas, we will use this to add and remove nodes from the canvas
const blocks = activeFile?.type === "attacker" ? Ablocks : Eblocks;
//const blocks = activeTap === "System" ? Eblocks : Ablocks;
//when we drag and drop we store the value of blocks into state and we return then after droping them 
//anything above the return are out state and helper functions and cacluated values that we will use in our app, 
//anything inside the return is what we will render on the page
const newFile = (type) => {
  const count = files.filter((f) => f.type === type).length + 1;
  const name = (type === "environment" ? "Env " : "Attacker ") + count;
  const file = { id: crypto.randomUUID(), name, type, nodes: [], edges: [] };
  setFiles((current) => [...current, file]);
  setActiveId(file.id);
  setMenuOpen(false);
};
//this help us write the changes made to the canves back to the file and change between canveses and tabs
const setActiveNodes = (updater) => {
  setFiles((files) => files.map((f) =>
    f.id === activeId ? { ...f, nodes: updater(f.nodes) } : f
  ));
};
//for us to close any env or attacker tap we close a file 
const closeFile = (id) => {
  setFiles((current) => current.filter((f) => f.id !== id));
  if (activeId === id) setActiveId(null);//delete the active file and set the active id to null if we closed the active file
};


const updateNodeProperty = (nodeId, key, value) => {
  setActiveNodes((nds) => nds.map((n) =>
    n.id === nodeId
      ? { ...n, data: { ...n.data, properties: { ...n.data.properties, [key]: value } } }
      : n
  ));
};

//need a button where we can delete a specific node 
const deleteSelectedNode = () => {
  if (!selectedId) return;

  setActiveNodes((nds) =>
    nds.filter((node) => node.id !== selectedId)
  );

  setActiveEdges((eds) =>
    eds.filter((edge) =>
      edge.source !== selectedId && edge.target !== selectedId
    )
  );

  setSelectedId(null);
};

//THIS WILL NEED TO BE UPDATED IN THE FUTURE 
const onConnect = (connection) => {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  const result = connectionKind(source.data.blockType, target.data.blockType);
  if (result.status === "invalid") {
    setDialog({ kind: "invalid", reason: result.reason });
  } else if (result.status === "ambiguous") {
    setDialog({ kind: "ambiguous", connection });
  } else {
    setActiveEdges((eds) => addEdge(connection, eds));   // valid: add it, no stored kind (derived later)
  }
};
//a helper function to handles all types of edge connections 
//this function expect direcional correct so if we want to connect host to router it should start from host and be connected to router 
//I NEED TO ADD A REVERSE RULE SO THE CONNECTIONS WORK NO MATER WHERE YOU START THE CONNCTION FROM 
//WILL BE CHANGED 
const connectionKind = (sourceType, targetType) => {
  if (sourceType === "Service" && targetType === "Host")
    return { status: "valid", type: "service" };
  if ((sourceType === "Vulnerability" || sourceType === "Misconfiguration") && targetType === "Service")
    return { status: "valid", type: "vulnerability" };
  if (sourceType === "Host" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Host" && targetType === "Host")
    return { status: "ambiguous" };
  if (sourceType === "Host" && targetType === "Subnet")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Subnet")
    return { status: "valid", type: "topology" }; 
  if (sourceType === "Subnet" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Subnet" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Host" && targetType === "Service")
    return { status: "valid", type: "service" };
  if (sourceType === "Service" && (targetType === "Vulnerability" || targetType === "Misconfiguration"))
    return { status: "valid", type: "vulnerability" };
  return { status: "invalid", reason: `A ${sourceType} can't connect to a ${targetType}.` };
};
//Compile the current canves file into a JSON file that can be used in the backend to prodcue a DSL 

return ( 
<> 
      <div className="App">
      Cyblocks 
      {selectedNode && (
  <div className="Inspector" style={{ left: panelPos.x, top: panelPos.y }}>
    <div
      className="InspectorHeader"
      onPointerDown={(e) => {
        setDragging(true);
        setDragStart({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging) setPanelPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }}
      onPointerUp={(e) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <span>{selectedNode.data.blockType}</span>
{/* This is the header of the inspector panel, it will show the type of the selected node and a close button, we also added the functionality to drag the panel around the screen by clicking and dragging the header */}
<button
  onPointerDown={(e) => e.stopPropagation()}
  onClick={() => setSelectedId(null)}
>x</button>    </div>
    <div className="InspectorBody">
      <button onClick={deleteSelectedNode}>
  Delete block
      </button>
      {Object.keys(selectedNode.data.properties || {}).map((key) => (
        <div key={key}>
          <label>{key}</label>
          <input
            value={selectedNode.data.properties[key]}
            onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
          />
        </div>
      ))}
    </div>
  </div>
)}
      {dialog && (
  <div className="Dialog">
    {dialog.kind === "invalid" && (
      <>
        <p>Invalid connection: {dialog.reason}</p>
        <button onClick={() => setDialog(null)}>OK</button>
      </>
    )}
    {dialog.kind === "ambiguous" && (
      <>
        <p>What kind of connection is this?</p>
        <button onClick={() => {
          setActiveEdges((eds) => addEdge({ ...dialog.connection, data: { kind: "topology" } }, eds));
          setDialog(null);
        }}>Topology</button>
        <button onClick={() => {
          setActiveEdges((eds) => addEdge({ ...dialog.connection, data: { kind: "access" } }, eds));
          setDialog(null);
        }}>Access</button>
      </>
    )}
  </div>
)}
    <div className="Tapbar">
      <button onClick={() => setMenuOpen(!menuOpen)}>File</button>
      {menuOpen && (
        <div className="Menu">
        <button onClick={() => { newFile("environment")}}>Environment</button>
        <button onClick={() => { newFile("attacker");}}>Attacker</button> 
          </div>
      )}
    <button onClick={() => setActiveNodes(() => [])}>Clear canvas</button>
    </div>
     <div className="Toolbar">
        {/* so each tap gets its own tab */}
        {files.map((file) => (
        <div key={file.id} className="Tab">
        <button onClick={() => setActiveId(file.id)}>{file.name}</button>
        <button onClick={() => closeFile(file.id)}>x</button>
         </div>
        ))}
      </div>
    <div className="Main">

        <div className="Sidebar">
        Blocks
      {/*This will render a list of blocks in the sidebar,  react needs a key for each element in a list so we can track which elements have changed, been added or removed */}
        {blocks.map((block) => (
          <div key={block} className="Block" draggable onDragStart={(event) => {
            event.dataTransfer.setData("application/reactflow", block); //this will set the data that we will use to identify which block is being dragged, we will use this data to add the correct node to the canvas when the block is dropped
          }}>
            {block}
          </div>
        ))}
        </div>
        <div className="Canvas">
        Design Canvas
        {/*This part is mostly repsosnable for the drag and drop functionality on canves with React Flow*/}
        <ReactFlow nodes={nodes}  
        onNodesChange={(changes) => setActiveNodes((nds) => applyNodeChanges(changes, nds))} 
        edges={edges}
        onEdgesChange={(changes) => setActiveEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={onConnect}
        onNodeClick={(event, node) => setSelectedId(node.id)}
        onDragOver={(event) => event.preventDefault()} //this will allow us to drop elements on the canvas, by default the browser does not allow dropping elements on a page, so we need to prevent the default behavior
        onDrop ={(event) => {
          event.preventDefault(); //this will prevent the default behavior of the browser when dropping an element, which is to open the element in a new tab
          const name = event.dataTransfer.getData("application/reactflow"); //this will get the data that we set when we started dragging the block, which is the name of the block
          const bounds = event.currentTarget.getBoundingClientRect();
          const position = { x: event.clientX - bounds.left, y:event.clientY - bounds.top };// need to calculate the position of the node based on the position of the mouse and the position of the canvas, because the position of the mouse is relative to the entire page, but we need the position of the node to be relative to the canvas
          const newNode = {//the new node that we will add to the canvas, it needs to have an id, a position and some data, we will use the name of the block as the label of the node
          id: crypto.randomUUID(),
          position, 
          data:  { label: name, blockType: name, properties: { ...blockProperties[name] } }//start stating the block type to help determine the kind of connection we have 
          };
          setActiveNodes((current) => [...current, newNode]);
        }}
        >
          {/*This is the main canvas where we will add our nodes and edges, we will use the react flow library to handle the canvas and its functionality like zooming, panning and connecting nodes*/}
          {/*This will add a background to our canvas, we will customize in later steps*/}
          <Background />
          {/*This will add controls to our canvas like zooming and panning, we will customize in later steps*/}
          <Controls />
          </ReactFlow>
        </div>

      </div>
    </div>
    </>
  )
}

export default App
