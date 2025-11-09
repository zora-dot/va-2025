import { GlassPanel } from "@/components/ui/GlassPanel"
import { ResponsiveImage } from "@/components/ui/ResponsiveImage"
import { faqs } from "@/data/faq"

const faqColors = [
  '!bg-gradient-to-br from-[#fdf2f8] via-[#fde7ef] to-[#f8fbff]',
  '!bg-gradient-to-br from-[#e1f3ff] via-[#edf8ff] to-[#f9fbff]',
  '!bg-gradient-to-br from-[#fff6e4] via-[#ffe9d6] to-[#f8fbff]',
]

export const FaqPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.28em] text-horizon/70 sm:text-base sm:tracking-[0.35em]">
            Valley Airporter FAQ
          </p>
          <h1 className="mt-3 font-heading text-2xl uppercase tracking-[0.24em] text-horizon sm:mt-4 sm:text-3xl sm:tracking-[0.28em]">
            Your Questions, Answered
          </h1>
        </div>
        <ResponsiveImage
          src="https://st.depositphotos.com/4428871/53719/v/450/depositphotos_537196004-stock-illustration-faq-frequently-asked-questions-acronym.jpg"
          alt="Traveler thinking through a question"
          className="mx-auto h-44 w-full max-w-md rounded-3xl object-contain shadow-lg sm:mx-0 sm:h-60 sm:max-w-none sm:object-cover lg:h-[260px]"
          sources={[
            {
              srcSet: "https://st.depositphotos.com/4428871/53719/v/450/depositphotos_537196004-stock-illustration-faq-frequently-asked-questions-acronym.jpg",
              type: "image/webp",
              media: "(max-width: 768px)",
            },
          ]}
        />
      </GlassPanel>
      <div className="grid gap-6">
        {faqs.map((faq, index) => (
          <GlassPanel
            key={faq.question}
            className={`flex items-start gap-4 p-6 ${faqColors[index % faqColors.length]}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-horizon/40 bg-white/80 text-horizon font-heading text-lg font-semibold">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                {faq.question}
              </h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-midnight/80">{faq.answer}</p>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}

export default FaqPage
