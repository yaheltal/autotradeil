import { useEffect } from "react";
import { StyleSheet, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

type Props = { width?: number | string; height?: number; radius?: number; style?: ViewStyle };

/**
 * Shimmering rectangle. Use as a 1:1 stand-in for the real content's
 * dimensions so the layout doesn't pop on data arrival.
 */
export function Skeleton({ width = "100%", height = 14, radius = 8, style }: Props) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as number, height, borderRadius: radius, backgroundColor: colors.border },
        animated,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
});
