import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { toApiError } from "@/services/api";
import { t } from "@/services/i18n";
import { useAcceptOffer, useRejectOffer } from "@/services/mutations";
import { useOffers } from "@/services/queries";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";
import type { Offer } from "@/types/schemas";
import { formatILS } from "@/utils/formatters";

type Direction = "received" | "sent";

const TABS: { key: Direction; labelKey: string }[] = [
  { key: "received", labelKey: "offers.tabReceived" },
  { key: "sent", labelKey: "offers.tabSent" },
];

export function OffersScreen() {
  const [tab, setTab] = useState<Direction>("received");
  const { data, isLoading, isError, error, refetch } = useOffers(tab);
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const pushToast = useUiStore((s) => s.pushToast);
  const { colors, spacing, typography, radii } = useTheme();

  const handleAccept = useCallback(
    async (id: string) => {
      try {
        await accept.mutateAsync(id);
        pushToast("success", t("offers.accepted"));
      } catch (err) {
        pushToast("error", toApiError(err).message);
      }
    },
    [accept, pushToast]
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await reject.mutateAsync(id);
        pushToast("success", t("offers.rejected"));
      } catch (err) {
        pushToast("error", toApiError(err).message);
      }
    },
    [reject, pushToast]
  );

  return (
    <Screen>
      <View
        style={[
          styles.tabs,
          { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, marginTop: spacing.lg },
        ]}
      >
        {TABS.map((tt) => {
          const active = tab === tt.key;
          return (
            <PressableScale
              key={tt.key}
              hapticStyle="selection"
              onPress={() => setTab(tt.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? colors.bgElevated : "transparent",
                  borderRadius: radii.pill,
                },
              ]}
            >
              <Text
                style={[
                  typography.bodyBold,
                  { color: active ? colors.textPrimary : colors.textMuted },
                ]}
              >
                {t(tt.labelKey)}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {isError ? (
        <ErrorState message={toApiError(error).message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton width="60%" height={18} />
              <View style={{ height: 8 }} />
              <Skeleton width="40%" height={14} />
            </Card>
          ))}
        </View>
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState emoji="💬" title={t("offers.empty")} body={t("offers.emptyBody")} />
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          {data?.items.map((o, i) => (
            <Animated.View key={o.id} entering={FadeIn.delay(i * 40)}>
              <OfferCard
                offer={o}
                direction={tab}
                onAccept={() => handleAccept(o.id)}
                onReject={() => handleReject(o.id)}
                accepting={accept.isPending && accept.variables === o.id}
                rejecting={reject.isPending && reject.variables === o.id}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function OfferCard({
  offer,
  direction,
  onAccept,
  onReject,
  accepting,
  rejecting,
}: {
  offer: Offer;
  direction: Direction;
  onAccept: () => void;
  onReject: () => void;
  accepting: boolean;
  rejecting: boolean;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  const actionable = direction === "received" && (offer.status === "pending" || offer.status === "countered");
  const price = offer.counter_price ?? offer.offered_price;

  return (
    <Card>
      <Text style={[typography.h3, { color: colors.textPrimary }]} numberOfLines={1}>
        {offer.vehicle.make} {offer.vehicle.model} {offer.vehicle.year}
      </Text>
      <View style={[styles.statusPill, { backgroundColor: statusBg(offer.status, colors), marginTop: 8 }]}>
        <Text style={[typography.caption, { color: statusFg(offer.status, colors) }]}>{offer.status}</Text>
      </View>
      <Text style={[typography.h2, { color: colors.accent, marginTop: 8 }]}>{formatILS(price)}</Text>

      {actionable ? (
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
          <PressableScale
            onPress={onReject}
            hapticStyle="press"
            style={[
              styles.action,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
            ]}
          >
            {rejecting ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{t("offers.reject")}</Text>
            )}
          </PressableScale>
          <PressableScale
            onPress={onAccept}
            hapticStyle="press"
            style={[
              styles.action,
              { backgroundColor: colors.accent, borderColor: colors.accent, borderRadius: radii.lg },
            ]}
          >
            {accepting ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={[typography.bodyBold, { color: colors.accentText }]}>{t("offers.accept")}</Text>
            )}
          </PressableScale>
        </View>
      ) : null}
    </Card>
  );
}

function statusBg(status: string, colors: ReturnType<typeof useTheme>["colors"]): string {
  if (status === "accepted") return colors.successBg;
  if (status === "rejected" || status === "cancelled") return colors.dangerBg;
  return colors.surfaceMuted;
}
function statusFg(status: string, colors: ReturnType<typeof useTheme>["colors"]): string {
  if (status === "accepted") return colors.success;
  if (status === "rejected" || status === "cancelled") return colors.danger;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", padding: 4 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", height: 40 },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  action: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
