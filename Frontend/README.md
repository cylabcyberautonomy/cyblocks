# Cyblocks - Frontend deliverables   

Week 2 Progress Description: A simple drag-and-drop IDE for designing agentic cybersecurity systems. Drag
blocks from the sidebar onto the canvas, pan and zoom, and switch between Environment and Attacker modes from the File menu.


Week 3 Progress Descreption:
**Block Properties and Connection logic**
Added editable properties to blocks and connection logic does allow for differnt type of connction and prevent illiage connections like (service <-> router)

**Compilation flow**
The current flow of compilations is to build a flat environment list file that conatin all our blocks and connections on the canves and using that list to compile a file that works with a docker structure. 

This compilation design choise allowes us to reuse the flat environment to compile to different target structure we migh want to add in the future.

## Built with 

This Frontend was built with:


**React** - Because it can build UI that has reusable components 

**Vite** - Because it is a fast dev server and building tool

**React Flow** - Because it provides draggable, zoomable node canvas
 



## Set up and run 


To run this code you have to install
- Node.js (LTS version)

Then run 
​```
npm install
npm run dev
​```


Then open http://localhost:5173 in your browser.



