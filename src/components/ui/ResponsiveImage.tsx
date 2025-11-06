import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

export interface ResponsiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Optional additional sources to prepend before the generated webp source. */
  sources?: Array<{
    srcSet: string
    type?: string
    media?: string
  }>
}

const ensureWebp = (src?: string): string | undefined => {
  if (!src) return src
  if (src.startsWith("data:") || src.endsWith(".svg") || src.endsWith(".webp") || src.includes("fm=webp")) {
    return src
  }
  const separator = src.includes("?") ? "&" : "?"
  return `${src}${separator}fm=webp`
}

export const ResponsiveImage = forwardRef<HTMLImageElement, ResponsiveImageProps>(
  ({ className, loading, decoding, sources, ...imgProps }, ref) => {
    const webpSrc = ensureWebp(imgProps.src)

    return (
      <picture>
        {sources?.map((source) => (
          <source
            key={`${source.srcSet}-${source.type ?? "any"}-${source.media ?? "all"}`}
            srcSet={source.srcSet}
            type={source.type}
            media={source.media}
          />
        ))}
        {webpSrc ? <source srcSet={webpSrc} type="image/webp" /> : null}
        <img
          ref={ref}
          className={className ? twMerge(className) : undefined}
          loading={loading ?? "lazy"}
          decoding={decoding ?? "async"}
          {...imgProps}
        />
      </picture>
    )
  },
)

ResponsiveImage.displayName = "ResponsiveImage"
