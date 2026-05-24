import { forwardRef } from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { haptic } from "@/services/haptics";
import { useTheme } from "@/theme/ThemeProvider";

// reanimated 4's createAnimatedComponent overloads expect FunctionComponent
// /ComponentClass/typeof FlatList — none of which matches Pressable's
// ForwardRefExoticComponent shape. Cast through `any` so the wrapper
// inherits AnimatedProps<PressableProps> at the call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedPressable = Animated.createAnimatedComponent(Pressable as any) as React.ComponentType<
  PressableProps & { style?: StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle> }
>;

type Props = Omit<PressableProps, "style"> & {
  hapticStyle?: "tap" | "press" | "selection" | "none";
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
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
      style={[style, animatedStyle]}
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
