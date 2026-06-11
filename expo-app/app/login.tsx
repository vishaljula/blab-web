import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInRight,
  FadeInLeft,
  FadeOutLeft,
  FadeOutRight,
} from "react-native-reanimated";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";
import { sendOtp, verifyOtp, completeOnboarding } from "@/lib/api";
import { useListingsStore, saveStoredAuth } from "@/store/listings";

type Step = "phone" | "otp" | "onboarding";

const COUNTRIES = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", name: "UK", flag: "🇬🇧" },
  { code: "+31", name: "Netherlands", flag: "🇳🇱" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
];

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);

  // Onboarding
  const [name, setName] = useState("");
  const [role, setRole] = useState<"buyer" | "owner" | "broker" | "developer">("owner");

  const otpInputRef = useRef<TextInput>(null);

  // OTP countdown
  useEffect(() => {
    if (step !== "otp" || timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [step, timer]);

  const handleSendOTP = useCallback(async () => {
    if (phoneNumber.length < 10) {
      Alert.alert("Invalid", "Please enter a valid phone number");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const fullPhone = `${countryCode}${phoneNumber}`;
      const res = await sendOtp(fullPhone);
      if (res.success) {
        setTimer(60);
        setStep("otp");
        setTimeout(() => otpInputRef.current?.focus(), 200);
      } else {
        Alert.alert("Failed", res.error || "Failed to send verification code");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to connect to authentication server");
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, countryCode]);

  const handleVerifyOTP = useCallback(
    async (code: string) => {
      if (code.length !== 6) return;
      setLoading(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        const fullPhone = `${countryCode}${phoneNumber}`;
        const res = await verifyOtp(fullPhone, code);
        if (res.success && res.token) {
          await saveStoredAuth(res.token, res.user);
          useListingsStore.getState().setAuth(res.token, res.user);
          if (!res.user?.name) {
            setStep("onboarding");
          } else {
            router.back();
          }
        } else {
          Alert.alert("Verification Failed", res.error || "Invalid OTP code");
          setOtpCode(Array(6).fill(""));
          otpInputRef.current?.focus();
        }
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to verify code");
      } finally {
        setLoading(false);
      }
    },
    [countryCode, phoneNumber, router]
  );

  // Single input handler — receives the full OTP string (typed, pasted, or auto-filled)
  const handleOtpInput = useCallback(
    (value: string) => {
      const cleaned = value.replace(/\D/g, "").slice(0, 6);
      const newOtp = Array(6).fill("");
      cleaned.split("").forEach((d, i) => { newOtp[i] = d; });
      setOtpCode(newOtp);

      if (cleaned.length === 6) {
        handleVerifyOTP(cleaned);
      }
    },
    [handleVerifyOTP]
  );

  const handleOnboardingSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter your full name");
      return;
    }
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const token = useListingsStore.getState().token;
      if (!token) throw new Error("Authentication token missing");
      const res = await completeOnboarding(token, { name, role });
      if (res.success) {
        const currentUser = useListingsStore.getState().user || {};
        const updatedUser = { ...currentUser, name, role };
        await saveStoredAuth(token, updatedUser);
        useListingsStore.getState().setAuth(token, updatedUser);
        router.back();
      } else {
        Alert.alert("Onboarding Failed", res.error || "Failed to complete onboarding");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save profile settings");
    } finally {
      setLoading(false);
    }
  }, [name, role, router]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Platform.OS === "web" ? (isDark ? "#0A0A0A" : "#F4F4F5") : colors.card }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.select({
            web: {
              minHeight: "100%",
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 40,
            },
            default: {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 24,
            },
          }),
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={Platform.select({
            web: {
              width: "100%",
              maxWidth: 460,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 32,
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
            },
          })}
        >
          {/* Close button */}
          <Pressable
            onPress={() => router.back()}
            style={[styles.closeButton, { backgroundColor: colors.secondary }]}
          >
            <Ionicons name="close" size={20} color={colors.foreground} />
          </Pressable>

        {/* Phone Step */}
        {step === "phone" && (
          <Animated.View
            entering={FadeInRight.duration(250)}
            exiting={FadeOutLeft.duration(200)}
            style={styles.stepContainer}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Welcome to Blab</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Verify your phone number to find premium properties.
            </Text>

            <View style={styles.phoneRow}>
              <Pressable
                onPress={() => setCountryPickerVisible(true)}
                style={[
                  styles.countryPicker,
                  { backgroundColor: colors.secondary, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 }
                ]}
              >
                <Text style={[styles.countryText, { color: colors.foreground }]}>
                  {COUNTRIES.find((c) => c.code === countryCode)?.flag} {countryCode}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
              </Pressable>
              <TextInput
                value={phoneNumber}
                onChangeText={(v) => setPhoneNumber(v.replace(/\D/g, ""))}
                placeholder="Enter 10 digit number"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                maxLength={10}
                style={[
                  styles.phoneInput,
                  { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
                ]}
              />
            </View>

            <Pressable
              onPress={handleSendOTP}
              disabled={loading || phoneNumber.length < 10}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: loading || phoneNumber.length < 10 ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="key" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {loading ? "Sending..." : "Send Verification OTP"}
              </Text>
            </Pressable>

            <Text style={[styles.terms, { color: `${colors.mutedForeground}CC` }]}>
              By continuing, you agree to our Terms of Service & Privacy Policy.
            </Text>
          </Animated.View>
        )}

        {/* OTP Step */}
        {step === "otp" && (
          <Animated.View
            entering={FadeInRight.duration(250)}
            exiting={FadeOutLeft.duration(200)}
            style={styles.stepContainer}
          >
            <Pressable onPress={() => setStep("phone")} style={styles.backRow}>
              <Ionicons name="arrow-back" size={16} color={colors.mutedForeground} />
              <Text style={[styles.backText, { color: colors.mutedForeground }]}>Go Back</Text>
            </Pressable>

            <Text style={[styles.title, { color: colors.foreground }]}>Enter OTP Code</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Sent to{" "}
              <Text style={{ fontWeight: "700", color: colors.foreground }}>
                {countryCode} {phoneNumber}
              </Text>
            </Text>

            {/* Single real TextInput behind visual boxes — captures typing, paste, and auto-fill */}
            <View style={styles.otpRow}>
              <TextInput
                ref={otpInputRef}
                value={otpCode.join("")}
                onChangeText={handleOtpInput}
                maxLength={6}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                caretHidden
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                }}
              />
              {otpCode.map((digit, i) => (
                <Pressable
                  key={i}
                  onPress={() => otpInputRef.current?.focus()}
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: digit
                        ? colors.primary
                        : i === otpCode.join("").length
                          ? colors.foreground
                          : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: 18,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    {digit}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.timerText, { color: colors.mutedForeground }]}>
              {timer > 0 ? (
                <>
                  Resend code in{" "}
                  <Text style={{ fontWeight: "700", color: colors.foreground }}>{timer}s</Text>
                </>
              ) : (
                <Pressable onPress={handleSendOTP}>
                  <Text style={{ fontWeight: "700", color: colors.primary }}>Resend OTP Code</Text>
                </Pressable>
              )}
            </Text>
          </Animated.View>
        )}

        {/* Onboarding Step */}
        {step === "onboarding" && (
          <Animated.View
            entering={FadeInRight.duration(250)}
            style={styles.stepContainer}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name="person" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Complete Your Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Customize your Blab experience.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FULL NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="E.g. Rajesh Kumar"
                placeholderTextColor={`${colors.mutedForeground}99`}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>WHO ARE YOU?</Text>
              <View style={styles.roleGrid}>
                {[
                  { id: "owner", label: "Property Owner", desc: "Selling / renting out" },
                  { id: "buyer", label: "Buyer / Renter", desc: "Finding properties" },
                  { id: "broker", label: "Agent / Broker", desc: "Listing properties" },
                  { id: "developer", label: "Developer", desc: "New projects builder" },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRole(item.id as any);
                    }}
                    style={[
                      styles.roleCard,
                      {
                        borderColor: role === item.id ? colors.primary : colors.border,
                        backgroundColor: role === item.id ? `${colors.primary}08` : colors.secondary,
                      },
                    ]}
                  >
                    <Text style={[styles.roleLabel, { color: colors.foreground }]}>{item.label}</Text>
                    <Text style={[styles.roleDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={handleOnboardingSubmit}
              disabled={loading}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: loading ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {loading ? "Completing..." : "Complete Registration & Login"}
              </Text>
            </Pressable>
          </Animated.View>
        )}
        </View>
      </ScrollView>

      {/* Country Picker Modal */}
      <Modal
        visible={countryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCountryPickerVisible(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Country</Text>
            {COUNTRIES.map((c) => (
              <Pressable
                key={c.code}
                onPress={() => {
                  setCountryCode(c.code);
                  setCountryPickerVisible(false);
                }}
                style={[
                  styles.modalItem,
                  { borderBottomColor: colors.border },
                  countryCode === c.code && { backgroundColor: `${colors.primary}0D` }
                ]}
              >
                <Text style={[styles.modalItemText, { color: colors.foreground }]}>
                  {c.flag}   {c.name} ({c.code})
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  closeButton: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  stepContainer: {
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  countryPicker: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
  },
  countryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  phoneInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 46,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  terms: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: 12,
  },
  backText: {
    fontSize: 13,
    fontWeight: "600",
  },
  otpRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginVertical: 16,
  },
  otpInput: {
    width: 44,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    fontSize: 13,
    textAlign: "center",
  },
  fieldGroup: {
    width: "100%",
    gap: 8,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  textInput: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleCard: {
    width: "48%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  roleDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
