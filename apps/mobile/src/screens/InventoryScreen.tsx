import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Fab } from "@/components/Fab";
import { FilterChips, type ChipOption } from "@/components/FilterChips";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { SearchBar } from "@/components/SearchBar";
import { Skeleton } from "@/components/Skeleton";
import { VehicleDetailSheet, type VehicleDetailSheetRef } from "@/components/VehicleDetailSheet";
import { toApiError } from "@/services/api";
import { t } from "@/services/i18n";
import { useInventory, useMe } from "@/services/queries";
import { useTheme } from "@/theme/ThemeProvider";
import type { InventoryItem } from "@/types";
import { formatILS, formatKm } from "@/utils/formatters";

type StatusFilter = "all" | "active" | "hidden" | "sold";

const STATUS_OPTIONS: readonly ChipOption<StatusFilter>[] = [
  { value: "all", label: "הכל" },
  { value: "active", label: "פעיל" },
  { value: "hidden", label: "מושעה" },
  { value: "sold", label: "נמכר" },
];

export function InventoryScreen() {
  const me = useMe();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const sheetRef = useRef<VehicleDetailSheetRef>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // debounced — what hits the API

  const filters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      q: searchQuery || undefined,
    }),
    [statusFilter, searchQuery]
  );

  const { data, isLoading, isError, refetch, isRefetching, error, isFetching } =
    useInventory(filters);

  const isAdmin = me.data?.user_type === "admin";
  const items = data?.items ?? [];

  const renderItem = useCallback(
    ({ item, index }: { item: InventoryItem; index: number }) => (
      <Animated.View entering={FadeIn.delay(index * 30)}>
        <PressableScale
          style={{ marginBottom: spacing.md }}
          onPress={() => sheetRef.current?.open(item)}
        >
          <Card padding={spacing.md}>
            <View style={styles.row}>
              <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted }]}>
                {item.primary_image_url ? (
                  <Image
                    source={{ uri: item.primary_image_url }}
                    style={styles.thumbImage}
                    contentFit="cover"
                    transition={150}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={[typography.h3, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.make} {item.model}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {item.year} · {formatKm(item.mileage)}
                </Text>
                <Text style={[typography.bodyBold, { color: colors.accent }]}>
                  {formatILS(item.b2b_price ?? item.price)}
                </Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
          </Card>
        </PressableScale>
      </Animated.View>
    ),
    [colors, spacing, typography]
  );

  // ─── Header (search + chips + admin banner) ────────────────────────
  const ListHeader = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      {isAdmin ? (
        <View
          style={{
            backgroundColor: `${colors.accent}1A`,
            borderColor: `${colors.accent}55`,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginHorizontal: spacing.xl,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 14 }}>👑</Text>
          <Text
            style={[typography.caption, { color: colors.textPrimary, flex: 1 }]}
          >
            אתה מחובר כאדמין. המסך הזה מציג את המלאי האישי שלך — לפעולות אדמין מלאות פתח את האתר.
          </Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: spacing.xl }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onDebouncedChange={setSearchQuery}
          placeholder="חפש לפי יצרן, דגם או הערה"
        />
      </View>

      <FilterChips<StatusFilter>
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {data?.total !== undefined && data.total > 0 ? (
        <Text
          style={[
            typography.caption,
            {
              color: colors.textMuted,
              paddingHorizontal: spacing.xl,
              marginTop: 4,
            },
          ]}
        >
          {data.total} רכבים
        </Text>
      ) : null}
    </View>
  );

  // ─── Body branches ──────────────────────────────────────────────────
  if (isError) {
    return (
      <Screen>
        <ErrorState message={toApiError(error).message} onRetry={() => refetch()} />
        <Fab onPress={() => router.push("/add-vehicle")} bottom={96} />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen padded={false}>
        <View style={{ paddingTop: spacing.lg, gap: spacing.md }}>
          {ListHeader}
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} padding={spacing.md}>
                <View style={styles.row}>
                  <Skeleton width={72} height={72} radius={12} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width="70%" height={18} />
                    <Skeleton width="40%" height={14} />
                    <Skeleton width="55%" height={18} />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
        <Fab onPress={() => router.push("/add-vehicle")} bottom={96} />
        <VehicleDetailSheet ref={sheetRef} />
      </Screen>
    );
  }

  // Empty state — distinguish "no inventory yet" from "filter excluded all".
  const hasFilters = statusFilter !== "all" || searchQuery.length > 0;
  if (items.length === 0) {
    return (
      <Screen padded={false}>
        <View style={{ paddingTop: spacing.lg }}>{ListHeader}</View>
        {hasFilters ? (
          <EmptyState
            emoji="🔎"
            title="אין תוצאות לסינון הזה"
            body="נסה לשנות את הפילטר או לנקות את החיפוש."
            ctaLabel="נקה סינון"
            onCta={() => {
              setStatusFilter("all");
              setSearchInput("");
              setSearchQuery("");
            }}
          />
        ) : isAdmin ? (
          <EmptyState
            emoji="👑"
            title="אדמינים — פתחו את האתר"
            body="המסך הזה מציג את המלאי האישי של החשבון. אדמינים בדרך כלל לא מנהלים מלאי דרך המובייל — פתח את האתר ב-localhost:3001 לתצוגת אדמין מלאה."
          />
        ) : (
          <EmptyState
            emoji="🚗"
            title={t("inventory.empty.title")}
            body={t("inventory.empty.body")}
            ctaLabel={t("inventory.empty.cta")}
            onCta={() => router.push("/add-vehicle")}
          />
        )}
        <Fab onPress={() => router.push("/add-vehicle")} bottom={96} />
        <VehicleDetailSheet ref={sheetRef} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlashList
        data={items}
        keyExtractor={(it) => it.id}
        estimatedItemSize={104}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: 120,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetching}
            onRefresh={() => refetch()}
            tintColor={colors.accent}
          />
        }
      />
      <Fab label={t("inventory.addCta")} onPress={() => router.push("/add-vehicle")} bottom={96} />
      <VehicleDetailSheet ref={sheetRef} />
    </Screen>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { colors, radii, typography } = useTheme();
  const color =
    status === "active"
      ? colors.success
      : status === "sold"
        ? colors.textMuted
        : colors.warning;
  const label =
    status === "active"
      ? "פעיל"
      : status === "sold"
        ? "נמכר"
        : status === "hidden"
          ? "מושעה"
          : status;
  return (
    <View
      style={{
        backgroundColor: `${color}22`,
        borderRadius: radii.pill,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={[typography.micro, { color, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: "hidden" },
  thumbImage: { width: "100%", height: "100%" },
});
