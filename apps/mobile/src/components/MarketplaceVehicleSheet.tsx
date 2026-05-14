import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { useInventoryImages } from "@/services/queries";
import type { MarketplaceItem } from "@/services/queries";
import { useTheme } from "@/theme/ThemeProvider";
import { formatILS, formatKm } from "@/utils/formatters";

export type MarketplaceVehicleSheetRef = {
  open: (item: MarketplaceItem) => void;
  close: () => void;
};

type Props = {
  onMakeOffer: (item: MarketplaceItem) => void;
};

const { width: WINDOW_WIDTH } = Dimensions.get("window");

/**
 * Marketplace vehicle detail — buyer view.
 *
 * Differs from the inventory variant ([VehicleDetailSheet]) in two ways:
 *   1. Renders the SELLER (business name + city + tier) prominently so
 *      the buyer knows who they're transacting with.
 *   2. "הגש הצעה" CTA at the bottom — disabled with a friendly label when
 *      the vehicle is the caller's own row (`is_own`).
 *
 * Image gallery uses the same [useInventoryImages] query as the dealer
 * sheet — the backend returns the same shape for both contexts.
 */
export const MarketplaceVehicleSheet = forwardRef<MarketplaceVehicleSheetRef, Props>(
  function MarketplaceVehicleSheet({ onMakeOffer }, ref) {
    const { colors, radii, spacing, typography } = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [item, setItem] = useState<MarketplaceItem | null>(null);
    const snapPoints = useMemo(() => ["78%", "94%"], []);

    const images = useInventoryImages(item?.id ?? null);

    useImperativeHandle(
      ref,
      () => ({
        open: (it: MarketplaceItem) => {
          setItem(it);
          sheetRef.current?.present();
        },
        close: () => sheetRef.current?.dismiss(),
      }),
      []
    );

    const renderBackdrop = useCallback(
      (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.55}
        />
      ),
      []
    );

    const handleDismiss = useCallback(() => setItem(null), []);

    if (!item) {
      return (
        <BottomSheetModal
          ref={sheetRef}
          snapPoints={snapPoints}
          backdropComponent={renderBackdrop}
          onDismiss={handleDismiss}
          backgroundStyle={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
          }}
          handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
        >
          <View />
        </BottomSheetModal>
      );
    }

    const galleryImages =
      images.data?.items
        .filter((img) => !img.is_hidden)
        .sort((a, b) => a.position - b.position) ?? [];
    const heroUrl = galleryImages[0]?.url ?? item.primary_image_url ?? null;
    const galleryCount = galleryImages.length;

    const askingPrice = item.b2b_price ?? item.price;
    const hasDiscount = item.b2b_price != null && item.b2b_price < item.price;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        onDismiss={handleDismiss}
        backgroundStyle={{
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
        }}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View
            style={[
              styles.hero,
              { backgroundColor: colors.surfaceMuted, marginHorizontal: spacing.lg },
            ]}
          >
            {heroUrl ? (
              <Image
                source={{ uri: heroUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <Text style={[typography.body, { color: colors.textMuted }]}>אין תמונה</Text>
            )}
            {galleryCount > 1 ? (
              <View
                style={[
                  styles.imageBadge,
                  { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: radii.pill },
                ]}
              >
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
                  📷 {galleryCount}
                </Text>
              </View>
            ) : null}
            {hasDiscount ? (
              <View
                style={[
                  styles.dealBadge,
                  {
                    backgroundColor: colors.accent,
                    borderRadius: radii.pill,
                  },
                ]}
              >
                <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "700" }}>
                  מבצע B2B
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title + year */}
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
            <Text
              style={[typography.h1, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {item.make} {item.model}
            </Text>
            <Text
              style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}
            >
              {item.year} · {formatKm(item.mileage)}
              {item.color ? ` · ${item.color}` : ""}
            </Text>
          </View>

          {/* Price card */}
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderColor: colors.border,
              borderWidth: 1,
              padding: spacing.lg,
            }}
          >
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              מחיר B2B
            </Text>
            <Text style={[typography.display, { color: colors.accent, marginTop: 2 }]}>
              {formatILS(askingPrice)}
            </Text>
            {hasDiscount ? (
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.textMuted,
                    marginTop: 4,
                    textDecorationLine: "line-through",
                  },
                ]}
              >
                מחירון: {formatILS(item.price)}
              </Text>
            ) : null}
          </View>

          {/* Seller card */}
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginTop: spacing.lg,
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderColor: colors.border,
              borderWidth: 1,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.surfaceMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 22 }}>🏬</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>מוכר</Text>
              <Text
                style={[typography.bodyBold, { color: colors.textPrimary, marginTop: 2 }]}
                numberOfLines={1}
              >
                {item.seller_business_name}
              </Text>
              <Text
                style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
              >
                {item.seller_city}
                {item.seller_tier ? ` · ${item.seller_tier}` : ""}
              </Text>
            </View>
          </View>

          {/* Specs grid */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              marginTop: spacing.lg,
            }}
          >
            <SpecCell label="שנה" value={String(item.year)} />
            <SpecCell label="קילומטראז'" value={formatKm(item.mileage)} />
            {item.transmission ? (
              <SpecCell
                label="תיבת הילוכים"
                value={item.transmission === "manual" ? "ידנית" : "אוטומטית"}
              />
            ) : null}
            {item.fuel_type ? (
              <SpecCell
                label="סוג דלק"
                value={
                  item.fuel_type === "petrol"
                    ? "בנזין"
                    : item.fuel_type === "diesel"
                      ? "דיזל"
                      : item.fuel_type === "electric"
                        ? "חשמלי"
                        : "היברידי"
                }
              />
            ) : null}
          </View>

          {/* CTA */}
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
            {item.is_own ? (
              <Button
                label="זה הרכב שלך"
                onPress={() => sheetRef.current?.dismiss()}
                variant="secondary"
              />
            ) : (
              <Button
                label="הגש הצעה"
                onPress={() => {
                  sheetRef.current?.dismiss();
                  // Small delay so the parent sheet finishes its dismiss
                  // animation before the offer sheet animates in.
                  setTimeout(() => onMakeOffer(item), 220);
                }}
                variant="primary"
              />
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

function SpecCell({ label, value }: { label: string; value: string }) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radii.md,
        padding: spacing.md,
      }}
    >
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.bodyBold, { color: colors.textPrimary, marginTop: 2 }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: WINDOW_WIDTH * 0.55,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageBadge: {
    position: "absolute",
    top: 12,
    insetInlineEnd: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dealBadge: {
    position: "absolute",
    top: 12,
    insetInlineStart: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
