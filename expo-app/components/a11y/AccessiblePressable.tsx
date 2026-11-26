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
  AccessibilityState,
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
 *
 * NON-NUMERIC MIN SIZES ARE HONOURED, NOT OVERWRITTEN — BLA-33 Layer-2 F1.
 * The old `typeof === "number" ? max(HIT, v) : HIT` ternary silently replaced an
 * intrinsic-sizing keyword (`"max-content"`, `"auto"`) with the flat 44, because such a
 * keyword is not a number. The dashboard tab strip needs `minWidth: "max-content"` to stop a
 * flex item clipping its own label, and routing it through this wrapper is the only way in —
 * `scripts/a11y-guard.mjs` bans raw `Pressable` in the guarded files. Under the old ternary
 * the keyword vanished with no error and the clip stayed.
 *
 * There is no CSS that expresses `max(44px, max-content)` — `max()` takes lengths, not
 * intrinsic keywords, and the whole declaration is dropped if you try. So the floor and the
 * keyword cannot be composed, and one has to win. The keyword wins: an intrinsic minimum is
 * *also* a floor, just a content-derived one, and a control explicitly asking to be at least
 * as wide as its own content is not the thin-target case §F3 exists to prevent. The HIT floor
 * still applies to every call site that does not name a minimum, and `minHeight` — the axis
 * that actually governs thumb reach in these row layouts — is unaffected.
 */
function withHitFloor(style: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  const minWidth =
    typeof flat.minWidth === "number"
      ? Math.max(HIT, flat.minWidth)
      : flat.minWidth !== undefined
        ? flat.minWidth
        : HIT;
  const minHeight =
    typeof flat.minHeight === "number"
      ? Math.max(HIT, flat.minHeight)
      : flat.minHeight !== undefined
        ? flat.minHeight
        : HIT;
  return [webCursor, style, { minWidth, minHeight }];
}

/**
 * `accessibilityState` -> `aria-*`, web only. BLA-12 Layer-2 QA, FAIL #2.
 *
 * react-native-web 0.21.2 does NOT forward the `accessibilityState` *object*. Its
 * `modules/forwardedProps` allowlist carries only the flattened `aria-selected` /
 * `aria-expanded` / `aria-busy` / `aria-checked` / `aria-disabled` props, and
 * `accessibilityState` appears nowhere outside `TouchableWithoutFeedback`'s own prop list.
 * Measured consequence in Chromium's computed AX tree before this fix: the active dashboard
 * tab announced `selected=false`, the accordion header exposed no `expanded` at all, and
 * `busy` was never announced while publishing. The props are silently dropped — no warning.
 *
 * Native iOS/Android consume `accessibilityState` correctly, so we pass BOTH and let each
 * platform read the one it understands. Translating here rather than at the ~6 call sites is
 * the point: a new control gets correct web semantics without the author knowing this quirk.
 *
 * Role-gated on purpose. `aria-selected` is only valid on a closed set of roles (WAI-ARIA 1.2
 * §6.6.8); `profile.tsx:241` sets `{ selected, checked }` on `accessibilityRole="radio"`,
 * where `aria-checked` is the correct attribute and `aria-selected` would be invalid ARIA.
 * Emitting it anyway would trade one defect for another.
 */
const ARIA_SELECTED_ROLES: ReadonlySet<string> = new Set([
  "tab",
  "option",
  "row",
  "gridcell",
  "columnheader",
  "rowheader",
  "treeitem",
]);

type AriaStateProps = {
  "aria-disabled"?: boolean;
  "aria-selected"?: boolean;
  "aria-checked"?: boolean | "mixed";
  "aria-busy"?: boolean;
  "aria-expanded"?: boolean;
};

function ariaFromState(
  state: AccessibilityState | undefined,
  role: AccessibilityRole
): AriaStateProps {
  if (Platform.OS !== "web" || !state) return {};
  const aria: AriaStateProps = {};
  // `disabled` and `busy` are global ARIA attributes — valid on any role.
  if (state.disabled !== undefined) aria["aria-disabled"] = state.disabled;
  if (state.busy !== undefined) aria["aria-busy"] = state.busy;
  // `aria-expanded` is valid on button and on every composite/disclosure role we use.
  if (state.expanded !== undefined) aria["aria-expanded"] = state.expanded;
  if (state.checked !== undefined) aria["aria-checked"] = state.checked;
  if (state.selected !== undefined && ARIA_SELECTED_ROLES.has(role)) {
    aria["aria-selected"] = state.selected;
  }
  return aria;
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
  accessibilityState,
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
      accessibilityState={accessibilityState}
      style={styleWithFloor}
      {...rest}
      // Spread last so a call site cannot accidentally shadow the translated state.
      {...ariaFromState(accessibilityState, accessibilityRole)}
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
