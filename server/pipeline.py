import torch
import av
import numpy as np
import logging

from typing import Any, Dict
from comfystream.client import ComfyStreamClient

logger = logging.getLogger(__name__)

WARMUP_RUNS = 5



class Pipeline:
    def __init__(self, **kwargs):
        logger.info("[Pipeline] Initializing pipeline")
        self.client = ComfyStreamClient(**kwargs)
        logger.info("[Pipeline] Pipeline initialized")

    def set_prompt(self, prompt: Dict[Any, Any]):
        logger.info("[Pipeline] Setting prompt in pipeline")
        try:
            self.client.set_prompt(prompt)
            logger.info("[Pipeline] Successfully set prompt in pipeline")
        except Exception as e:
            logger.error(f"[Pipeline] Error setting prompt: {str(e)}")
            raise

    async def warm(self):
        logger.info(f"[Pipeline] Starting warmup with {WARMUP_RUNS} runs")
        frame = torch.randn(1, 512, 512, 3)

        for i in range(WARMUP_RUNS):
            try:
                logger.debug(f"[Pipeline] Warmup run {i+1}/{WARMUP_RUNS}")
                await self.predict(frame)
            except Exception as e:
                logger.error(f"[Pipeline] Error during warmup run {i+1}: {str(e)}")
                raise
        logger.info("[Pipeline] Completed warmup runs")

    def preprocess(self, frame: av.VideoFrame) -> torch.Tensor:
        try:
            logger.debug("[Pipeline] Preprocessing frame")
            frame_np = frame.to_ndarray(format="rgb24").astype(np.float32) / 255.0
            tensor = torch.from_numpy(frame_np).unsqueeze(0)
            logger.debug(f"[Pipeline] Preprocessed frame to tensor shape: {tensor.shape}")
            return tensor
        except Exception as e:
            logger.error(f"[Pipeline] Error preprocessing frame: {str(e)}")
            raise

    async def predict(self, frame: torch.Tensor) -> torch.Tensor:
        try:
            logger.debug("[Pipeline] Starting prediction")
            result = await self.client.queue_prompt(frame)
            logger.debug(f"[Pipeline] Completed prediction, output shape: {result.shape}")
            return result
        except Exception as e:
            logger.error(f"[Pipeline] Error during prediction: {str(e)}")
            raise

    def postprocess(self, frame: torch.Tensor) -> av.VideoFrame:
        try:
            logger.debug("[Pipeline] Postprocessing output tensor")
            numpy_frame = (frame * 255.0).clamp(0, 255).to(dtype=torch.uint8).squeeze(0).cpu().numpy()
            video_frame = av.VideoFrame.from_ndarray(numpy_frame)
            logger.debug("[Pipeline] Successfully converted tensor to video frame")
            return video_frame
        except Exception as e:
            logger.error(f"[Pipeline] Error postprocessing frame: {str(e)}")
            raise

    async def __call__(self, frame: av.VideoFrame) -> av.VideoFrame:
        try:
            logger.debug("[Pipeline] Processing frame through pipeline")
            pre_output = self.preprocess(frame)
            pred_output = await self.predict(pre_output)
            post_output = self.postprocess(pred_output)

            post_output.pts = frame.pts
            post_output.time_base = frame.time_base
            
            logger.debug("[Pipeline] Successfully processed frame through pipeline")
            return post_output
        except Exception as e:
            logger.error(f"[Pipeline] Error in pipeline processing: {str(e)}")
            raise

    async def get_nodes_info(self) -> Dict[str, Any]:
        """Get information about all nodes in the current prompt including metadata."""
        logger.info("[Pipeline] Getting nodes info")
        try:
            nodes_info = await self.client.get_available_nodes()
            logger.info(f"[Pipeline] Retrieved info for {len(nodes_info)} nodes")
            return nodes_info
        except AttributeError as e:
            logger.error(f"[Pipeline] Error getting nodes info - method not found: {str(e)}")
            return {}
        except Exception as e:
            logger.error(f"[Pipeline] Error getting nodes info: {str(e)}")
            import traceback
            logger.error(f"[Pipeline] Traceback: {traceback.format_exc()}")
            return {}