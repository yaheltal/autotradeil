import { useActionSheet } from "@expo/react-native-action-sheet";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { toApiError } from "@/services/api";
import { t } from "@/services/i18n";
import {
  detectedKeys,
  identifyByDocument,
  identifyByLicensePlate,
  identifyByPhoto,
  type DetectionResult,
} from "@/services/identify";
import { useCreateInventory, useUploadInventoryImage } from "@/services/mutations";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";
import { type ExposureOption, inventoryItemCreateSchema } from "@/types/schemas";
import { formatILS } from "@/utils/formatters";

type Mode = "choice" | "license" | "scanning" | "results" | "form";
type Step = "vehicle" | "details" | "review";
type Transmission = "automatic" | "manual";
type Fuel = "petrol" | "diesel" | "electric" | "hybrid";

type Form = {
  licensePlate: string;
  make: string;
  model: string;
  year: string;
  mileage: string;
  color: string;
  transmission?: Transmission;
  fuel?: Fuel;
  price: string;
  b2bPrice: string;
  notes: string;
};

const EMPTY_FORM: Form = {
  licensePlate: "",
  make: "",
  model: "",
  year: "",
  mileage: "",
  color: "",
  transmission: undefined,
  fuel: undefined,
  price: "",
  b2bPrice: "",
  notes: "",
};

const STEPS: Step[] = ["vehicle", "details", "review"];

const EXPOSURE_OPTIONS: {
  value: Exclude<ExposureOption, "PRIVATE">;
  labelKey: string;
  descKey: string;
  enabled: boolean;
}[] = [
  { value: "B2B", labelKey: "addVehicle.expB2BLabel", descKey: "addVehicle.expB2BBody", enabled: true },
  { value: "B2C", labelKey: "addVehicle.expB2CLabel", descKey: "addVehicle.expB2CBody", enabled: false },
];

export function AddVehicleScreen() {
  const router = useRouter();
  const create = useCreateInventory();
  const upload = useUploadInventoryImage();
  const pushToast = useUiStore((s) => s.pushToast);
  const { colors, radii, spacing, typography } = useTheme();

  const [mode, setMode] = useState<Mode>("choice");
  const [step, setStep] = useState<Step>("vehicle");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detectedSet, setDetectedSet] = useState<Set<string>>(new Set());
  const [resultsMileage, setResultsMileage] = useState("");

  // Default to B2B selected, per spec — most common dealer choice.
  const [exposure, setExposure] = useState<Set<ExposureOption>>(new Set(["B2B"]));
  const [exposureError, setExposureError] = useState<string | null>(null);

  const [licenseInput, setLicenseInput] = useState("");
  const { showActionSheetWithOptions } = useActionSheet();

  const setField = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleExposure = (value: ExposureOption, enabled = true) => {
    if (!enabled) {
      pushToast("info", t("addVehicle.comingSoonToast"));
      return;
    }
    setExposureError(null);
    setExposure((prev) => {
      const next = new Set(prev);
      if (value === "PRIVATE") {
        // Toggling PRIVATE makes it the sole selection.
        if (next.has("PRIVATE")) next.delete("PRIVATE");
        else {
          next.clear();
          next.add("PRIVATE");
        }
      } else {
        // Picking a marketplace clears PRIVATE.
        next.delete("PRIVATE");
        if (next.has(value)) next.delete(value);
        else next.add(value);
      }
      return next;
    });
  };

  // ---------- Identify handlers ----------
  const runPhotoDetect = async (uri: string) => {
    setMode("scanning");
    try {
      const detect = await identifyByPhoto(uri);
      setDetection(detect);
      setDetectedSet(new Set(Array.from(detectedKeys(detect)) as string[]));
      setPhotos((p) => (p.length ? p : [uri]));
      setMode("results");
    } catch (err) {
      pushToast("error", toApiError(err).message);
      setMode("choice");
    }
  };

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      pushToast("error", t("addVehicle.permissionDenied"));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled) return;
    await runPhotoDetect(res.assets[0]!.uri);
  };

  const pickPhotoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      pushToast("error", t("addVehicle.permissionDenied"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (res.canceled) return;
    await runPhotoDetect(res.assets[0]!.uri);
  };

  const showPhotoSourceSheet = () => {
    const options = [
      t("addVehicle.photoSourceCamera"),
      t("addVehicle.photoSourceLibrary"),
      t("common.cancel"),
    ];
    showActionSheetWithOptions(
      { options, cancelButtonIndex: 2, textStyle: { textAlign: "right" } },
      (idx) => {
        if (idx === 0) capturePhoto();
        else if (idx === 1) pickPhotoFromLibrary();
      }
    );
  };

  const submitLicenseLookup = async () => {
    const plate = licenseInput.trim();
    if (!plate) {
      pushToast("error", t("addVehicle.errorRequired"));
      return;
    }
    setMode("scanning");
    try {
      const detect = await identifyByLicensePlate(plate);
      setDetection(detect);
      setDetectedSet(new Set(Array.from(detectedKeys(detect)) as string[]));
      setForm((f) => ({ ...f, licensePlate: plate }));
      setMode("results");
    } catch (err) {
      pushToast("error", toApiError(err).message);
      setMode("license");
    }
  };

  const runDocumentDetect = async (uri: string) => {
    setMode("scanning");
    try {
      const detect = await identifyByDocument(uri);
      setDetection(detect);
      setDetectedSet(new Set(Array.from(detectedKeys(detect)) as string[]));
      setMode("results");
    } catch (err) {
      pushToast("error", toApiError(err).message);
      setMode("choice");
    }
  };

  const pickDocumentFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      pushToast("error", t("addVehicle.permissionDenied"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (res.canceled) return;
    await runDocumentDetect(res.assets[0]!.uri);
  };

  const applyDetection = (carryMileage: boolean) => {
    if (!detection) return;
    setForm((f) => ({
      ...f,
      make: detection.make ?? f.make,
      model: detection.model ?? f.model,
      year: detection.year ? String(detection.year) : f.year,
      color: detection.color ?? f.color,
      transmission: detection.transmission ?? f.transmission,
      fuel: detection.fuel_type ?? f.fuel,
      mileage: carryMileage && resultsMileage ? resultsMileage : f.mileage,
    }));
  };

  const onResultsEditAll = () => {
    applyDetection(true);
    setMode("form");
    setStep("vehicle");
  };
  const onResultsLooksGood = () => {
    applyDetection(true);
    setMode("form");
    setStep("details");
  };
  const onManual = () => {
    setDetection(null);
    setDetectedSet(new Set());
    setMode("form");
    setStep("vehicle");
  };

  // ---------- Validation ----------
  const validateVehicle = (): boolean => {
    const next: Partial<Record<keyof Form, string>> = {};
    if (!form.make.trim()) next.make = t("addVehicle.errorRequired");
    if (!form.model.trim()) next.model = t("addVehicle.errorRequired");
    if (!form.year.trim()) next.year = t("addVehicle.errorRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const validateDetails = (): boolean => {
    const next: Partial<Record<keyof Form, string>> = {};
    if (!form.mileage.trim()) next.mileage = t("addVehicle.errorRequired");
    if (!form.price.trim()) next.price = t("addVehicle.errorRequired");
    setErrors(next);
    if (exposure.has("PRIVATE") && exposure.size > 1) {
      setExposureError(t("addVehicle.exposureConflict"));
      return false;
    }
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (step === "vehicle") {
      if (!validateVehicle()) return;
      setStep("details");
    } else if (step === "details") {
      if (!validateDetails()) return;
      setStep("review");
    }
  };
  const goBack = () => {
    if (step === "review") setStep("details");
    else if (step === "details") {
      if (detection) setMode("results");
      else setStep("vehicle");
    } else if (step === "vehicle") {
      if (detection) setMode("results");
      else setMode("choice");
    }
  };

  // ---------- Photos ----------
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      pushToast("error", t("addVehicle.permissionDenied"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10 - photos.length,
      quality: 0.85,
    });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)]);
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      pushToast("error", t("addVehicle.permissionDenied"));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) setPhotos((p) => [...p, res.assets[0]!.uri]);
  };
  const removePhoto = (uri: string) => setPhotos((p) => p.filter((u) => u !== uri));

  // ---------- Submit ----------
  const submit = async () => {
    setSubmitting(true);
    try {
      // Default to PRIVATE if nothing is selected.
      const finalExposure: ExposureOption[] = exposure.size === 0 ? ["PRIVATE"] : Array.from(exposure);

      const parsed = inventoryItemCreateSchema.parse({
        license_plate: form.licensePlate.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        mileage: Number(form.mileage),
        price: Number(form.price),
        b2b_price: form.b2bPrice ? Number(form.b2bPrice) : undefined,
        color: form.color.trim() || undefined,
        transmission: form.transmission,
        fuel_type: form.fuel,
        notes: form.notes.trim() || undefined,
        exposure: finalExposure,
        is_private: finalExposure.includes("PRIVATE"),
      });
      const created = await create.mutateAsync(parsed);
      for (const uri of photos) {
        try {
          await upload.mutateAsync({ inventoryId: created.id, uri });
        } catch (err) {
          pushToast("error", toApiError(err).message);
        }
      }
      pushToast("success", t("addVehicle.successTitle"));
      router.replace("/(tabs)/inventory");
    } catch (err) {
      pushToast("error", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // CHOICE
  // ============================================================
  if (mode === "choice") {
    return (
      <Screen>
        <View style={[styles.container, { paddingTop: spacing.xxxl }]}>
          <Animated.View entering={FadeInDown.springify()} style={{ alignItems: "center" }}>
            <Text style={[typography.display, { color: colors.textPrimary, textAlign: "center" }]}>
              {t("addVehicle.chooseTitle")}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
              ]}
            >
              {t("addVehicle.chooseSubtitle")}
            </Text>
          </Animated.View>

          <View style={{ alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xxxl }}>
            <ChoiceCard i={0} glyph="📸" title={t("addVehicle.scanPhoto")} body={t("addVehicle.scanPhotoBody")} onPress={showPhotoSourceSheet} />
            <ChoiceCard i={1} glyph="🔢" title={t("addVehicle.licenseInput")} body={t("addVehicle.licenseInputBody")} onPress={() => setMode("license")} />
            <ChoiceCard i={2} glyph="📄" title={t("addVehicle.uploadDoc")} body={t("addVehicle.uploadDocBody")} onPress={pickDocumentFromLibrary} />
            <ChoiceCard i={3} glyph="✏️" title={t("addVehicle.manual")} body={t("addVehicle.manualBody")} onPress={onManual} />
          </View>
        </View>
      </Screen>
    );
  }

  // ============================================================
  // LICENSE-NUMBER INPUT
  // ============================================================
  if (mode === "license") {
    return (
      <Screen>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl, gap: spacing.lg }}>
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 56 }}>🔢</Text>
              <Text style={[typography.h1, { color: colors.textPrimary, marginTop: spacing.md, textAlign: "center" }]}>
                {t("addVehicle.licenseInput")}
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
                ]}
              >
                {t("addVehicle.licenseInputBody")}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).springify()} style={{ gap: spacing.md }}>
              <TextField
                label={t("addVehicle.licenseNumber")}
                value={licenseInput}
                onChangeText={setLicenseInput}
                placeholder={t("addVehicle.licenseNumberPlaceholder")}
                keyboardType="number-pad"
                returnKeyType="search"
                onSubmitEditing={submitLicenseLookup}
                autoFocus
              />
              <Button label={t("addVehicle.licenseLookup")} variant="primary" onPress={submitLicenseLookup} />
              <PressableScale onPress={() => setMode("choice")} hapticStyle="tap" style={{ alignSelf: "center", paddingVertical: 6 }}>
                <Text style={[typography.bodyBold, { color: colors.textMuted }]}>← {t("addVehicle.back")}</Text>
              </PressableScale>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // ============================================================
  // SCANNING
  // ============================================================
  if (mode === "scanning") {
    return (
      <Screen>
        <View style={styles.center}>
          <Pulse />
          <Text style={[typography.h1, { color: colors.textPrimary, marginTop: spacing.xl, textAlign: "center" }]}>
            {t("addVehicle.scanning")}
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
            {t("addVehicle.scanningSub")}
          </Text>
        </View>
      </Screen>
    );
  }

  // ============================================================
  // RESULTS
  // ============================================================
  if (mode === "results" && detection) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingTop: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg }}>
          <Animated.View entering={FadeIn.duration(280)} style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 56 }}>✅</Text>
            <Text style={[typography.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>
              {t("addVehicle.detected")}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
              {t("addVehicle.confidence", { n: detection.confidence })}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()}>
            <Text style={[typography.h3, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
              {t("addVehicle.detectedFields")}
            </Text>
            <Card>
              {detection.make ? <DetectedRow label={t("addVehicle.make")} value={detection.make} /> : null}
              {detection.model ? <DetectedRow label={t("addVehicle.model")} value={detection.model} /> : null}
              {detection.year ? <DetectedRow label={t("addVehicle.year")} value={String(detection.year)} /> : null}
              {detection.color ? <DetectedRow label={t("addVehicle.color")} value={detection.color} /> : null}
              {detection.transmission ? (
                <DetectedRow label={t("addVehicle.transmission")} value={t(`addVehicle.${detection.transmission}`)} />
              ) : null}
              {detection.fuel_type ? (
                <DetectedRow label={t("addVehicle.fuel")} value={t(`addVehicle.${detection.fuel_type}`)} last />
              ) : null}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).springify()}>
            <Text style={[typography.h3, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
              {t("addVehicle.extraFields")}
            </Text>
            <TextField
              label={t("addVehicle.mileage")}
              value={resultsMileage}
              onChangeText={(v) => setResultsMileage(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="45000"
            />
          </Animated.View>

          <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center" }]}>
            {t("addVehicle.verifyHint")}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button label={t("addVehicle.editAll")} variant="secondary" onPress={onResultsEditAll} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t("addVehicle.looksGood")} variant="primary" onPress={onResultsLooksGood} />
            </View>
          </View>

          <PressableScale onPress={() => setMode("choice")} hapticStyle="tap" style={{ alignSelf: "center", marginTop: spacing.md }}>
            <Text style={[typography.bodyBold, { color: colors.textMuted }]}>← {t("addVehicle.back")}</Text>
          </PressableScale>
        </ScrollView>
      </Screen>
    );
  }

  // ============================================================
  // FORM
  // ============================================================
  const stepIndex = STEPS.indexOf(step);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.header, { marginBottom: spacing.xl }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("addVehicle.step", { n: stepIndex + 1, total: STEPS.length })}
            </Text>
            <Text style={[typography.h1, { color: colors.textPrimary, marginTop: 4 }]}>
              {step === "vehicle"
                ? t("addVehicle.stepVehicle")
                : step === "details"
                  ? t("addVehicle.stepDetails")
                  : t("addVehicle.stepReview")}
            </Text>
            <View style={[styles.progress, { backgroundColor: colors.border, marginTop: spacing.md }]}>
              <View style={{ height: "100%", width: `${((stepIndex + 1) / STEPS.length) * 100}%`, backgroundColor: colors.accent, borderRadius: radii.pill }} />
            </View>
          </View>

          {step === "vehicle" ? (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: spacing.md }}>
              <FieldWithCheck detected={detectedSet.has("make")}>
                <TextField label={t("addVehicle.make")} value={form.make} onChangeText={(v) => setField("make", v)} error={errors.make} editable={!submitting} autoCapitalize="words" />
              </FieldWithCheck>
              <FieldWithCheck detected={detectedSet.has("model")}>
                <TextField label={t("addVehicle.model")} value={form.model} onChangeText={(v) => setField("model", v)} error={errors.model} editable={!submitting} autoCapitalize="words" />
              </FieldWithCheck>
              <FieldWithCheck detected={detectedSet.has("year")}>
                <TextField label={t("addVehicle.year")} value={form.year} onChangeText={(v) => setField("year", v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" error={errors.year} editable={!submitting} maxLength={4} />
              </FieldWithCheck>
              <FieldWithCheck detected={detectedSet.has("color")}>
                <TextField label={t("addVehicle.color")} value={form.color} onChangeText={(v) => setField("color", v)} editable={!submitting} />
              </FieldWithCheck>
              <ChoiceRow
                label={t("addVehicle.transmission")}
                detected={detectedSet.has("transmission")}
                options={[
                  { value: "automatic", label: t("addVehicle.automatic") },
                  { value: "manual", label: t("addVehicle.manual") },
                ]}
                value={form.transmission}
                onChange={(v) => setField("transmission", v as Transmission)}
              />
              <ChoiceRow
                label={t("addVehicle.fuel")}
                detected={detectedSet.has("fuel_type")}
                options={[
                  { value: "petrol", label: t("addVehicle.petrol") },
                  { value: "diesel", label: t("addVehicle.diesel") },
                  { value: "electric", label: t("addVehicle.electric") },
                  { value: "hybrid", label: t("addVehicle.hybrid") },
                ]}
                value={form.fuel}
                onChange={(v) => setField("fuel", v as Fuel)}
              />
            </Animated.View>
          ) : null}

          {step === "details" ? (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: spacing.lg }}>
              <Card padding={spacing.md}>
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      ✅ {t("addVehicle.summary")}
                    </Text>
                    <Text style={[typography.h3, { color: colors.textPrimary, marginTop: 4 }]} numberOfLines={1}>
                      {form.make} {form.model} {form.year}
                    </Text>
                    {form.licensePlate ? (
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                        {t("addVehicle.licensePlateLabel")}: {form.licensePlate}
                      </Text>
                    ) : null}
                    {form.color || form.transmission ? (
                      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                        {[form.color, form.transmission ? t(`addVehicle.${form.transmission}`) : null].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                  <PressableScale onPress={() => setStep("vehicle")} hapticStyle="tap" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                    <Text style={[typography.bodyBold, { color: colors.accent }]}>{t("addVehicle.editDetails")}</Text>
                  </PressableScale>
                </View>
              </Card>

              <View style={{ gap: spacing.md }}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>💰 {t("addVehicle.stepPricing")}</Text>
                <View style={styles.gridRow}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={t("addVehicle.mileage")}
                      value={form.mileage}
                      onChangeText={(v) => setField("mileage", v.replace(/[^0-9]/g, ""))}
                      keyboardType="number-pad"
                      placeholder={t("addVehicle.mileagePlaceholder")}
                      error={errors.mileage}
                      editable={!submitting}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label={t("addVehicle.price")}
                      value={form.price}
                      onChangeText={(v) => setField("price", v.replace(/[^0-9]/g, ""))}
                      keyboardType="number-pad"
                      placeholder={t("addVehicle.pricePlaceholder")}
                      error={errors.price}
                      editable={!submitting}
                    />
                  </View>
                </View>
                <TextField
                  label={t("addVehicle.b2bPrice")}
                  value={form.b2bPrice}
                  onChangeText={(v) => setField("b2bPrice", v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  editable={!submitting}
                />
              </View>

              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{t("addVehicle.exposureTitle")}</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t("addVehicle.exposureSubtitle")}</Text>
                <View style={{ gap: 8, marginTop: spacing.xs }}>
                  {EXPOSURE_OPTIONS.map((opt) => (
                    <ExposureRow
                      key={opt.value}
                      checked={exposure.has(opt.value)}
                      enabled={opt.enabled}
                      label={t(opt.labelKey)}
                      body={t(opt.descKey)}
                      badge={!opt.enabled ? t("addVehicle.comingSoon") : undefined}
                      onPress={() => toggleExposure(opt.value, opt.enabled)}
                    />
                  ))}
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <ExposureRow
                    checked={exposure.has("PRIVATE")}
                    enabled
                    label={t("addVehicle.expPrivateLabel")}
                    body={t("addVehicle.expPrivateBody")}
                    onPress={() => toggleExposure("PRIVATE", true)}
                  />
                </View>
                {exposureError ? (
                  <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]}>{exposureError}</Text>
                ) : null}
              </View>

              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{t("addVehicle.photosOptional")}</Text>
                <View style={styles.photoGrid}>
                  {photos.map((uri) => (
                    <Animated.View key={uri} entering={FadeIn} style={styles.photoCell}>
                      <Image source={{ uri }} style={styles.photo} contentFit="cover" />
                      <Pressable onPress={() => removePhoto(uri)} style={[styles.removeBtn, { backgroundColor: colors.danger }]}>
                        <Text style={{ color: "#FFF", fontWeight: "700" }}>×</Text>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button label={t("addVehicle.takePhoto")} onPress={takePhoto} variant="secondary" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label={t("addVehicle.fromLibrary")} onPress={pickFromLibrary} variant="secondary" />
                  </View>
                </View>
              </View>

              <TextField
                label={t("addVehicle.notes")}
                value={form.notes}
                onChangeText={(v) => setField("notes", v)}
                multiline
                style={{ height: 96, paddingTop: 12 }}
                editable={!submitting}
              />
            </Animated.View>
          ) : null}

          {step === "review" ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Card padding={0} style={{ overflow: "hidden" }}>
                {photos[0] ? (
                  <Image source={{ uri: photos[0] }} style={styles.previewHero} contentFit="cover" />
                ) : (
                  <View style={[styles.previewHero, { backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 48 }}>🚗</Text>
                  </View>
                )}
                <View style={{ padding: spacing.lg, gap: spacing.md }}>
                  <View>
                    <Text style={[typography.h1, { color: colors.textPrimary }]} numberOfLines={1}>
                      {form.make} {form.model} {form.year}
                    </Text>
                    {form.licensePlate ? (
                      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                        {t("addVehicle.licensePlateLabel")}: {form.licensePlate}
                      </Text>
                    ) : null}
                  </View>

                  <View style={[styles.previewSection, { borderTopColor: colors.border }]}>
                    <Text style={[typography.h3, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
                      💰 {t("addVehicle.stepPricing")}
                    </Text>
                    <ReviewRow label={t("addVehicle.mileage")} value={`${Number(form.mileage).toLocaleString("he-IL")} ק"מ`} />
                    <ReviewRow label={t("addVehicle.price")} value={formatILS(Number(form.price))} />
                    {form.b2bPrice ? <ReviewRow label={t("addVehicle.b2bPrice")} value={formatILS(Number(form.b2bPrice))} /> : null}
                  </View>

                  <View style={[styles.previewSection, { borderTopColor: colors.border }]}>
                    <Text style={[typography.h3, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
                      {t("addVehicle.exposureTitle")}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {(exposure.size === 0 ? (["PRIVATE"] as const) : Array.from(exposure)).map((v) => (
                        <View
                          key={v}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: v === "PRIVATE" ? colors.surfaceMuted : colors.successBg,
                          }}
                        >
                          <Text
                            style={[
                              typography.caption,
                              { color: v === "PRIVATE" ? colors.textPrimary : colors.success, fontWeight: "700" },
                            ]}
                          >
                            🔹 {v === "PRIVATE" ? t("addVehicle.expPrivateLabel") : v === "B2B" ? t("addVehicle.expB2BLabel") : t("addVehicle.expB2CLabel")}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {photos.length > 0 ? (
                    <View style={[styles.previewSection, { borderTopColor: colors.border }]}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        📷 {photos.length} {t("addVehicle.stepPhotos")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Animated.View>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
            <View style={{ flex: 1 }}>
              <Button label={t("addVehicle.back")} variant="ghost" onPress={goBack} disabled={submitting} />
            </View>
            <View style={{ flex: 1 }}>
              {step === "review" ? (
                <Button label={t("addVehicle.submit")} variant="primary" onPress={submit} loading={submitting} />
              ) : (
                <Button label={t("addVehicle.next")} variant="primary" onPress={goNext} />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ============== Sub-components ==============

function ChoiceCard({
  glyph,
  title,
  body,
  onPress,
  i,
}: {
  glyph: string;
  title: string;
  body: string;
  onPress: () => void;
  i: number;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(80 + i * 80).springify()}>
      <PressableScale onPress={onPress} hapticStyle="press">
        <Card padding={spacing.lg}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>{glyph}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>{title}</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{body}</Text>
            </View>
            <Text style={[typography.h2, { color: colors.textMuted }]}>›</Text>
          </View>
        </Card>
      </PressableScale>
    </Animated.View>
  );
}

function Pulse() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.18, { duration: 800 }), -1, true);
  }, [scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animated}>
      <Text style={{ fontSize: 72 }}>🤖</Text>
    </Animated.View>
  );
}

function DetectedRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      }}
    >
      <Text style={[typography.caption, { color: colors.textMuted, width: 80 }]}>{label}</Text>
      <Text style={[typography.bodyBold, { color: colors.textPrimary, flex: 1 }]}>{value}</Text>
      <Text style={{ color: colors.success, fontSize: 16, fontWeight: "700" }}>✓</Text>
    </View>
  );
}

function FieldWithCheck({ detected, children }: { detected: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: "relative" }}>
      {children}
      {detected ? (
        <View style={styles.detectedBadge} pointerEvents="none">
          <Text style={{ color: colors.success, fontSize: 16, fontWeight: "700" }}>✓</Text>
        </View>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  detected,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
  detected?: boolean;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
        {detected ? (
          <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700" }}>✓</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <PressableScale
              key={o.value}
              hapticStyle="selection"
              onPress={() => onChange(o.value)}
              style={{
                paddingHorizontal: 14,
                height: 36,
                justifyContent: "center",
                borderRadius: radii.pill,
                backgroundColor: active ? colors.accent : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
              }}
            >
              <Text style={[typography.bodyBold, { color: active ? colors.accentText : colors.textPrimary, fontSize: 13 }]}>
                {o.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function ExposureRow({
  checked,
  enabled,
  label,
  body,
  badge,
  onPress,
}: {
  checked: boolean;
  enabled: boolean;
  label: string;
  body: string;
  badge?: string;
  onPress: () => void;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <PressableScale onPress={onPress} hapticStyle={enabled ? "selection" : "tap"}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: checked ? colors.surfaceMuted : "transparent",
          borderWidth: 1,
          borderColor: checked ? colors.accent : colors.border,
          opacity: enabled ? 1 : 0.55,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: checked ? colors.accent : colors.border,
            backgroundColor: checked ? colors.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "800" }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{label}</Text>
            {badge ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>{badge}</Text>
            ) : null}
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{body}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.bodyBold, { color: colors.textPrimary, marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 4 },
  header: { gap: 4 },
  progress: { height: 6, borderRadius: 999, overflow: "hidden" },
  gridRow: { flexDirection: "row", gap: 12 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoCell: { width: "30%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", position: "relative" },
  photo: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute",
    top: 4,
    end: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  detectedBadge: { position: "absolute", top: 30, end: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  previewHero: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  previewSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
});
