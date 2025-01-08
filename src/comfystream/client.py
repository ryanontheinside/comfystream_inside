import torch
import asyncio
from typing import Any
import json
import logging

from comfy.api.components.schema.prompt import PromptDictInput
from comfy.cli_args_types import Configuration
from comfy.client.embedded_comfy_client import EmbeddedComfyClient
from comfystream import tensor_cache
from comfystream.utils import convert_prompt

logger = logging.getLogger(__name__)


class ComfyStreamClient:
    def __init__(self, **kwargs):
        config = Configuration(**kwargs)
        self.comfy_client = EmbeddedComfyClient(config)
        self.prompt = None
        self._lock = asyncio.Lock()

    def set_prompt(self, prompt: PromptDictInput):
        self.prompt = convert_prompt(prompt)

    async def queue_prompt(self, input: torch.Tensor) -> torch.Tensor:
        async with self._lock:
            tensor_cache.inputs.append(input)
            output_fut = asyncio.Future()
            tensor_cache.outputs.append(output_fut)
            try:
                await self.comfy_client.queue_prompt(self.prompt)
            except Exception as e:
                logger.error(f"Error queueing prompt: {str(e)}")
                logger.error(f"Error type: {type(e)}")
                raise
            return await output_fut

    async def get_available_nodes(self):
        """Get metadata and available nodes info in a single pass"""
        async with self._lock:
            if not self.prompt:
                logger.warning("No prompt set when trying to get available nodes")
                return {}

            try:
                from comfy.nodes.package import import_all_nodes_in_workspace
                logger.info("Importing nodes from workspace...")
                nodes = import_all_nodes_in_workspace()
                logger.info(f"Found {len(nodes.NODE_CLASS_MAPPINGS)} total node types")
                
                # Get set of class types we need metadata for, excluding LoadTensor and SaveTensor
                needed_class_types = {
                    node.get('class_type') 
                    for node in self.prompt.values() 
                    if node.get('class_type') not in ('LoadTensor', 'SaveTensor')
                }
                logger.info(f"Looking for metadata for {len(needed_class_types)} node types: {needed_class_types}")
                remaining_nodes = {
                    node_id 
                    for node_id, node in self.prompt.items() 
                    if node.get('class_type') not in ('LoadTensor', 'SaveTensor')
                }
                nodes_info = {}
                
                # Only process nodes until we've found all the ones we need
                for class_type, node_class in nodes.NODE_CLASS_MAPPINGS.items():
                    if not remaining_nodes:  # Exit early if we've found all needed nodes
                        break
                        
                    if class_type not in needed_class_types:
                        continue
                        
                    # Get metadata for this node type (same as original get_node_metadata)
                    input_data = node_class.INPUT_TYPES() if hasattr(node_class, 'INPUT_TYPES') else {}
                    input_info = {}
                    
                    # Process required inputs
                    if 'required' in input_data:
                        for name, value in input_data['required'].items():
                            if isinstance(value, tuple) and len(value) == 2:
                                input_type, config = value
                                input_info[name] = {
                                    'type': input_type,
                                    'required': True,
                                    'min': config.get('min', None),
                                    'max': config.get('max', None),
                                    'widget': config.get('widget', None)
                                }
                            else:
                                logger.error(f"Unexpected structure for required input {name}: {value}")
                    
                    # Process optional inputs
                    if 'optional' in input_data:
                        for name, value in input_data['optional'].items():
                            if isinstance(value, tuple) and len(value) == 2:
                                input_type, config = value
                                input_info[name] = {
                                    'type': input_type,
                                    'required': False,
                                    'min': config.get('min', None),
                                    'max': config.get('max', None),
                                    'widget': config.get('widget', None)
                                }
                            else:
                                logger.error(f"Unexpected structure for optional input {name}: {value}")
                    
                    # Now process any nodes in our prompt that use this class_type
                    for node_id in list(remaining_nodes):
                        node = self.prompt[node_id]
                        if node.get('class_type') != class_type:
                            continue
                            
                        node_info = {
                            'class_type': class_type,
                            'inputs': {}
                        }
                        
                        if 'inputs' in node:
                            for input_name, input_value in node['inputs'].items():
                                node_info['inputs'][input_name] = {
                                    'value': input_value,
                                    'type': input_info.get(input_name, {}).get('type', 'unknown'),
                                    'min': input_info.get(input_name, {}).get('min', None),
                                    'max': input_info.get(input_name, {}).get('max', None),
                                    'widget': input_info.get(input_name, {}).get('widget', None)
                                }
                        
                        nodes_info[node_id] = node_info
                        remaining_nodes.remove(node_id)
                
                return nodes_info
                
            except ImportError as e:
                logger.error(f"Failed to import ComfyUI nodes: {str(e)}")
                logger.error(f"Current workspace: {self.comfy_client.config.cwd}")
                return {}
            except Exception as e:
                logger.error(f"Error getting node info: {str(e)}")
                logger.error(f"Error type: {type(e)}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                return {}
