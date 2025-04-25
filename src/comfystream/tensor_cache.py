import torch
import numpy as np

from queue import Queue
from asyncio import Queue as AsyncQueue

from typing import Union, Dict

# Configuration for batch processing
batch_size = 1  # Default to 1 for backward compatibility
buffer_threshold = 2  # Minimum number of batches to collect before starting processing
buffer_fill_counter = 0  # Counter to track buffer filling
is_buffer_ready = False  # Flag to indicate if buffer is ready for processing

# Flight buffer system settings
max_queue_size = 5  # Default maximum number of batches to store (5× batch size)

# Queue for input frames with larger capacity for buffer
image_inputs: Queue[Union[torch.Tensor, np.ndarray]] = Queue(maxsize=32)  # Increased from 1
image_outputs: AsyncQueue[Union[torch.Tensor, np.ndarray]] = AsyncQueue()

# Audio queues remain unchanged
audio_inputs: Queue[Union[torch.Tensor, np.ndarray]] = Queue()
audio_outputs: AsyncQueue[Union[torch.Tensor, np.ndarray]] = AsyncQueue()

# Buffer health metrics
buffer_metrics: Dict[str, float] = {
    "fill_level": 0.0,
    "processing_rate": 0.0,
    "input_rate": 0.0,
    "buffer_health": 1.0,
}

def configure_batch_processing(new_batch_size: int, new_buffer_threshold: int, new_max_queue_size: int):
    """Configure batch processing parameters.
    
    Args:
        new_batch_size: Number of frames to process in a single batch
        new_buffer_threshold: Minimum number of batches to collect before processing
        new_max_queue_size: Maximum number of batches to store in the queue
    """
    global batch_size, buffer_threshold, max_queue_size, image_inputs, is_buffer_ready, buffer_fill_counter
    
    batch_size = max(1, new_batch_size)  # Ensure at least 1
    buffer_threshold = max(1, new_buffer_threshold)  # Ensure at least 1
    max_queue_size = max(buffer_threshold + 1, new_max_queue_size)  # Ensure room for processing
    
    # Reset buffer state
    is_buffer_ready = False
    buffer_fill_counter = 0
    
    # Create a new queue with appropriate capacity
    new_queue_maxsize = max_queue_size * batch_size
    old_queue = image_inputs
    image_inputs = Queue(maxsize=new_queue_maxsize)
    
    # Transfer any existing items to the new queue
    while not old_queue.empty():
        try:
            image_inputs.put_nowait(old_queue.get_nowait())
        except:
            break
    
    return {
        "batch_size": batch_size,
        "buffer_threshold": buffer_threshold,
        "max_queue_size": max_queue_size,
        "queue_capacity": new_queue_maxsize
    }

def update_buffer_metrics(input_rate: float = None, processing_rate: float = None):
    """Update buffer health metrics
    
    Args:
        input_rate: Rate of frames being added to buffer (frames/sec)
        processing_rate: Rate of frames being processed (frames/sec)
    """
    global buffer_metrics
    
    # Update rates if provided
    if input_rate is not None:
        buffer_metrics["input_rate"] = input_rate
    
    if processing_rate is not None:
        buffer_metrics["processing_rate"] = processing_rate
    
    # Calculate fill level (0.0 to 1.0)
    buffer_metrics["fill_level"] = min(1.0, image_inputs.qsize() / image_inputs.maxsize)
    
    # Calculate buffer health (ratio of processing rate to input rate)
    if buffer_metrics["input_rate"] > 0:
        buffer_metrics["buffer_health"] = min(1.0, buffer_metrics["processing_rate"] / buffer_metrics["input_rate"])
    else:
        buffer_metrics["buffer_health"] = 1.0
    
    return buffer_metrics
