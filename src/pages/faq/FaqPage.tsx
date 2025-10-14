import { GlassPanel } from "@/components/ui/GlassPanel"
import { faqs } from "@/data/faq"
import { HelpCircle } from "lucide-react"

const faqColors = [
  '!bg-gradient-to-br from-[#fdf2f8] via-[#fde7ef] to-[#f8fbff]',
  '!bg-gradient-to-br from-[#e1f3ff] via-[#edf8ff] to-[#f9fbff]',
  '!bg-gradient-to-br from-[#fff6e4] via-[#ffe9d6] to-[#f8fbff]',
]

export const FaqPage = () => {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <GlassPanel className="grid gap-6 p-7 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="font-heading text-base uppercase tracking-[0.35em] text-horizon/70">
            Valley Airporter FAQ
          </p>
          <h1 className="mt-4 font-heading text-3xl uppercase tracking-[0.28em] text-horizon">
            Your Questions, Answered
          </h1>
          <p className="mt-4 max-w-3xl text-base text-midnight/75">
            These answers are copied directly from the Valley Airporter FAQ so no knowledge is lost during the redesign.
          </p>
        </div>
        <img
          src="https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80"
          alt="Shuttle loading passengers"
          className="h-44 w-full rounded-3xl object-cover shadow-lg"
          loading="lazy"
        />
      </GlassPanel>
      <div className="grid gap-6">
        {faqs.map((faq, index) => (
          <GlassPanel
            key={faq.question}
            className={`flex items-start gap-4 p-6 ${faqColors[index % faqColors.length]}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-horizon/40 bg-white/80 text-horizon">
              <HelpCircle className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h2 className="font-heading text-lg uppercase tracking-[0.3em] text-horizon">
                {faq.question}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-midnight/80">{faq.answer}</p>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}

export default FaqPage
