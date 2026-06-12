//each costume node need to be defined in their own file 
//Our host node will have a circle shape with 5 handles to connect to each block 

import React from 'react';
import { Handle, Position } from '@xyflow/react';
const circleHandleStyle = (angleDeg, color) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    background: color,
    left: `${(50 + 50 * Math.sin(rad)).toFixed(1)}%`,
    top:  `${(50 - 50 * Math.cos(rad)).toFixed(1)}%`,
    transform: 'translate(-50%, -50%)',
  };
};

const HostNode = ({data}) => {//this mkaes this costumized node a recat compunent we can use in our code 
    return (
        <div style={{
         width:100,
         height:100,
         borderRadius: '50%',//will make it a circle 
         backgroundColor :'#6fbff8',   
         display: 'flex',
         alignItems: 'center',
         justifyContent: 'center',
         color: 'white',
         fontWeight: 'bold',
         textAlign:"center",
         fontSize: '15px'
        }}>
        {data.label}
      <Handle id="host-subnet"  type="target" position={Position.Top}   style={circleHandleStyle(0,   '#2241e0')} />
      <Handle id="host-service" type="target" position={Position.Right}  style={circleHandleStyle(72,  '#0da319')} />
      <Handle id="host-file"    type="target" position={Position.Bottom} style={circleHandleStyle(144, '#737572')} />
      <Handle id="host-router"  type="target" position={Position.Bottom} style={circleHandleStyle(216, '#6b77be')} />
      <Handle id="host-user"    type="target" position={Position.Left}   style={circleHandleStyle(288, '#c8b800')} />
        </div>
    );
};
export default HostNode 