import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { useMakeOffer } from "@/services/mutations";
import { haptic } from "@/services/haptics";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";
import type { MarketplaceItem } from "@/services/queries";
import { formatILS } from "@/utils/formatters";

export type MakeOfferSheetRef = {
  open: (item: MarketplaceItem) => void;
  close: () => void;
};

type Props = {
  onSubmitted?: () => void;
};

/**
 * "הגש הצעה" bottom sheet — opened from the marketplace vehicle detail.
 *
 * UX:
 *   - Reference price (b2b_price or price) is shown read-only at the top
 *     so the dealer can anchor their bid.
 *   - Numeric pad input for `offered_price` — pre-filled with 95% of the
 *     listed price as a sensible starting bid; the dealer can edit.
 *   - Optional message (multiline, max 2000 chars to match backend).
 *   - The keyboard-aware BottomSheetTextInput lifts the sheet automatically.
 */
export const MakeOfferSheet = forwardRef<MakeOfferSheetRef, Props>(
  function MakeOfferSheet({ onSubmitted }, ref) {
    const { colors, radii, spacing, typography } = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [item, setItem] = useState<MarketplaceItem | null>(null);
    const [priceText, setPriceText] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const snapPoints = useMemo(() => ["68%", "92%"], []);
    const pushToast = useUiStore((s) => s.pushToast);
    const makeOffer = useMakeOffer();

    const openWith = useCallback((it: MarketplaceItem) => {
      setItem(it);
      setError(null);
      const listed = it.b2b_price ?? it.price;
      // Start the bid 5% below list — common B2B opener.
      const suggested = Math.round(listed * 0.95);
      setPriceText(String(suggested));
      setMessage("");
      sheetRef.current?.present();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        open: openWith,
        close: () => sheetRef.current?.dismiss(),
      }),
      [openWith]
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

    const handleSubmit = useCallback(async () => {
      if (!item) return;
      const offered = Number(priceText.replace(/\D/g, ""));
      if (!offered || offered <= 0) {
        setError("הזן מחיר תקף");
        haptic.error();
        return;
      }
      setError(null);
      try {
        await makeOffer.mutateAsync({
          inventoryId: item.id,
          offeredPrice: offered,
          message: message,
        });
        haptic.success();
        pushToast("success", "ההצעה נשלחה");
        sheetRef.current?.dismiss();
        onSubmitted?.();
      } catch (err) {
        haptic.error();
        const msg = err instanceof Error ? err.message : "שגיאה בשליחת ההצעה";
        setError(msg);
      }
    }, [item, priceText, message, makeOffer, pushToast, onSubmitted]);

    const handleDismiss = useCallback(() => {
      setItem(null);
      setPriceText("");
      setMessage("");
      setError(null);
    }, []);

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

    const listed = item.b2b_price ?? item.price;

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        onDismiss={handleDismiss}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radii.xl,
          borderTopRightRadius: radii.xl,
        }}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xxxl,
            gap: spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title + reference */}
          <View>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>הגש הצעה</Text>
            <Text
              style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}
              numberOfLines={1}
            >
              {item.make} {item.model} {item.year}
            </Text>
          </View>

          {/* Reference price card */}
          <View
            style={{
              backgroundColor: colors.surfaceMuted,
              borderRadius: radii.lg,
              padding: spacing.md,
            }}
          >
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              מחיר מבוקש
            </Text>
            <Text
              style={[typography.h1, { color: colors.textPrimary, marginTop: 2 }]}
            >
              {formatILS(listed)}
            </Text>
          </View>

          {/* Offered price input */}
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              ההצעה שלך
            </Text>
            <BottomSheetTextInput
              value={priceText}
              onChangeText={(v) => {
                setPriceText(v.replace(/\D/g, ""));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={{
                height: 56,
                borderColor: error ? colors.danger : colors.border,
                borderWidth: 1.5,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                fontSize: 22,
                fontWeight: "700",
                color: colors.textPrimary,
                backgroundColor: colors.surface,
              }}
            />
            {error ? (
              <Text style={[typography.caption, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}
          </View>

          {/* Optional message */}
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              הערה (אופציונלי)
            </Text>
            <BottomSheetTextInput
              value={message}
              onChangeText={setMessage}
              placeholder="לדוגמה: זמין לתשלום מיידי"
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              multiline
              style={{
                minHeight: 88,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                fontSize: 15,
                color: colors.textPrimary,
                backgroundColor: colors.surface,
                textAlignVertical: "top",
              }}
            />
          </View>

          <Button
            label="שלח הצעה"
            onPress={handleSubmit}
            loading={makeOffer.isPending}
            variant="primary"
          />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _styles = StyleSheet.create({});
