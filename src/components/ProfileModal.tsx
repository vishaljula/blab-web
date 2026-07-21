"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  CheckCircle2,
  Clock,
  X,
  ShieldCheck,
  UserCheck,
  LogOut
} from "lucide-react";
import { toast } from "sonner";
import {
  completeOnboardingAction,
  sendEmailOtpAction,
  verifyEmailOtpAction
} from "@/app/actions/auth";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { data: session, update: updateSession } = useSession();

  // Profile fields
  const [name, setName] = useState("");
  const [role, setRole] = useState<"buyer" | "owner" | "realtor" | "developer">("owner");
  const [reraNumber, setReraNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [projectCount, setProjectCount] = useState("1-5");

  // Email verification states
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState<string[]>(Array(6).fill(""));
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const [loading, setLoading] = useState(false);

  // Email input refs
  const emailInputRefs = useRef<HTMLInputElement[]>([]);

  // Load existing profile from session
  useEffect(() => {
    if (session?.user && isOpen) {
      setName(session.user.name || "");
      setRole((session.user as any).role || "owner");
      setReraNumber((session.user as any).reraNumber || "");
      setCompanyName((session.user as any).companyName || "");
      setProjectCount((session.user as any).projectCount || "1-5");

      const savedEmail = session.user.email || "";
      setEmail(savedEmail);
      setOriginalEmail(savedEmail);
      setEmailVerified(!!savedEmail); // If it exists in session, it is already verified
      setEmailOtpSent(false);
      setEmailOtpCode(Array(6).fill(""));
    }
  }, [session, isOpen]);

  // Handle Email OTP Sending
  const handleSendEmailOtp = async () => {
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!email || !isValidEmail) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingEmailOtp(true);
    try {
      const res = await sendEmailOtpAction(email);
      if (res.success) {
        toast.success("Verification code sent to email!");
        setEmailOtpSent(true);
        setTimeout(() => emailInputRefs.current[0]?.focus(), 100);
      } else {
        toast.error(res.error || "Failed to send verification code");
      }
    } catch (err: any) {
      toast.error(err.message || "Error sending verification code");
    } finally {
      setSendingEmailOtp(false);
    }
  };

  // Handle Email OTP Verification
  const handleVerifyEmailOtp = async (codeString?: string) => {
    const code = codeString || emailOtpCode.join("");
    if (code.length !== 6) {
      toast.error("Please enter all 6 digits");
      return;
    }

    setVerifyingEmailOtp(true);
    try {
      const res = await verifyEmailOtpAction(email, code);
      if (res.success) {
        toast.success("Email verified successfully!");
        setEmailVerified(true);
      } else {
        toast.error(res.error || "Invalid verification code");
        setEmailOtpCode(Array(6).fill(""));
        emailInputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      toast.error(err.message || "Error verifying email code");
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  // Clipboard Paste Helper for Email OTP
  const handleEmailPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const digits = pastedData.split("");
    const newOtp = Array(6).fill("");
    for (let i = 0; i < 6; i++) {
      newOtp[i] = digits[i] || "";
    }

    setEmailOtpCode(newOtp);
    const targetIndex = Math.min(pastedData.length - 1, 5);
    emailInputRefs.current[targetIndex]?.focus();
    if (pastedData.length === 6) {
      handleVerifyEmailOtp(pastedData);
    }
  };

  const handleEmailOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...emailOtpCode];
    if (value.length > 1) {
      const digits = value.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newOtp[i] = digits[i] || "";
      }
      setEmailOtpCode(newOtp);
      const lastIndex = Math.min(digits.length - 1, 5);
      emailInputRefs.current[lastIndex]?.focus();
      if (digits.length === 6) {
        handleVerifyEmailOtp(digits.join(""));
      }
      return;
    }

    newOtp[index] = value;
    setEmailOtpCode(newOtp);

    if (value !== "" && index < 5) {
      emailInputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((digit) => digit !== "")) {
      handleVerifyEmailOtp(newOtp.join(""));
    }
  };

  const handleEmailOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && emailOtpCode[index] === "" && index > 0) {
      const newOtp = [...emailOtpCode];
      newOtp[index - 1] = "";
      setEmailOtpCode(newOtp);
      emailInputRefs.current[index - 1]?.focus();
    }
  };

  // Submit Profile Changes
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Full Name is required");
      return;
    }

    const typedEmail = email.trim();
    const isEmailChanged = typedEmail !== originalEmail;
    if (typedEmail && isEmailChanged && !emailVerified) {
      toast.error("Please verify your email address or clear it before saving");
      return;
    }

    setLoading(true);
    try {
      const res = await completeOnboardingAction({
        name,
        email: typedEmail || undefined,
        role,
        reraNumber: role === "realtor" || role === "developer" ? reraNumber : undefined,
        companyName: role === "realtor" || role === "developer" ? companyName : undefined,
        projectCount: role === "developer" ? projectCount : undefined,
      });

      if (res.success) {
        toast.success("Profile updated successfully!");
        await updateSession({
          name,
          email: typedEmail || undefined,
          role,
          reraNumber: role === "realtor" || role === "developer" ? reraNumber : undefined,
          companyName: role === "realtor" || role === "developer" ? companyName : undefined,
          projectCount: role === "developer" ? projectCount : undefined,
        });
        onClose();
      } else {
        toast.error(res.error || "Failed to update profile");
      }
    } catch (err: any) {
      toast.error(err.message || "Profile Update Error");
    } finally {
      setLoading(false);
    }
  };

  const isEmailChanged = email.trim() !== originalEmail;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && onClose()}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md px-4 py-12"
        >
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-[480px] bg-card border border-border rounded-xl shadow-lg p-6 relative z-10 dark:bg-card max-h-[90vh] overflow-y-auto"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserCheck size={26} />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground font-display">
                  Profile Settings
                </h1>
                <p className="text-xs text-muted-foreground">
                  Update your contact details and roles on Blab.
                </p>
              </div>

              {/* Verified Phone display */}
              <div className="p-3 bg-secondary/80 rounded-lg border border-border flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
                <div className="text-left">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Verified Phone</div>
                  <div className="text-sm font-semibold text-foreground font-mono">
                    {(session?.user as any)?.phone || "Phone verified"}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Email Address (Optional)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (e.target.value.trim() === originalEmail) {
                            setEmailVerified(true);
                          } else {
                            setEmailVerified(false);
                          }
                          setEmailOtpSent(false);
                          setEmailOtpCode(Array(6).fill(""));
                        }}
                        placeholder="E.g. rajesh@example.com"
                        className={`w-full px-4 py-2 bg-secondary border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm pr-10 ${
                          emailVerified && email.trim() !== ""
                            ? "border-emerald-500/45 bg-emerald-500/5 text-emerald-950 dark:text-emerald-300"
                            : ""
                        }`}
                      />
                      {emailVerified && email.trim() !== "" && (
                        <div className="absolute right-3 text-emerald-500 flex items-center gap-1 text-xs font-bold">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </div>
                  </div>

                  {isEmailChanged && email.trim() !== "" && !emailVerified && !emailOtpSent && (
                    <button
                      type="button"
                      onClick={handleSendEmailOtp}
                      disabled={sendingEmailOtp || !isEmailValid}
                      className={`w-full flex items-center justify-center gap-2 py-2 font-bold rounded-lg text-xs transition-all cursor-pointer ${
                        isEmailValid
                          ? "bg-primary text-primary-foreground hover:opacity-90 border border-transparent shadow-sm"
                          : "bg-secondary text-muted-foreground/60 border border-border disabled:opacity-50 disabled:cursor-not-allowed"
                      }`}
                    >
                      <Mail size={13} />
                      {sendingEmailOtp ? "Sending Verification Code..." : "Verify New Email"}
                    </button>
                  )}

                  {emailOtpSent && !emailVerified && (
                    <div className="space-y-3 p-3 bg-secondary/50 border border-border rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                          <Clock size={11} /> Enter Email OTP
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEmailOtpSent(false);
                            setEmailOtpCode(Array(6).fill(""));
                          }}
                          className="text-[10px] text-primary hover:underline bg-transparent border-none p-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="flex justify-between gap-1 max-w-[285px] mx-auto py-1">
                        {emailOtpCode.map((digit, i) => (
                          <input
                            key={i}
                            ref={(el) => {
                              if (el) emailInputRefs.current[i] = el;
                            }}
                            type="text"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleEmailOtpChange(e.target.value, i)}
                            onKeyDown={(e) => handleEmailOtpKeyDown(e, i)}
                            onPaste={handleEmailPaste}
                            className="w-9 h-10 text-center text-md font-bold bg-card border border-border text-foreground rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Role
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
                        className={`flex flex-col text-left p-2.5 border rounded-lg transition-all ${
                          role === item.id
                            ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                            : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}
                      >
                        <span className="text-xs font-bold text-foreground">{item.label}</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional Fields for Brokers and Developers */}
                {(role === "realtor" || role === "developer") && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  </div>
                )}

                {role === "developer" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  disabled={loading || (isEmailChanged && email.trim() !== "" && !emailVerified)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-lg text-sm transition-opacity cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Profile Changes
                </button>

                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-200 dark:border-red-950/30 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 font-bold rounded-lg text-sm transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
