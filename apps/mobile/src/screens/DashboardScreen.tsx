import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { toApiError } from "@/services/api";
import { t } from "@/services/i18n";
import { useAnalytics, useMe } from "@/services/queries";
import { useTheme } from "@/theme/ThemeProvider";
import type { Analytics } from "@/types/schemas";
import { formatILS } from "@/utils/formatters";

export function DashboardScreen() {
  const me = useMe();
  const analytics = useAnalytics();
  const { colors, spacing, typography } = useTheme();

  if (me.isError && !analytics.data) {
    return (
      <Screen>
        <ErrorState
          title={t("errors.loadProfile")}
          message={toApiError(me.error).message}
          onRetry={() => {
            me.refetch();
            analytics.refetch();
          }}
        />
      </Screen>
    );
  }

  const stats = analytics.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.springify()}>
          {me.isLoading ? (
            <Skeleton width="60%" height={28} radius={8} />
          ) : (
            <Text style={[typography.h1, { color: colors.textPrimary }]} numberOfLines={1}>
              {me.data?.email ?? ""}
            </Text>
          )}
        </Animated.View>

        <View style={styles.grid}>
          <KpiCard
            i={0}
            label={t("dashboard2.kpiActive")}
            value={stats ? String(stats.active_vehicles) : undefined}
            loading={analytics.isLoading}
          />
          <KpiCard
            i={1}
            label={t("dashboard2.kpiViewsWeek")}
            value={stats ? String(stats.views_this_week) : undefined}
            loading={analytics.isLoading}
          />
          <KpiCard
            i={2}
            label={t("dashboard2.kpiOffersIn")}
            value={stats ? String(stats.total_offers_received) : undefined}
            loading={analytics.isLoading}
          />
          <KpiCard
            i={3}
            label={t("dashboard2.kpiDeals")}
            value={stats ? String(stats.deals_completed) : undefined}
            sub={stats?.deals_value ? formatILS(stats.deals_value) : undefined}
            loading={analytics.isLoading}
          />
        </View>

        <Animated.View entering={FadeInDown.delay(280).springify()}>
          <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.md }]}>
            {t("dashboard2.topVehicles")}
          </Text>
          <Card padding={spacing.md}>
            {analytics.isLoading ? (
              <View style={{ gap: spacing.md }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ gap: 6 }}>
                    <Skeleton width="60%" height={16} />
                    <Skeleton width="35%" height={12} />
                  </View>
                ))}
              </View>
            ) : !stats || stats.top_vehicles.length === 0 ? (
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {t("dashboard2.noActivity")}
              </Text>
            ) : (
              <View>
                {stats.top_vehicles.map((v, idx) => (
                  <View
                    key={v.id}
                    style={[
                      styles.topRow,
                      idx > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
                        {v.make} {v.model} {v.year}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                        {v.views} צפיות · {v.offers} הצעות
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function KpiCard({
  label,
  value,
  sub,
  loading,
  i,
}: {
  label: string;
  value: string | undefined;
  sub?: string;
  loading: boolean;
  i: number;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(80 + i * 60).springify()} style={styles.kpiCell}>
      <Card padding={spacing.lg}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
        <View style={{ marginTop: spacing.sm }}>
          {loading ? (
            <Skeleton width="50%" height={22} />
          ) : (
            <Text style={[typography.h2, { color: colors.textPrimary }]}>{value ?? "—"}</Text>
          )}
        </View>
        {sub ? (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>{sub}</Text>
        ) : null}
      </Card>
    </Animated.View>
  );
}

// keep a typed unused export from accidentally tree-shaking the schema import
export type _RefAnalytics = Analytics;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCell: { flexBasis: "48%", flexGrow: 1 },
  topRow: { flexDirection: "row", paddingVertical: 10 },
});
