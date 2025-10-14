
import { GlassPanel } from "@/components/ui/GlassPanel"
import { reviews } from "@/data/reviews"
import { Star } from "lucide-react"

const reviewColors = [
  '!bg-gradient-to-br from-[#eef2ff] via-[#f8f9ff] to-[#fdfbff]',
  '!bg-gradient-to-br from-[#fdf2f8] via-[#fde6ef] to-[#f8fbff]',
  '!bg-gradient-to-br from-[#fff7e5] via-[#ffedd8] to-[#f9fbff]',
]

export const ReviewsPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="grid gap-6 p-7 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
            5 Star Google Reviews
          </p>
          <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
            150+ Five-Star Experiences
          </h1>
          <Star className="mt-2 h-10 w-10 text-horizon" aria-hidden />
          <p className="mt-4 max-w-3xl text-base text-midnight/75">
            Every testimonial here is copied directly from the Valley Airporter review archive. Scroll to experience the voice of over 150 travellers.
          </p>
        </div>
        <img
          src="https://images.unsplash.com/photo-1511288597080-488ef2b1a661?auto=format&fit=crop&w=900&q=80"
          alt="Happy travellers ready for shuttle"
          className="h-44 w-full rounded-3xl object-cover shadow-lg"
          loading="lazy"
        />
      </GlassPanel>
      <div className="grid gap-6">
        {reviews.map((review, index) => (
          <GlassPanel
            key={`${review.author}-${index}`}
            className={`flex h-full flex-col justify-between gap-6 p-6 ${reviewColors[index % reviewColors.length]}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-horizon">
              {Array.from({ length: 5 }).map((_, starIndex) => (
                <Star key={starIndex} className="h-5 w-5 fill-current text-horizon" />
              ))}
              <span className="text-base font-semibold uppercase tracking-[0.28em] text-horizon/80">
                Rated 5 Stars on Google
              </span>
            </div>
            <p className="text-base leading-relaxed text-midnight/80">{review.quote}</p>
            <p className="text-base font-semibold uppercase tracking-[0.28em] text-horizon/80">
              by {review.author || "Anonymous"}
            </p>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}

export default ReviewsPage
