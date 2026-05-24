import { Car, Star } from "lucide-react";
import Link from "next/link";

import { TrustBadge } from "@/components/TrustBadge";
import { formatMileage, formatPrice } from "@/lib/format";

/*
 * MarketplaceCard — editorial catalogue card used by:
 *   • /dashboard/marketplace                  (catalogue index)
 *   • /dashboard/marketplace/dealer/[id]      (dealer's listings; hideSellerRow)
 *
 * The entire card is a <Link> to the vehicle detail page. Click
 * affordance comes from the title's underline-on-hover and the card's
 * hairline border darkening on hover — no separate button.
 *
 * `is_own` is signalled with a small Star + label pill in the
 * thumbnail's top-end corner (NOT a ring around the card, which read
 * as noise on a grid of 12+ cards).
 *
 * TrustBadge is intentionally left at its current brand-* theming for
 * this commit — it serves offers + admin/dealers too and will retoken
 * in a later page-pass.
 */

export type MarketplaceCardVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  b2b_price: number | null;
  color?: string | null;
  transmission?: "automatic" | "manual" | null;
  fuel_type?: "petrol" | "diesel" | "electric" | "hybrid" | null;
  primary_image_url: string | null;
  seller_business_name?: string;
  seller_city?: string | null;
  seller_tier?: "bronze" | "silver" | "gold" | "platinum";
  is_own?: boolean;
};

const FUEL_LABELS: Record<string, string> = {
  petrol: "בנזין",
  diesel: "דיזל",
  electric: "חשמלי",
  hybrid: "היברידי",
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: "אוטומט",
  manual: "ידני",
};

export function MarketplaceCard({
  vehicle,
  hideSellerRow = false,
}: {
  vehicle: MarketplaceCardVehicle;
  hideSellerRow?: boolean;
}) {
  const priceF = formatPrice(vehicle.b2b_price ?? vehicle.price);
  const mileageF = formatMileage(vehicle.mileage);
  const fullLabel = `${vehicle.make} ${vehicle.model} שנת ${vehicle.year}`;
  const titleId = `mkt-${vehicle.id}-title`;
  const subMeta = [
    vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission] : null,
    vehicle.fuel_type ? FUEL_LABELS[vehicle.fuel_type] : null,
    vehicle.color,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <article aria-labelledby={titleId} className="h-full">
        <Link
          href={`/dashboard/marketplace/${vehicle.id}`}
          aria-label={`פרטים נוספים על ${fullLabel}`}
          className="border-hairline bg-paper hover:border-muted/30 duration-fast focus-visible:outline-accent group flex h-full flex-col overflow-hidden rounded-md border transition-colors focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {/* Thumbnail */}
          <div className="bg-muted/5 relative aspect-[16/9] w-full overflow-hidden">
            {vehicle.primary_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vehicle.primary_image_url}
                alt={`תמונת ${fullLabel}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="text-subtle flex h-full w-full items-center justify-center"
              >
                <Car className="h-10 w-10" />
              </div>
            )}
            {vehicle.is_own ? (
              <span className="bg-accent text-paper gap-xxs absolute end-2 top-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
                <Star aria-hidden="true" className="h-3 w-3" />
                הרכב שלך
              </span>
            ) : null}
          </div>

          {/* Body */}
          <div className="px-md py-md flex flex-1 flex-col">
            <h3
              id={titleId}
              className="text-ink font-serif text-base font-medium leading-tight group-hover:underline group-hover:underline-offset-4"
            >
              {vehicle.make} {vehicle.model}{" "}
              <span className="text-muted font-tabular font-normal">· {vehicle.year}</span>
            </h3>
            {subMeta ? <p className="text-muted mt-xxs text-xs">{subMeta}</p> : null}

            <div aria-hidden="true" className="bg-hairline my-md h-px w-full" />

            <div className="gap-md flex items-baseline justify-between">
              <p className="text-ink font-tabular text-lg font-medium leading-none">
                <span aria-hidden="true">{priceF.visual}</span>
                <span className="sr-only">{priceF.sr}</span>
              </p>
              <p className="text-muted font-tabular text-sm">
                <span aria-hidden="true">{mileageF.visual}</span>
                <span className="sr-only">{mileageF.sr}</span>
              </p>
            </div>

            {!hideSellerRow && vehicle.seller_business_name ? (
              <div className="mt-md gap-xs flex flex-wrap items-center text-xs">
                <span className="text-muted truncate">
                  {vehicle.seller_business_name}
                  {vehicle.seller_city ? ` · ${vehicle.seller_city}` : ""}
                </span>
                {vehicle.seller_tier ? <TrustBadge tier={vehicle.seller_tier} compact /> : null}
              </div>
            ) : null}
          </div>
        </Link>
      </article>
    </li>
  );
}
