import torch

from comfystream import tensor_cache


class SaveTensor:
    CATEGORY = "tensor_utils"
    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
            }
        }

    @classmethod
    def IS_CHANGED(s):
        return float("nan")

    def execute(self, images: torch.Tensor):
        # Check if we have a batch of images (BHWC format)
        if len(images.shape) == 4 and images.shape[0] > 1:
            # Handle batch processing - put each image to the output queue in order
            for i in range(images.shape[0]):
                single_image = images[i:i+1]  # Keep the batch dimension as 1 instead of removing it
                tensor_cache.image_outputs.put_nowait(single_image)
        else:
            # Single image case (backward compatibility)
            tensor_cache.image_outputs.put_nowait(images)
            
        return images
