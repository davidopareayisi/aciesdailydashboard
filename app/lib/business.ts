import { brand } from "./brand";
export const business = { phone: "054 763 7997", internationalPhone: brand.phone, name: brand.name };

export function whatsapp(message = "Hi AciesDaily, I'd like to discuss a production.", phone: string = business.internationalPhone) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

export const enquiryStatuses = ["New", "Contacted", "Quoted", "Booked", "In production", "Delivered", "Closed"] as const;
export type EnquiryStatus = typeof enquiryStatuses[number];
export type Collection = "profiles" | "work" | "packages";
export const collections: Collection[] = ["profiles", "work", "packages"];
export type ContentEntry = {
  id: string; title: string; category: string; location: string; summary: string;
  details: string; image: string; imageAlt: string; items: string[]; credits: string;
  published: boolean; updatedAt: string;
};
export type Enquiry = {
  id: string; kind: "project" | "network"; createdAt: string; updatedAt?: string;
  name: string; phone: string; email: string; company: string; location: string;
  projectType: string; budget: string; description: string; role: string; portfolio: string;
  date: string; services: string[]; primaryContact: string; consent: { granted: boolean; noticeVersion: string };
  status?: EnquiryStatus; coordinator?: string; shootDate?: string; proposal?: string;
  quote?: string; clientMessage?: string; internalNotes?: string; deliverables?: { label: string; url: string }[];
  accessToken?: string; approvedAt?: string;
  milestones?: Partial<Record<EnquiryStatus, string>>;
};

export const packageDefaults: ContentEntry[] = [
  { id: "product-shoot", title: "Product shoot", category: "Product photography", location: "Ghana", summary: "Give your products the attention they deserve.", details: "For launches, online shops and product stories. We work through your shot list, source the right space and team, and agree the final delivery with you.", items: ["Brief and shot-list planning", "Studio and photographer sourcing", "Styling and crew as required", "A delivery plan agreed in your proposal"], image: "", imageAlt: "", credits: "", published: true, updatedAt: "2026-10-27" },
  { id: "brand-campaign", title: "Brand campaign", category: "Brand campaign", location: "Ghana", summary: "One idea. The right people around it.", details: "Bring together talent, locations and production for a campaign with a clear direction. We coordinate the moving parts around your objectives and budget.", items: ["Creative and production planning", "Talent, location and crew sourcing", "Shoot coordination", "Usage and deliverables agreed before booking"], image: "", imageAlt: "", credits: "", published: true, updatedAt: "2026-10-27" },
  { id: "content-day", title: "Content day", category: "Social content day", location: "Ghana", summary: "Make room for a good day of making.", details: "Plan a focused session for your social channels. We help shape a practical content list, organise the people and space, and keep the day moving.", items: ["Content-list and schedule planning", "A team matched to your formats", "Space and production coordination", "Editing and delivery scope set in your quote"], image: "", imageAlt: "", credits: "", published: true, updatedAt: "2026-10-27" },
];
