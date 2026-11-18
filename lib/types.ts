export type Product = {
  id: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  category: "lip_sets" | "archive_sets" | "accessories" | "clothing";
  price: number;
  stock_quantity: number;
  is_available: boolean;
  image_url?: string | null;
};
export type CartLine = { product: Product; quantity: number };
