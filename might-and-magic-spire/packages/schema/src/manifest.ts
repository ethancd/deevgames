import { z } from "zod";
import { ImageRef } from "./source";

export const ImageManifestEntry = z.object({
  ref: ImageRef,
  localPath: z.string(),            // "assets/images/necropolis_skeleton.webp"
  sourceUrl: z.string().url(),
  attribution: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type ImageManifestEntry = z.infer<typeof ImageManifestEntry>;
export const ImageManifest = z.array(ImageManifestEntry);
