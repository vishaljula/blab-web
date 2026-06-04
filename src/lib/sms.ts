/**
 * Verification Gateway for Hybrid OTP Routing (MSG91 for India +91, Twilio for US/International)
 * Includes Developer Mock Mode for local testing without incurring SMS costs.
 */

// Developer Mock Mode helpers
const IS_MOCK = process.env.NEXT_PUBLIC_DEV_OTP_MOCK === "true";
const MOCK_CODE = process.env.DEV_OTP_MOCK_CODE || "123456";

/**
 * Send an OTP code to a phone number.
 */
export async function sendOTP(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  const normalizedPhone = phoneNumber.trim();

  if (IS_MOCK) {
    console.log(`[MOCK OTP] Send code request to ${normalizedPhone}. Mock code is: ${MOCK_CODE}`);
    return { success: true };
  }

  try {
    const hasTwilio = !!(process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET && process.env.TWILIO_VERIFY_SERVICE_SID);
    
    if (hasTwilio && !normalizedPhone.startsWith("+91")) {
      return await sendViaTwilio(normalizedPhone);
    } else {
      // Default to MSG91 for all other cases (including US numbers since MSG91 is set up for global delivery)
      return await sendViaMSG91(normalizedPhone);
    }
  } catch (error: any) {
    console.error("SMS Gateway Error Details:", error);
    
    // Hide raw configuration variable alerts from UI
    if (error?.message && error.message.includes("missing in environment")) {
      const provider = normalizedPhone.startsWith("+91") ? "India (MSG91)" : "International (Twilio)";
      return { 
        success: false, 
        error: `Verification service is not configured for ${provider} numbers yet. Please check your credentials.`
      };
    }
    
    return { success: false, error: "Verification service error. Please try again later." };
  }
}

/**
 * Verify the OTP code sent to a phone number.
 */
export async function verifyOTP(phoneNumber: string, code: string): Promise<boolean> {
  const normalizedPhone = phoneNumber.trim();
  const normalizedCode = code.trim();

  if (IS_MOCK) {
    const isMatch = normalizedCode === MOCK_CODE;
    console.log(`[MOCK OTP] Verifying ${normalizedPhone} with code ${normalizedCode}. Success: ${isMatch}`);
    return isMatch;
  }

  try {
    const hasTwilio = !!(process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET && process.env.TWILIO_VERIFY_SERVICE_SID);
    if (hasTwilio && !normalizedPhone.startsWith("+91")) {
      return await verifyViaTwilio(normalizedPhone, normalizedCode);
    } else {
      return await verifyViaMSG91(normalizedPhone, normalizedCode);
    }
  } catch (error) {
    console.error("Failed to verify OTP:", error);
    return false;
  }
}

/**
 * MSG91 Send OTP (India Domestic)
 */
async function sendViaMSG91(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    throw new Error("MSG91 configuration variables (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID) are missing in environment.");
  }

  // MSG91 expects number without '+'
  const mobile = phoneNumber.replace("+", "");

  const response = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile: mobile,
    }),
  });

  const data = await response.json();
  if (data.type === "success" || data.type === "success_otp") {
    return { success: true };
  }

  console.error("MSG91 API error response:", data);
  return { success: false, error: "Failed to send verification code. Please try again later." };
}

/**
 * MSG91 Verify OTP (India Domestic)
 */
async function verifyViaMSG91(phoneNumber: string, code: string): Promise<boolean> {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    throw new Error("MSG91_AUTH_KEY is missing in environment.");
  }

  const mobile = phoneNumber.replace("+", "");
  const response = await fetch(
    `https://control.msg91.com/api/v5/otp/verify?otp=${code}&mobile=${mobile}`,
    {
      method: "GET",
      headers: {
        authkey: authKey,
      },
    }
  );

  const data = await response.json();
  return data.type === "success";
}

/**
 * Twilio Verify Send OTP (US / International)
 */
async function sendViaTwilio(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!apiKey || !apiSecret || !serviceSid) {
    throw new Error("Twilio Verify configuration variables (TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_VERIFY_SERVICE_SID) are missing in environment.");
  }

  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      To: phoneNumber,
      Channel: "sms",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Twilio Verify SMS error response:", errorData);
    return { success: false, error: "Failed to send verification code. Please check the phone number or try again later." };
  }

  return { success: true };
}

/**
 * Twilio Verify OTP Check
 */
async function verifyViaTwilio(phoneNumber: string, code: string): Promise<boolean> {
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!apiKey || !apiSecret || !serviceSid) {
    throw new Error("Twilio Verify configuration variables are missing.");
  }

  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;
  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      To: phoneNumber,
      Code: code,
    }),
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data.status === "approved";
}

/**
 * Send an OTP code to an email address using Twilio Verify Email Channel.
 */
export async function sendEmailOTP(email: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (IS_MOCK) {
    console.log(`[MOCK EMAIL OTP] Sent code to ${normalizedEmail}. Mock code is: ${MOCK_CODE}`);
    return { success: true };
  }

  try {
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!apiKey || !apiSecret || !serviceSid) {
      throw new Error("Twilio Verify configuration variables (TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_VERIFY_SERVICE_SID) are missing in environment.");
    }

    const url = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        To: normalizedEmail,
        Channel: "email",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Twilio Verify Email error response:", errorData);
      return { success: false, error: "Failed to send verification code. Please check the email address or try again later." };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Email OTP Gateway Error Details:", error);
    return { success: false, error: "Email verification service error. Please try again later." };
  }
}

/**
 * Verify the OTP code sent to an email address.
 */
export async function verifyEmailOTP(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.trim();

  if (IS_MOCK) {
    const isMatch = normalizedCode === MOCK_CODE;
    console.log(`[MOCK EMAIL OTP] Verifying ${normalizedEmail} with code ${normalizedCode}. Success: ${isMatch}`);
    return isMatch;
  }

  try {
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!apiKey || !apiSecret || !serviceSid) {
      throw new Error("Twilio Verify configuration variables are missing.");
    }

    const url = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        To: normalizedEmail,
        Code: normalizedCode,
      }),
    });

    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "approved";
  } catch (error) {
    console.error("Failed to verify email OTP:", error);
    return false;
  }
}
