import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { haptic } from "@/services/haptics";
import { t } from "@/services/i18n";
import { useTheme } from "@/theme/ThemeProvider";

const ICONS: Record<string, string> = {
  dashboard: "🏠",
  inventory: "🚗",
  marketplace: "🛒",
  offers: "💬",
  profile: "👤",
};

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.selection() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color }) => (
          <View style={styles.icon}>
            <Text style={{ fontSize: 22, color }}>{ICONS[route.name] ?? "•"}</Text>
          </View>
        ),
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: t("tabs.dashboard") }} />
      <Tabs.Screen name="inventory" options={{ title: t("tabs.inventory") }} />
      <Tabs.Screen name="marketplace" options={{ title: t("tabs.marketplace") }} />
      <Tabs.Screen name="offers" options={{ title: t("tabs.offers") }} />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
