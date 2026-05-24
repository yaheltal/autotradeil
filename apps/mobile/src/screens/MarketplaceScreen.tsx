import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FilterChips, type ChipOption } from "@/components/FilterChips";
import { MakeOfferSheet, type MakeOfferSheetRef } from "@/components/MakeOfferSheet";
import {
  MarketplaceVehicleSheet,
  type MarketplaceVehicleSheetRef,
} from "@/components/MarketplaceVehicleSheet";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { SearchBar } from "@/components/SearchBar";
import { Skeleton } from "@/components/Skeleton";
import { toApiError } from "@/services/api";
import {
  useMarketplace,
  type MarketplaceFilters,
  type MarketplaceItem,
} from "@/services/queries";
import { useTheme } from "@/theme/ThemeProvider";
import { formatILS, formatKm } from "@/utils/formatters";

/**
 * Marketplace screen — browse B2B inventory across the platform.
 *
 * Filters: search (q) + fuel type chips. Year / price ranges live behind
 * the future "advanced filters" sheet (out of scope here).
 */
type FuelChoice = "all" | "petrol" | "diesel" | "electric" | "hybrid";

const FUEL_OPTIONS: readonly ChipOption<FuelChoice>[] = [
  { value: "all", label: "הכל" },
  { value: "petrol", label: "בנזין" },
  { value: "diesel", label: "דיזל" },
  { value: "electric", label: "חשמלי" },
  { value: "hybrid", label: "היברידי" },
];

function isRecent(createdAt?: string): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 7 * 24 * 3600 * 1000;
}

export function MarketplaceScreen() {
  const { colors, spacing, typography } = useTheme();
  const detailRef = useRef<MarketplaceVehicleSheetRef>(null);
  const offerRef = useRef<MakeOfferSheetRef>(null);

  const [fuel, setFuel] = useState<FuelChoice>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filters: MarketplaceFilters = useMemo(
    () => ({
      q: searchQuery || undefined,
      fuel_type: fuel === "all" ? undefined : fuel,
    }),
    [searchQuery, fuel]
  );

  const { data, isLoading, isError, refetch, isRefetching, error } = useMarketplace(filters);
  const items = data?.items ?? [];

  const onMakeOffer = useCallback((item: MarketplaceItem) => {
    offerRef.current?.open(item);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: MarketplaceItem; index: number }) => {
      const askingPrice = item.b2b_price ?? item.price;
      const hasDiscount = item.b2b_price != null && item.b2b_price < item.price;
      const fresh = isRecent(item.created_at);

      return (
        <Animated.View entering={FadeIn.delay(index * 30)}>
          <PressableScale
            style={{ marginBottom: spacing.md }}
            onPress={() => detailRef.current?.open(item)}
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      style={[typography.h3, { color: colors.textPrimary, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {item.make} {item.model}
                    </Text>
                    {item.is_own ? <Pill text="שלך" color={colors.success} /> : null}
                    {fresh && !item.is_own ? (
                      <Pill text="חדש" color={colors.accent} />
                    ) : null}
                  </View>
                  <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.year} · {formatKm(item.mileage)} · {item.seller_business_name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    📍 {item.seller_city}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[typography.bodyBold, { color: colors.accent }]}>
                      {formatILS(askingPrice)}
                    </Text>
                    {hasDiscount ? (
                      <Text
                        style={[
                          typography.caption,
                          {
                            color: colors.textMuted,
                            textDecorationLine: "line-through",
                          },
                        ]}
                      >
                        {formatILS(item.price)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </Card>
          </PressableScale>
        </Animated.View>
      );
    },
    [colors, spacing, typography]
  );

  const ListHeader = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={{ paddingHorizontal: spacing.xl }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onDebouncedChange={setSearchQuery}
          placeholder="חפש יצרן, דגם או הערה"
        />
      </View>

      <FilterChips<FuelChoice> options={FUEL_OPTIONS} value={fuel} onChange={setFuel} />

      {data?.total !== undefined && data.total > 0 ? (
        <Text
          style={[
            typography.caption,
            { color: colors.textMuted, paddingHorizontal: spacing.xl, marginTop: 4 },
          ]}
        >
          {data.total} רכבים בשוק
        </Text>
      ) : null}
    </View>
  );

  if (isError) {
    return (
      <Screen>
        <ErrorState message={toApiError(error).message} onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen padded={false}>
        <View style={{ paddingTop: spacing.lg, gap: spacing.md }}>
          {ListHeader}
          <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
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
        <MarketplaceVehicleSheet ref={detailRef} onMakeOffer={onMakeOffer} />
        <MakeOfferSheet ref={offerRef} />
      </Screen>
    );
  }

  const hasFilters = fuel !== "all" || searchQuery.length > 0;
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
              setFuel("all");
              setSearchInput("");
              setSearchQuery("");
            }}
          />
        ) : (
          <EmptyState
            emoji="🛒"
            title="השוק עוד ריק"
            body="כשסוחרים יפרסמו רכבים ל-B2B, הם יופיעו כאן."
          />
        )}
        <MarketplaceVehicleSheet ref={detailRef} onMakeOffer={onMakeOffer} />
        <MakeOfferSheet ref={offerRef} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlashList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: 120,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.accent}
          />
        }
      />
      <MarketplaceVehicleSheet ref={detailRef} onMakeOffer={onMakeOffer} />
      <MakeOfferSheet ref={offerRef} />
    </Screen>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  const { radii, typography } = useTheme();
  return (
    <View
      style={{
        backgroundColor: `${color}22`,
        borderRadius: radii.pill,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={[typography.micro, { color, fontWeight: "700" }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: "hidden" },
  thumbImage: { width: "100%", height: "100%" },
});
