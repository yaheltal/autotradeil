import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  /** Renders dots instead of digits — used for PIN entry on the lockscreen. */
  secureTextEntry?: boolean;
  disabled?: boolean;
};

/**
 * Six-cell OTP / PIN input.
 *
 * Implementation choice: ONE hidden TextInput captures all input, and N
 * visual cells render the i-th character. This keeps:
 *   - iOS SMS auto-fill working (`textContentType="oneTimeCode"`)
 *   - Paste of the full code in one shot
 *   - Backspace at any position behaving naturally (the underlying string
 *     just shrinks/grows)
 *   - LTR digit order even inside an RTL screen — numbers always read LTR.
 *
 * Tap anywhere on the cell row to focus the hidden input and pop the
 * keyboard.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  secureTextEntry = false,
  disabled = false,
}: Props) {
  const { colors, radii, spacing } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus && !disabled) {
      // small defer so RN can measure layout first
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [autoFocus, disabled]);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      onComplete?.(digits);
    }
  };

  return (
    <Pressable
      onPress={() => !disabled && inputRef.current?.focus()}
      style={styles.row}
    >
      <View style={[styles.cells, { gap: spacing.sm }]} pointerEvents="none">
        {Array.from({ length }).map((_, i) => {
          const ch = value[i] ?? "";
          const isCursor = focused && value.length === i;
          const filled = !!ch;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  backgroundColor: colors.surface,
                  borderColor: isCursor ? colors.accent : colors.border,
                  borderRadius: radii.md,
                },
              ]}
            >
              <Text style={[styles.digit, { color: colors.textPrimary }]}>
                {filled ? (secureTextEntry ? "•" : ch) : ""}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        editable={!disabled}
        // The hidden input — we steal its keyboard but render our own UI.
        // Caret-color transparent so iOS doesn't draw a blue bar over the cells.
        style={styles.hiddenInput}
        caretHidden
        selectionColor="transparent"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    alignItems: "center",
  },
  cells: {
    flexDirection: "row",
    direction: "ltr",
  },
  cell: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: {
    fontSize: 24,
    fontWeight: "700",
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
});
