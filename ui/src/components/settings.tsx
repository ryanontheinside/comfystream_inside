import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/hooks/use-media-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Select } from "./ui/select";

export interface StreamConfig {
  streamUrl: string;
  frameRate: number;
  videoPrompt?: any;
  audioPrompt?: any;
  selectedDeviceId: string;
  selectedAudioDeviceId: string; // New property for audio device
}

interface VideoDevice {
  deviceId: string;
  label: string;
}

export const DEFAULT_CONFIG: StreamConfig = {
  streamUrl:
    process.env.NEXT_PUBLIC_DEFAULT_STREAM_URL || "http://127.0.0.1:3000",
  frameRate: 30,
  selectedDeviceId: "",
  selectedAudioDeviceId: "", // Default value for audio device
};

interface StreamSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: StreamConfig) => void;
}

export function StreamSettings({
  open,
  onOpenChange,
  onSave,
}: StreamSettingsProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [config, setConfig] = useState<StreamConfig>(DEFAULT_CONFIG);

  const handleSubmit = (config: StreamConfig) => {
    setConfig(config);
    onSave(config);
    onOpenChange(false);
  };

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader className="text-left">
            <DialogTitle>
              <div className="mt-4">Stream Settings</div>
            </DialogTitle>
          </DialogHeader>
          <ConfigForm config={config} onSubmit={handleSubmit} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Stream Settings</DrawerTitle>
        </DrawerHeader>
        <div className="px-4">
          <ConfigForm config={config} onSubmit={handleSubmit} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const formSchema = z.object({
  streamUrl: z.string().url(),
  frameRate: z.coerce.number(),
});

interface ConfigFormProps {
  config: StreamConfig;
  onSubmit: (config: StreamConfig) => void;
}

function ConfigForm({ config, onSubmit }: ConfigFormProps) {
  const [videoPrompt, setVideoPrompt] = useState<any>(null);
  const [audioPrompt, setAudioPrompt] = useState<any>(null);
  const [videoDevices, setVideoDevices] = useState<VideoDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<VideoDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: config,
  });

  const getVideoDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 5)}...`,
        }));

      setVideoDevices(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedDevice((curr) => curr || videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error("Failed to get video devices");
    }
  }, []);

  const getAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`,
        }));

      setAudioDevices(audioDevices);
      if (audioDevices.length > 0) {
        setSelectedAudioDevice((curr) => curr || audioDevices[0].deviceId);
      }
    } catch (err) {
      console.error("Failed to get audio devices");
    }
  }, []);

  useEffect(() => {
    getVideoDevices();
    getAudioDevices();
    navigator.mediaDevices.addEventListener("devicechange", getVideoDevices);
    navigator.mediaDevices.addEventListener("devicechange", getAudioDevices);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        getVideoDevices
      );
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        getAudioDevices
      );
    };
  }, [getVideoDevices, getAudioDevices]);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit({
      ...values,
      streamUrl: values.streamUrl
        ? values.streamUrl.replace(/\/+$/, "")
        : values.streamUrl,
      videoPrompt: videoPrompt,
      audioPrompt: audioPrompt,
      selectedDeviceId: selectedDevice,
      selectedAudioDeviceId: selectedAudioDevice,
    });
  };

  const handleVideoPromptChange = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      setVideoPrompt(JSON.parse(text));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAudioPromptChange = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      setAudioPrompt(JSON.parse(text));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} autoComplete="off">
        <FormField
          control={form.control}
          name="streamUrl"
          render={({ field }) => (
            <FormItem className="mt-4">
              <FormLabel>Stream URL</FormLabel>
              <FormControl>
                <Input placeholder="Stream URL" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="frameRate"
          render={({ field }) => (
            <FormItem className="mt-4">
              <FormLabel>Frame Rate</FormLabel>
              <FormControl>
                <Input placeholder="Frame Rate" {...field} type="number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="mt-4 mb-4">
          <Label>Camera</Label>
          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
            <Select.Trigger className="w-full mt-2">
              {videoDevices.find((d) => d.deviceId === selectedDevice)?.label ||
                "Select camera"}
            </Select.Trigger>
            <Select.Content>
              {videoDevices.map((device) => (
                <Select.Option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </div>

        <div className="mt-4 mb-4">
          <Label>Microphone</Label>
          <Select value={selectedAudioDevice} onValueChange={setSelectedAudioDevice}>
            <Select.Trigger className="w-full mt-2">
              {audioDevices.find((d) => d.deviceId === selectedAudioDevice)?.label ||
                "Select microphone"}
            </Select.Trigger>
            <Select.Content>
              {audioDevices.map((device) => (
                <Select.Option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        </div>

        <div className="mt-4 mb-4 grid max-w-sm items-center gap-3">
          <Label>Comfy Video Workflow</Label>
          <Input
            id="video-workflow"
            type="file"
            accept=".json"
            onChange={handleVideoPromptChange}
          ></Input>
        </div>

        <div className="mt-4 mb-4 grid max-w-sm items-center gap-3">
          <Label>Comfy Audio Workflow</Label>
          <Input
            id="audio-workflow"
            type="file"
            accept=".json"
            onChange={handleAudioPromptChange}
          ></Input>
        </div>

        <Button type="submit" className="w-full mt-4 mb-4">
          Start Stream
        </Button>
      </form>
    </Form>
  );
}
