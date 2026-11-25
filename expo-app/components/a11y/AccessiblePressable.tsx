/**
 * Accessible control primitives — AUDIT-001 / T3 (BLA-5).
 *
 * WHY THIS EXISTS
 * ---------------
 * `uxd-critique.md` §F1 found zero `accessibilityLabel` / `accessibilityRole` /
 * `accessibilityState` across the whole of Flow #1, and §F3 found touch targets down to
 * 30x30. A one-time sweep fixes today and regresses the moment someone adds a button
 * (`uxd-review-addendum.md` §5.4). So the fix is structural, not cosmetic:
 *
 *   1. `accessibilityLabel` and `accessibilityRole` are REQUIRED props. Omitting either is a
 *      TypeScript error under `expo-app/tsconfig.json` (`strict: true`), i.e. it fails the
 *      existing `npx tsc --noEmit` CI gate — no new toolchain needed.
 *   2. The 44pt minimum target (WCAG 2.2 §2.5.8 / HIG) is applied by the wrapper itself, so
 *      it cannot be forgotten per-call-site.
 *   3. `scripts/a11y-guard.mjs` (CI, `npm run lint:a11y`) bans raw `Pressable` /
 *      `TouchableOpacity` / `TextInput` in the guarded Flow #1 files, so the wrapper cannot
 *      simply be bypassed.
 *
 * Together: a new control in a guarded file cannot ship without a label and a role.
 */

import React from "react";
import {
  Pressable,
  PressableProps,
  Platform,
  StyleSheet,
  TextInput,
  TextInputProps,
  AccessibilityRole,
  PressableStateCallbackType,
  StyleProp,
  ViewStyle,
} from "react-native";

/** Minimum interactive target, in points. WCAG 2.2 §2.5.8 (AAA 44px) / Apple HIG 44pt. */
export const HIT = 44;

/** Per CLAUDE.md §1 Platform Styling Rule — `cursor` is web-only. */
const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

/**
 * Raise the target to at least HIT without ever lowering it.
 *
 * This has to be a max, not an override: `cardHeader` declares `minHeight: 90`, so appending
 * a flat `minHeight: 44` last would *shrink* it. Appending it first would instead let a call
 * site declare `minHeight: 30` and win. Flattening and taking the max is the only merge that
 * is correct in both directions.
 */
function withHitFloor(style: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  const minWidth = typeof flat.minWidth === "number" ? Math.max(HIT, flat.minWidth) : HIT;
  const minHeight = typeof flat.minHeight === "number" ? Math.max(HIT, flat.minHeight) : HIT;
  return [webCursor, style, { minWidth, minHeight }];
}

type A11yContract = {
  /**
   * What a screen reader announces. REQUIRED — this is the structural guard.
   * Describe the action and its object ("Call Priya Sharma"), not the icon ("phone").
   */
  accessibilityLabel: string;
  /**
   * REQUIRED, and deliberately not defaulted to "button": defaulting it is how tab bars end
   * up announcing as buttons, which is the §H7 defect this ticket exists to fix.
   */
  accessibilityRole: AccessibilityRole;
};

export type A11yPressableProps = Omit<
  PressableProps,
  "accessibilityLabel" | "accessibilityRole"
> &
  A11yContract;

/**
 * `Pressable` that cannot be rendered without a label and a role, and that is never smaller
 * than 44x44. Drop-in replacement: all other `Pressable` props pass through unchanged.
 */
export function A11yPressable({
  accessibilityLabel,
  accessibilityRole,
  style,
  ...rest
}: A11yPressableProps) {
  if (__DEV__ && accessibilityLabel.trim().length === 0) {
    console.error(
      "[a11y] A11yPressable received an empty accessibilityLabel. An empty string satisfies " +
        "the type but announces nothing — give the control a real label."
    );
  }

  // `style` may be a plain style or a (state) => style callback; preserve both shapes.
  const styleWithFloor =
    typeof style === "function"
      ? (state: PressableStateCallbackType) => withHitFloor(style(state))
      : withHitFloor(style);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={styleWithFloor}
      {...rest}
    />
  );
}

export type A11yTextInputProps = Omit<TextInputProps, "accessibilityLabel"> & {
  /** REQUIRED. A `placeholder` is not an accessible name — it disappears once text is typed. */
  accessibilityLabel: string;
};

/** `TextInput` that cannot be rendered without a label, and is never shorter than 44pt. */
export function A11yTextInput({ accessibilityLabel, style, ...rest }: A11yTextInputProps) {
  if (__DEV__ && accessibilityLabel.trim().length === 0) {
    console.error("[a11y] A11yTextInput received an empty accessibilityLabel.");
  }
  const flat = StyleSheet.flatten(style) ?? {};
  const minHeight = typeof flat.minHeight === "number" ? Math.max(HIT, flat.minHeight) : HIT;
  return <TextInput accessibilityLabel={accessibilityLabel} style={[style, { minHeight }]} {...rest} />;
}
