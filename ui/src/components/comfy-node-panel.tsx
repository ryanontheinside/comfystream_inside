"use client";

import React, { useState, useEffect } from "react";
import { usePeerContext } from "@/context/peer-context";
import { ChevronDown, ChevronRight } from "lucide-react"; // Assuming you use lucide-react for icons

interface InputInfo {
  value: any;
  type: string;
  min?: number;
  max?: number;
  widget?: string;
}

interface NodeInfo {
  class_type: string;
  inputs: Record<string, InputInfo>;
}

const NodeInput = ({
  label,
  input,
  value,
  onChange,
}: {
  label: string;
  input: InputInfo;
  value: string;
  onChange: (value: string) => void;
}) => {
  // Handle input connections (non-widget inputs)
  if (typeof input.type === 'string' && !input.widget && 
      !["number", "float", "int", "boolean", "string"].includes(input.type.toLowerCase())) {
    return (
      <div className="flex items-center gap-2 p-2">
        <div className="w-3 h-3 rounded-full bg-purple-500" /> {/* Connection dot */}
        <label className="text-gray-300">{label}</label>
        <span className="text-gray-500 text-sm ml-auto">{input.type}</span>
      </div>
    );
  }

  // Handle combo widget
  if (input.widget === "combo") {
    return (
      <div className="flex items-center gap-2 p-2">
        <label className="text-gray-300 min-w-[120px]">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-[#444] text-white p-1 rounded border border-[#666] focus:border-[#888] focus:outline-none"
        >
          {Array.isArray(input.value) && input.value.map((option: string) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }

  // Handle case where type is an array (like for LoRA options)
  if (Array.isArray(input.type)) {
    return (
      <div className="flex items-center gap-2 p-2">
        <label className="text-gray-300 min-w-[120px]">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-[#444] text-white p-1 rounded border border-[#666] focus:border-[#888] focus:outline-none"
        >
          {input.type.map((option: string) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }

  // Handle boolean toggle
  if (input.type === "boolean") {
    return (
      <div className="flex items-center gap-2 p-2">
        <label className="text-gray-300 flex-1">{label}</label>
        <div 
          className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${
            value === "true" ? "bg-blue-500" : "bg-[#444]"
          }`}
          onClick={() => onChange((value !== "true").toString())}
        >
          <div 
            className={`w-4 h-4 rounded-full bg-white transition-transform ${
              value === "true" ? "translate-x-6" : ""
            }`}
          />
        </div>
      </div>
    );
  }

  // Handle number inputs - with type safety check
  const inputTypeStr = typeof input.type === 'string' ? input.type.toLowerCase() : '';
  if (["number", "float", "int"].includes(inputTypeStr)) {
    return (
      <div className="flex items-center gap-2 p-2">
        <label className="text-gray-300 min-w-[120px]">{label}</label>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={input.min}
          max={input.max}
          step={inputTypeStr === "int" ? "1" : "0.1"}
          className="flex-1 bg-[#444] text-white p-1 rounded border border-[#666] focus:border-[#888] focus:outline-none"
        />
      </div>
    );
  }

  // Default text input
  return (
    <div className="flex items-center gap-2 p-2">
      <label className="text-gray-300 min-w-[120px]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-[#444] text-white p-1 rounded border border-[#666] focus:border-[#888] focus:outline-none"
      />
    </div>
  );
};

export const ComfyNodePanel = () => {
  const { controlChannel } = usePeerContext();
  const [selectedNode, setSelectedNode] = useState("");
  const [nodeValues, setNodeValues] = useState<Record<string, string>>({});
  const [availableNodes, setAvailableNodes] = useState<Record<string, NodeInfo>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useState(true);

  // Fetch available nodes
  useEffect(() => {
    if (controlChannel) {
      controlChannel.send(JSON.stringify({ type: "get_nodes" }));
      
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "nodes_info") {
            setAvailableNodes(data.nodes);
            // Initialize values for the first node
            if (Object.keys(data.nodes).length > 0) {
              const firstNodeId = Object.keys(data.nodes)[0];
              setSelectedNode(firstNodeId);
              initializeNodeValues(firstNodeId, data.nodes[firstNodeId]);
            }
          }
        } catch (error) {
          console.error("[ComfyNodePanel] Error parsing node info:", error);
        }
      };

      controlChannel.addEventListener("message", handleMessage);
      return () => controlChannel.removeEventListener("message", handleMessage);
    }
  }, [controlChannel]);

  const initializeNodeValues = (nodeId: string, nodeInfo: NodeInfo) => {
    const initialValues: Record<string, string> = {};
    Object.entries(nodeInfo.inputs).forEach(([field, info]) => {
      initialValues[field] = info.value?.toString() || "0";
    });
    setNodeValues(initialValues);
  };

  const handleValueChange = (field: string, value: string) => {
    setNodeValues(prev => ({ ...prev, [field]: value }));
    
    if (isAutoUpdateEnabled && controlChannel) {
      controlChannel.send(JSON.stringify({
        node_id: selectedNode,
        field_name: field,
        value: value,
      }));
    }
  };

  if (!selectedNode || Object.keys(availableNodes).length === 0) {
    return null;
  }

  const currentNode = availableNodes[selectedNode];

  return (
    <div className="bg-[#2b2b2b] rounded-lg overflow-hidden shadow-lg w-[300px]">
      {/* Node Header */}
      <div className="bg-[#444] p-2 flex items-center justify-between cursor-pointer"
           onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-center gap-2">
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <h3 className="text-white font-medium">{currentNode.class_type}</h3>
        </div>
      </div>

      {/* Node Content */}
      {!isCollapsed && (
        <div className="p-2">
          {Object.entries(currentNode.inputs).map(([field, info]) => (
            <NodeInput
              key={field}
              label={field}
              input={info}
              value={nodeValues[field] || ""}
              onChange={(value) => handleValueChange(field, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}; 