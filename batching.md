# ComfyStream Batch Processing Implementation Plan

## What is ComfyStream and How it Currently Works

ComfyStream is a custom node extension for ComfyUI that enables real-time video processing via WebRTC. It creates a client-server architecture where:

1. **WebRTC Video/Audio Stream**: Captures frames from a client (like a webcam) through a browser interface
2. **Server Processing Pipeline**: Receives frames, processes them through ComfyUI workflows, and returns processed frames
3. **Tensor Cache System**: Acts as a bridge between the WebRTC stream and ComfyUI nodes using queue-based architecture

The current implementation processes frames sequentially:
- Each frame is received via WebRTC
- The frame is placed in a queue (`tensor_cache.image_inputs`)
- ComfyUI loads the frame via `LoadTensor` node
- Processing happens through the user-defined ComfyUI workflow
- The processed frame is saved via `SaveTensor` node to `tensor_cache.image_outputs`
- The processed frame is sent back to the client through WebRTC

This sequential processing introduces latency since each frame must complete its processing cycle before the next one begins.

## Important Files and Their Functions

### Core System Components

1. **Tensor Cache System**:
   - `custom_nodes/comfystream_inside/src/comfystream/tensor_cache.py`: Defines the queues for moving tensors between WebRTC and ComfyUI

2. **Tensor Utility Nodes**:
   - `custom_nodes/comfystream_inside/nodes/tensor_utils/load_tensor.py`: Pulls frames from the tensor cache for processing in ComfyUI
   - `custom_nodes/comfystream_inside/nodes/tensor_utils/save_tensor.py`: Pushes processed frames back to the tensor cache for WebRTC delivery

3. **Server Components**:
   - `custom_nodes/comfystream_inside/server/app.py`: Manages the WebRTC connections and media tracks
   - `custom_nodes/comfystream_inside/server/pipeline.py`: Handles the processing pipeline between input and output frames

4. **Client Integration**:
   - `custom_nodes/comfystream_inside/src/comfystream/client.py`: Manages interaction with ComfyUI's execution engine

5. **Server Management**:
   - `custom_nodes/comfystream_inside/nodes/server_manager.py`: Controls starting/stopping the server process

6. **UI**:
   - `custom_nodes\comfystream_inside\ui\src\components\settings.tsx`: where the user configures settings for the stream

## High-Level Plan to Add Batching

### Using Flight Buffer for Batch Processing

The most effective approach for implementing batch processing is to use a "flight buffer" system. In this approach:

1. **Initial Buffer Phase**: 
   - Multiple batches of frames are collected before processing begins
   - A configurable buffer threshold determines when to start processing
   - This creates an initial startup delay but enables consistent processing afterward

2. **Steady State Processing**:
   - Once the buffer threshold is reached, processing begins
   - As one batch finishes processing, the next pre-assembled batch is immediately available
   - This eliminates idle time between batch processing cycles
   - The system maintains a consistent buffer size during operation

This flight buffer approach offers several key advantages:
- Ensures the processing pipeline is never starved for input
- Provides consistent frame timing once streaming begins
- Maximizes GPU/processor utilization with minimal gaps between batches
- Allows dynamic adjustment of buffer size based on processing capabilities

### Implementation Details

Implementing the flight buffer approach involves these key changes:

1. **Modify Tensor Cache System**:
   - Increase the `image_inputs` queue maxsize to hold multiple batches (e.g., 4-5× batch size)
   - Add a buffer threshold configuration parameter
   - Implement a buffer fill counter before activating processing

2. **Enhance LoadTensor Node**:
   - Modify to retrieve complete batches (B frames) from the queue at once
   - Add wait logic to pause until the buffer threshold is reached initially
   - Stack frames into a single tensor with shape BHWC where B is the batch size

3. **Update SaveTensor Node**:
   - Accept tensors with batch dimension B
   - Maintain output ordering to match input sequence

4. **Update Pipeline Processing**:
   - Modify `pipeline.py` to handle batch inputs and outputs
   - Add buffer monitoring and management logic
   - Implement buffer health metrics

5. **Configuration Options**:
   - Add batch size parameter to the server
   - Add buffer threshold configuration (e.g., minimum number of batches)
   - Allow users to configure buffer parameters through the UI


The flight buffer approach leverages ComfyUI's existing optimization for batch processing (BHWC tensor format) while ensuring a consistent flow of batches through the processing pipeline, maximizing throughput and maintaining stable frame timing.

This approach does introduce an initial startup delay as the buffer fills, but this trade-off provides significantly more consistent performance once the stream is running, which is preferable for continuous video processing applications.

### Future Enhancements

Future enhancements to the batching system could include:

1. **Adaptive Buffer Sizing**:
   - Dynamically adjust buffer size based on processing speed
   - Increase buffer when processing is faster, decrease when slower

2. **Priority Frame Handling**:
   - Tag certain frames as high-priority (e.g., key frames or frames with significant changes)
   - Ensure these frames are processed even if normal frames need to be dropped

3. **Processing Metrics**:
   - Track and report batch processing efficiency
   - Provide recommendations for optimal batch and buffer settings

4. **Performance Considerations**:
   - Monitor buffer health to adjust parameters dynamically if needed
   - Implement intelligent frame dropping when buffer gets too full
   - Add buffer underrun detection and handling

5. **UI Feedback**:
   - Display buffer status in the UI (current fill level, health)
   - Show startup buffer countdown
   - Provide batch processing metrics
