
import './App.css'
import { ReactFlow, Background, Controls, applyNodeChanges } from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState } from 'react'; //so we can manage the taps and switch between them 
//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service"];
const Ablocks = ["Agent", "Tool"];
const [files , setFiles] = useState([]); //this will allow us to manage the state of the files that we have uploaded, we will use this to show the list of files in the sidebar 
const [activeId, setActiveId] = useState(null); //this will allow us to manage the state of the active file, we will use this to switch between different files and show different content based on the active file
const [menuOpen, setMenuOpen] = useState(false);// to choose which tab we want 
const activeFile = files.find((f) => f.id === activeId);
const nodes = activeFile ? activeFile.nodes : []; //this will get the nodes of the active file, if there is no active file it will return an empty array, we will use this to show the nodes on the canvas based on the active file
//const [nodes, setNodes, onNodesChange] = useNodesState([]); //from react flow that allows us to manage the state of our nodes in the canvas, we will use this to add and remove nodes from the canvas
const blocks = activeFile?.type === "attacker" ? Ablocks : Eblocks;
//const blocks = activeTap === "System" ? Eblocks : Ablocks;
//when we drag and drop we store the value of blocks into state and we return then after droping them 
//anything above the return are out state and helper functions and cacluated values that we will use in our app, 
//anything inside the return is what we will render on the page
const newFile = (type) => {
  const count = files.filter((f) => f.type === type).length + 1;
  const name = (type === "environment" ? "Env " : "Attacker ") + count;
  const file = { id: crypto.randomUUID(), name, type, nodes: [] };
  setFiles((current) => [...current, file]);
  setActiveId(file.id);
  setMenuOpen(false);
};
//this help us write the changes made to the canves back to the file and change between canveses 
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
return ( 
<> 
      <div className="App">
      Cyblokcs
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
        {/*This part is mostly repsosnable for teh drag and drop functionality on canves with React Flow*/}
        <ReactFlow nodes={nodes}  onNodesChange={(changes) => setActiveNodes((nds) => applyNodeChanges(changes, nds))} defaultEdges={[]} 
        onDragOver={(event) => event.preventDefault()} //this will allow us to drop elements on the canvas, by default the browser does not allow dropping elements on a page, so we need to prevent the default behavior
        onDrop ={(event) => {
          event.preventDefault(); //this will prevent the default behavior of the browser when dropping an element, which is to open the element in a new tab
          const name = event.dataTransfer.getData("application/reactflow"); //this will get the data that we set when we started dragging the block, which is the name of the block
          const bounds = event.currentTarget.getBoundingClientRect();
          const position = { x: event.clientX - bounds.left, y:event.clientY - bounds.top };// need to calculate the position of the node based on the position of the mouse and the position of the canvas, because the position of the mouse is relative to the entire page, but we need the position of the node to be relative to the canvas
          const newNode = {//the new node that we will add to the canvas, it needs to have an id, a position and some data, we will use the name of the block as the label of the node
          id: crypto.randomUUID(),
          position, 
          data: { label: name } 
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
