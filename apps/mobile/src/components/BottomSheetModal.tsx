import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export type BottomSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  title?: string;
  snapPoints?: (string | number)[];
  children: React.ReactNode;
};

/**
 * Imperative bottom sheet — replaces Alert / Modal usage. Spring-driven
 * by gorhom/bottom-sheet, dim backdrop with tap-to-close.
 */
export const BottomSheetModal = forwardRef<BottomSheetHandle, Props>(function BottomSheetModal(
  { title, snapPoints, children },
  ref
) {
  const { colors, radii, spacing, typography } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const points = useMemo(() => snapPoints ?? ["45%", "85%"], [snapPoints]);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.snapToIndex(0),
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={points}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.bgElevated,
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
    >
      <BottomSheetView style={[styles.body, { padding: spacing.xl }]}>
        {title ? (
          <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.lg }]}>{title}</Text>
        ) : null}
        <View>{children}</View>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  body: { flex: 1 },
});
