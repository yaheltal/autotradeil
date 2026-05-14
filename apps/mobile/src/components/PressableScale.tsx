import { forwardRef } from "react";
import { Pressable, PressableProps, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { haptic } from "@/services/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  hapticStyle?: "tap" | "press" | "selection" | "none";
  scaleTo?: number;
  style?: ViewStyle | ((s: { pressed: boolean }) => ViewStyle);
};

/**
 * Haptic + spring-scale pressable. Use for any interactive surface
 * larger than a 28pt icon — buttons, list rows, KPI cards, tabs.
 */
export const PressableScale = forwardRef<typeof AnimatedPressable, Props>(function PressableScale(
  { hapticStyle = "tap", scaleTo = 0.97, onPressIn, onPressOut, onPress, style, children, ...rest },
  _ref
) {
  const { motion } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[typeof style === "function" ? undefined : style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, motion.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.spring);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticStyle !== "none") haptic[hapticStyle]?.();
        onPress?.(e);
      }}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
});
