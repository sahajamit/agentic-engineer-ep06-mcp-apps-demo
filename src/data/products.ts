export interface Product {
  id: string;
  name: string;
  price: number;
  color: string;
  tags: string[];
}

export const PRODUCTS: Product[] = [
  { id: "trail-runner-coral", name: "Trail Runner · Coral", price: 58.0, color: "#FF5A4E", tags: ["running", "shoe", "trail"] },
  { id: "cloud-marathon",     name: "Cloud Marathon",        price: 54.0, color: "#7BB9F4", tags: ["running", "shoe", "road"] },
  { id: "urban-step",         name: "Urban Step",            price: 42.0, color: "#9DD367", tags: ["running", "shoe", "lifestyle"] },
  { id: "speed-lite-black",   name: "Speed Lite Black",      price: 79.0, color: "#3A3F47", tags: ["running", "shoe", "race"] },
  { id: "pacer-pro",          name: "Pacer Pro",             price: 89.0, color: "#F2B940", tags: ["running", "shoe", "pro"] },
  { id: "sunrise-seven",      name: "Sunrise 7",             price: 67.0, color: "#F47B7B", tags: ["running", "shoe", "daily"] },
];
