"""Tensor utility nodes for ComfyStream"""

from .load_tensor import LoadTensor
from .save_tensor import SaveTensor
from .gpu_test import DummyGPUBatchOp

NODE_CLASS_MAPPINGS = {"LoadTensor": LoadTensor, "SaveTensor": SaveTensor, "DummyGPUBatchOp": DummyGPUBatchOp}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS"]
