import { useMutation, useQueryClient } from "@tanstack/react-query";

import { inventoryItemSchema, type InventoryItemCreate } from "@/types/schemas";

import { api } from "./api";
import { queryKeys } from "./queryClient";

export function useCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InventoryItemCreate) => {
      const r = await api.post("/api/v1/inventory", payload);
      return inventoryItemSchema.parse(r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useUploadInventoryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inventoryId, uri }: { inventoryId: string; uri: string }) => {
      const form = new FormData();
      const filename = uri.split("/").pop() ?? `photo-${Date.now()}.jpg`;
      const ext = (filename.split(".").pop() ?? "jpg").toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      // RN's FormData accepts the file-as-object pattern.
      form.append("file", { uri, name: filename, type: mime } as unknown as Blob);
      const r = await api.post(`/api/v1/inventory/${inventoryId}/images`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return r.data as { id: string; url: string };
    },
    onSuccess: (_data, { inventoryId }) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory", "detail", inventoryId] });
    },
  });
}

export function useMakeOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      inventoryId,
      offeredPrice,
      message,
    }: {
      inventoryId: string;
      offeredPrice: number;
      message?: string;
    }) => {
      const r = await api.post(
        `/api/v1/marketplace/vehicles/${inventoryId}/offers`,
        { offered_price: offeredPrice, message: message?.trim() || null }
      );
      return r.data;
    },
    onSuccess: () => {
      // The buyer's "sent" list grows by one — refresh both lists since the
      // seller's "received" view also gets the new offer (admin/other dealer
      // testing on the same device would notice the stale tab otherwise).
      qc.invalidateQueries({ queryKey: ["offers"] });
    },
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const r = await api.post(`/api/v1/marketplace/offers/${offerId}/accept`);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.offers("received") });
      qc.invalidateQueries({ queryKey: queryKeys.offers("sent") });
    },
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const r = await api.post(`/api/v1/marketplace/offers/${offerId}/reject`);
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.offers("received") });
      qc.invalidateQueries({ queryKey: queryKeys.offers("sent") });
    },
  });
}
