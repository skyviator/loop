import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Loop",
    short_name: "Loop",
    description: "Brighter days together.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F7F6F2",
    theme_color: "#2F6F68",
    icons: [
      {
        src: "/icons/loop-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/loop-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/loop-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
