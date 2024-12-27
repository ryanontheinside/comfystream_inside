import { NextRequest, NextResponse } from "next/server";

export const POST = async function POST(req: NextRequest) {
  const { endpoint, video_prompt, audio_prompt, offer } = await req.json();

  const res = await fetch(endpoint + "/offer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video_prompt, audio_prompt, offer }),
  });

  return NextResponse.json(await res.json(), { status: res.status });
};
