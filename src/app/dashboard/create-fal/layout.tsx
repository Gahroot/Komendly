import { TestimonialGate } from "@/components/hub/testimonial-gate";

export const dynamic = "force-dynamic";

export default function CreateTestimonialLayout({ children }: { children: React.ReactNode }) {
  return <TestimonialGate>{children}</TestimonialGate>;
}
