import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";

import { useInventoryImages } from "@/services/queries";
import { useTheme } from "@/theme/ThemeProvider";
import type { InventoryItem } from "@/types";
import { formatILS, formatKm } from "@/utils/formatters";

export type VehicleDetailSheetRef = {
  open: (item: InventoryItem) => void;
  close: () => void;
};

type Props = {
  /** Optional callback when the sheet is dismissed (not used today but
   * wired in advance for the "edit/delete just happened" cleanup flow). */
  onDismiss?: () => void;
};

const { width: WINDOW_WIDTH } = Dimensions.get("window");

/**
 * Vehicle detail bottom sheet with image gallery.
 *
 * Two-stage data:
 *   1. The list endpoint gives us a thin `InventoryItem` (the row the user
 *      tapped). We render its fields immediately so the sheet feels instant.
 *   2. `useInventoryImages` lazily fetches the FULL gallery for that item;
 *      a horizontal pager replaces the single primary thumb when it lands.
 *
 * Status badge color follows the dealer flow:
 *   active → success, hidden/paused → warning, sold → muted.
 */
export const VehicleDetailSheet = forwardRef<VehicleDetailSheetRef, Props>(
  function VehicleDetailSheet({ onDismiss }, ref) {
    const { colors, radii, spacing, typography } = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [item, setItem] = useState<InventoryItem | null>(null);
    const snapPoints = useMemo(() => ["75%", "92%"], []);

    const images = useInventoryImages(item?.id ?? null);

    useImperativeHandle(
      ref,
      () => ({
        open: (it: InventoryItem) => {
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

    const handleDismiss = useCallback(() => {
      setItem(null);
      onDismiss?.();
    }, [onDismiss]);

    if (!item) {
      // Pre-mount the modal so it's ready, but render an empty placeholder
      // inside (BottomSheetModal requires `children`).
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
      images.data?.items.filter((img) => !img.is_hidden).sort((a, b) => a.position - b.position) ??
      [];
    const heroUrl = galleryImages[0]?.url ?? item.primary_image_url ?? null;
    const hasMultipleImages = galleryImages.length > 1;

    const statusColor =
      item.status === "active"
        ? colors.success
        : item.status === "sold"
          ? colors.textMuted
          : colors.warning;
    const statusLabel =
      item.status === "active"
        ? "פעיל"
        : item.status === "sold"
          ? "נמכר"
          : item.status === "hidden"
            ? "מושעה"
            : item.status;

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
          {/* Hero image (or placeholder) */}
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
            {hasMultipleImages ? (
              <View
                style={[
                  styles.imageBadge,
                  { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: radii.pill },
                ]}
              >
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
                  📷 {galleryImages.length}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title + status row */}
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
            <View style={styles.titleRow}>
              <Text
                style={[typography.h1, { color: colors.textPrimary, flex: 1 }]}
                numberOfLines={2}
              >
                {item.make} {item.model}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: `${statusColor}22`,
                    borderRadius: radii.pill,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: statusColor, fontWeight: "700" }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>

            <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
              {item.year} · {formatKm(item.mileage)}
            </Text>
          </View>

          {/* Price block */}
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
            <Text style={[typography.caption, { color: colors.textMuted }]}>מחיר B2B</Text>
            <Text style={[typography.display, { color: colors.accent, marginTop: 2 }]}>
              {formatILS(item.b2b_price ?? item.price)}
            </Text>
            {item.b2b_price && item.b2b_price !== item.price ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                מחיר מחירון: {formatILS(item.price)}
              </Text>
            ) : null}
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
            <SpecCell label="מצב" value={statusLabel} />
            <SpecCell label="ID" value={item.id.slice(0, 8)} mono />
          </View>

          {/* Footnote — full edit lives on the existing add-vehicle screen
              and on the web; action buttons (edit / delete / pause) come
              in the next iteration. */}
          <Text
            style={[
              typography.caption,
              {
                color: colors.textMuted,
                textAlign: "center",
                marginTop: spacing.xl,
                paddingHorizontal: spacing.xl,
              },
            ]}
          >
            לעריכה / פעולות נוספות — באתר. במובייל בקרוב 🚧
          </Text>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

function SpecCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
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
      <Text
        style={[
          typography.bodyBold,
          {
            color: colors.textPrimary,
            marginTop: 2,
            fontVariant: mono ? (["tabular-nums"] as const) : undefined,
          },
        ]}
      >
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
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  statusPill: {
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
});
