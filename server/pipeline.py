import av
import torch
import numpy as np
import asyncio
import logging
import time

from typing import Any, Dict, Union, List
from comfystream.client import ComfyStreamClient
from comfystream import tensor_cache
from utils import temporary_log_level

WARMUP_RUNS = 5

logger = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, width=512, height=512, comfyui_inference_log_level: int = None, 
                 batch_size=1, buffer_threshold=2, max_queue_size=5, **kwargs):
        """Initialize the pipeline with the given configuration.
        Args:
            width: Frame width
            height: Frame height
            comfyui_inference_log_level: The logging level for ComfyUI inference.
                Defaults to None, using the global ComfyUI log level.
            batch_size: Number of frames to process in a single batch
            buffer_threshold: Minimum number of batches to collect before processing
            max_queue_size: Maximum number of batches to store in the queue
            **kwargs: Additional arguments to pass to the ComfyStreamClient
        """
        self.client = ComfyStreamClient(**kwargs)
        self.width = kwargs.get("width", 512)
        self.height = kwargs.get("height", 512)

        self.video_incoming_frames = asyncio.Queue()
        self.audio_incoming_frames = asyncio.Queue()

        self.processed_audio_buffer = np.array([], dtype=np.int16)

        self._comfyui_inference_log_level = comfyui_inference_log_level
        
        # Configure batch processing
        self.configure_batch_processing(batch_size, buffer_threshold, max_queue_size)
        
        # Frame rate monitoring
        self.last_frame_time = time.time()
        self.frame_count = 0

    def configure_batch_processing(self, batch_size, buffer_threshold, max_queue_size):
        """Configure batch processing parameters"""
        self.batch_size = batch_size
        self.buffer_threshold = buffer_threshold
        self.max_queue_size = max_queue_size
        
        # Update tensor cache config
        tensor_cache.configure_batch_processing(batch_size, buffer_threshold, max_queue_size)
        
        logger.info(f"Configured batch processing: batch_size={batch_size}, buffer_threshold={buffer_threshold}, max_queue_size={max_queue_size}")

    async def warm_video(self):
        # Create dummy frame with the CURRENT resolution settings (which might have been updated via control channel)
        dummy_frame = av.VideoFrame()
        dummy_frame.side_data.input = torch.randn(1, self.height, self.width, 3)
        
        logger.info(f"Warming video pipeline with resolution {self.width}x{self.height}")

        for _ in range(WARMUP_RUNS):
            self.client.put_video_input(dummy_frame)
            await self.client.get_video_output()

    async def warm_audio(self):
        dummy_frame = av.AudioFrame()
        dummy_frame.side_data.input = np.random.randint(-32768, 32767, int(48000 * 0.5), dtype=np.int16)   # TODO: adds a lot of delay if it doesn't match the buffer size, is warmup needed?
        dummy_frame.sample_rate = 48000

        for _ in range(WARMUP_RUNS):
            self.client.put_audio_input(dummy_frame)
            await self.client.get_audio_output()

    async def set_prompts(self, prompts: Union[Dict[Any, Any], List[Dict[Any, Any]]]):
        if isinstance(prompts, list):
            await self.client.set_prompts(prompts)
        else:
            await self.client.set_prompts([prompts])

    async def update_prompts(self, prompts: Union[Dict[Any, Any], List[Dict[Any, Any]]]):
        if isinstance(prompts, list):
            await self.client.update_prompts(prompts)
        else:
            await self.client.update_prompts([prompts])

    async def put_video_frame(self, frame: av.VideoFrame):
        # Preprocess the frame
        frame.side_data.input = self.video_preprocess(frame)
        frame.side_data.skipped = True
        
        # Update frame rate metrics
        now = time.time()
        elapsed = now - self.last_frame_time
        self.last_frame_time = now
        self.frame_count += 1
        
        # Update input rate metric after initial frames
        if self.frame_count > 5 and elapsed > 0:
            input_rate = 1.0 / elapsed  # frames per second
            tensor_cache.update_buffer_metrics(input_rate=input_rate)
        
        # Send frame to client and add to queue
        self.client.put_video_input(frame)
        await self.video_incoming_frames.put(frame)
        
        # Monitor buffer health and provide feedback
        if self.frame_count % 30 == 0:  # Log every 30 frames
            metrics = tensor_cache.buffer_metrics
            logger.info(f"Buffer metrics: fill={metrics['fill_level']:.2f}, health={metrics['buffer_health']:.2f}")
            
            # Alert if buffer health is concerning
            if metrics['buffer_health'] < 0.8 and metrics['fill_level'] > 0.8:
                logger.warning("Buffer filling up faster than processing. Consider increasing batch size.")
            elif metrics['buffer_health'] > 1.2 and metrics['fill_level'] < 0.3:
                logger.info("Processing faster than input rate. Could decrease batch size if desired.")

    async def put_audio_frame(self, frame: av.AudioFrame):
        frame.side_data.input = self.audio_preprocess(frame)
        frame.side_data.skipped = True
        self.client.put_audio_input(frame)
        await self.audio_incoming_frames.put(frame)

    def video_preprocess(self, frame: av.VideoFrame) -> Union[torch.Tensor, np.ndarray]:
        frame_np = frame.to_ndarray(format="rgb24").astype(np.float32) / 255.0
        return torch.from_numpy(frame_np).unsqueeze(0)
    
    def audio_preprocess(self, frame: av.AudioFrame) -> Union[torch.Tensor, np.ndarray]:
        return frame.to_ndarray().ravel().reshape(-1, 2).mean(axis=1).astype(np.int16)
    
    def video_postprocess(self, output: Union[torch.Tensor, np.ndarray]) -> av.VideoFrame:
        return av.VideoFrame.from_ndarray(
            (output * 255.0).clamp(0, 255).to(dtype=torch.uint8).squeeze(0).cpu().numpy()
        )

    def audio_postprocess(self, output: Union[torch.Tensor, np.ndarray]) -> av.AudioFrame:
        return av.AudioFrame.from_ndarray(np.repeat(output, 2).reshape(1, -1))
    
    async def get_processed_video_frame(self):
        # TODO: make it generic to support purely generative video cases
        async with temporary_log_level("comfy", self._comfyui_inference_log_level):
            out_tensor = await self.client.get_video_output()
        frame = await self.video_incoming_frames.get()
        while frame.side_data.skipped:
            frame = await self.video_incoming_frames.get()

        processed_frame  = self.video_postprocess(out_tensor)
        processed_frame.pts = frame.pts
        processed_frame.time_base = frame.time_base
        
        return processed_frame

    async def get_processed_audio_frame(self):
        # TODO: make it generic to support purely generative audio cases and also add frame skipping
        frame = await self.audio_incoming_frames.get()
        if frame.samples > len(self.processed_audio_buffer):
            async with temporary_log_level("comfy", self._comfyui_inference_log_level):
                out_tensor = await self.client.get_audio_output()
            self.processed_audio_buffer = np.concatenate([self.processed_audio_buffer, out_tensor])
        out_data = self.processed_audio_buffer[:frame.samples]
        self.processed_audio_buffer = self.processed_audio_buffer[frame.samples:]

        processed_frame = self.audio_postprocess(out_data)
        processed_frame.pts = frame.pts
        processed_frame.time_base = frame.time_base
        processed_frame.sample_rate = frame.sample_rate
        
        return processed_frame
    
    async def get_nodes_info(self) -> Dict[str, Any]:
        """Get information about all nodes in the current prompt including metadata."""
        nodes_info = await self.client.get_available_nodes()
        return nodes_info
    
    def get_buffer_status(self) -> Dict[str, Any]:
        """Get current buffer status information."""
        return {
            "batch_size": self.batch_size,
            "buffer_threshold": self.buffer_threshold,
            "max_queue_size": self.max_queue_size,
            "is_buffer_ready": tensor_cache.is_buffer_ready,
            "metrics": tensor_cache.buffer_metrics,
        }
    
    async def cleanup(self):
        await self.client.cleanup()
