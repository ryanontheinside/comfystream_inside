"use client";

import React, { useState, useEffect } from "react";
import { usePeerContext } from "@/context/peer-context";
import { usePrompt } from "./settings";

type InputValue = string | number | boolean;

interface ControllerMapping {
  inputIndex: number;        // Unified index for buttons or axes
  isAxis: boolean;          // Whether this is an axis or button
  multiplier?: number;      // For scaling inputs
}

interface InputInfo {
  value: InputValue;
  type: string;
  min?: number;
  max?: number;
  widget?: string;
  controllerMapping?: ControllerMapping;
}

interface NodeInfo {
  class_type: string;
  inputs: Record<string, InputInfo>;
}

interface ControlPanelProps {
  panelState: {
    nodeId: string;
    fieldName: string;
    value: string;
    isAutoUpdateEnabled: boolean;
  };
  onStateChange: (
    state: Partial<{
      nodeId: string;
      fieldName: string;
      value: string;
      isAutoUpdateEnabled: boolean;
    }>,
  ) => void;
  controllerMappings?: {
    [nodeId: string]: {
      [fieldName: string]: ControllerMapping;
    };
  };
  onMappingChange?: (
    nodeId: string,
    fieldName: string,
    mapping: ControllerMapping
  ) => void;
}

const InputControl = ({
  input,
  value,
  onChange,
}: {
  input: InputInfo;
  value: string;
  onChange: (value: string) => void;
}) => {
  if (input.widget === "combo") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="p-2 border rounded w-full"
      >
        {Array.isArray(input.value) &&
          input.value.map((option: string) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
      </select>
    );
  }

  const inputType = input.type.toLowerCase();

  switch (inputType) {
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked.toString())}
          className="w-5 h-5"
        />
      );
    case "number":
    case "float":
    case "int":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={input.min}
          max={input.max}
          step={
            inputType === "float" ? "0.01" : inputType === "int" ? "1" : "any"
          }
          className="p-2 border rounded w-32"
        />
      );
    case "string":
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="p-2 border rounded w-full"
        />
      );
    default:
      console.warn(`Unhandled input type: ${input.type}`);
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="p-2 border rounded w-full"
        />
      );
  }
};

const ControllerMapper = ({
  input,
  onMappingChange,
  nodeId,
  fieldName,
  controllerMapping,
}: {
  input: InputInfo;
  onMappingChange: (mapping: ControllerMapping) => void;
  nodeId: string;
  fieldName: string;
  controllerMapping?: ControllerMapping;
}) => {
  const [gamepads, setGamepads] = useState<Gamepad[]>([]);
  const [isMapping, setIsMapping] = useState(false);
  const [detectedInput, setDetectedInput] = useState<string>("");

  useEffect(() => {
    const updateGamepads = () => {
      const pads = navigator.getGamepads();
      setGamepads(Array.from(pads).filter((pad): pad is Gamepad => pad !== null));
    };

    const interval = setInterval(updateGamepads, 100);
    window.addEventListener("gamepadconnected", updateGamepads);
    window.removeEventListener("gamepaddisconnected", updateGamepads);

    return () => {
      clearInterval(interval);
      window.removeEventListener("gamepadconnected", updateGamepads);
      window.removeEventListener("gamepaddisconnected", updateGamepads);
    };
  }, []);

  useEffect(() => {
    if (!isMapping) return;

    const checkInputs = () => {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (!pad) continue;

        // Check buttons (including analog triggers)
        pad.buttons.forEach((button, index) => {
          if (button.value > 0.1) {
            setDetectedInput(`Button ${index}`);
            onMappingChange({ inputIndex: index, isAxis: false });
            setIsMapping(false);
          }
        });

        // Check axes
        pad.axes.forEach((axis, index) => {
          if (Math.abs(axis) > 0.2) {
            setDetectedInput(`Axis ${index}`);
            onMappingChange({ inputIndex: index, isAxis: true, multiplier: 1 });
            setIsMapping(false);
          }
        });
      }
    };

    const interval = setInterval(checkInputs, 50);
    return () => clearInterval(interval);
  }, [isMapping, onMappingChange]);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setIsMapping(!isMapping)}
        className={`p-2 rounded ${isMapping ? "bg-yellow-500" : "bg-blue-500"} text-white`}
      >
        {isMapping ? "Mapping..." : "Map Controller"}
      </button>
      {controllerMapping && (
        <div className="text-sm">
          Mapped to: {controllerMapping.isAxis 
            ? `Axis ${controllerMapping.inputIndex}`
            : `Button ${controllerMapping.inputIndex}`}
        </div>
      )}
      {gamepads.length === 0 && (
        <div className="text-sm text-red-500">No controllers detected</div>
      )}
    </div>
  );
};

export const ControlPanel = ({
  panelState,
  onStateChange,
  controllerMappings = {},
  onMappingChange,
}: ControlPanelProps) => {
  const { controlChannel } = usePeerContext();
  const { currentPrompts, setCurrentPrompts } = usePrompt();
  const [availableNodes, setAvailableNodes] = useState<
    Record<string, NodeInfo>
  >({});
  const [controllerValue, setControllerValue] = useState<string>("");
  const [lastToggleValue, setLastToggleValue] = useState<string>("0");
  const [isToggled, setIsToggled] = useState(false);

  const lastSentValueRef = React.useRef<{
    nodeId: string;
    fieldName: string;
    value: InputValue;
  } | null>(null);
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (controlChannel) {
      controlChannel.send(JSON.stringify({ type: "get_nodes" }));

      controlChannel.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "nodes_info") {
            setAvailableNodes(data.nodes);
          } else if (data.type === "prompts_updated") {
            if (!data.success) {
              console.error("[ControlPanel] Failed to update prompt");
            }
          }
        } catch (error) {
          console.error("[ControlPanel] Error parsing node info:", error);
        }
      });
    }
  }, [controlChannel]);

  useEffect(() => {
    const pollController = () => {
      const pads = navigator.getGamepads();
      const currentMapping = panelState.nodeId && panelState.fieldName && controllerMappings[panelState.nodeId]?.[panelState.fieldName];
      const currentInput =
        panelState.nodeId && panelState.fieldName
          ? availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
          : null;

      if (!currentInput || !currentMapping) return;

      for (const pad of pads) {
        if (!pad) continue;

        const mapping = currentMapping;
        const min = currentInput.min ?? 0;
        const max = currentInput.max ?? 1;

        if (mapping.isAxis) {
          const rawValue = mapping.inputIndex < pad.axes.length
            ? pad.axes[mapping.inputIndex]
            : pad.buttons[mapping.inputIndex].value;

          const normalizedValue = (rawValue + 1) / 2;
          const scaledValue = min + (max - min) * normalizedValue;
          const clampedValue = Math.max(min, Math.min(max, scaledValue));
          
          const newValue = currentInput.type.toLowerCase() === "number"
            ? clampedValue.toFixed(2)
            : clampedValue.toString();

          if (Math.abs(parseFloat(newValue) - parseFloat(panelState.value)) > 0.01) {
            setControllerValue(newValue);
            handleValueChange(newValue);
          }
        } else {
          const button = pad.buttons[mapping.inputIndex];
          if (button.value > 0.1 && !isToggled) {
            const targetValue = panelState.value !== "0" 
              ? panelState.value 
              : lastToggleValue !== "0" 
                ? lastToggleValue 
                : max.toString();
            setIsToggled(true);
            setLastToggleValue(targetValue);
            handleValueChange(targetValue);
          } else if (button.value <= 0.1 && isToggled) {
            setIsToggled(false);
            handleValueChange("0");
          }
        }
      }
    };

    const interval = setInterval(pollController, 50);
    return () => clearInterval(interval);
  }, [panelState, availableNodes, isToggled, lastToggleValue, controllerMappings]);

  const handleValueChange = (newValue: string) => {
    const currentInput =
      panelState.nodeId && panelState.fieldName
        ? availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
        : null;

    if (currentInput) {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        const min = currentInput.min ?? 0;
        const max = currentInput.max ?? Infinity;
        const clampedValue = Math.max(min, Math.min(max, numValue));
        onStateChange({ value: clampedValue.toString() });
        if (!currentInput.controllerMapping?.isAxis) {
          setLastToggleValue(clampedValue.toString());
        }
      } else {
        onStateChange({ value: newValue });
      }
    }
  };

  useEffect(() => {
    const currentInput =
      panelState.nodeId && panelState.fieldName
        ? availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
        : null;
    if (!currentInput || !currentPrompts) return;

    let isValidValue = true;
    let processedValue: InputValue = panelState.value;

    switch (currentInput.type.toLowerCase()) {
      case "number":
        isValidValue =
          /^-?\d*\.?\d*$/.test(panelState.value) && panelState.value !== "";
        processedValue = parseFloat(panelState.value);
        break;
      case "boolean":
        isValidValue =
          panelState.value === "true" || panelState.value === "false";
        processedValue = panelState.value === "true";
        break;
      case "string":
        processedValue = panelState.value;
        break;
      default:
        if (currentInput.widget === "combo") {
          isValidValue = panelState.value !== "";
          processedValue = panelState.value;
        } else {
          isValidValue = panelState.value !== "";
          processedValue = panelState.value;
        }
    }

    const hasRequiredFields =
      panelState.nodeId.trim() !== "" && panelState.fieldName.trim() !== "";

    const lastSent = lastSentValueRef.current;
    const hasValueChanged =
      !lastSent ||
      lastSent.nodeId !== panelState.nodeId ||
      lastSent.fieldName !== panelState.fieldName ||
      lastSent.value !== processedValue;

    if (
      controlChannel &&
      panelState.isAutoUpdateEnabled &&
      isValidValue &&
      hasRequiredFields &&
      hasValueChanged
    ) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(
        () => {
          const currentPrompt = currentPrompts[0];
          const updatedPrompt = JSON.parse(JSON.stringify(currentPrompt));
          if (
            updatedPrompt[panelState.nodeId] &&
            updatedPrompt[panelState.nodeId].inputs
          ) {
            updatedPrompt[panelState.nodeId].inputs[panelState.fieldName] =
              processedValue;

            lastSentValueRef.current = {
              nodeId: panelState.nodeId,
              fieldName: panelState.fieldName,
              value: processedValue,
            };

            const message = JSON.stringify({
              type: "update_prompts",
              prompts: [updatedPrompt],
            });
            controlChannel.send(message);

            setCurrentPrompts([updatedPrompt]);
          }
        },
        currentInput.type.toLowerCase() === "number" ? 0 : 0,
      );
    }
  }, [
    panelState.value,
    panelState.nodeId,
    panelState.fieldName,
    panelState.isAutoUpdateEnabled,
    controlChannel,
    availableNodes,
    currentPrompts,
    setCurrentPrompts,
  ]);

  const toggleAutoUpdate = () => {
    onStateChange({ isAutoUpdateEnabled: !panelState.isAutoUpdateEnabled });
  };

  const getInitialValue = (input: InputInfo): string => {
    if (input.type.toLowerCase() === "boolean") {
      return (!!input.value).toString();
    }
    if (input.widget === "combo" && Array.isArray(input.value)) {
      return input.value[0]?.toString() || "";
    }
    return input.value?.toString() || "0";
  };

  const handleFieldSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedField = e.target.value;

    const input = availableNodes[panelState.nodeId]?.inputs[selectedField];
    if (input) {
      const initialValue = getInitialValue(input);
      onStateChange({
        fieldName: selectedField,
        value: initialValue,
      });
    } else {
      onStateChange({ fieldName: selectedField });
    }
  };

  const handleMappingChange = (mapping: ControllerMapping) => {
    if (panelState.nodeId && panelState.fieldName && onMappingChange) {
      onMappingChange(panelState.nodeId, panelState.fieldName, mapping);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <select
        value={panelState.nodeId}
        onChange={(e) => {
          onStateChange({
            nodeId: e.target.value,
            fieldName: "",
            value: "0",
          });
        }}
        className="p-2 border rounded"
      >
        <option value="">Select Node</option>
        {Object.entries(availableNodes).map(([id, info]) => (
          <option key={id} value={id}>
            {id} ({info.class_type})
          </option>
        ))}
      </select>

      <select
        value={panelState.fieldName}
        onChange={handleFieldSelect}
        disabled={!panelState.nodeId}
        className="p-2 border rounded"
      >
        <option value="">Select Field</option>
        {panelState.nodeId &&
          availableNodes[panelState.nodeId]?.inputs &&
          Object.entries(availableNodes[panelState.nodeId].inputs)
            .filter(([, info]) => {
              const type =
                typeof info.type === "string"
                  ? info.type.toLowerCase()
                  : String(info.type).toLowerCase();
              return (
                ["boolean", "number", "float", "int", "string"].includes(
                  type,
                ) || info.widget === "combo"
              );
            })
            .map(([field, info]) => (
              <option key={field} value={field}>
                {field} ({info.type}
                {info.widget ? ` - ${info.widget}` : ""})
              </option>
            ))}
      </select>

      <div className="flex items-center gap-2">
        {panelState.nodeId &&
          panelState.fieldName &&
          availableNodes[panelState.nodeId]?.inputs[panelState.fieldName] && (
            <>
              <InputControl
                input={
                  availableNodes[panelState.nodeId].inputs[panelState.fieldName]
                }
                value={panelState.value}
                onChange={handleValueChange}
              />
              <ControllerMapper
                input={
                  availableNodes[panelState.nodeId].inputs[panelState.fieldName]
                }
                nodeId={panelState.nodeId}
                fieldName={panelState.fieldName}
                controllerMapping={controllerMappings[panelState.nodeId]?.[panelState.fieldName]}
                onMappingChange={handleMappingChange}
              />
            </>
          )}

        {panelState.nodeId &&
          panelState.fieldName &&
          availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
            ?.type === "number" && (
            <span className="text-sm text-gray-600">
              {availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
                ?.min !== undefined &&
                availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]
                  ?.max !== undefined &&
                `(${availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]?.min} - ${availableNodes[panelState.nodeId]?.inputs[panelState.fieldName]?.max})`}
            </span>
          )}
      </div>

      <button
        onClick={toggleAutoUpdate}
        disabled={!controlChannel}
        className={`p-2 rounded ${
          !controlChannel
            ? "bg-gray-300 text-gray-600 cursor-not-allowed"
            : panelState.isAutoUpdateEnabled
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
        }`}
      >
        Auto-Update{" "}
        {controlChannel
          ? panelState.isAutoUpdateEnabled
            ? "(ON)"
            : "(OFF)"
          : "(Not Connected)"}
      </button>
    </div>
  );
};