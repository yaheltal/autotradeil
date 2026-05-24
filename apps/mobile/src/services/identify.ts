/**
 * Vehicle identification — currently mocked. Wire to the real
 * endpoints by replacing the body of each function with the
 * corresponding `api.post(...)` call.
 *
 *   POST /api/v1/vehicles/lookup-by-plate    — plate number lookup (text)
 *   POST /api/v1/ai/identify-vehicle         — full-vehicle photo
 *   POST /api/v1/ai/identify-from-document   — registration document
 */

export type DetectionResult = {
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  transmission?: "automatic" | "manual";
  fuel_type?: "petrol" | "diesel" | "electric" | "hybrid";
  confidence: number; // 0–100
  source: "license_plate" | "photo" | "document" | "manual";
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Look up a vehicle by license-plate number (TEXT, not a photo). */
export async function identifyByLicensePlate(_plate: string): Promise<DetectionResult> {
  await wait(2000);
  return {
    make: "Toyota",
    model: "Camry",
    year: 2020,
    color: "לבן",
    transmission: "automatic",
    confidence: 95,
    source: "license_plate",
  };
}

export async function identifyByPhoto(_imageUri: string): Promise<DetectionResult> {
  await wait(2000);
  return {
    make: "Toyota",
    model: "Camry",
    year: 2020,
    color: "לבן",
    confidence: 87,
    source: "photo",
  };
}

export async function identifyByDocument(_imageUri: string): Promise<DetectionResult> {
  await wait(2000);
  return {
    make: "Toyota",
    model: "Camry",
    year: 2020,
    color: "לבן",
    transmission: "automatic",
    fuel_type: "petrol",
    confidence: 92,
    source: "document",
  };
}

/** Which detection keys were populated — used for the green-✓ UI. */
export function detectedKeys(d: DetectionResult): Set<keyof DetectionResult> {
  const keys = new Set<keyof DetectionResult>();
  for (const k of ["make", "model", "year", "color", "transmission", "fuel_type"] as const) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== "") keys.add(k);
  }
  return keys;
}
