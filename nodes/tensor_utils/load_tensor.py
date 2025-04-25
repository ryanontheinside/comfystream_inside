from comfystream import tensor_cache
import torch
import time


class LoadTensor:
    CATEGORY = "tensor_utils"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1})
            }
        }

    @classmethod
    def IS_CHANGED():
        return float("nan")

    def execute(self, batch_size=None):
        # Use node batch_size parameter if provided, otherwise use global setting
        if batch_size is not None and batch_size > 0:
            use_batch_size = batch_size
        else:
            use_batch_size = tensor_cache.batch_size
        
        # Early return for single frame case (backward compatibility)
        if use_batch_size == 1:
            frame = tensor_cache.image_inputs.get(block=True)
            frame.side_data.skipped = False
            return (frame.side_data.input,)
        
        # Check if buffer is ready for batch processing
        if not tensor_cache.is_buffer_ready:
            # Wait for sufficient frames to accumulate
            current_size = tensor_cache.image_inputs.qsize()
            required_size = tensor_cache.buffer_threshold * use_batch_size
            
            if current_size < required_size:
                print(f"Waiting for buffer to fill: {current_size}/{required_size} frames")
                # Block until we have enough frames
                while tensor_cache.image_inputs.qsize() < required_size:
                    time.sleep(0.1)
            
            # Mark buffer as ready after initial filling
            tensor_cache.is_buffer_ready = True
            print(f"Buffer ready: processing with batch size {use_batch_size}")
        
        # Get batch_size frames from the queue
        batch_frames = []
        batch_start_time = time.time()
        
        for _ in range(use_batch_size):
            frame = tensor_cache.image_inputs.get(block=True)
            frame.side_data.skipped = False
            batch_frames.append(frame.side_data.input)
        
        # Stack frames into a batch tensor (BHWC format)
        batch_tensor = torch.stack(batch_frames, dim=0)
        
        # Update processing metrics
        batch_process_time = time.time() - batch_start_time
        if batch_process_time > 0:
            processing_rate = use_batch_size / batch_process_time
            tensor_cache.update_buffer_metrics(processing_rate=processing_rate)
        
        return (batch_tensor,)
