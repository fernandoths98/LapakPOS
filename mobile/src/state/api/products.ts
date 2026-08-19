import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Category, CreateProductRequest, PhotoFillRequest, PhotoFillResponse, Product, UpdateProductRequest } from "@lapak/shared";
import { apiClient } from "./apiClient";

export interface UseProductsOptions {
  query?: string;
  category?: string;
}

/** GET /api/products?query=&category= — the Sell screen's search + category-pill filter. */
export function useProducts(opts: UseProductsOptions = {}) {
  const query = opts.query?.trim() ?? "";
  const category = opts.category ?? "All";

  return useQuery({
    queryKey: ["products", query, category],
    queryFn: async () => {
      const { data } = await apiClient.get<Product[]>("/api/products", {
        params: {
          query: query || undefined,
          category: category !== "All" ? category : undefined,
        },
      });
      return data;
    },
  });
}

/** GET /api/categories — rarely changes, so cached longer than the product list. */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await apiClient.get<Category[]>("/api/categories");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** GET /api/products/:id — a single product, for the edit form. Disabled until an id is given. */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data } = await apiClient.get<Product>(`/api/products/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/**
 * GET /api/products/barcode/:code — a plain imperative lookup rather than a
 * `useQuery` hook, since both call sites (Sell screen's scan handler,
 * Product form's scan-to-check) need a one-shot "look this up right now"
 * call triggered from an event handler, not a cached/subscribed query.
 * Returns `null` on a 404 (not found) instead of throwing, so callers can
 * show a plain "no product with that barcode" message.
 */
export async function fetchProductByBarcode(code: string): Promise<Product | null> {
  try {
    const { data } = await apiClient.get<Product>(`/api/products/barcode/${encodeURIComponent(code)}`);
    return data;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

function invalidateProductLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["products"] });
}

/** POST /api/products */
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProductRequest) => {
      const { data } = await apiClient.post<Product>("/api/products", body);
      return data;
    },
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

/** PATCH /api/products/:id */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateProductRequest }) => {
      const { data } = await apiClient.patch<Product>(`/api/products/${id}`, body);
      return data;
    },
    onSuccess: (product) => {
      invalidateProductLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ["product", product.id] });
    },
  });
}

/** DELETE /api/products/:id (soft delete) */
export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/products/${id}`);
      return id;
    },
    onSuccess: () => invalidateProductLists(queryClient),
  });
}

export interface UploadProductPhotoResult {
  imageUrl: string;
}

/** POST /api/products/photo — uploads a base64-encoded image, returns the saved imageUrl. */
export function useUploadProductPhoto() {
  return useMutation({
    mutationFn: async (body: { imageBase64: string; mimeType: string }) => {
      const { data } = await apiClient.post<UploadProductPhotoResult>("/api/products/photo", body);
      return data;
    },
  });
}

/**
 * POST /api/products/photo-fill — "Snap to fill". A non-200 here is expected
 * and honest whenever the backend has no `ANTHROPIC_API_KEY` configured (or
 * the photo failed to read) — callers must show that plainly, never treat a
 * thrown error as "nothing happened."
 */
export function usePhotoFillProduct() {
  return useMutation({
    mutationFn: async (body: PhotoFillRequest) => {
      const { data } = await apiClient.post<PhotoFillResponse>("/api/products/photo-fill", body);
      return data;
    },
  });
}
