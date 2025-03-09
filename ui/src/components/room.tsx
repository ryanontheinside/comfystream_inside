"use client";

import { PeerConnector } from "@/components/peer";
import { StreamConfig, StreamSettings, DEFAULT_CONFIG } from "@/components/settings";
import { Webcam } from "@/components/webcam";
import { usePeerContext } from "@/context/peer-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ControlPanelsContainer } from "@/components/control-panels-container";
import { Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaStreamPlayerProps {
  stream: MediaStream;
  resolution: { width: number; height: number };
}

function MediaStreamPlayer({ stream, resolution }: MediaStreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [needsPlayButton, setNeedsPlayButton] = useState(false);
  const [playAttempts, setPlayAttempts] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    video.srcObject = stream;
    setNeedsPlayButton(false);

    // Handle autoplay
    const playStream = async () => {
      try {
        // Only attempt to play if the video element exists and has a valid srcObject
        if (video && video.srcObject) {
          console.log("[MediaStreamPlayer] Attempting autoplay...");
          await video.play();
          console.log("[MediaStreamPlayer] Autoplay successful");
          setNeedsPlayButton(false);
        } else {
          console.warn("[MediaStreamPlayer] Cannot autoplay - no video or srcObject");
          setNeedsPlayButton(true);
        }
      } catch (error) {
        // Log error but don't throw - this is likely due to browser autoplay policy
        console.warn("[MediaStreamPlayer] Autoplay prevented:", error);
        setNeedsPlayButton(true);
      }
    };
    playStream();

    return () => {
      if (video) {
        video.srcObject = null;
        video.pause();
      }
    };
  }, [stream]);

  const handlePlayClick = async () => {
    try {
      console.log("[MediaStreamPlayer] Play button clicked");
      setPlayAttempts(prev => prev + 1);
      
      if (!videoRef.current) {
        console.warn("[MediaStreamPlayer] No video element found");
        return;
      }
      
      if (!videoRef.current.srcObject) {
        console.warn("[MediaStreamPlayer] No srcObject on video element, re-attaching stream");
        videoRef.current.srcObject = stream;
      }

      // Force a user interaction with the video element
      videoRef.current.controls = true;
      setTimeout(() => {
        if (videoRef.current) videoRef.current.controls = false;
      }, 50);
      
      console.log("[MediaStreamPlayer] Attempting to play video...");
      const playPromise = videoRef.current.play();
      
      await playPromise;
      console.log("[MediaStreamPlayer] Play successful");
      setNeedsPlayButton(false);
    } catch (error) {
      console.warn("[MediaStreamPlayer] Manual play failed:", error);
      // If we've tried a few times with the normal approach, try a more aggressive approach
      if (playAttempts > 2) {
        try {
          console.log("[MediaStreamPlayer] Trying alternative play approach...");
          const video = videoRef.current;
          if (video) {
            // Try with muted first (browsers are more permissive with muted videos)
            video.muted = true;
            await video.play();
            console.log("[MediaStreamPlayer] Alternative play successful (muted)");
            // Optionally unmute after successful play
            // video.muted = false;
            setNeedsPlayButton(false);
          }
        } catch (fallbackError) {
          console.error("[MediaStreamPlayer] All play attempts failed:", fallbackError);
        }
      }
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error("[MediaStreamPlayer] Fullscreen error:", error);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full" 
      style={{ aspectRatio: `${resolution.width}/${resolution.height}` }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
      {needsPlayButton && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <button
            onClick={handlePlayClick}
            className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200 transition-colors"
          >
            Click to Play {playAttempts > 0 ? `(Attempt ${playAttempts})` : ""}
          </button>
        </div>
      )}
      <div className="absolute bottom-2 right-2 z-10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="bg-black/50 text-white hover:bg-black/70"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

interface StageProps {
  connected: boolean;
  onStreamReady: () => void;
  resolution: { width: number; height: number };
}

function Stage({ connected, onStreamReady, resolution }: StageProps) {
  const { remoteStream, peerConnection } = usePeerContext();
  const [frameRate, setFrameRate] = useState<number>(0);

  useEffect(() => {
    if (!connected || !remoteStream) return;

    onStreamReady();

    const interval = setInterval(() => {
      if (peerConnection) {
        peerConnection.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
              const currentFrameRate = report.framesPerSecond;
              if (currentFrameRate) {
                setFrameRate(Math.round(currentFrameRate));
              }
            }
          });
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connected, remoteStream, peerConnection, onStreamReady]);

  if (!connected || !remoteStream) {
    return (
      <>
        <video 
          className="w-full h-full object-cover" 
          autoPlay 
          loop 
          playsInline
          style={{ aspectRatio: `${resolution.width}/${resolution.height}` }}
        >
          <source src="/loading.mp4" type="video/mp4" />
        </video>
      </>
    );
  }

  const hasVideo = remoteStream.getVideoTracks().length > 0;

  return (
    <div 
      className="relative w-full h-full"
      style={{ aspectRatio: `${resolution.width}/${resolution.height}` }}
    >
      <MediaStreamPlayer stream={remoteStream} resolution={resolution} />
      {hasVideo && (
        <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>{frameRate} FPS</TooltipTrigger>
              <TooltipContent>
                <p>This is the FPS of the output stream.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}

/**
 * Creates a room component for the user to stream their webcam to ComfyStream and
 * see the output stream.
 */
export const Room = () => {
  const [connect, setConnect] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStreamSettingsOpen, setIsStreamSettingsOpen] =
    useState<boolean>(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [loadingToastId, setLoadingToastId] = useState<
    string | number | undefined
  >(undefined);

  const [config, setConfig] = useState<StreamConfig>({
    ...DEFAULT_CONFIG,
    streamUrl: "",
    frameRate: 0,
    selectedVideoDeviceId: "",
    selectedAudioDeviceId: "",
    prompts: null,
  });

  const connectingRef = useRef(false);

  const onStreamReady = useCallback((stream: MediaStream) => {
    setLocalStream(stream);
  }, []);

  const onRemoteStreamReady = useCallback(() => {
    toast.success("Started stream!", { id: loadingToastId });
    setLoadingToastId(undefined);
  }, [loadingToastId]);

  const onStreamConfigSave = useCallback((config: StreamConfig) => {
    setConfig(config);
    
    // If resolution changed, we need to restart the stream
    if (localStream && 
        (config.resolution.width !== DEFAULT_CONFIG.resolution.width || 
         config.resolution.height !== DEFAULT_CONFIG.resolution.height)) {
      console.log(`[Room] Resolution changed to ${config.resolution.width}x${config.resolution.height}, restarting stream`);
    }
  }, [localStream]);

  useEffect(() => {
    if (connectingRef.current) return;

    if (!config.streamUrl) {
      setConnect(false);
    } else {
      setConnect(true);

      const id = toast.loading("Starting stream...");
      setLoadingToastId(id);

      connectingRef.current = true;
    }
  }, [config.streamUrl]);

  const handleConnected = useCallback(() => {
    setIsConnected(true);
    connectingRef.current = false;
  }, []);

  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none">
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      />
      <div className="fixed inset-0 z-[-1] bg-cover bg-[black]">
        <PeerConnector
          url={config.streamUrl}
          prompts={config.prompts ?? null}
          connect={connect}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
          localStream={localStream}
          resolution={config.resolution}
        >
          <div className="min-h-[100dvh] flex flex-col items-center justify-center md:justify-start">
            <div className="w-full max-h-[100dvh] flex flex-col md:flex-row landscape:flex-row justify-center items-center lg:space-x-4 md:pt-[10vh]">
              {/* Output stream */}
              <div 
                className="relative w-full max-w-[100vw] sm:max-w-[640px] md:max-w-[512px] flex justify-center items-center bg-slate-900 sm:border-[2px] md:border-0 lg:border-2 rounded-md overflow-hidden"
                style={{
                  aspectRatio: `${config.resolution.width}/${config.resolution.height}`,
                }}
              >
                <Stage
                  connected={isConnected}
                  onStreamReady={onRemoteStreamReady}
                  resolution={config.resolution}
                />
                {/* Thumbnail (mobile) */}
                <div className="absolute bottom-[8px] right-[8px] w-[70px] h-[70px] sm:w-[90px] sm:h-[90px] bg-slate-800 block md:hidden overflow-hidden">
                  <Webcam
                    onStreamReady={onStreamReady}
                    deviceId={config.selectedVideoDeviceId}
                    frameRate={config.frameRate}
                    selectedAudioDeviceId={config.selectedAudioDeviceId}
                    resolution={config.resolution}
                  />
                </div>
              </div>
              {/* Input stream (desktop) */}
              <div 
                className="hidden md:flex w-full sm:w-full md:w-full max-w-[512px] flex justify-center items-center lg:border-2 lg:rounded-md bg-slate-800 overflow-hidden"
                style={{
                  aspectRatio: `${config.resolution.width}/${config.resolution.height}`,
                }}
              >
                <Webcam
                  onStreamReady={onStreamReady}
                  deviceId={config.selectedVideoDeviceId}
                  frameRate={config.frameRate}
                  selectedAudioDeviceId={config.selectedAudioDeviceId}
                  resolution={config.resolution}
                />
              </div>
            </div>

            {isConnected && <ControlPanelsContainer />}

            <StreamSettings
              open={isStreamSettingsOpen}
              onOpenChange={setIsStreamSettingsOpen}
              onSave={onStreamConfigSave}
            />
          </div>
        </PeerConnector>
      </div>
    </main>
  );
};
