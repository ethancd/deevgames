// Renders CONTENT art (creature portraits) from the researcher's manifest,
// with a graceful CHROME placeholder when the asset is missing — which is the
// normal case during fixture-only development. The placeholder is a bone-
// engraved sigil so a portrait-less build still reads as Necropolis, never
// as a broken image.
import { resolveImage } from '../content/images';
import { SkullIcon } from './icons';

export function ContentImage({
  imageRef,
  alt,
  className = '',
}: {
  imageRef: string;
  alt: string;
  className?: string;
}) {
  const url = resolveImage(imageRef);
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${alt} (art forthcoming)`}
      className={`flex items-center justify-center bg-grave-700 text-verd-500 ${className}`}
      title={alt}
    >
      <SkullIcon className="text-[2.2rem] opacity-70" />
    </div>
  );
}
