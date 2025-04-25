import torch

class DummyGPUBatchOp:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "process"

    CATEGORY = "ComfyStreamTests"

    def process(self, image):
        # Ensure tensor is on GPU
        if not image.is_cuda:
            image = image.cuda()

        # Heavy GPU workload
        for _ in range(10):  # Increase loop count to make it heavier if needed
            image = image * 1.1 - 0.1
            image = torch.sin(image * 3.1415)
            image = torch.cos(image)
            image = torch.pow(image, 2.0)
            image = torch.exp(-image)
            image = torch.sqrt(torch.abs(image) + 1e-6)

        return (image,)