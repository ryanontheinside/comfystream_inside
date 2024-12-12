"use client";

import React, { useState } from "react";
import { ComfyNodePanel } from "./comfy-node-panel";
import { Button } from "./ui/button";
import { Plus } from "lucide-react";

export const ControlPanelsContainer = () => {
  const [panels, setPanels] = useState<number[]>([0]);
  const [nextPanelId, setNextPanelId] = useState(1);

  const addPanel = () => {
    setPanels([...panels, nextPanelId]);
    setNextPanelId(nextPanelId + 1);
  };

  const removePanel = (id: number) => {
    setPanels(panels.filter(panelId => panelId !== id));
  };

  return (
    <section className="w-full p-4">
      <div className="mb-4 flex justify-center">
        <Button 
          onClick={addPanel}
          className="bg-[#444] hover:bg-[#555] text-white flex items-center gap-2"
        >
          <Plus size={16} />
          Add New Node Panel
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {panels.map((id) => (
          <div key={id} className="relative group">
            <Button
              onClick={() => removePanel(id)}
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </Button>
            <ComfyNodePanel panelId={id} />
          </div>
        ))}
      </div>
    </section>
  );
}; 