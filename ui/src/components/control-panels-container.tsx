"use client";

import React, { useState, useEffect, useRef } from "react";
import { ControlPanel } from "./control-panel";
import { Button } from "./ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "./ui/drawer";
import { Settings } from "lucide-react";
import { Plus } from "lucide-react"; // Import Plus icon for minimal add button
import { usePeerContext } from "@/context/peer-context";
import { usePrompt } from "./settings";

interface ControllerMapping {
  inputIndex: number;
  isAxis: boolean;
  multiplier?: number;
}

interface NodeMappings {
  [nodeId: string]: {
    [fieldName: string]: ControllerMapping;
  };
}

export const ControlPanelsContainer = () => {
  const { controlChannel } = usePeerContext();
  const { currentPrompts, setCurrentPrompts } = usePrompt();
  const [panels, setPanels] = useState<number[]>([0]); // Start with one panel
  const [nextPanelId, setNextPanelId] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [controllerMappings, setControllerMappings] = useState<NodeMappings>({});
  const [availableNodes, setAvailableNodes] = useState<Record<string, any>>({});
  const [isToggled, setIsToggled] = useState<Record<string, Record<string, boolean>>>({});
  const [lastToggleValues, setLastToggleValues] = useState<Record<string, Record<string, string>>>({});
  const lastSentValueRef = useRef<{
    nodeId: string;
    fieldName: string;
    value: any;
  } | null>(null);
  
  const [panelStates, setPanelStates] = useState<
    Record<
      number,
      {
        nodeId: string;
        fieldName: string;
        value: string;
        isAutoUpdateEnabled: boolean;
      }
    >
  >({
    0: {
      nodeId: "",
      fieldName: "",
      value: "0",
      isAutoUpdateEnabled: false,
    },
  });

  // Load controller mappings from localStorage on component mount
  useEffect(() => {
    const savedMappings = localStorage.getItem('controllerMappings');
    if (savedMappings) {
      try {
        setControllerMappings(JSON.parse(savedMappings));
      } catch (error) {
        console.error('Failed to parse saved controller mappings:', error);
      }
    }
    
    // Load last toggle values
    const savedToggleValues = localStorage.getItem('lastToggleValues');
    if (savedToggleValues) {
      try {
        setLastToggleValues(JSON.parse(savedToggleValues));
      } catch (error) {
        console.error('Failed to parse saved toggle values:', error);
      }
    }
  }, []);

  // Save controller mappings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('controllerMappings', JSON.stringify(controllerMappings));
  }, [controllerMappings]);
  
  // Save last toggle values to localStorage
  useEffect(() => {
    localStorage.setItem('lastToggleValues', JSON.stringify(lastToggleValues));
  }, [lastToggleValues]);

  // Fetch available nodes
  useEffect(() => {
    if (controlChannel) {
      controlChannel.send(JSON.stringify({ type: "get_nodes" }));

      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "nodes_info") {
            setAvailableNodes(data.nodes);
          }
        } catch (error) {
          console.error("[ControlPanelsContainer] Error parsing node info:", error);
        }
      };

      controlChannel.addEventListener("message", handleMessage);
      return () => {
        controlChannel.removeEventListener("message", handleMessage);
      };
    }
  }, [controlChannel]);

  // Controller polling logic that runs even when the panel is closed
  useEffect(() => {
    const pollController = () => {
      const pads = navigator.getGamepads();
      
      // For each active panel
      Object.values(panelStates).forEach(panelState => {
        if (!panelState.isAutoUpdateEnabled || !panelState.nodeId || !panelState.fieldName) {
          return;
        }
        
        const currentMapping = controllerMappings[panelState.nodeId]?.[panelState.fieldName];
        const currentInput = availableNodes[panelState.nodeId]?.inputs[panelState.fieldName];
        
        if (!currentMapping || !currentInput) {
          return;
        }
        
        for (const pad of pads) {
          if (!pad) continue;
          
          const min = currentInput.min ?? 0;
          const max = currentInput.max ?? 1;
          
          if (currentMapping.isAxis) {
            const rawValue = currentMapping.inputIndex < pad.axes.length
              ? pad.axes[currentMapping.inputIndex]
              : pad.buttons[currentMapping.inputIndex]?.value || 0;
              
            const normalizedValue = (rawValue + 1) / 2;
            const scaledValue = min + (max - min) * normalizedValue;
            const clampedValue = Math.max(min, Math.min(max, scaledValue));
            
            const newValue = currentInput.type.toLowerCase() === "number"
              ? clampedValue.toFixed(2)
              : clampedValue.toString();
              
            if (Math.abs(parseFloat(newValue) - parseFloat(panelState.value)) > 0.01) {
              updateNodeValue(panelState.nodeId, panelState.fieldName, newValue);
            }
          } else {
            // For button inputs (toggle behavior)
            const button = pad.buttons[currentMapping.inputIndex];
            const nodeToggledState = isToggled[panelState.nodeId]?.[panelState.fieldName] || false;
            
            if (button && button.value > 0.1 && !nodeToggledState) {
              // Initialize nested objects if they don't exist
              if (!isToggled[panelState.nodeId]) {
                setIsToggled(prev => ({ ...prev, [panelState.nodeId]: {} }));
              }
              
              if (!lastToggleValues[panelState.nodeId]) {
                setLastToggleValues(prev => ({ ...prev, [panelState.nodeId]: {} }));
              }
              
              const lastValue = lastToggleValues[panelState.nodeId]?.[panelState.fieldName] || max.toString();
              const targetValue = panelState.value !== "0" ? panelState.value : lastValue;
              
              setIsToggled(prev => ({
                ...prev,
                [panelState.nodeId]: {
                  ...(prev[panelState.nodeId] || {}),
                  [panelState.fieldName]: true
                }
              }));
              
              updateNodeValue(panelState.nodeId, panelState.fieldName, targetValue);
            } else if (button && button.value <= 0.1 && nodeToggledState) {
              setIsToggled(prev => ({
                ...prev,
                [panelState.nodeId]: {
                  ...(prev[panelState.nodeId] || {}),
                  [panelState.fieldName]: false
                }
              }));
              
              updateNodeValue(panelState.nodeId, panelState.fieldName, "0");
            }
          }
        }
      });
    };
    
    const interval = setInterval(pollController, 50);
    return () => clearInterval(interval);
  }, [panelStates, controllerMappings, availableNodes, isToggled, lastToggleValues, controlChannel]);
  
  // Function to update node value and send to server
  const updateNodeValue = (nodeId: string, fieldName: string, value: string) => {
    // Update panel state if this node/field is currently displayed in a panel
    Object.entries(panelStates).forEach(([id, state]) => {
      if (state.nodeId === nodeId && state.fieldName === fieldName) {
        updatePanelState(parseInt(id), { value });
      }
    });
    
    // Store last toggle value if this is a button
    const mapping = controllerMappings[nodeId]?.[fieldName];
    if (mapping && !mapping.isAxis && value !== "0") {
      setLastToggleValues(prev => ({
        ...prev,
        [nodeId]: {
          ...(prev[nodeId] || {}),
          [fieldName]: value
        }
      }));
    }
    
    // Send update to server
    if (controlChannel && currentPrompts && currentPrompts.length > 0) {
      const currentPrompt = currentPrompts[0];
      const updatedPrompt = JSON.parse(JSON.stringify(currentPrompt));
      
      if (updatedPrompt[nodeId] && updatedPrompt[nodeId].inputs) {
        const processedValue = 
          availableNodes[nodeId]?.inputs[fieldName]?.type.toLowerCase() === "number" 
            ? parseFloat(value)
            : availableNodes[nodeId]?.inputs[fieldName]?.type.toLowerCase() === "boolean"
              ? value === "true"
              : value;
              
        updatedPrompt[nodeId].inputs[fieldName] = processedValue;
        
        lastSentValueRef.current = {
          nodeId,
          fieldName,
          value: processedValue,
        };
        
        const message = JSON.stringify({
          type: "update_prompts",
          prompts: [updatedPrompt],
        });
        
        controlChannel.send(message);
        setCurrentPrompts([updatedPrompt]);
      }
    }
  };

  const addPanel = () => {
    const newId = nextPanelId;
    setPanels([...panels, newId]);
    setPanelStates((prev) => ({
      ...prev,
      [newId]: {
        nodeId: "",
        fieldName: "",
        value: "0",
        isAutoUpdateEnabled: false,
      },
    }));
    setNextPanelId(nextPanelId + 1);
  };

  const removePanel = (id: number) => {
    setPanels(panels.filter((panelId) => panelId !== id));
    setPanelStates((prev) => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  };

  const updatePanelState = (
    id: number,
    state: Partial<(typeof panelStates)[number]>,
  ) => {
    setPanelStates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...state,
      },
    }));
  };

  const updateControllerMapping = (
    nodeId: string,
    fieldName: string,
    mapping: ControllerMapping
  ) => {
    setControllerMappings(prev => {
      const newMappings = { ...prev };
      if (!newMappings[nodeId]) {
        newMappings[nodeId] = {};
      }
      newMappings[nodeId][fieldName] = mapping;
      return newMappings;
    });
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 h-12 w-12 rounded-full p-0 shadow-lg hover:shadow-xl transition-shadow"
        variant="default"
      >
        <Settings className="h-6 w-6" />
      </Button>

      <Drawer
        open={isOpen}
        onOpenChange={setIsOpen}
        direction="bottom"
        shouldScaleBackground={false}
      >
        {/* This is a hack to remove the background color of the overlay so the screen is not dimmed when the drawer is open */}
        <style>
          {`
            [data-vaul-overlay] {
              background-color: transparent !important;
              background: transparent !important;
            }
            
            /* Custom scrollbar styling */
            #control-panel-drawer ::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            
            #control-panel-drawer ::-webkit-scrollbar-track {
              background: transparent;
            }
            
            #control-panel-drawer ::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 4px;
            }
            
            #control-panel-drawer ::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
          `}
        </style>
        <DrawerContent
          id="control-panel-drawer"
          className="max-h-[50vh] min-h-[200px] bg-background/90 backdrop-blur-md border-t shadow-lg overflow-hidden"
        >
          <DrawerTitle className="sr-only">Control Panels</DrawerTitle>

          <div className="flex h-full">
            {/* Left side add button */}
            <div className="w-12 border-r flex items-start pt-4 justify-center bg-background/50">
              <Button
                onClick={addPanel}
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md bg-blue-500 hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm hover:shadow text-white"
                title="Add control panel"
                aria-label="Add control panel"
                data-tooltip="Add control panel"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Control panels container */}
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-4 p-4 min-h-0">
                {panels.map((id) => (
                  <div
                    key={id}
                    className="flex-none w-80 border rounded-lg bg-white/95 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col max-h-[calc(50vh-3rem)]"
                  >
                    <div className="flex justify-between items-center p-2 border-b bg-gray-50/80">
                      <span className="font-medium">
                        Control Panel {id + 1}
                      </span>
                      <Button
                        onClick={() => removePanel(id)}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 rounded-full p-0 hover:bg-gray-200/80 transition-colors"
                      >
                        <span className="text-sm">×</span>
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <ControlPanel
                        panelState={panelStates[id]}
                        onStateChange={(state) => updatePanelState(id, state)}
                        controllerMappings={controllerMappings}
                        onMappingChange={updateControllerMapping}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};
