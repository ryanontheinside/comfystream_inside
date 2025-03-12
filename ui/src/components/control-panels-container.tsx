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
  usePromptList?: boolean;  // Whether to use the hard-coded prompt list
  promptIndex?: number;     // Current index in the prompt list
  useDpad?: boolean;        // Whether to use D-pad for increment/decrement
  dpadMode?: 'updown' | 'leftright'; // Which D-pad axis to use
  incrementValue?: number;  // Value to increment/decrement by
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
  
  // Add state for prompt list management
  const [promptList, setPromptList] = useState<string[]>([
    "an abstract masterpiece trippy flowing orbs",
    "Beautiful landscape with mountains and lakes",
    "Portrait of a person in cyberpunk style",
    "Futuristic city with flying cars",
    "Fantasy castle with dragons",
    "Steampunk machinery with gears and pipes"
  ]);
  const [isPromptListOpen, setIsPromptListOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  
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

  // Add reference for trigger states
  const triggerStatesRef = useRef<{
    leftPressed: Record<string, Record<string, boolean>>;
    rightPressed: Record<string, Record<string, boolean>>;
  }>({
    leftPressed: {},
    rightPressed: {}
  });

  // Add reference for D-pad button states
  const dpadStatesRef = useRef<{
    up: Record<string, Record<string, boolean>>;
    down: Record<string, Record<string, boolean>>;
    left: Record<string, Record<string, boolean>>;
    right: Record<string, Record<string, boolean>>;
  }>({
    up: {},
    down: {},
    left: {},
    right: {}
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

  // Add useEffect to load and save the promptList
  useEffect(() => {
    const savedPromptList = localStorage.getItem('promptList');
    if (savedPromptList) {
      try {
        setPromptList(JSON.parse(savedPromptList));
      } catch (error) {
        console.error('Failed to parse saved prompt list:', error);
      }
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem('promptList', JSON.stringify(promptList));
  }, [promptList]);

  // Controller polling logic that runs even when the panel is closed
  useEffect(() => {
    const pollController = () => {
      const pads = navigator.getGamepads();
      
      // For each active panel
      Object.values(panelStates).forEach(panelState => {
        if (!panelState.nodeId || !panelState.fieldName) {
          return;
        }
        
        const currentMapping = controllerMappings[panelState.nodeId]?.[panelState.fieldName];
        const currentInput = availableNodes[panelState.nodeId]?.inputs[panelState.fieldName];
        
        if (!currentMapping || !currentInput) {
          return;
        }
        
        for (const pad of pads) {
          if (!pad) continue;
          
          // Handle D-pad for numeric inputs
          if (currentMapping.useDpad && 
              (currentInput.type?.toLowerCase() === "number" || 
               currentInput.type?.toLowerCase() === "float" || 
               currentInput.type?.toLowerCase() === "int")) {
            
            // Initialize D-pad state objects if needed
            if (!dpadStatesRef.current.up[panelState.nodeId]) {
              dpadStatesRef.current.up[panelState.nodeId] = {};
              dpadStatesRef.current.down[panelState.nodeId] = {};
              dpadStatesRef.current.left[panelState.nodeId] = {};
              dpadStatesRef.current.right[panelState.nodeId] = {};
            }
            
            // D-pad button indices: 12 (up), 13 (down), 14 (left), 15 (right)
            const upButton = pad.buttons[12];
            const downButton = pad.buttons[13];
            const leftButton = pad.buttons[14];
            const rightButton = pad.buttons[15];
            
            // Get current value
            const currentValue = parseFloat(panelState.value) || 0;
            const increment = currentMapping.incrementValue || 0.1;
            
            if (currentMapping.dpadMode === 'updown') {
              // Handle up button
              const upPressed = dpadStatesRef.current.up[panelState.nodeId][panelState.fieldName] || false;
              if (upButton?.pressed && !upPressed) {
                // Mark as pressed
                dpadStatesRef.current.up[panelState.nodeId][panelState.fieldName] = true;
                
                // Increment value
                const newValue = currentValue + increment;
                const clampedValue = Math.min(newValue, currentInput.max ?? Infinity);
                updateNodeValue(panelState.nodeId, panelState.fieldName, clampedValue.toString());
              } else if (!upButton?.pressed && upPressed) {
                dpadStatesRef.current.up[panelState.nodeId][panelState.fieldName] = false;
              }
              
              // Handle down button
              const downPressed = dpadStatesRef.current.down[panelState.nodeId][panelState.fieldName] || false;
              if (downButton?.pressed && !downPressed) {
                // Mark as pressed
                dpadStatesRef.current.down[panelState.nodeId][panelState.fieldName] = true;
                
                // Decrement value
                const newValue = currentValue - increment;
                const clampedValue = Math.max(newValue, currentInput.min ?? -Infinity);
                updateNodeValue(panelState.nodeId, panelState.fieldName, clampedValue.toString());
              } else if (!downButton?.pressed && downPressed) {
                dpadStatesRef.current.down[panelState.nodeId][panelState.fieldName] = false;
              }
            } else if (currentMapping.dpadMode === 'leftright') {
              // Handle right button
              const rightPressed = dpadStatesRef.current.right[panelState.nodeId][panelState.fieldName] || false;
              if (rightButton?.pressed && !rightPressed) {
                // Mark as pressed
                dpadStatesRef.current.right[panelState.nodeId][panelState.fieldName] = true;
                
                // Increment value
                const newValue = currentValue + increment;
                const clampedValue = Math.min(newValue, currentInput.max ?? Infinity);
                updateNodeValue(panelState.nodeId, panelState.fieldName, clampedValue.toString());
              } else if (!rightButton?.pressed && rightPressed) {
                dpadStatesRef.current.right[panelState.nodeId][panelState.fieldName] = false;
              }
              
              // Handle left button
              const leftPressed = dpadStatesRef.current.left[panelState.nodeId][panelState.fieldName] || false;
              if (leftButton?.pressed && !leftPressed) {
                // Mark as pressed
                dpadStatesRef.current.left[panelState.nodeId][panelState.fieldName] = true;
                
                // Decrement value
                const newValue = currentValue - increment;
                const clampedValue = Math.max(newValue, currentInput.min ?? -Infinity);
                updateNodeValue(panelState.nodeId, panelState.fieldName, clampedValue.toString());
              } else if (!leftButton?.pressed && leftPressed) {
                dpadStatesRef.current.left[panelState.nodeId][panelState.fieldName] = false;
              }
            }
          }
          
          // Handle prompt list cycling for string inputs
          if (currentInput.type?.toLowerCase() === "string" && 
              currentMapping.usePromptList) {
            
            // Initialize trigger state objects if needed
            if (!triggerStatesRef.current.leftPressed[panelState.nodeId]) {
              triggerStatesRef.current.leftPressed[panelState.nodeId] = {};
              triggerStatesRef.current.rightPressed[panelState.nodeId] = {};
            }
            
            // Only process if we have prompts to cycle through
            if (promptList.length > 0) {
              // Left trigger (usually button 6) - previous prompt
              const leftTrigger = pad.buttons[6];
              const leftPressed = triggerStatesRef.current.leftPressed[panelState.nodeId][panelState.fieldName] || false;
              
              if (leftTrigger.pressed && !leftPressed) {
                // Mark as pressed
                triggerStatesRef.current.leftPressed[panelState.nodeId][panelState.fieldName] = true;
                
                // Get current index, default to 0 if undefined
                const currentIndex = currentMapping.promptIndex ?? 0;
                const newIndex = (currentIndex - 1 + promptList.length) % promptList.length;
                
                // Update the mapping with new index
                updateControllerMapping(
                  panelState.nodeId,
                  panelState.fieldName,
                  { ...currentMapping, promptIndex: newIndex }
                );
                
                // Update the value
                const newValue = promptList[newIndex];
                updateNodeValue(panelState.nodeId, panelState.fieldName, newValue);
              } else if (!leftTrigger.pressed && leftPressed) {
                triggerStatesRef.current.leftPressed[panelState.nodeId][panelState.fieldName] = false;
              }
              
              // Right trigger (usually button 7) - next prompt
              const rightTrigger = pad.buttons[7];
              const rightPressed = triggerStatesRef.current.rightPressed[panelState.nodeId][panelState.fieldName] || false;
              
              if (rightTrigger.pressed && !rightPressed) {
                // Mark as pressed
                triggerStatesRef.current.rightPressed[panelState.nodeId][panelState.fieldName] = true;
                
                // Get current index, default to 0 if undefined
                const currentIndex = currentMapping.promptIndex ?? 0;
                const newIndex = (currentIndex + 1) % promptList.length;
                
                // Update the mapping with new index
                updateControllerMapping(
                  panelState.nodeId,
                  panelState.fieldName,
                  { ...currentMapping, promptIndex: newIndex }
                );
                
                // Update the value
                const newValue = promptList[newIndex];
                updateNodeValue(panelState.nodeId, panelState.fieldName, newValue);
              } else if (!rightTrigger.pressed && rightPressed) {
                triggerStatesRef.current.rightPressed[panelState.nodeId][panelState.fieldName] = false;
              }
            }
          }
          
          // Skip non-promptList controls if auto-update is disabled
          if (!panelState.isAutoUpdateEnabled && !currentMapping.usePromptList) {
            continue;
          }
          
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
  }, [panelStates, controllerMappings, availableNodes, isToggled, lastToggleValues, controlChannel, promptList]);
  
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
    // Get the panel's nodeId and fieldName before removing
    const panelToRemove = panelStates[id];
    
    // If this panel has a controller mapping, remove it
    if (panelToRemove.nodeId && panelToRemove.fieldName) {
      // Check if this node/field has a controller mapping
      if (controllerMappings[panelToRemove.nodeId]?.[panelToRemove.fieldName]) {
        // Clone the current mappings
        const newMappings = { ...controllerMappings };
        
        // Delete the mapping for this field
        delete newMappings[panelToRemove.nodeId][panelToRemove.fieldName];
        
        // If the node now has no mappings, remove the node entry entirely
        if (Object.keys(newMappings[panelToRemove.nodeId]).length === 0) {
          delete newMappings[panelToRemove.nodeId];
        }
        
        // Update controller mappings state
        setControllerMappings(newMappings);
      }
    }
    
    // Remove panel from panels list and panel states
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

  // Add new functions to manage the prompt list
  const addPrompt = () => {
    if (newPrompt.trim() !== "") {
      setPromptList([...promptList, newPrompt.trim()]);
      setNewPrompt("");
    }
  };
  
  const removePrompt = (index: number) => {
    setPromptList(promptList.filter((_, i) => i !== index));
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
      
      {/* Prompt List Button */}
      <Button
        onClick={() => setIsPromptListOpen(true)}
        className="fixed bottom-4 right-20 h-12 px-4 shadow-lg hover:shadow-xl transition-shadow"
        variant="default"
      >
        Manage Prompts
      </Button>
      
      {/* Prompt List Editor Drawer */}
      <Drawer
        open={isPromptListOpen}
        onOpenChange={setIsPromptListOpen}
        direction="bottom"
        shouldScaleBackground={false}
      >
        <DrawerContent
          className="max-h-[50vh] min-h-[200px] bg-background/90 backdrop-blur-md border-t shadow-lg"
        >
          <DrawerTitle className="px-4 pt-4 font-semibold text-lg">Manage Prompt List</DrawerTitle>
          
          <div className="p-4">
            <div className="mb-4">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Enter a new prompt..."
                  className="flex-1 p-2 border rounded"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addPrompt();
                  }}
                />
                <Button onClick={addPrompt}>Add</Button>
              </div>
              
              <p className="text-sm text-gray-500 mb-2">
                {promptList.length} prompt{promptList.length !== 1 ? 's' : ''} available for controller trigger cycling
              </p>
            </div>
            
            <div className="bg-white rounded border overflow-y-auto max-h-[30vh]">
              {promptList.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No prompts added yet. Add some prompts above.
                </div>
              ) : (
                <ul className="divide-y">
                  {promptList.map((prompt, index) => (
                    <li key={index} className="p-3 flex justify-between items-center">
                      <span className="flex-1 mr-2">{prompt}</span>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => removePrompt(index)}
                          variant="destructive"
                          size="sm"
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
      
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
