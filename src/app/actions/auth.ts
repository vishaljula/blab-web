"use server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, hashString } from "@/lib/crypto";
import { sendOTP, sendEmailOTP, verifyEmailOTP } from "@/lib/sms";

/**
 * Server Action: Triggers OTP sending to the phone number.
 */
export async function sendOtpAction(phone: string) {
  if (!phone) {
    return { success: false, error: "Phone number is required" };
  }
  return await sendOTP(phone);
}

interface OnboardingInput {
  name: string;
  email: string;
  role: "buyer" | "owner" | "broker" | "developer";
  reraNumber?: string;
  companyName?: string;
  projectCount?: string;
}

/**
 * Server Action: Complete profile onboarding for the currently authenticated user.
 */
export async function completeOnboardingAction(data: OnboardingInput) {
  const session = await auth();
  if (!session || !session.user || !(session.user as any).id) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const userId = (session.user as any).id;

  try {
    const db = getDb();
    
    // Encrypt the fields at application level
    const encryptedName = encrypt(data.name);
    const encryptedEmail = encrypt(data.email);
    const emailHash = hashString(data.email);

    // Update the user record
    await db
      .update(users)
      .set({
        encryptedName,
        encryptedEmail,
        emailHash,
        role: data.role,
        reraNumber: data.role === "broker" || data.role === "developer" ? data.reraNumber || null : null,
        companyName: data.role === "broker" || data.role === "developer" ? data.companyName || null : null,
        projectCount: data.role === "developer" ? data.projectCount || null : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error: any) {
    console.error("Onboarding action error:", error);
    return { success: false, error: error.message || "Failed to update profile" };
  }
}

/**
 * Server Action: Triggers OTP sending to an email address.
 */
export async function sendEmailOtpAction(email: string) {
  if (!email) {
    return { success: false, error: "Email address is required" };
  }
  return await sendEmailOTP(email);
}

/**
 * Server Action: Verifies the email OTP code.
 */
export async function verifyEmailOtpAction(email: string, code: string) {
  if (!email || !code) {
    return { success: false, error: "Email and verification code are required" };
  }
  
  const isVerified = await verifyEmailOTP(email, code);
  if (isVerified) {
    return { success: true };
  }
  
  return { success: false, error: "Invalid verification code" };
}

/**
 * Server Action: Creates a Jira bug ticket when verification fails or user submits feedback.
 */
export async function createJiraTicketAction(emailOrPhone: string, errorMessage: string, feedback: string) {
  const jiraUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY || "SCRUM";

  if (!jiraUrl || !email || !token) {
    console.error("Jira configuration is missing in environment.");
    return { success: false, error: "Jira support configuration is offline." };
  }

  const authHeader = Buffer.from(`${email}:${token}`).toString("base64");
  const endpoint = `${jiraUrl.replace(/\/$/, "")}/rest/api/3/issue`;

  const descriptionContent = [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `User-facing issue reported during registration/onboarding.`
        }
      ]
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `User Identifier: ${emailOrPhone}`
        }
      ]
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Encountered Error: ${errorMessage || "None"}`
        }
      ]
    }
  ];

  if (feedback.trim()) {
    descriptionContent.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `User Feedback: ${feedback}`
        }
      ]
    });
  }

  const payload = {
    fields: {
      project: { key: projectKey },
      summary: `[Onboarding Issue] ${emailOrPhone}`,
      issuetype: { id: "10003" }, // 'Task' issue type ID
      description: {
        type: "doc",
        version: 1,
        content: descriptionContent
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${authHeader}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Jira API error response:", errorText);
      return { success: false, error: "Failed to submit ticket to Jira." };
    }

    const result = await response.json();
    return { success: true, ticketKey: result.key };
  } catch (err: any) {
    console.error("Failed to connect to Jira:", err);
    return { success: false, error: "Network error submitting ticket." };
  }
}
