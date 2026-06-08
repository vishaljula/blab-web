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
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);

  // Onboarding
  const [name, setName] = useState("");
  const [role, setRole] = useState<"buyer" | "owner" | "broker" | "developer">("owner");

  const otpRefs = useRef<TextInput[]>([]);

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

    // TODO: Call sendOtp API
    setTimeout(() => {
      setLoading(false);
      setTimer(60);
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    }, 800);
  }, [phoneNumber]);

  const handleVerifyOTP = useCallback(
    async (code: string) => {
      if (code.length !== 6) return;
      setLoading(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // TODO: Call verifyOtp API
      setTimeout(() => {
        setLoading(false);
        setStep("onboarding");
      }, 800);
    },
    []
  );

  const handleOtpChange = useCallback(
    (value: string, index: number) => {
      if (!/^\d*$/.test(value)) return;
      const newOtp = [...otpCode];
      newOtp[index] = value;
      setOtpCode(newOtp);

      if (value && index < 5) {
        otpRefs.current[index + 1]?.focus();
      }

      if (newOtp.every((d) => d !== "")) {
        handleVerifyOTP(newOtp.join(""));
      }
    },
    [otpCode, handleVerifyOTP]
  );

  const handleOtpKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === "Backspace" && otpCode[index] === "" && index > 0) {
        const newOtp = [...otpCode];
        newOtp[index - 1] = "";
        setOtpCode(newOtp);
        otpRefs.current[index - 1]?.focus();
      }
    },
    [otpCode]
  );

  const handleOnboardingSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter your full name");
      return;
    }
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // TODO: Call completeOnboarding API
    setTimeout(() => {
      setLoading(false);
      router.back();
    }, 800);
  }, [name, role, router]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.card }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
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
              <View style={[styles.countryPicker, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.countryText, { color: colors.foreground }]}>
                  {COUNTRIES.find((c) => c.code === countryCode)?.flag} {countryCode}
                </Text>
              </View>
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

            <View style={styles.otpRow}>
              {otpCode.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(el) => {
                    if (el) otpRefs.current[i] = el;
                  }}
                  value={digit}
                  onChangeText={(v) => handleOtpChange(v, i)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                  maxLength={1}
                  keyboardType="number-pad"
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: digit ? colors.primary : colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  selectTextOnFocus
                />
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
      </ScrollView>
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
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
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
});
