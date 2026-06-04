
import './App.css'
import { ReactFlow, Background, Controls, useNodesState } from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState } from 'react'; //so we can manage the taps and switch between them 
//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service"];
const Ablocks = ["Agent", "Tool"];
const [nodes, setNodes, onNodesChange] = useNodesState([]); //from react flow that allows us to manage the state of our nodes in the canvas, we will use this to add and remove nodes from the canvas
const [activeTap, setActiveTap] = useState("System"); //this will allow us to manage the state of the active tap, we will use this to switch between different taps and show different content based on the active tap
const [menuOpen, setMenuOpen] = useState(false);// to choose which tab we want 
const blocks = activeTap === "System" ? Eblocks : Ablocks;
//when we drag and drop we store the value of blocks into state and we return then after droping them 
return ( 
<> 
      <div className="App">
        Cyblocks
    <div className="Tapbar">
      <button onClick={() => setMenuOpen(!menuOpen)}>File</button>
      {menuOpen && (
        <div className="Menu">
        <button onClick={() => { setActiveTap("System"); setMenuOpen(false); }}>Environment</button>
        <button onClick={() => { setActiveTap("attacker"); setMenuOpen(false); }}>Attacker</button> 
          </div>
      )}
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
        <ReactFlow nodes={nodes} onNodesChange={onNodesChange} defaultEdges={[]} 
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
          setNodes((current) => [...current, newNode]);
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
