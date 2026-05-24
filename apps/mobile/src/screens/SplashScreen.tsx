import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

export function SplashScreen() {
  const { colors, typography } = useTheme();
  const scale = useSharedValue(0.92);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.04, { duration: 700 }), withTiming(0.96, { duration: 700 })), -1, true);
  }, [scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <Animated.View style={animated}>
        <Text style={[typography.display, { color: colors.textPrimary }]}>AutoTradeIL</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
