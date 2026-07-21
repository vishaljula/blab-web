"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ArrowLeft,
  User,
  KeyRound,
  Sparkles,
  Mail,
  CheckCircle2,
  Clock,
  X,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import {
  sendOtpAction,
  completeOnboardingAction,
  sendEmailOtpAction,
  verifyEmailOtpAction,
  createJiraTicketAction
} from "@/app/actions/auth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "phone" | "otp" | "onboarding";

const COUNTRIES = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+31", name: "Netherlands", flag: "🇳🇱" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
];

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { data: session, status, update: updateSession } = useSession();

  // Auth flow states
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [isResendActive, setIsResendActive] = useState(false);

  // Onboarding profile states
  const [name, setName] = useState("");
  const [role, setRole] = useState<"buyer" | "owner" | "realtor" | "developer">("owner");
  const [reraNumber, setReraNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [projectCount, setProjectCount] = useState("1-5");

  // Feedback/Support states
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [lastErrorMsg, setLastErrorMsg] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // OTP input refs
  const inputRefs = useRef<HTMLInputElement[]>([]);

  const isForcedOnboarding = status === "authenticated" && !session?.user?.name;

  // Sync state with authentication session
  useEffect(() => {
    if (!isOpen) return;

    if (status === "authenticated") {
      if (!session?.user?.name) {
        setStep("onboarding");
      } else {
        onClose();
      }
    } else {
      setStep("phone");
    }
  }, [status, session, isOpen, onClose]);

  // Countdown timer for SMS OTP
  useEffect(() => {
    if (step !== "otp") return;
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    } else {
      setIsResendActive(true);
    }
  }, [step, timer]);



  // Handle SMS OTP Sending
  const handleSendSMS = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setLoading(true);
    const fullPhone = `${countryCode}${phoneNumber}`;

    try {
      const res = await sendOtpAction(fullPhone);
      if (res.success) {
        toast.success("Verification code sent!");
        setTimer(60);
        setIsResendActive(false);
        setStep("otp");
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else {
        setLastErrorMsg(res.error || "SMS send failure");
        toast.error(res.error || "Failed to send verification code");
      }
    } catch (err: any) {
      setLastErrorMsg(err.message || "Error sending code");
      toast.error(err.message || "Error sending code");
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async (codeString?: string) => {
    const code = codeString || otpCode.join("");
    if (code.length !== 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    setLoading(true);
    const fullPhone = `${countryCode}${phoneNumber}`;

    try {
      const result = await signIn("credentials", {
        redirect: false,
        phone: fullPhone,
        code,
      });

      if (result?.error) {
        setLastErrorMsg(result.error || "Invalid verification code");
        toast.error(result.error || "Invalid verification code");
        setOtpCode(Array(6).fill(""));
        inputRefs.current[0]?.focus();
      } else {
        toast.success("Phone Verified Successfully!");
      }
    } catch (err: any) {
      setLastErrorMsg(err.message || "Error verifying code");
      toast.error(err.message || "Error verifying code");
    } finally {
      setLoading(false);
    }
  };

  // Onboarding submission
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Full Name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await completeOnboardingAction({
        name,
        role,
        reraNumber: role === "realtor" || role === "developer" ? reraNumber : undefined,
        companyName: role === "realtor" || role === "developer" ? companyName : undefined,
        projectCount: role === "developer" ? projectCount : undefined,
      });

      if (res.success) {
        toast.success("Welcome to Blab!");
        // Update Session to sync JWT/Cookie values
        await updateSession({ name, role, reraNumber, companyName, projectCount });
        onClose();
      } else {
        toast.error(res.error || "Failed to complete onboarding");
      }
    } catch (err: any) {
      toast.error(err.message || "Onboarding Error");
    } finally {
      setLoading(false);
    }
  };

  // Support/Jira ticket submission
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) {
      toast.error("Please enter your feedback description");
      return;
    }
    setSubmittingFeedback(true);
    const identifier = `${countryCode}${phoneNumber}` || session?.user?.email || "onboarding-user";
    try {
      const res = await createJiraTicketAction(identifier, lastErrorMsg, feedbackText);
      if (res.success) {
        toast.success("Thank you! Your report has been submitted to our support team.");
        setFeedbackText("");
        setFeedbackOpen(false);
      } else {
        toast.error(res.error || "Failed to submit feedback");
      }
    } catch (err: any) {
      toast.error("Error connecting to support system");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const digits = pastedData.split("");
    const newOtp = Array(6).fill("");
    for (let i = 0; i < 6; i++) {
      newOtp[i] = digits[i] || "";
    }

    setOtpCode(newOtp);
    const targetIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[targetIndex]?.focus();
    if (pastedData.length === 6) {
      handleVerifyOtp(pastedData);
    }
  };

  // Auto-focus OTP inputs handling
  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return; // Only allow numbers

    const newOtp = [...otpCode];
    if (value.length > 1) {
      const digits = value.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newOtp[i] = digits[i] || "";
      }
      setOtpCode(newOtp);
      const lastIndex = Math.min(digits.length - 1, 5);
      inputRefs.current[lastIndex]?.focus();
      if (digits.length === 6) {
        handleVerifyOtp(digits.join(""));
      }
      return;
    }

    newOtp[index] = value;
    setOtpCode(newOtp);

    if (value !== "" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((digit) => digit !== "")) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && otpCode[index] === "" && index > 0) {
      const newOtp = [...otpCode];
      newOtp[index - 1] = "";
      setOtpCode(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };



  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isForcedOnboarding) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md px-4 py-12"
        >
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-[480px] bg-card border border-border rounded-xl shadow-lg p-8 relative z-10 dark:bg-card"
          >
        {/* Close Button */}
        {!isForcedOnboarding && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        )}

        <AnimatePresence mode="wait">
          {step === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck size={28} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
                  Welcome to Blab
                </h1>
                <p className="text-sm text-muted-foreground">
                  Verify your phone number to find premium properties.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Phone Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-3 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm font-medium"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter 10 digit number"
                      maxLength={10}
                      className="flex-1 px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleSendSMS}
                    disabled={loading || phoneNumber.length < 10}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:opacity-90 text-primary-foreground font-semibold rounded-lg text-sm transition-opacity cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <KeyRound size={16} />
                    Send Verification OTP
                  </button>
                </div>
              </div>

              <div className="text-center pt-2">
                <span className="text-xs text-muted-foreground/80">
                  By continuing, you agree to our Terms of Service & Privacy Policy.
                </span>
              </div>
            </motion.div>
          )}

          {step === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep("phone")}
                  className="p-1.5 hover:bg-secondary border border-transparent rounded-full text-muted-foreground hover:text-foreground transition-all"
                >
                  <ArrowLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-muted-foreground">Go Back</span>
              </div>

              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
                  Enter OTP Code
                </h1>
                <p className="text-sm text-muted-foreground">
                  Sent to <span className="font-semibold text-foreground">{countryCode} {phoneNumber}</span>
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between gap-2 max-w-[320px] mx-auto">
                  {otpCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        if (el) inputRefs.current[i] = el;
                      }}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, i)}
                      onKeyDown={(e) => handleOtpKeyDown(e, i)}
                      onPaste={handlePaste}
                      className="w-11 h-12 text-center text-lg font-bold bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  ))}
                </div>

                {process.env.NEXT_PUBLIC_DEV_OTP_MOCK === "true" && (
                  <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg text-primary text-xs justify-center font-medium">
                    <Sparkles size={14} />
                    <span>[Mock Mode] Use verification code: <strong>123456</strong></span>
                  </div>
                )}

                <div className="text-center text-sm space-y-2">
                  <div className="text-muted-foreground">
                    {!isResendActive ? (
                      <span>Resend code in <span className="font-semibold text-foreground">{timer}s</span></span>
                    ) : (
                      <button
                        onClick={handleSendSMS}
                        disabled={loading}
                        className="text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        Resend OTP Code
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "onboarding" && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User size={28} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
                  Complete Your Profile
                </h1>
                <p className="text-sm text-muted-foreground">
                  Customize your Blab experience and find the right listings.
                </p>
              </div>

              <form onSubmit={handleOnboardingSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="E.g. Rajesh Kumar"
                    className="w-full px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  />
                </div>


                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Who are you? (Role)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "owner", label: "Property Owner", desc: "Selling / renting out" },
                      { id: "buyer", label: "Buyer / Renter", desc: "Finding properties" },
                      { id: "realtor", label: "Agent / Realtor", desc: "Listing properties" },
                      { id: "developer", label: "Developer", desc: "New projects builder" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRole(item.id as any)}
                        className={`flex flex-col text-left p-3 border rounded-lg transition-all ${
                          role === item.id
                            ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                            : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}
                      >
                        <span className="text-xs font-bold text-foreground">{item.label}</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional Fields for Brokers and Developers */}
                {(role === "realtor" || role === "developer") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-4 pt-2 border-t border-border"
                  >
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Company Name
                      </label>
                      <input
                        type="text"
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="E.g. Premium Realty Group"
                        className="w-full px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        RERA Registration Number
                      </label>
                      <input
                        type="text"
                        required
                        value={reraNumber}
                        onChange={(e) => setReraNumber(e.target.value)}
                        placeholder="E.g. PRM/KA/RERA/1251/..."
                        className="w-full px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                      />
                    </div>
                  </motion.div>
                )}

                {role === "developer" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Number of Active Projects
                    </label>
                    <select
                      value={projectCount}
                      onChange={(e) => setProjectCount(e.target.value)}
                      className="w-full px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    >
                      <option value="1-5">1 - 5 Projects</option>
                      <option value="6-20">6 - 20 Projects</option>
                      <option value="20+">20+ Projects</option>
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg text-sm transition-opacity cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Complete Registration & Login
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Support/Jira report trigger */}
        <div className="mt-6 pt-4 border-t border-border/60 text-center">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <MessageSquare size={13} />
            Having trouble? Report a problem
          </button>
        </div>
      </motion.div>

      {/* Support/Jira Feedback Modal */}
      <AnimatePresence>
        {feedbackOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[420px] bg-card border border-border rounded-xl shadow-xl p-6 relative"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <h3 className="text-md font-bold text-foreground font-display flex items-center gap-2">
                    <MessageSquare size={18} className="text-primary" /> Report Onboarding Issue
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackText("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Experiencing issues with receiving codes or logging in? Submit a report directly to our development team's backlog.
                </p>

                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Describe the problem
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="e.g. Email verification code is not arriving, or verification failed with an error."
                      className="w-full px-3 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-xs placeholder:text-muted-foreground/60 resize-none"
                    />
                  </div>

                  {lastErrorMsg && (
                    <div className="p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg text-[10px] text-red-500 font-mono break-all max-h-16 overflow-y-auto">
                      <strong>Diagnostics:</strong> {lastErrorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg text-xs transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {submittingFeedback ? "Submitting Ticket..." : "Submit Support Ticket"}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
