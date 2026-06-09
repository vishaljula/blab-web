import { NextResponse } from "next/server";
import { sendOTP } from "@/lib/sms";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone) {
      return NextResponse.json({ success: false, error: "Phone number is required" }, { status: 400 });
    }
    const result = await sendOTP(phone);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("send-otp route error:", error);
    return NextResponse.json({ success: false, error: error.message || "Server error" }, { status: 500 });
  }
}
