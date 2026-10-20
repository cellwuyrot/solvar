import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export function useShop() {
  return useQuery(orpc.shop.catalog.queryOptions({ staleTime: 30000, refetchOnWindowFocus: true }));
}
export function useManagement(enabled = true) {
  return useQuery(orpc.management.catalog.queryOptions({ enabled, retry: false }));
}
export function useAdmin() {
  return useQuery(orpc.staff.me.queryOptions({ retry: false }));
}
export function useSaveProduct() {
  const q = useQueryClient();
  return useMutation(
    orpc.management.saveProduct.mutationOptions({ onSuccess: () => q.invalidateQueries() }),
  );
}
export function useDeleteProduct() {
  const q = useQueryClient();
  return useMutation(
    orpc.management.deleteProduct.mutationOptions({ onSuccess: () => q.invalidateQueries() }),
  );
}
export function useSaveSettings() {
  const q = useQueryClient();
  return useMutation(
    orpc.management.saveSettings.mutationOptions({ onSuccess: () => q.invalidateQueries() }),
  );
}
export function useUpload() {
  return useMutation(orpc.management.upload.mutationOptions());
}
export function useUploadLogo() {
  return useMutation(orpc.management.uploadLogo.mutationOptions());
}

export function useSaveBrand() {
  const q = useQueryClient();
  return useMutation(orpc.management.saveBrand.mutationOptions({ onSuccess: () => q.invalidateQueries() }));
}
