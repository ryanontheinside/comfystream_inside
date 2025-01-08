import copy
import logging
from typing import Dict, Any
from comfy.api.components.schema.prompt import Prompt, PromptDictInput

logger = logging.getLogger(__name__)

def create_load_tensor_node():
    logger.debug("[Utils] Creating LoadTensor node")
    node = {
        "inputs": {},
        "class_type": "LoadTensor",
        "_meta": {"title": "LoadTensor"},
    }
    logger.debug("[Utils] Created LoadTensor node")
    return node

def create_save_tensor_node(inputs: Dict[Any, Any]):
    logger.debug("[Utils] Creating SaveTensor node")
    node = {
        "inputs": inputs,
        "class_type": "SaveTensor",
        "_meta": {"title": "SaveTensor"},
    }
    logger.debug("[Utils] Created SaveTensor node")
    return node

def convert_prompt(prompt: PromptDictInput) -> Prompt:
    """Convert a prompt to use tensor nodes for input/output."""
    logger.info("[Utils] Starting prompt conversion")
    try:
        # Deep copy to avoid modifying original
        prompt = copy.deepcopy(prompt)
        
        # Find primary input node
        primary_input_node_id = None
        primary_input_node_class = None
        
        logger.debug("[Utils] Searching for primary input node")
        for node_id, node in prompt.items():
            class_type = node.get("class_type")
            if class_type in ("PrimaryInputLoadImage", "LoadImage"):
                if primary_input_node_id is not None:
                    logger.error("[Utils] Multiple primary input nodes found")
                    raise ValueError("Multiple primary input nodes found")
                primary_input_node_id = node_id
                primary_input_node_class = class_type
        
        if primary_input_node_id is None:
            logger.error("[Utils] No primary input node found")
            raise ValueError("No primary input node found")
            
        logger.debug(f"[Utils] Found primary input node: {primary_input_node_id} ({primary_input_node_class})")
        
        # Find output node
        output_node_id = None
        output_node_inputs = None
        
        logger.debug("[Utils] Searching for output node")
        for node_id, node in prompt.items():
            class_type = node.get("class_type")
            if class_type in ("PreviewImage", "SaveImage"):
                if output_node_id is not None:
                    logger.error("[Utils] Multiple output nodes found")
                    raise ValueError("Multiple output nodes found")
                output_node_id = node_id
                output_node_inputs = node.get("inputs", {})
        
        if output_node_id is None:
            logger.error("[Utils] No output node found")
            raise ValueError("No output node found")
            
        logger.debug(f"[Utils] Found output node: {output_node_id}")
        
        # Replace input node with LoadTensor
        prompt[primary_input_node_id] = create_load_tensor_node()
        
        # Replace output node with SaveTensor
        prompt[output_node_id] = create_save_tensor_node(output_node_inputs)
        
        logger.info("[Utils] Successfully converted prompt")
        return prompt
        
    except Exception as e:
        logger.error(f"[Utils] Error converting prompt: {str(e)}")
        raise
